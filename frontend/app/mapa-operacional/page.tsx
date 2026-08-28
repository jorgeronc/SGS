"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import MapaBase from "@/app/components/MapaBase";
import CamarasCercanas from "@/app/components/CamarasCercanas";
import CameraDetailDrawer from "@/app/components/CameraDetailDrawer";
import ChatIncidente from "@/app/components/ChatIncidente";
import { useGuardiasEnLinea } from "@/lib/guardiasVivo";
import { computeReporteSla } from "@/lib/sla";

const CENTER: [number, number] = [-100.309, 25.6714];
const COL = { guardia: "#1f9d5c", pausa: "#d98a2b", incidente: "#e23b53", camara: "#0e8f86", geof: "#2f6bff" };
const PRIO_LBL: Record<string, string> = { alta: "Crítica", media: "Media", baja: "Baja" };

// Color del icono de cámara según su estado_operativo (activa/inactiva/mantenimiento).
const colorCamara = (e?: string) => (e === "activa" ? COL.camara : e === "mantenimiento" ? COL.pausa : COL.incidente);

// Anillo (polígono) de una geocerca en coordenadas lon/lat.
function circulo(lng: number, lat: number, radioM: number, n = 48): number[][] {
  const dLat = radioM / 111320;
  const dLng = radioM / (111320 * Math.cos((lat * Math.PI) / 180));
  const ring: number[][] = [];
  for (let i = 0; i <= n; i++) { const a = (i / n) * 2 * Math.PI; ring.push([lng + dLng * Math.cos(a), lat + dLat * Math.sin(a)]); }
  return ring;
}

