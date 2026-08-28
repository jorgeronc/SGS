"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import VisorCamara from "@/app/components/VisorCamara";
import MapaBase from "@/app/components/MapaBase";
import CameraDetailDrawer from "@/app/components/CameraDetailDrawer";

// Consola de Videovigilancia (Monitoreo en tiempo real) — pantalla dedicada para
// el OPERADOR DE VIDEO. Doble recuadro (dual-view) con arrastrar-y-soltar desde la
// tira de miniaturas; al hacer clic, la nueva cámara entra a la IZQUIERDA y la que
// estaba se recorre a la DERECHA. El mini-mapa se centra/resalta en la última
// cámara seleccionada. La gestión/alta vive en /videovigilancia/camaras.

const COLEST: Record<string, string> = { activa: "#1f9d5c", mantenimiento: "#d98a2b", inactiva: "#e23b53" };
const estLbl = (e: string) => (e === "activa" ? "En línea" : e === "mantenimiento" ? "Mantenimiento" : "Sin señal");
const SEV: Record<string, { c: string; t: string }> = { critico: { c: "#e23b53", t: "Crítico" }, aviso: { c: "#d98a2b", t: "Alto" }, info: { c: "#2f6bff", t: "Info" } };

function Donut({ pct, color }: { pct: number; color: string }) {
  const r = 52, c = 2 * Math.PI * r, off = c * (1 - pct / 100);
  return (
    <svg width={130} height={130} viewBox="0 0 130 130">
      <circle cx={65} cy={65} r={r} fill="none" stroke="var(--sc-card-line)" strokeWidth={12} />
      <circle cx={65} cy={65} r={r} fill="none" stroke={color} strokeWidth={12} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off} transform="rotate(-90 65 65)" />
      <text x={65} y={62} textAnchor="middle" fontSize={24} fontWeight={800} fill="var(--sc-text)">{pct.toFixed(1)}%</text>
      <text x={65} y={80} textAnchor="middle" fontSize={9.5} fill="var(--sc-text-soft)">Disponibilidad</text>
    </svg>
  );
}

interface Cam { id: string; folio: string | null; nombre: string; estado_operativo: string; sitio_id: string; latitud: number | null; longitud: number | null; zona: string | null; sitio?: { nombre: string } | null }
interface Ev { id: string; tipo: string; severidad: string; descripcion: string | null; ocurrido_en: string; camara_id: string }

