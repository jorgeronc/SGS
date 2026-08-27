"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import MapaBase from "@/app/components/MapaBase";
import CamarasCercanas from "@/app/components/CamarasCercanas";
import { useGuardiasEnLinea } from "@/lib/guardiasVivo";
import { computeReporteSla } from "@/lib/sla";

const CENTER: [number, number] = [-100.309, 25.6714];
const COL = { guardia: "#1f9d5c", pausa: "#d98a2b", incidente: "#e23b53", camara: "#0e8f86", geof: "#2f6bff" };
const PRIO_LBL: Record<string, string> = { alta: "Crítica", media: "Media", baja: "Baja" };

// Anillo (polígono) de una geocerca en coordenadas lon/lat.
function circulo(lng: number, lat: number, radioM: number, n = 48): number[][] {
  const dLat = radioM / 111320;
  const dLng = radioM / (111320 * Math.cos((lat * Math.PI) / 180));
  const ring: number[][] = [];
  for (let i = 0; i <= n; i++) { const a = (i / n) * 2 * Math.PI; ring.push([lng + dLng * Math.cos(a), lat + dLat * Math.sin(a)]); }
  return ring;
}

// Elemento HTML de un marcador (pin o punto), estilo del diseño.
function pinEl(color: string, icon: string, label: string, dot: boolean, pulse: boolean, onClick?: () => void): HTMLElement {
  const el = document.createElement("div");
  el.style.cssText = "display:flex;flex-direction:column;align-items:center;cursor:pointer;transform:translateY(-50%)";
  const shape = dot ? "border-radius:50%;" : "border-radius:50% 50% 50% 0;transform:rotate(-45deg);";
  const iconT = dot ? "" : "transform:rotate(45deg);";
  el.innerHTML =
    (pulse ? `<div style="position:absolute;top:-19px;width:60px;height:60px;border-radius:50%;background:radial-gradient(circle,#e23b5355,#e23b5300 70%);animation:mo-pulse 1.8s ease-in-out infinite"></div>` : "") +
    `<div style="width:24px;height:24px;${shape}background:${color};display:grid;place-items:center;border:2px solid #ffffff55;box-shadow:0 3px 8px #0006"><span style="${iconT}font-size:12px">${icon}</span></div>` +
    `<div style="margin-top:3px;font-size:10px;font-weight:700;color:#e7edf5;background:#0c131cc0;padding:1px 6px;border-radius:5px;white-space:nowrap;border:1px solid #283442">${label}</div>`;
  if (onClick) el.addEventListener("click", onClick);
  return el;
}

const guardiaNombre = (g: any) => g.etiqueta ?? "Guardia";

