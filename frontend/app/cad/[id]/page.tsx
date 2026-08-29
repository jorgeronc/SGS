"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import type { LlamadaCad, EstadoDespachoLlamada } from "@/lib/types";
import VinculosPanel from "@/app/components/VinculosPanel";
import MapaUbicacion from "@/app/components/MapaUbicacion";
import MapaPicker from "@/app/components/MapaPicker";
import DespachoRecursos from "@/app/components/DespachoRecursos";
import { CatalogoSelect } from "@/app/components/CatalogoSelect";
import DireccionGeocode from "@/app/components/DireccionGeocode";
import VisorTransmision from "@/app/components/VisorTransmision";
import GrabacionesTransmision from "@/app/components/GrabacionesTransmision";
import CamarasCercanas from "@/app/components/CamarasCercanas";
import HistorialCad from "@/app/components/HistorialCad";
import PersonasVehiculosIncidente from "@/app/components/PersonasVehiculosIncidente";

const ESTADOS: EstadoDespachoLlamada[] = ["recibida", "despachada", "en_atencion", "resuelta"];
const DESP_REPORTE: Record<string, string> = { recibida: "Recibida", despachada: "Despachado", en_atencion: "En atención", resuelta: "Resuelta" };
const EST_LABEL: Record<string, string> = { activo: "Activo", cerrado: "Cerrado", cancelado: "Cancelado" };
const CONCLUSIONES = ["Atendida sin novedad", "Atendida con novedad", "Falsa alarma", "Cancelada"];
const MOTIVOS_CANCELADO = ["Cancelada por el cliente", "Reporte duplicado", "Sin acceso al sitio"];
const PASOS = ["Recibido", "En despacho", "En atención", "Resuelto", "Cerrado"];
type Tab = "detalle" | "personas" | "evidencias" | "archivos" | "vinculos" | "tareas" | "bitacora";