export default function VideovigilanciaConsolaPage() {
  const [cams, setCams] = useState<Cam[]>([]);
  const [slotL, setSlotL] = useState<Cam | null>(null);
  const [slotR, setSlotR] = useState<Cam | null>(null);
  const [busca, setBusca] = useState("");
  const [eventos, setEventos] = useState<Ev[]>([]);
  const [tab, setTab] = useState("En vivo");
  const [ahora, setAhora] = useState<Date | null>(null);
  const [inspectorCam, setInspectorCam] = useState<Cam | null>(null);
  const [colapsados, setColapsados] = useState<Set<string>>(new Set());
  const marks = useRef<any[]>([]);
  const mlRef = useRef<any>(null);
  const mapRef = useRef<any>(null);

  useEffect(() => { const t = setInterval(() => setAhora(new Date()), 1000); setAhora(new Date()); return () => clearInterval(t); }, []);

  useEffect(() => {
    supabase.from("camaras")
      .select("id, folio, nombre, estado_operativo, sitio_id, latitud, longitud, zona, sitio:sitios(nombre)")
      .eq("estatus", "activo").order("nombre")
      .then(({ data }) => {
        const c = (data as any[]) ?? []; setCams(c);
        const act = c.filter((x) => x.estado_operativo === "activa");
        setSlotL((s) => s ?? act[0] ?? c[0] ?? null);
        setSlotR((s) => s ?? act[1] ?? null);
      });
    supabase.from("camara_eventos").select("id, tipo, severidad, descripcion, ocurrido_en, camara_id")
      .order("ocurrido_en", { ascending: false }).limit(12).then(({ data }) => setEventos((data as any[]) ?? []));
  }, []);

  // Abre una cámara: entra a la IZQUIERDA; la que estaba se recorre a la DERECHA.
  const abrir = useCallback((c: Cam) => { setSlotL((curL) => { if (curL?.id === c.id) return curL; setSlotR(curL); return c; }); }, []);
  const toggleSitio = (s: string) => setColapsados((p) => { const n = new Set(p); n.has(s) ? n.delete(s) : n.add(s); return n; });

  // Árbol por sitio (orden alfabético de sitios y de cámaras) + búsqueda.
  const grupos = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const fil = cams.filter((c) => !q || `${c.folio ?? ""} ${c.nombre} ${c.sitio?.nombre ?? ""} ${c.zona ?? ""}`.toLowerCase().includes(q));
    const m = new Map<string, Cam[]>();
    fil.forEach((c) => { const k = c.sitio?.nombre ?? "Sin sitio"; if (!m.has(k)) m.set(k, []); m.get(k)!.push(c); });
    const arr = Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0], "es"));
    arr.forEach(([, list]) => list.sort((x, y) => (x.nombre || "").localeCompare(y.nombre || "", "es", { numeric: true })));
    return arr;
  }, [cams, busca]);

  const salud = useMemo(() => {
    const total = cams.length, linea = cams.filter((c) => c.estado_operativo === "activa").length;
    const sin = cams.filter((c) => c.estado_operativo === "inactiva").length;
    const mant = cams.filter((c) => c.estado_operativo === "mantenimiento").length;
    return { total, linea, sin, mant, pct: total ? (linea / total) * 100 : 0 };
  }, [cams]);

  const conCoords = useMemo(() => cams.filter((c) => c.latitud != null && c.longitud != null), [cams]);
  const centro = useMemo<[number, number]>(() => slotL?.latitud != null ? [Number(slotL.longitud), Number(slotL.latitud)] : conCoords.length ? [Number(conCoords[0].longitud), Number(conCoords[0].latitud)] : [-100.309, 25.6714], [slotL, conCoords]);

  const pintarMapa = useCallback(() => {
    const map = mapRef.current, ml = mlRef.current; if (!map || !ml) return;
    marks.current.forEach((m) => m.remove()); marks.current = [];
    conCoords.forEach((c) => {
      const activo = c.id === slotL?.id;
      const el = document.createElement("div");
      el.style.cssText = `width:${activo ? 18 : 13}px;height:${activo ? 18 : 13}px;border-radius:50%;background:${COLEST[c.estado_operativo] ?? "#607d8b"};border:2px solid #fff;box-shadow:${activo ? "0 0 0 3px #2f6bffaa," : ""}0 1px 4px #0006;cursor:pointer`;
      el.title = `${c.folio ?? ""} ${c.nombre}`;
      el.onclick = () => abrir(c);
      marks.current.push(new ml.Marker({ element: el }).setLngLat([Number(c.longitud), Number(c.latitud)]).addTo(map));
    });
  }, [conCoords, slotL, abrir]);

  async function onMapReady(map: any) {
    mapRef.current = map;
    if (!mlRef.current) { const m = await import("maplibre-gl"); mlRef.current = (m as any).default ?? m; }
    pintarMapa();
    if (slotL?.latitud != null) map.flyTo({ center: [Number(slotL.longitud), Number(slotL.latitud)], zoom: Math.max(map.getZoom(), 13), duration: 500 });
  }
  useEffect(() => { pintarMapa(); }, [pintarMapa]);
  // Centra el mapa en la última cámara seleccionada.
  useEffect(() => {
    const map = mapRef.current;
    if (map && slotL?.latitud != null) map.flyTo({ center: [Number(slotL.longitud), Number(slotL.latitud)], zoom: Math.max(map.getZoom?.() ?? 11, 13), duration: 700 });
  }, [slotL]);

  const miniaturas = useMemo(() => cams.filter((c) => c.id !== slotL?.id && c.id !== slotR?.id).slice(0, 20), [cams, slotL, slotR]);

  const TABS = ["En vivo", "Mosaico", "Mapa", "Eventos", "Investigación"];
  const card: React.CSSProperties = { background: "var(--sc-content)", border: "1px solid var(--sc-card-line)", borderRadius: 12, color: "var(--sc-text)" };
  const dot = (e: string) => <span style={{ width: 9, height: 9, borderRadius: "50%", background: COLEST[e] ?? "#607d8b", flex: "0 0 auto" }} />;

  return (
    <div style={{ height: "calc(100vh - 56px)", margin: -22, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--bg,#eef1f5)" }}>
      {/* Barra superior */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "8px 16px", borderBottom: "1px solid var(--sc-card-line)", background: "var(--sc-content)", flex: "0 0 auto" }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 17 }}>Videovigilancia</div>
          <div style={{ fontSize: 11.5, color: "var(--sc-text-soft)" }}>Monitoreo en tiempo real</div>
        </div>
        <div style={{ display: "flex", gap: 6, marginLeft: 10 }}>
          {TABS.map((t) => (
            t === "Mosaico"
              ? <Link key={t} href="/videovigilancia/muro" style={{ padding: "7px 14px", borderRadius: 9, fontSize: 13, fontWeight: 600, textDecoration: "none", color: "var(--sc-text-soft)", border: "1px solid var(--sc-card-line)" }}>Mosaico</Link>
              : <button key={t} onClick={() => setTab(t)} style={{ padding: "7px 14px", borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: "pointer", border: "1px solid " + (tab === t ? "var(--sc-btn,#f4a03f)" : "var(--sc-card-line)"), background: tab === t ? "var(--sc-btn,#f4a03f)" : "transparent", color: tab === t ? "#fff" : "var(--sc-text-soft)" }}>{t}{t === "Investigación" ? " ·VMS" : ""}</button>
          ))}
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "#1f9d5c", fontWeight: 700 }}>● En línea</span>
          <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
            <div style={{ fontWeight: 800 }}>{ahora ? ahora.toLocaleTimeString() : "—"}</div>
            <div style={{ fontSize: 11, color: "var(--sc-text-soft)" }}>{ahora ? ahora.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" }) : ""}</div>
          </div>
          <Link href="/videovigilancia/camaras" style={{ fontSize: 12.5, color: "var(--sc-btn,#f4a03f)", textDecoration: "none", fontWeight: 700 }}>⚙ Administrar</Link>
        </div>
      </div>

      {/* Cuerpo */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", gap: 12, padding: 12 }}>
        {/* Sidebar de cámaras */}
        <aside style={{ ...card, width: 250, flex: "0 0 auto", display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--sc-card-line)" }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".05em", color: "var(--sc-text-faint)", marginBottom: 8 }}>CÁMARAS</div>
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar cámara…" style={{ width: "100%", padding: "7px 10px", borderRadius: 8, border: "1px solid var(--sc-card-line)", background: "var(--bg,#f4f6f9)", color: "var(--sc-text)", fontSize: 13 }} />
          </div>
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "6px 6px" }}>
            {grupos.map(([sitio, list]) => {
              const abierto = !colapsados.has(sitio);
              return (
                <div key={sitio} style={{ marginBottom: 4 }}>
                  <button onClick={() => toggleSitio(sitio)} style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", textAlign: "left", background: "transparent", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700, color: "var(--sc-text-soft)", padding: "6px 8px" }}>
                    <span style={{ width: 12, display: "inline-block" }}>{abierto ? "▾" : "▸"}</span>🏢 {sitio}
                    <span style={{ marginLeft: "auto", fontWeight: 400, color: "var(--sc-text-faint)" }}>{list.length}</span>
                  </button>
                  {abierto && list.map((c) => {
                    const enSlot = c.id === slotL?.id || c.id === slotR?.id;
                    return (
                      <button key={c.id} draggable onDragStart={(e) => e.dataTransfer.setData("camid", c.id)} onClick={() => abrir(c)}
                        style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", padding: "7px 10px 7px 22px", borderRadius: 8, cursor: "pointer", border: "none", fontSize: 13, background: enSlot ? "var(--sc-btn-soft,#f6ede1)" : "transparent", color: "var(--sc-text)", borderLeft: c.id === slotL?.id ? "3px solid var(--sc-btn,#f4a03f)" : "3px solid transparent" }}>
                        {dot(c.estado_operativo)}
                        <span style={{ color: "var(--sc-text-soft)", fontVariantNumeric: "tabular-nums" }}>{c.folio ?? ""}</span>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.nombre}</span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
            {grupos.length === 0 && <p style={{ color: "var(--sc-text-soft)", fontSize: 13, padding: 10 }}>Sin cámaras.</p>}
          </div>
          <div style={{ display: "flex", gap: 6, padding: 8, borderTop: "1px solid var(--sc-card-line)" }}>
            <button style={{ flex: 1, padding: "7px", borderRadius: 8, border: "none", background: "#2f6bff", color: "#fff", fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}>★ Favoritos</button>
            <button style={{ flex: 1, padding: "7px", borderRadius: 8, border: "1px solid var(--sc-card-line)", background: "transparent", color: "var(--sc-text-soft)", fontSize: 12.5, cursor: "pointer" }}>Vistas guardadas</button>
          </div>
        </aside>

        {/* Columna derecha: doble reproductor + fila inferior */}
        <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Doble recuadro (dual-view) con drag & drop */}
          <div style={{ flex: "1 1 55%", minHeight: 0, display: "flex", gap: 12 }}>
            {([["Izquierda", slotL, setSlotL], ["Derecha", slotR, setSlotR]] as const).map(([lado, cam, setCam]) => (
              <div key={lado}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData("camid"); const c = cams.find((x) => x.id === id); if (c) setCam(c); }}
                style={{ flex: 1, minWidth: 0, background: "#0b1220", borderRadius: 12, overflow: "hidden", display: "flex", flexDirection: "column", outline: cam?.id === slotL?.id && lado === "Izquierda" ? "2px solid var(--sc-btn,#f4a03f)" : undefined }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", color: "#fff", background: "#11223c" }}>
                  {cam ? (<>
                    <b style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cam.folio} · {cam.nombre}</b>
                    <span style={{ fontSize: 10.5, fontWeight: 700, background: (COLEST[cam.estado_operativo] ?? "#607d8b") + "33", color: COLEST[cam.estado_operativo] ?? "#ccc", borderRadius: 5, padding: "1px 6px", flex: "0 0 auto" }}>{estLbl(cam.estado_operativo).toUpperCase()}</span>
                    <span title="Detalle / inspector" onClick={() => setInspectorCam(cam)} style={{ marginLeft: "auto", cursor: "pointer", fontSize: 16, flex: "0 0 auto" }}>⋮</span>
                  </>) : <span style={{ fontSize: 12, opacity: 0.7 }}>Recuadro {lado.toLowerCase()}</span>}
                </div>
                <div style={{ flex: 1, minHeight: 0 }}>
                  {cam ? <VisorCamara key={cam.id} camaraId={cam.id} nombre={cam.nombre} llenar />
                    : <div style={{ height: "100%", display: "grid", placeItems: "center", color: "#6b7a8d", fontSize: 13, textAlign: "center", padding: 12 }}>Arrastra una cámara aquí<br /><span style={{ fontSize: 11.5 }}>o haz clic en una de la lista/tira</span></div>}
                </div>
              </div>
            ))}
          </div>

          {/* Tira de miniaturas (arrastrables) */}
          <div style={{ display: "flex", gap: 10, overflowX: "auto", flex: "0 0 auto", paddingBottom: 2 }}>
            {miniaturas.map((c) => (
              <div key={c.id} draggable onDragStart={(e) => e.dataTransfer.setData("camid", c.id)} onClick={() => abrir(c)} title="Clic = abrir · Arrastra a un recuadro"
                style={{ width: 180, flex: "0 0 auto", cursor: "grab", border: "1px solid var(--sc-card-line)", borderRadius: 8, overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 7px", fontSize: 11, background: "#11223c", color: "#fff" }}>{dot(c.estado_operativo)}<span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.folio} · {c.nombre}</span></div>
                <VisorCamara key={c.id} camaraId={c.id} nombre={c.nombre} alto={92} />
              </div>
            ))}
            {miniaturas.length === 0 && <div style={{ color: "var(--sc-text-soft)", fontSize: 12.5, padding: 8 }}>Sin más cámaras en línea.</div>}
          </div>

          {/* Fila inferior: eventos / mapa / salud */}
          <div style={{ flex: "1 1 38%", minHeight: 160, display: "grid", gridTemplateColumns: "1fr 1.2fr 1fr", gap: 12 }}>
            <div style={{ ...card, display: "flex", flexDirection: "column", overflow: "hidden" }}>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 12px", borderBottom: "1px solid var(--sc-card-line)" }}><b style={{ fontSize: 13 }}>Eventos recientes</b></div>
              <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "4px 8px" }}>
                {eventos.length === 0 ? (
                  <div style={{ color: "var(--sc-text-soft)", fontSize: 12.5, textAlign: "center", padding: "22px 8px" }}>Sin eventos.<br /><span style={{ fontSize: 11.5, color: "var(--sc-text-faint)" }}>Los eventos analíticos llegan con un VMS/analítica conectados.</span></div>
                ) : eventos.map((ev) => {
                  const c = cams.find((x) => x.id === ev.camara_id); const s = SEV[ev.severidad] ?? SEV.info;
                  return (
                    <div key={ev.id} onClick={() => c && abrir(c)} style={{ display: "flex", gap: 8, padding: "8px 6px", borderBottom: "1px solid var(--sc-card-line)", cursor: c ? "pointer" : "default" }}>
                      <span style={{ fontSize: 11, color: "var(--sc-text-faint)", fontVariantNumeric: "tabular-nums" }}>{new Date(ev.ocurrido_en).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 600 }}>{ev.tipo}</div>
                        <div style={{ fontSize: 11.5, color: "var(--sc-text-soft)" }}>{c?.folio} {c?.nombre}</div>
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 700, color: s.c, background: s.c + "1e", borderRadius: 5, padding: "1px 6px", height: "fit-content" }}>{s.t}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={{ ...card, overflow: "hidden", position: "relative" }}>
              <div style={{ position: "absolute", top: 8, left: 10, zIndex: 2, fontSize: 12, fontWeight: 700, background: "var(--sc-content)", padding: "2px 8px", borderRadius: 6, border: "1px solid var(--sc-card-line)" }}>Mapa de cámaras</div>
              <MapaBase center={centro} zoom={12} className="vv-map" onReady={onMapReady} />
              <style>{`.vv-map{position:absolute;inset:0}`}</style>
              <div style={{ position: "absolute", bottom: 8, left: 10, zIndex: 2, display: "flex", gap: 10, fontSize: 11, background: "var(--sc-content)", padding: "3px 8px", borderRadius: 6, border: "1px solid var(--sc-card-line)" }}>
                <span style={{ color: "#1f9d5c" }}>● {salud.linea}</span><span style={{ color: "#e23b53" }}>● {salud.sin}</span><span style={{ color: "#d98a2b" }}>● {salud.mant}</span>
              </div>
            </div>

            <div style={{ ...card, padding: 12, overflowY: "auto" }}>
              <b style={{ fontSize: 13 }}>Salud del sistema</b>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 6 }}>
                <Donut pct={salud.pct} color={salud.pct >= 90 ? "#1f9d5c" : salud.pct >= 75 ? "#d98a2b" : "#e23b53"} />
                <div style={{ flex: 1, fontSize: 12.5 }}>
                  {[["Cámaras totales", salud.total, "var(--sc-text)"], ["En línea", salud.linea, "#1f9d5c"], ["Sin señal", salud.sin, "#e23b53"], ["Mantenimiento", salud.mant, "#d98a2b"]].map(([l, n, c]) => (
                    <div key={l as string} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}><span style={{ color: "var(--sc-text-soft)" }}>{l as string}</span><b style={{ color: c as string }}>{n as number}</b></div>
                  ))}
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 10 }}>
                {[["Ancho de banda", "· VMS"], ["Almacenamiento", "· VMS"], ["Retención", "30 días"]].map(([l, v]) => (
                  <div key={l} style={{ border: "1px solid var(--sc-card-line)", borderRadius: 8, padding: "8px 6px", textAlign: "center" }}>
                    <div style={{ fontWeight: 800, fontSize: 14 }}>{v}</div>
                    <div style={{ fontSize: 10.5, color: "var(--sc-text-soft)" }}>{l}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Inspector (drawer) */}
      {inspectorCam && (
        <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: 360, maxWidth: "92vw", zIndex: 40, boxShadow: "-8px 0 24px #0003", background: "var(--sc-content)", overflowY: "auto" }}>
          <CameraDetailDrawer camaraId={inspectorCam.id} onClose={() => setInspectorCam(null)} />
        </div>
      )}
    </div>
  );
}