// Elemento HTML de un marcador (pin o punto), estilo del diseño.
// opts.hoverOnly: la etiqueta (nombre + opts.sub) se oculta y solo aparece al
// pasar el cursor (tooltip), p.ej. cámaras -> nombre + estatus.
function pinEl(color: string, icon: string, label: string, dot: boolean, pulse: boolean, onClick?: () => void, opts?: { hoverOnly?: boolean; sub?: string }): HTMLElement {
  const el = document.createElement("div");
  if (opts?.hoverOnly) el.className = "mo-pin";
  el.style.cssText = "display:flex;flex-direction:column;align-items:center;cursor:pointer;transform:translateY(-50%)";
  const shape = dot ? "border-radius:50%;" : "border-radius:50% 50% 50% 0;transform:rotate(-45deg);";
  const iconT = dot ? "" : "transform:rotate(45deg);";
  const sub = opts?.sub ? `<div style="font-size:9px;font-weight:600;color:#9fb0c2;margin-top:1px">${opts.sub}</div>` : "";
  el.innerHTML =
    (pulse ? `<div style="position:absolute;top:-19px;width:60px;height:60px;border-radius:50%;background:radial-gradient(circle,#e23b5355,#e23b5300 70%);animation:mo-pulse 1.8s ease-in-out infinite"></div>` : "") +
    `<div style="width:24px;height:24px;${shape}background:${color};display:grid;place-items:center;border:2px solid #ffffff55;box-shadow:0 3px 8px #0006"><span style="${iconT}font-size:12px">${icon}</span></div>` +
    `<div class="${opts?.hoverOnly ? "mo-hoverlabel" : ""}" style="margin-top:3px;font-size:10px;font-weight:700;color:#e7edf5;background:#0c131cc0;padding:1px 6px;border-radius:5px;white-space:nowrap;border:1px solid #283442;text-align:center">${label}${sub}</div>`;
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
  const [ultima, setUltima] = useState<Date | null>(null); // null hasta montar (evita mismatch de hidratación)
  const [selInc, setSelInc] = useState<any | null>(null);
  const [selCam, setSelCam] = useState<any | null>(null);
  const [selChat, setSelChat] = useState<{ canalId: string; folio: string } | null>(null);

  // Abre (asegurando membresía) el chat del incidente en el panel izquierdo.
  async function abrirChatIncidente(inc: any) {
    const { data } = await supabase.rpc("rpc_incidente_unir_chat", { p_llamada: inc.id });
    if (data) setSelChat({ canalId: data as string, folio: inc.folio ?? "incidente" });
  }
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
    // Índice de cumplimiento: también en cada recarga (antes solo al montar).
    const mes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    computeReporteSla(null, mes, new Date().toISOString()).then((r) => setIndice(r.index)).catch(() => {});
    setUltima(new Date());
  }, []);

  useEffect(() => {
    cargar();
    const t = setInterval(cargar, 60000);
    // Recargar también al volver a la pestaña/ventana (el intervalo no basta si
    // el navegador lo estranguló en segundo plano). Patrón del proyecto.
    const onVis = () => { if (!document.hidden) cargar(); };
    window.addEventListener("focus", cargar);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", cargar);
      document.removeEventListener("visibilitychange", onVis);
    };
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
    if (capas.camaras) camaras.forEach((c: any) => add(Number(c.longitud), Number(c.latitud), pinEl(colorCamara(c.estado_operativo), "📷", c.nombre ?? "Cámara", true, false, () => setSelCam(c), { hoverOnly: true, sub: c.estado_operativo ?? "" })));
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
      <style>{`.mo-map{position:absolute;inset:0}.mo-hoverlabel{display:none}.mo-pin:hover .mo-hoverlabel{display:block}`}</style>

      {/* Barra de Capas (horizontal). Los conteos ya viven en la barra inferior. */}
      <div style={{ position: "absolute", top: 14, left: "50%", transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap", maxWidth: "calc(100vw - 28px)", padding: "5px 10px", zIndex: 5, ...cssObj(panel) }}>
        <span style={{ fontSize: 11, letterSpacing: ".08em", color: "var(--sc-text-faint)", textTransform: "uppercase", marginRight: 2 }}>Capas</span>
        {([["guardias", COL.guardia, "Guardias"], ["incidentes", COL.incidente, "Incidentes"], ["camaras", COL.camara, "Cámaras"], ["geofences", COL.geof, "Geocercas"]] as const).map(([k, c, l]) => (
          <label key={k} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, padding: "4px 8px", cursor: "pointer" }}>
            <input type="checkbox" checked={capas[k]} onChange={() => toggle(k)} />
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: c }} /> {l}
          </label>
        ))}
        <span style={{ width: 1, alignSelf: "stretch", background: "var(--sc-card-line)", margin: "0 4px" }} />
        <span style={{ fontSize: 10, color: "var(--sc-text-faint)", whiteSpace: "nowrap" }}>Actualizado {ultima ? ultima.toLocaleTimeString() : "—"}</span>
        <button onClick={() => cargar()} title="Actualizar ahora" style={{ background: "transparent", border: "1px solid var(--sc-card-line)", color: "var(--sc-text-soft)", borderRadius: 6, padding: "2px 8px", fontSize: 11, cursor: "pointer" }}>⟳</button>
      </div>

      {/* Ventana de incidente: lado derecho */}
      {selInc && (
        <aside style={{ position: "absolute", top: 14, right: 14, width: 340, maxHeight: "calc(100vh - 90px)", overflow: "auto", zIndex: 6, ...cssObj(panel) }}>
          <div style={{ padding: "13px 15px", borderBottom: "1px solid var(--sc-card-line)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <b style={{ color: COL.incidente }}>🚨 {selInc.folio ?? "Incidente"}</b>
              <span onClick={() => setSelInc(null)} style={{ cursor: "pointer", color: "var(--sc-text-faint)" }}>✕</span>
            </div>
            <h3 style={{ margin: "8px 0 2px" }}>{selInc.tipo ?? "Incidencia"}</h3>
            <div style={{ color: "var(--sc-text-soft)", fontSize: 12.5 }}>{selInc.direccion ?? "—"} · prioridad {PRIO_LBL[selInc.prioridad] ?? selInc.prioridad}</div>
            <Link href={`/cad/${selInc.id}`} style={{ display: "block", textAlign: "center", background: "#2f6bff", color: "#fff", borderRadius: 9, padding: 9, fontWeight: 700, marginTop: 10, textDecoration: "none" }}>Abrir en Central / Despacho</Link>
            <button onClick={() => abrirChatIncidente(selInc)} style={{ display: "block", width: "100%", textAlign: "center", background: "#2563eb", color: "#fff", border: "none", borderRadius: 9, padding: 9, fontWeight: 700, marginTop: 8, cursor: "pointer" }}>💬 Chat del incidente</button>
          </div>
          <div style={{ padding: "6px 15px 14px" }}>
            <CamarasCercanas latitud={selInc.latitud ?? null} longitud={selInc.longitud ?? null} radioM={600} />
          </div>
        </aside>
      )}

      {/* Dock IZQUIERDO: ventana de cámara (arriba) y chat del incidente (abajo),
          alineado en top con la barra de Capas (centrada) y la ventana derecha.
          Se apilan sin empalmarse y sobre la barra de KPIs. */}
      {(selCam || selChat) && (
        <div style={{ position: "absolute", top: 14, left: 14, width: 340, maxHeight: "calc(100vh - 90px)", overflow: "auto", zIndex: 6, display: "flex", flexDirection: "column", gap: 12 }}>
          {selCam && <CameraDetailDrawer camaraId={selCam.id} onClose={() => setSelCam(null)} />}
          {selChat && (
            <div style={cssObj(panel)}>
              <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--sc-card-line)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <b style={{ color: "#2563eb" }}>💬 Chat · {selChat.folio}</b>
                <span onClick={() => setSelChat(null)} style={{ cursor: "pointer", color: "var(--sc-text-faint)" }}>✕</span>
              </div>
              <div style={{ padding: "8px 12px 12px" }}>
                <ChatIncidente canalId={selChat.canalId} alto={300} />
              </div>
            </div>
          )}
        </div>
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