export default function IncidenciaDetallePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [llamada, setLlamada] = useState<LlamadaCad | null>(null);
  const [abriendoChat, setAbriendoChat] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [descripcion, setDescripcion] = useState("");
  const [editando, setEditando] = useState(false);
  const [ed, setEd] = useState({ tipo: "", prioridad: "media", reportante: "", telefono: "", direccion: "", lat: "", lng: "", estado_despacho: "recibida" });
  const [txActiva, setTxActiva] = useState<string | null>(null);
  const [pasoTs, setPasoTs] = useState<(string | null)[]>([null, null, null, null, null]);
  const [cerrando, setCerrando] = useState(false);
  const [conclusion, setConclusion] = useState("");
  const [motivoCancel, setMotivoCancel] = useState("");
  const [tab, setTab] = useState<Tab>("detalle");
  const [conteos, setConteos] = useState({ persona: 0, vehiculo: 0, evidencia: 0, tarea: 0, archivo: 0 });

  useEffect(() => {
    if (!params.id) return;
    async function buscar() {
      const { data } = await supabase.from("transmisiones").select("id, estado").eq("llamada_id", params.id).eq("estatus", "activo").eq("estado", "en_vivo").order("iniciado_en", { ascending: false }).limit(1).maybeSingle();
      setTxActiva((data as any)?.id ?? null);
    }
    buscar();
    const canal = supabase.channel(`cad-tx:${params.id}`).on("postgres_changes", { event: "*", schema: "public", table: "transmisiones", filter: `llamada_id=eq.${params.id}` }, buscar).subscribe();
    return () => { supabase.removeChannel(canal); };
  }, [params.id]);

  // Fecha/hora en que se alcanzó cada estatus (para la secuencia del encabezado).
  useEffect(() => {
    if (!params.id) return;
    const cargar = async () => {
      const { data } = await supabase.from("cad_estado_historial").select("campo, estado, cambiado_en").eq("llamada_id", params.id).eq("ambito", "reporte").order("cambiado_en", { ascending: true });
      const rows = (data as any[]) ?? [];
      const prim = (campo: string, val: string) => rows.find((r) => r.campo === campo && r.estado === val)?.cambiado_en ?? null;
      setPasoTs([
        (llamada as any)?.fecha_recepcion ?? prim("estado_despacho", "recibida"),
        prim("estado_despacho", "despachada"),
        prim("estado_despacho", "en_atencion"),
        prim("estado_despacho", "resuelta"),
        prim("estatus", "cerrado") ?? (llamada as any)?.fecha_cierre ?? null,
      ]);
    };
    cargar();
    const canal = supabase.channel(`cad-histp:${params.id}`).on("postgres_changes", { event: "INSERT", schema: "public", table: "cad_estado_historial", filter: `llamada_id=eq.${params.id}` }, cargar).subscribe();
    return () => { supabase.removeChannel(canal); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id, (llamada as any)?.fecha_recepcion, (llamada as any)?.fecha_cierre]);

  async function guardar() {
    if (!llamada) return;
    if (ed.telefono && ed.telefono.length !== 10) { setError("El teléfono debe tener 10 dígitos."); return; }
    setGuardando(true); setError(null); setMensaje(null);
    const cierre = ed.estado_despacho === "resuelta" ? (llamada.fecha_cierre ?? new Date().toISOString()) : null;
    const { error } = await supabase.from("llamadas_cad").update({
      tipo: ed.tipo || null, prioridad: ed.prioridad || null, reportante: ed.reportante || null,
      telefono: ed.telefono || null, direccion: ed.direccion || null,
      latitud: ed.lat ? Number(ed.lat) : null, longitud: ed.lng ? Number(ed.lng) : null,
      estado_despacho: ed.estado_despacho, fecha_cierre: cierre,
      descripcion: descripcion.trim() || null, actualizado_en: new Date().toISOString(),
    }).eq("id", llamada.id);
    setGuardando(false);
    if (error) { setError(error.message); return; }
    setMensaje("Cambios guardados."); setEditando(false); cargarLlamada();
  }

  async function cargarLlamada() {
    const { data, error } = await supabase.from("llamadas_cad").select("*").eq("id", params.id).maybeSingle();
    if (error) { setError(error.message); return; }
    setLlamada(data as LlamadaCad);
    setDescripcion((data as LlamadaCad)?.descripcion ?? "");
    const l = data as any;
    setEd({ tipo: l.tipo ?? "", prioridad: l.prioridad ?? "media", reportante: l.reportante ?? "", telefono: l.telefono ?? "", direccion: l.direccion ?? "", lat: l.latitud != null ? String(l.latitud) : "", lng: l.longitud != null ? String(l.longitud) : "", estado_despacho: l.estado_despacho ?? "recibida" });
    supabase.rpc("rpc_registrar_bitacora", { p_tipo_accion: "CONSULTAR", p_entidad_tipo: "llamadas_cad", p_entidad_id: params.id, p_modulo: "cad" }).then(() => undefined);
  }

  // Conteos de "Registros relacionados".
  useEffect(() => {
    if (!params.id) return;
    (async () => {
      const { data } = await supabase.from("vinculos").select("entidad_destino_tipo").eq("entidad_origen_tipo", "cad").eq("entidad_origen_id", params.id).eq("estatus", "activo");
      const arr = (data as any[]) ?? []; const c = (t: string) => arr.filter((x) => x.entidad_destino_tipo === t).length;
      const fotos = Array.isArray((llamada as any)?.datos_adicionales?.fotografias) ? (llamada as any).datos_adicionales.fotografias.length : 0;
      setConteos({ persona: c("persona"), vehiculo: c("vehiculo"), evidencia: c("evidencia"), tarea: c("tarea"), archivo: fotos });
    })();
  }, [params.id, llamada]);

  async function irAlChat() {
    if (!llamada) return;
    setAbriendoChat(true);
    const { data, error } = await supabase.rpc("rpc_incidente_unir_chat", { p_llamada: llamada.id });
    setAbriendoChat(false);
    if (error) { setError(error.message); return; }
    router.push((data as string | null) ? `/chat?canal=${data}` : "/chat");
  }

  useEffect(() => { cargarLlamada(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [params.id]);

  async function cerrarReporte() {
    if (!llamada) return;
    if (!conclusion) { setError("Selecciona una conclusión de cierre."); return; }
    if (conclusion === "Cancelada" && !motivoCancel) { setError("Selecciona el motivo de la cancelación."); return; }
    setGuardando(true); setError(null);
    const { error } = await supabase.from("llamadas_cad").update({ estatus: "cerrado", estado_despacho: "resuelta", conclusion, motivo_cierre: conclusion === "Cancelada" ? motivoCancel : null, fecha_cierre: llamada.fecha_cierre ?? new Date().toISOString(), actualizado_en: new Date().toISOString() }).eq("id", llamada.id);
    if (!error) {
      const { data: desp } = await supabase.from("despachos").select("id, patrulla_id").eq("llamada_id", llamada.id).eq("estatus", "activo").neq("estado", "cerrado");
      for (const d of ((desp as any[]) ?? [])) {
        await supabase.from("despachos").update({ estado: "cerrado", actualizado_en: new Date().toISOString() }).eq("id", d.id);
        if (d.patrulla_id) await supabase.from("patrullas").update({ estatus_unidad: "disponible", actualizado_en: new Date().toISOString() }).eq("id", d.patrulla_id);
      }
    }
    setGuardando(false);
    if (error) { setError(error.message); return; }
    setCerrando(false); cargarLlamada();
  }

  const fotosReporte = useMemo(() => {
    const dd = (llamada as any)?.datos_adicionales ?? {};
    return (Array.isArray(dd.fotografias) ? dd.fotografias : []) as string[];
  }, [llamada]);

  if (!llamada) return <main className="contenedor">{error ? <p>{error}</p> : <p>Cargando...</p>}</main>;

  const editable = llamada.estatus === "activo";
  const cerrado = llamada.estatus !== "activo";
  // Si el incidente está ACTIVO se puede editar directo; si ya está cerrado se
  // requiere pulsar "Editar incidente".
  const puedeEditar = editable || editando;
  const fmtTs = (s: string | null) => (s ? new Date(s).toLocaleString() : "");
  // Tiempo de respuesta = entre la recepción y la fecha/hora de atención (en atención).
  const fmtDur = (ms: number) => { const min = Math.max(0, Math.round(ms / 60000)); const h = Math.floor(min / 60); const m = min % 60; return h > 0 ? `${h} h ${m} min` : `${m} min`; };
  const msResp = pasoTs[0] && pasoTs[2] ? new Date(pasoTs[2]).getTime() - new Date(pasoTs[0]).getTime() : null;
  const abrir = () => { setEditando(true); setMensaje(null); setTab("detalle"); };
  const cancelarEd = () => { setEditando(false); cargarLlamada(); };
  function generarPdf() { window.open(`/cad/${params.id}/imprimir`, "_blank", "noopener"); }

  const pasoIdx = cerrado ? 4 : llamada.estado_despacho === "resuelta" ? 3 : llamada.estado_despacho === "en_atencion" ? 2 : llamada.estado_despacho === "despachada" ? 1 : 0;

  const card: React.CSSProperties = { background: "var(--sc-content)", border: "1px solid var(--sc-card-line)", borderRadius: 14 };
  const h3: React.CSSProperties = { margin: "0 0 10px", fontSize: 14 };
  // Todos los botones y los cuadros de estatus comparten la misma altura (la del botón "Ir al chat").
  const H = 36;
  const btnBase: React.CSSProperties = { height: H, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 9, padding: "0 14px", fontWeight: 700, fontSize: 13.5, cursor: "pointer", whiteSpace: "nowrap", boxSizing: "border-box" };
  const btnP: React.CSSProperties = { ...btnBase, background: "var(--sc-btn,#f4a03f)", color: "#fff", border: "none" };
  const btn: React.CSSProperties = { ...btnBase, background: "transparent", color: "var(--sc-text)", border: "1px solid var(--sc-card-line)" };
  // Colores de fondo para los campos Prioridad y Estado del despacho.
  const bgPrioridad: Record<string, string> = { alta: "#fde7e7", media: "#fff4e0", baja: "#e6f6ec" };
  const fgPrioridad: Record<string, string> = { alta: "#b00020", media: "#8a5a00", baja: "#0a7c2f" };
  const bgDespacho: Record<string, string> = { recibida: "#eef1f4", despachada: "#e7effe", en_atencion: "#fff4e0", resuelta: "#e6f6ec" };
  const fgDespacho: Record<string, string> = { recibida: "#556070", despachada: "#2f6bff", en_atencion: "#8a5a00", resuelta: "#0a7c2f" };
  const tabBtn = (k: Tab, label: string): React.CSSProperties => ({ padding: "10px 15px", fontSize: 13.5, fontWeight: 700, cursor: "pointer", background: "transparent", border: "none", borderBottom: tab === k ? "3px solid var(--sc-btn,#f4a03f)" : "3px solid transparent", color: tab === k ? "var(--sc-text)" : "var(--sc-text-soft)" });

  const bloqueFotos = (titulo: string) => fotosReporte.length ? (
    <div><h3 style={h3}>{titulo}</h3><div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>{fotosReporte.map((p, i) => { const url = supabase.storage.from("fotos").getPublicUrl(p).data.publicUrl; return (<a key={i} href={url} target="_blank" rel="noopener noreferrer">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={url} alt={`Foto ${i + 1}`} style={{ width: 150, height: 150, objectFit: "cover", borderRadius: 8, border: "1px solid var(--sc-card-line)" }} /></a>); })}</div></div>
  ) : <div style={{ color: "var(--sc-text-soft)", fontSize: 13, textAlign: "center", padding: 14, border: "1px dashed var(--sc-card-line)", borderRadius: 10 }}>No hay {titulo.toLowerCase()}.</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Encabezado del incidente */}
      <div style={{ ...card, padding: 16 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <b style={{ fontSize: 22 }}>{llamada.folio ? `[${llamada.folio}] ` : ""}{llamada.tipo ?? "Incidencia"}</b>
              <span className={`cad-pill est-${llamada.estatus}`} style={{ height: H, display: "inline-flex", alignItems: "center", padding: "0 12px", fontSize: 14, fontWeight: 700, boxSizing: "border-box" }}>● {EST_LABEL[llamada.estatus] ?? llamada.estatus}</span>
              {txActiva && <span style={{ color: "#e11d48", fontWeight: 800, fontSize: 11.5 }}>🔴 EN VIVO</span>}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {cerrado && !editando && <button style={btnP} onClick={abrir}>✏️ Editar incidente</button>}
            {puedeEditar && <button style={btnP} onClick={guardar} disabled={guardando}>{guardando ? "Guardando…" : "💾 Guardar cambios"}</button>}
            {editando && <button style={btn} onClick={cancelarEd} disabled={guardando}>Cancelar</button>}
            {editable && <button style={{ ...btn, background: "#e23b53", color: "#fff", border: "none" }} onClick={() => { setError(null); setConclusion(""); setMotivoCancel(""); setCerrando(true); }} disabled={guardando}>🔒 Cerrar Incidente</button>}
            <button style={btn} onClick={generarPdf}>🖨️ Generar PDF</button>
          </div>
        </div>

        {/* Stepper + prioridad/despacho/guardia */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14, flexWrap: "wrap", borderTop: "1px solid var(--sc-card-line)", paddingTop: 12 }}>
          {PASOS.map((p, i) => (
            <div key={p} style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: 12 }}>
              <span style={{ width: 20, height: 20, borderRadius: "50%", display: "grid", placeItems: "center", color: "#fff", fontSize: 11, background: i < pasoIdx ? "#1f9d5c" : i === pasoIdx ? "#2f6bff" : "#c9d2dc" }}>{i < pasoIdx ? "✓" : i === pasoIdx ? "●" : "○"}</span>
              <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.25 }}>
                <span style={{ fontWeight: i === pasoIdx ? 800 : 400, color: i <= pasoIdx ? "var(--sc-text)" : "var(--sc-text-faint)" }}>{p}</span>
                <span style={{ fontSize: 10.5, color: "var(--sc-text-soft)", fontVariantNumeric: "tabular-nums" }}>{fmtTs(pasoTs[i])}</span>
              </div>
              {i < PASOS.length - 1 && <span style={{ color: "var(--sc-text-faint)", marginLeft: 4, marginTop: 3 }}>→</span>}
            </div>
          ))}
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ textAlign: "center", padding: "4px 12px", border: "1px solid var(--sc-card-line)", borderRadius: 9, background: "var(--sc-btn-soft,#f6ede1)" }}>
              <div style={{ fontSize: 10.5, color: "var(--sc-text-soft)", textTransform: "uppercase", letterSpacing: ".03em" }}>Tiempo de respuesta</div>
              <b style={{ fontSize: 15, fontVariantNumeric: "tabular-nums" }}>{msResp != null ? fmtDur(msResp) : "—"}</b>
            </div>
            {editable && <button style={{ ...btn, background: "#2f6bff", color: "#fff", border: "none" }} onClick={irAlChat} disabled={abriendoChat}>💬 {abriendoChat ? "Abriendo…" : "Ir al chat"}</button>}
          </div>
        </div>
        {cerrado && llamada.conclusion && <div style={{ marginTop: 8, fontSize: 13 }}>Conclusión: <b>{llamada.conclusion}</b>{llamada.motivo_cierre ? ` · ${llamada.motivo_cierre}` : ""}</div>}
        {mensaje && <p style={{ color: "#1f9d5c", fontSize: 13, margin: "8px 0 0" }}>{mensaje}</p>}
        {error && <p style={{ color: "#e23b53", fontSize: 13, margin: "8px 0 0" }}>{error}</p>}
      </div>

      {txActiva && <div style={{ ...card, padding: 14 }}><h3 style={h3}>🔴 Transmisión en vivo del guardia</h3><VisorTransmision transmisionId={txActiva} /></div>}

      {/* Pestañas */}
      <div style={card}>
        <div style={{ display: "flex", borderBottom: "1px solid var(--sc-card-line)", padding: "0 6px", flexWrap: "wrap" }}>
          <button style={tabBtn("detalle", "")} onClick={() => setTab("detalle")}>Detalle</button>
          <button style={tabBtn("personas", "")} onClick={() => setTab("personas")}>Personas y vehículos {conteos.persona + conteos.vehiculo > 0 ? `(${conteos.persona + conteos.vehiculo})` : ""}</button>
          <button style={tabBtn("evidencias", "")} onClick={() => setTab("evidencias")}>Evidencias</button>
          <button style={tabBtn("archivos", "")} onClick={() => setTab("archivos")}>Archivos</button>
          <button style={tabBtn("vinculos", "")} onClick={() => setTab("vinculos")}>Vínculos</button>
          <button style={tabBtn("tareas", "")} onClick={() => setTab("tareas")}>Tareas</button>
          <button style={tabBtn("bitacora", "")} onClick={() => setTab("bitacora")}>Bitácora</button>
        </div>

        <div style={{ padding: 16 }}>
          {tab === "detalle" && (
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.5fr) minmax(0,1fr)", gap: 16 }}>
              {/* Columna izquierda */}
              <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                <div>
                  <h3 style={h3}>Datos principales</h3>
                  <div className="form-grid">
                    <label>Tipo de incidencia<CatalogoSelect categoria="tipo_incidencia" value={ed.tipo} onChange={(v) => setEd({ ...ed, tipo: v })} disabled={!puedeEditar} /></label>
                    <label>Prioridad<select value={ed.prioridad} disabled={!puedeEditar} onChange={(e) => setEd({ ...ed, prioridad: e.target.value })} style={{ background: bgPrioridad[ed.prioridad], color: fgPrioridad[ed.prioridad], fontWeight: 700 }}><option value="alta">alta</option><option value="media">media</option><option value="baja">baja</option></select></label>
                    <label>Reportante<input value={ed.reportante} disabled={!puedeEditar} maxLength={45} onChange={(e) => setEd({ ...ed, reportante: e.target.value })} /></label>
                    <label>Teléfono<input value={ed.telefono} disabled={!puedeEditar} inputMode="numeric" maxLength={10} onChange={(e) => setEd({ ...ed, telefono: e.target.value.replace(/\D/g, "").slice(0, 10) })} /></label>
                    <label>Estado del despacho<select value={ed.estado_despacho} disabled={!puedeEditar} onChange={(e) => setEd({ ...ed, estado_despacho: e.target.value })} style={{ background: bgDespacho[ed.estado_despacho], color: fgDespacho[ed.estado_despacho], fontWeight: 700 }}>{ESTADOS.map((s) => <option key={s} value={s}>{DESP_REPORTE[s] ?? s}</option>)}</select></label>
                  </div>
                  <label className="dash-sub" style={{ display: "block", marginTop: 8 }}>Ubicación del Incidente</label>
                  <DireccionGeocode direccion={ed.direccion} lat={ed.lat} lng={ed.lng} onDireccion={(v) => setEd({ ...ed, direccion: v })} onCoords={(la, lo) => setEd({ ...ed, lat: la, lng: lo })} disabled={!puedeEditar} size={100} sinBoton sinCoords />
                  {llamada.latitud != null && <div style={{ marginTop: 10 }}><a href={`/mapa-operacional?incidente=${llamada.id}`} target="_blank" rel="noopener noreferrer" style={{ ...btnP, textDecoration: "none" }}>🗺️ Abrir en Mapa Operacional</a></div>}
                </div>

                <div>
                  <h3 style={h3}>Descripción y narrativas</h3>
                  <textarea style={{ display: "block", width: "100%", height: 200, resize: "vertical" }} placeholder="Descripción y narrativa cronológica de la incidencia…" value={descripcion} disabled={!puedeEditar} onChange={(e) => setDescripcion(e.target.value)} />
                  <div className="dash-sub" style={{ fontSize: 12, marginTop: 4 }}>Un solo campo cronológico (descripción + narrativas).</div>
                </div>

                <div><DespachoRecursos llamadaId={params.id} sitioId={(llamada as any).sitio_id ?? null} editable={editable} onDespacho={() => { setLlamada((l) => (l ? ({ ...l, estado_despacho: l.estado_despacho === "recibida" ? "despachada" : l.estado_despacho } as LlamadaCad) : l)); setEd((e) => ({ ...e, estado_despacho: e.estado_despacho === "recibida" ? "despachada" : e.estado_despacho })); }} /></div>
                <div>
                  <h3 style={h3}>🔗 Registros relacionados</h3>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 8, textAlign: "center" }}>
                    {[["👥 Personas", conteos.persona], ["🚗 Vehículos", conteos.vehiculo], ["🗂 Evidencias", conteos.evidencia], ["✔ Tareas", conteos.tarea], ["📎 Archivos", conteos.archivo]].map(([l, n]) => (
                      <div key={l as string} style={{ border: "1px solid var(--sc-card-line)", borderRadius: 8, padding: "8px 4px", fontSize: 12 }}>{l as string}<br /><b style={{ fontSize: 15 }}>{n as number}</b></div>
                    ))}
                  </div>
                </div>
                <div>{bloqueFotos("Archivos adjuntos")}</div>
              </div>

              {/* Columna derecha */}
              <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                <div>
                  <h3 style={h3}>📍 Ubicación</h3>
                  {puedeEditar ? (
                    <>
                      <MapaPicker lat={ed.lat === "" ? null : Number(ed.lat)} lng={ed.lng === "" ? null : Number(ed.lng)} onPick={(la, lo) => setEd({ ...ed, lat: String(la), lng: String(lo) })} />
                      <div style={{ fontSize: 13, marginTop: 6 }}>
                        {ed.lat !== "" && ed.lng !== ""
                          ? <>📍 Lat {Number(ed.lat).toFixed(6)}, Lng {Number(ed.lng).toFixed(6)}</>
                          : <span style={{ color: "var(--sc-text-soft)" }}>📍 Sin coordenadas — haz clic en el mapa para fijarlas.</span>}
                      </div>
                      <div className="dash-sub" style={{ fontSize: 12, marginTop: 2 }}>Haz clic en el mapa o arrastra el marcador para señalar el punto; también puedes buscar por dirección arriba.</div>
                    </>
                  ) : (
                    <MapaUbicacion latitud={llamada.latitud} longitud={llamada.longitud} sinEnlace />
                  )}
                </div>
                <GrabacionesTransmision llamadaId={params.id} />
                <div><CamarasCercanas latitud={llamada.latitud} longitud={llamada.longitud} /></div>
                <div><h3 style={h3}>🕘 Historial de atención</h3><HistorialCad llamadaId={params.id} /></div>
              </div>
            </div>
          )}

          {tab === "personas" && <PersonasVehiculosIncidente llamadaId={params.id} />}
          {tab === "evidencias" && bloqueFotos("Fotografías / evidencias del reporte")}
          {tab === "archivos" && (<div style={{ display: "flex", flexDirection: "column", gap: 16 }}>{bloqueFotos("Archivos adjuntos")}<GrabacionesTransmision llamadaId={params.id} /></div>)}
          {tab === "vinculos" && <VinculosPanel entidadTipo="cad" entidadId={params.id} />}
          {tab === "tareas" && <div style={{ color: "var(--sc-text-soft)", fontSize: 13, padding: "12px 4px" }}>Las tareas ligadas al incidente se gestionan en <Link href="/tareas" style={{ color: "var(--sc-btn,#f4a03f)" }}>Tareas</Link>.</div>}
          {tab === "bitacora" && <div style={{ color: "var(--sc-text-soft)", fontSize: 13, padding: "12px 4px" }}>El historial de atención está en la pestaña <b>Detalle</b>. La bitácora del sistema registra cada acción sobre este incidente — consúltala en <Link href="/bitacora" style={{ color: "var(--sc-btn,#f4a03f)" }}>Bitácora</Link>.</div>}
        </div>
      </div>

      {cerrando && (
        <div className="cad-modal-back" onClick={() => setCerrando(false)}>
          <div className="cad-modal" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Cerrar incidencia {llamada.folio ? `[${llamada.folio}]` : ""}</h3>
            <p className="dash-sub">Selecciona cómo concluyó la atención.</p>
            <div style={{ marginTop: 10 }}><label className="dash-sub" style={{ display: "block", marginBottom: 4 }}>Conclusión</label>
              <select style={{ width: "100%" }} value={conclusion} onChange={(e) => { setConclusion(e.target.value); setMotivoCancel(""); }}><option value="">— Selecciona —</option>{CONCLUSIONES.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
            {conclusion === "Cancelada" && <div style={{ marginTop: 10 }}><label className="dash-sub" style={{ display: "block", marginBottom: 4 }}>Motivo de la cancelación</label><select style={{ width: "100%" }} value={motivoCancel} onChange={(e) => setMotivoCancel(e.target.value)}><option value="">— Selecciona —</option>{MOTIVOS_CANCELADO.map((m) => <option key={m} value={m}>{m}</option>)}</select></div>}
            {error && <p style={{ color: "#b00020", fontSize: 13 }}>{error}</p>}
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}><button className="cad-guardar" onClick={cerrarReporte} disabled={guardando}>{guardando ? "Cerrando…" : "Confirmar cierre"}</button><button className="secundario" onClick={() => setCerrando(false)} disabled={guardando}>Cancelar</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
