"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import VisorCamara from "@/app/components/VisorCamara";

// Inspector de cámara (Camera Inspector / Detalle de cámara). REUTILIZABLE desde
// catálogo, muro, mapa e incidente. La UI es guiada por CAPACIDADES (live/snapshot/
// ptz/grabación/eventos) que resuelve la edge function `camara_vista` por driver:
// hoy Windy hace lo real (snapshot->evidencia, incidente, historial); PTZ/grabación/
// eventos quedan cableados y se ENCIENDEN solos cuando entre un VMS (ISS/Milestone/
// Genetec) — sin tocar esta pantalla. Ver migración 0067.
interface Cap { live: boolean; snapshot: boolean; ptz: boolean; grabacion: boolean; eventos: boolean }
interface Cam {
  id: string; folio: string | null; nombre: string; zona: string | null; ubicacion_desc: string | null;
  tipo: string | null; es_ptz: boolean; resolucion: string | null; fps: number | null; vms: string | null;
  ip: string | null; retencion_dias: number | null; grabacion_disponible: boolean; ultima_actividad: string | null;
  estado_operativo: string; proveedor: string; latitud: number | null; longitud: number | null; sitio?: { nombre: string } | null;
}
interface Evento { id: string; tipo: string; severidad: string; descripcion: string | null; ocurrido_en: string; resultado: string | null; llamada_id: string | null }

const EST: Record<string, { t: string; c: string }> = {
  ONLINE: { t: "EN LÍNEA", c: "#1f9d5c" }, NO_STREAM: { t: "SIN SEÑAL", c: "#d98a2b" },
  DEGRADED: { t: "DEGRADADA", c: "#d98a2b" }, MAINTENANCE: { t: "MANTENIMIENTO", c: "#d98a2b" },
  OFFLINE: { t: "DESCONECTADA", c: "#e23b53" }, LOADING: { t: "CARGANDO", c: "#8796a8" },
};