export default function MapaOperacionalPage() {
  const guardias = useGuardiasEnLinea();
  const [incidentes, setIncidentes] = useState<any[]>([]);
  const [camaras, setCamaras] = useState<any[]>([]);
  const [sitios, setSitios] = useState<any[]>([]);
  const [dentro, setDentro] = useState({ personas: 0, vehiculos: 0, rechazos: 0 });
  const [indice, setIndice] = useState<number | null>(null);
  const [selInc, setSelInc] = useState<any | null>(null);
  const [capas, setCapas] = useState({ guardias: true, incidentes: true, camaras: true, geofences: true });

  const mlRef = useRef<any>(null);
  const mapRef = useRef<any>(null);
  const marks = useRef<any[]>([]);
  const datos = useRef({ guardias, incidentes, camaras, capas });
  datos.current = { guardias, incidentes, camaras, capas };

  useEffect(() => { import("maplibre-gl").then((m) => { mlRef.current = (m as any).default ?? m; }); }, []);

  const cargar = useCallback(async () => {
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0); const desdeHoy = hoy.toISOString();
    const [{ data: inc }, { data: cam }, { data: sit }] = await Promise.all([
      supabase.from("llamadas_cad").select("id, folio, tipo, prioridad, direccion, estado_despacho, latitud, longitud, sitio_id, datos_adicionales")
        .eq("estatus", "activo").in("estado_despacho", ["recibida", "despachada", "en_atencion"]).not("latitud", "is", null),
      supabase.from("camaras").select("id, nombre, estado_operativo, latitud, longitud").eq("estatus", "activo").not("latitud", "is", null),
      supabase.from("sitios").select("id, nombre, latitud, longitud, radio_geofence_m").eq("estatus", "activo").not("latitud", "is", null),
    ]);
    setIncidentes((inc as any[]) ?? []);
    setCamaras((cam as any[]) ?? []);
    setSitios((sit as any[]) ?? []);
    const [{ count: pd }, { count: vd }, { count: ar }] = await Promise.all([
      supabase.from("v_personas_dentro").select("*", { count: "exact", head: true }),
      supabase.from("v_vehiculos_dentro").select("*", { count: "exact", head: true }),
      supabase.from("accesos").select("*", { count: "exact", head: true }).eq("estatus", "activo").eq("resultado", "rechazado").gte("fecha_evento", desdeHoy),
    ]);
    setDentro({ personas: pd ?? 0, vehiculos: vd ?? 0, rechazos: ar ?? 0 });
  }, []);

  useEffect(() => {
    cargar();
    const t = setInterval(cargar, 60000);
    const mes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    computeReporteSla(null, mes, new Date().toISOString()).then((r) => setIndice(r.index)).catch(() => {});
    return () => clearInterval(t);
  }, [cargar]);

  // Geocercas como polígonos (capa de estilo; se re-crea tras cambios de tema).
  function ensureGeocercas(map: any) {
    const fc = { type: "FeatureCollection", features: sitios.map((s) => ({ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [circulo(Number(s.longitud), Number(s.latitud), Number(s.radio_geofence_m) || 150)] } })) };
    if (!map.getSource("geocercas")) {
      map.addSource("geocercas", { type: "geojson", data: fc as any });
      map.addLayer({ id: "geoc-f", type: "fill", source: "geocercas", paint: { "fill-color": COL.geof, "fill-opacity": 0.07 } });
      map.addLayer({ id: "geoc-l", type: "line", source: "geocercas", paint: { "line-color": COL.geof, "line-width": 1.4, "line-dasharray": [2, 2], "line-opacity": 0.75 } });
    } else { map.getSource("geocercas").setData(fc as any); }
    const v = datos.current.capas.geofences ? "visible" : "none";
    ["geoc-f", "geoc-l"].forEach((l) => map.getLayer(l) && map.setLayoutProperty(l, "visibility", v));
  }

  // Redibuja los marcadores (guardias, incidentes, cámaras) según datos + capas.
  const pintar = useCallback(() => {
    const map = mapRef.current, maplibre = mlRef.current; if (!map || !maplibre) return;
    marks.current.forEach((m) => m.remove()); marks.current = [];
    const { guardias, incidentes, camaras, capas } = datos.current;
    const add = (lng: number, lat: number, el: HTMLElement) => marks.current.push(new maplibre.Marker({ element: el, anchor: "bottom" }).setLngLat([lng, lat]).addTo(map));
    if (capas.guardias) guardias.forEach((g: any) => { if (g.latitud != null) add(Number(g.longitud), Number(g.latitud), pinEl(g.estatus_servicio === "en_pausa" ? COL.pausa : COL.guardia, "👮", guardiaNombre(g), false, false)); });
    if (capas.camaras) camaras.forEach((c: any) => add(Number(c.longitud), Number(c.latitud), pinEl(COL.camara, "📷", c.nombre ?? "Cámara", true, false)));
    if (capas.incidentes) incidentes.forEach((it: any) => add(Number(it.longitud), Number(it.latitud), pinEl(COL.incidente, "⚠", it.folio ?? it.tipo ?? "Incidente", false, it.prioridad === "alta", () => setSelInc(it))));
  }, []);

  function onReady(map: any) { mapRef.current = map; ensureGeocercas(map); pintar(); }

  // Redibuja al cambiar datos/capas (sin reencuadrar).
  useEffect(() => { if (mapRef.current) { pintar(); ensureGeocercas(mapRef.current); } }, [guardias, incidentes, camaras, sitios, capas, pintar]);

  const panel = "background:var(--sc-content);border:1px solid var(--sc-card-line);border-radius:12px;color:var(--sc-text)";
  const toggle = (k: keyof typeof capas) => setCapas((p) => ({ ...p, [k]: !p[k] }));

  return (
    <div style={{ position: "relative", height: "calc(100vh - 56px)", margin: -22, overflow: "hidden" }}>
      <MapaBase center={CENTER} zoom={12.5} className="mo-map" onReady={onReady} />
      <style>{`.mo-map{position:absolute;inset:0}`}</style>

      {/* CAPAS */}
      <div style={{ position: "absolute", top: 14, left: 14, width: 190, padding: "10px 6px", zIndex: 5, ...cssObj(panel) }}>
        <div style={{ padding: "0 10px 8px", fontSize: 11, letterSpacing: ".08em", color: "var(--sc-text-faint)", textTransform: "uppercase" }}>Capas</div>
        {([["guardias", COL.guardia, "Guardias"], ["incidentes", COL.incidente, "Incidentes"], ["camaras", COL.camara, "Cámaras"], ["geofences", COL.geof, "Geocercas"]] as const).map(([k, c, l]) => (
          <label key={k} style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 12.5, padding: "6px 10px", cursor: "pointer" }}>
            <input type="checkbox" checked={capas[k]} onChange={() => toggle(k)} />
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: c }} /> {l}
          </label>
        ))}
      </div>

      {/* Strip de conteos */}
      <div style={{ position: "absolute", top: 14, left: "50%", transform: "translateX(-50%)", display: "flex", zIndex: 5, ...cssObj(panel) }}>
        {[[guardias.length, "Guardias", COL.guardia], [incidentes.length, "Incidentes", COL.incidente], [camaras.length, "Cámaras", COL.camara], [dentro.personas, "Dentro", COL.geof], [dentro.vehiculos, "Vehículos", "#4c9de0"]].map(([n, l, c], i) => (
          <div key={i} style={{ padding: "6px 16px", borderRight: i < 4 ? "1px solid var(--sc-card-line)" : "none", textAlign: "center" }}>
            <div style={{ fontWeight: 800, fontSize: 16, display: "flex", gap: 5, alignItems: "center", justifyContent: "center" }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: c as string }} />{n as number}</div>
            <div style={{ fontSize: 10, color: "var(--sc-text-soft)" }}>{l as string}</div>
          </div>
        ))}
      </div>

      {/* Panel de incidente seleccionado */}
      {selInc && (
        <aside style={{ position: "absolute", top: 14, right: 14, width: 320, maxHeight: "calc(100vh - 150px)", overflow: "auto", zIndex: 6, ...cssObj(panel) }}>
          <div style={{ padding: "13px 15px", borderBottom: "1px solid var(--sc-card-line)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <b style={{ color: COL.incidente }}>🚨 {selInc.folio ?? "Incidente"}</b>
              <span onClick={() => setSelInc(null)} style={{ cursor: "pointer", color: "var(--sc-text-faint)" }}>✕</span>
            </div>
            <h3 style={{ margin: "8px 0 2px" }}>{selInc.tipo ?? "Incidencia"}</h3>
            <div style={{ color: "var(--sc-text-soft)", fontSize: 12.5 }}>{selInc.direccion ?? "—"} · prioridad {PRIO_LBL[selInc.prioridad] ?? selInc.prioridad}</div>
            <Link href={`/cad/${selInc.id}`} style={{ display: "block", textAlign: "center", background: "#2f6bff", color: "#fff", borderRadius: 9, padding: 10, fontWeight: 700, marginTop: 10, textDecoration: "none" }}>Abrir en Central / Despacho</Link>
          </div>
          <div style={{ padding: "6px 15px 14px" }}>
            <CamarasCercanas latitud={selInc.latitud ?? null} longitud={selInc.longitud ?? null} radioM={600} />
          </div>
        </aside>
      )}

      {/* Barra inferior de KPIs */}
      <div style={{ position: "absolute", left: 14, right: 14, bottom: 14, display: "flex", alignItems: "center", gap: 18, padding: "10px 16px", zIndex: 5, ...cssObj(panel) }}>
        <Link href="/reporte-sla" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: "var(--sc-text)" }}>
          <span style={{ fontSize: 30, fontWeight: 900, color: indice == null ? "var(--sc-text-faint)" : indice >= 90 ? COL.guardia : indice >= 75 ? "#d98a2b" : COL.incidente }}>{indice ?? "—"}</span>
          <span style={{ fontSize: 12, color: "var(--sc-text-soft)" }}>Índice de<br />cumplimiento</span>
        </Link>
        <div style={{ flex: 1 }} />
        {[["Guardias en línea", guardias.length], ["Incidentes abiertos", incidentes.length], ["Personas dentro", dentro.personas], ["Vehículos dentro", dentro.vehiculos], ["Accesos rechazados (hoy)", dentro.rechazos]].map(([l, n], i) => (
          <div key={i} style={{ textAlign: "center", padding: "0 10px" }}>
            <div style={{ fontWeight: 800, fontSize: 20, fontVariantNumeric: "tabular-nums" }}>{n as number}</div>
            <div style={{ fontSize: 10.5, color: "var(--sc-text-soft)" }}>{l as string}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Convierte "a:b;c:d" (CSS) en objeto de estilo React camelCase.
function cssObj(s: string): Record<string, string> {
  return Object.fromEntries(s.split(";").filter(Boolean).map((r) => { const [k, v] = r.split(":"); return [k.trim().replace(/-([a-z])/g, (_, c) => c.toUpperCase()), v.trim()]; }));
}