export default function CameraDetailDrawer({ camaraId, onClose, verMapaHref }: { camaraId: string; onClose?: () => void; verMapaHref?: string }) {
  const [cam, setCam] = useState<Cam | null>(null);
  const [vista, setVista] = useState<{ capacidades?: Cap; imagen_url?: string | null; estado?: string } | null>(null);
  const [tab, setTab] = useState<"detalle" | "eventos" | "historial">("detalle");
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ txt: string; href?: string; ok: boolean } | null>(null);
  const [incAbierto, setIncAbierto] = useState(false);
  const [incPrio, setIncPrio] = useState("alta");
  const [incDesc, setIncDesc] = useState("");

  useEffect(() => {
    setMsg(null); setIncAbierto(false); setTab("detalle");
    const cols = "id, folio, nombre, zona, ubicacion_desc, tipo, es_ptz, resolucion, fps, vms, ip, retencion_dias, grabacion_disponible, ultima_actividad, estado_operativo, proveedor, latitud, longitud, sitio:sitios(nombre)";
    supabase.from("camaras").select(cols).eq("id", camaraId).maybeSingle().then(async ({ data, error }) => {
      if (error) { // columnas nuevas aún no migradas (0067) -> cae a lo básico
        const { data: b } = await supabase.from("camaras")
          .select("id, folio, nombre, ubicacion_desc, estado_operativo, proveedor, latitud, longitud, sitio:sitios(nombre)")
          .eq("id", camaraId).maybeSingle();
        setCam(b as any);
      } else setCam(data as any);
    });
    supabase.from("camara_eventos").select("id, tipo, severidad, descripcion, ocurrido_en, resultado, llamada_id")
      .eq("camara_id", camaraId).order("ocurrido_en", { ascending: false }).limit(50).then(({ data }) => setEventos((data as any[]) ?? []));
  }, [camaraId]);

  const onVista = useCallback((v: any) => setVista(v), []);
  const cap: Cap = vista?.capacidades ?? { live: false, snapshot: false, ptz: false, grabacion: false, eventos: false };
  const estado = vista?.estado ?? (cam?.estado_operativo === "mantenimiento" ? "MAINTENANCE" : cam?.estado_operativo === "inactiva" ? "OFFLINE" : "LOADING");
  const e = EST[estado] ?? EST.LOADING;

  async function guardarSnapshot() {
    if (!vista?.imagen_url) { setMsg({ txt: "No hay imagen disponible para guardar.", ok: false }); return; }
    setBusy(true); setMsg(null);
    const { data, error } = await supabase.rpc("rpc_camara_snapshot_evidencia", { p_camara: camaraId, p_imagen_url: vista.imagen_url, p_nota: null });
    setBusy(false);
    if (error) { setMsg({ txt: error.message, ok: false }); return; }
    setMsg({ txt: `Evidencia ${(data as any)?.folio ?? ""} creada.`, href: "/evidencias", ok: true });
  }

  async function crearIncidente() {
    setBusy(true); setMsg(null);
    const { data, error } = await supabase.rpc("rpc_camara_crear_incidente", { p_camara: camaraId, p_tipo: null, p_prioridad: incPrio, p_descripcion: incDesc || null, p_snapshot_url: vista?.imagen_url ?? null });
    setBusy(false);
    if (error) { setMsg({ txt: error.message, ok: false }); return; }
    setIncAbierto(false); setIncDesc("");
    setMsg({ txt: `Incidente ${(data as any)?.folio ?? ""} creado.`, href: `/cad/${(data as any)?.llamada_id}`, ok: true });
  }

  async function ptz(cmd: string) {
    setMsg(null);
    const { data, error } = await supabase.functions.invoke("camara_vista", { body: { accion: "ptz", camara_id: camaraId, cmd } });
    const err = (data as any)?.error ?? error?.message;
    if (err) setMsg({ txt: err, ok: false });
  }

  const ficha: [string, string | number | null | undefined][] = useMemo(() => cam ? [
    ["Tipo", cam.tipo ?? (cam.es_ptz ? "PTZ" : "Fija")], ["Resolución", cam.resolucion], ["FPS", cam.fps],
    ["VMS", cam.vms ?? "—"], ["Sitio", cam.sitio?.nombre], ["Zona", cam.zona ?? cam.ubicacion_desc],
    ["IP", cam.ip], ["Retención", cam.retencion_dias ? `${cam.retencion_dias} días` : null],
    ["Grabación", cam.grabacion_disponible ? "Disponible" : "No disponible"],
    ["Última actividad", cam.ultima_actividad ? new Date(cam.ultima_actividad).toLocaleString("es-MX", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" }) : null],
  ] : [], [cam]);

  const panel = { background: "var(--sc-content)", border: "1px solid var(--sc-card-line)", borderRadius: 12, color: "var(--sc-text)" } as const;
  const btn = (on: boolean): React.CSSProperties => ({ flex: 1, minWidth: 96, padding: "8px 10px", borderRadius: 8, fontWeight: 700, fontSize: 12.5, cursor: on ? "pointer" : "not-allowed", border: "1px solid var(--sc-card-line)", background: on ? "var(--sc-btn,#f4a03f)" : "transparent", color: on ? "#fff" : "var(--sc-text-faint)", opacity: on ? 1 : 0.6 });
  const tabBtn = (k: string): React.CSSProperties => ({ flex: 1, padding: "8px 6px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", background: "transparent", border: "none", borderBottom: tab === k ? "2px solid var(--sc-btn,#f4a03f)" : "2px solid transparent", color: tab === k ? "var(--sc-text)" : "var(--sc-text-soft)" });

  return (
    <div style={{ ...panel, width: "100%" }}>
      {/* Encabezado */}
      <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--sc-card-line)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <b style={{ color: "#0e8f86" }}>📷 {cam?.folio ?? ""} {cam?.nombre ?? "Cámara"}</b>
          {onClose && <span onClick={onClose} style={{ cursor: "pointer", color: "var(--sc-text-faint)" }}>✕</span>}
        </div>
        <div style={{ fontSize: 12.5, color: "var(--sc-text-soft)", marginTop: 2 }}>{cam?.zona ?? cam?.ubicacion_desc ?? cam?.sitio?.nombre ?? ""}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, fontSize: 12, fontWeight: 700, color: e.c }}>
          <span style={{ width: 9, height: 9, borderRadius: "50%", background: e.c }} /> ● {e.t}
        </div>
      </div>

      {/* Video */}
      <div style={{ padding: 10 }}>
        <VisorCamara camaraId={camaraId} nombre={cam?.nombre} alto={190} onVista={onVista} />
      </div>

      {/* Pestañas */}
      <div style={{ display: "flex", borderBottom: "1px solid var(--sc-card-line)", padding: "0 10px" }}>
        <button style={tabBtn("detalle")} onClick={() => setTab("detalle")}>Detalle</button>
        <button style={tabBtn("eventos")} onClick={() => setTab("eventos")}>Eventos{eventos.length ? ` (${eventos.length})` : ""}</button>
        <button style={tabBtn("historial")} onClick={() => setTab("historial")}>Historial</button>
      </div>

      <div style={{ padding: "12px 14px" }}>
        {tab === "detalle" && (
          <>
            <div style={{ fontSize: 11, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--sc-text-faint)", marginBottom: 6 }}>Información</div>
            <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", rowGap: 4, columnGap: 12, fontSize: 12.5 }}>
              {ficha.filter(([, v]) => v != null && v !== "").map(([k, v]) => (
                <div key={k} style={{ display: "contents" }}>
                  <span style={{ color: "var(--sc-text-soft)" }}>{k}</span>
                  <span style={{ fontWeight: 600, textAlign: "right" }}>{String(v)}</span>
                </div>
              ))}
            </div>

            <div style={{ fontSize: 11, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--sc-text-faint)", margin: "14px 0 6px" }}>Acciones rápidas</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <button style={btn(cap.snapshot && !busy)} disabled={!cap.snapshot || busy} onClick={guardarSnapshot} title={cap.snapshot ? "Guardar snapshot como evidencia" : "El proveedor no entrega snapshot"}>📸 Snapshot → Evidencia</button>
              <button style={{ ...btn(!busy), background: "#e23b53" }} disabled={busy} onClick={() => setIncAbierto((x) => !x)}>🚨 Crear incidente</button>
              <Link href={`/videovigilancia/muro?cam=${camaraId}`} style={{ ...btn(true), background: "#2f6bff", textAlign: "center", textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center" }}>⧉ Enviar al Muro</Link>
              {cam?.latitud != null && <Link href={verMapaHref ?? "/mapa-operacional"} style={{ ...btn(true), background: "transparent", color: "var(--sc-text)", textAlign: "center", textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center" }}>🗺️ Ver en mapa</Link>}
              {/* Cableados; se encienden cuando el VMS los declare */}
              <button style={btn(cap.grabacion)} disabled={!cap.grabacion} title={cap.grabacion ? "Grabar clip" : "Disponible con un VMS conectado"}>⏺ Grabar {(!cap.grabacion) && "· VMS"}</button>
            </div>

            {/* Form incidente */}
            {incAbierto && (
              <div style={{ marginTop: 10, padding: 10, border: "1px solid var(--sc-card-line)", borderRadius: 10 }}>
                <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  <select value={incPrio} onChange={(ev) => setIncPrio(ev.target.value)} style={{ padding: "7px 9px", borderRadius: 8, border: "1px solid var(--sc-card-line)", background: "var(--sc-content)", color: "var(--sc-text)", fontSize: 13 }}>
                    <option value="alta">Prioridad alta</option><option value="media">Media</option><option value="baja">Baja</option>
                  </select>
                  <input value={incDesc} onChange={(ev) => setIncDesc(ev.target.value)} placeholder="Descripción (opcional)" style={{ flex: 1, padding: "7px 10px", borderRadius: 8, border: "1px solid var(--sc-card-line)", background: "var(--sc-content)", color: "var(--sc-text)", fontSize: 13 }} />
                </div>
                <button style={{ ...btn(!busy), background: "#e23b53", width: "100%" }} disabled={busy} onClick={crearIncidente}>Crear incidente (se ancla al sitio + snapshot)</button>
              </div>
            )}

            {/* PTZ (cableado; deshabilitado hasta cámara PTZ + VMS) */}
            <div style={{ fontSize: 11, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--sc-text-faint)", margin: "14px 0 6px" }}>PTZ {(!cap.ptz) && <span style={{ textTransform: "none", fontWeight: 400 }}>· requiere cámara PTZ + VMS</span>}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 40px)", gap: 6, justifyContent: "center", opacity: cap.ptz ? 1 : 0.4 }}>
              {[["up", "↑"], ["left", "←"], ["home", "⌂"], ["right", "→"], ["down", "↓"], ["zin", "＋"], ["zout", "－"]].map(([c, s]) => (
                <button key={c} disabled={!cap.ptz} onClick={() => ptz(c)} style={{ width: 40, height: 34, borderRadius: 8, border: "1px solid var(--sc-card-line)", background: "transparent", color: "var(--sc-text)", cursor: cap.ptz ? "pointer" : "not-allowed" }}>{s}</button>
              ))}
            </div>
          </>
        )}

        {tab === "eventos" && (
          <div>
            {eventos.length === 0 ? (
              <div style={{ color: "var(--sc-text-soft)", fontSize: 13, textAlign: "center", padding: "18px 6px" }}>Sin eventos.<br /><span style={{ fontSize: 12, color: "var(--sc-text-faint)" }}>Los eventos analíticos llegan cuando se conecta un VMS o motor de analítica.</span></div>
            ) : eventos.map((ev) => (
              <div key={ev.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--sc-card-line)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
                  <b style={{ color: ev.severidad === "critico" ? "#e23b53" : ev.severidad === "aviso" ? "#d98a2b" : "var(--sc-text)" }}>{ev.tipo}</b>
                  <span style={{ color: "var(--sc-text-faint)" }}>{new Date(ev.ocurrido_en).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                </div>
                {ev.descripcion && <div style={{ fontSize: 12, color: "var(--sc-text-soft)" }}>{ev.descripcion}</div>}
                {ev.llamada_id ? <Link href={`/cad/${ev.llamada_id}`} style={{ fontSize: 12, color: "#2f6bff" }}>Ver incidente</Link>
                  : <button onClick={() => setIncAbierto(true)} style={{ fontSize: 12, color: "#e23b53", background: "transparent", border: "none", cursor: "pointer", padding: 0 }}>Crear incidente</button>}
              </div>
            ))}
          </div>
        )}

        {tab === "historial" && (
          <div style={{ fontSize: 12.5, display: "grid", gridTemplateColumns: "auto 1fr", rowGap: 5, columnGap: 12 }}>
            <span style={{ color: "var(--sc-text-soft)" }}>Estado actual</span><span style={{ fontWeight: 600, textAlign: "right", color: e.c }}>{e.t}</span>
            <span style={{ color: "var(--sc-text-soft)" }}>Proveedor</span><span style={{ fontWeight: 600, textAlign: "right" }}>{cam?.vms ?? cam?.proveedor}</span>
            {cam?.ultima_actividad && (<><span style={{ color: "var(--sc-text-soft)" }}>Última actividad</span><span style={{ fontWeight: 600, textAlign: "right" }}>{new Date(cam.ultima_actividad).toLocaleString("es-MX")}</span></>)}
            <div style={{ gridColumn: "1 / -1", color: "var(--sc-text-faint)", fontSize: 11.5, marginTop: 6 }}>El historial detallado (caídas de señal, mantenimiento, reinicios) se poblará desde el VMS/analítica.</div>
          </div>
        )}

        {msg && <div style={{ marginTop: 10, fontSize: 12.5, color: msg.ok ? "#1f9d5c" : "#e23b53" }}>{msg.txt} {msg.href && <Link href={msg.href} style={{ color: "#2f6bff", marginLeft: 4 }}>Abrir →</Link>}</div>}
      </div>
    </div>
  );
}
