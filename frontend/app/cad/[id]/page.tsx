"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import type { LlamadaCad, EstadoDespachoLlamada } from "@/lib/types";
import VinculosPanel from "@/app/components/VinculosPanel";
import MapaUbicacion from "@/app/components/MapaUbicacion";
import DespachosPanel from "@/app/components/DespachosPanel";
import NarrativasCadPanel from "@/app/components/NarrativasCadPanel";
import { CatalogoSelect } from "@/app/components/CatalogoSelect";
import DireccionGeocode from "@/app/components/DireccionGeocode";
import VisorTransmision from "@/app/components/VisorTransmision";
import GrabacionesTransmision from "@/app/components/GrabacionesTransmision";
import CamarasCercanas from "@/app/components/CamarasCercanas";
import HistorialCad from "@/app/components/HistorialCad";
import { getConfig } from "@/lib/config";
import { unidadesPorLlamada, DESPACHO_LABEL, DESPACHO_COLOR, type UnidadDespacho } from "@/lib/despachos";

const ESTADOS: EstadoDespachoLlamada[] = ["recibida", "despachada", "en_atencion", "resuelta"];
// Etiqueta del estado de despacho de la incidencia.
const DESP_REPORTE: Record<string, string> = {
  recibida: "Recibida", despachada: "Despachado", en_atencion: "En atención", resuelta: "Resuelta",
};
const EST_LABEL: Record<string, string> = { activo: "Activo", cerrado: "Cerrado", cancelado: "Cancelado" };
// Conclusiones de cierre de la incidencia y submotivos de cancelación (seg. privada).
const CONCLUSIONES = ["Atendida sin novedad", "Atendida con novedad", "Falsa alarma", "Cancelada"];
const MOTIVOS_CANCELADO = ["Cancelada por el cliente", "Reporte duplicado", "Sin acceso al sitio"];

export default function IncidenciaDetallePage() {
  const params = useParams<{ id: string }>();
  const [llamada, setLlamada] = useState<LlamadaCad | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [descripcion, setDescripcion] = useState("");
  const [editando, setEditando] = useState(false);   // modo consulta por defecto
  // Datos editables de la incidencia (incluye domicilio, coordenadas y despacho).
  const [ed, setEd] = useState({ tipo: "", prioridad: "media", reportante: "", telefono: "", direccion: "", lat: "", lng: "", estado_despacho: "recibida" });
  const [jur, setJur] = useState("");
  const [paisJur, setPaisJur] = useState("");
  // Transmisión en vivo (bodycam) ligada a esta incidencia, si la hay.
  const [txActiva, setTxActiva] = useState<string | null>(null);
  // Guardia/unidad que atiende esta incidencia (del despacho más reciente).
  const [unidadDet, setUnidadDet] = useState<UnidadDespacho | null>(null);
  // Cierre de la incidencia (modal + conclusión).
  const [cerrando, setCerrando] = useState(false);
  const [conclusion, setConclusion] = useState("");
  const [motivoCancel, setMotivoCancel] = useState("");

  useEffect(() => { getConfig().then((c) => { if (c) { setJur(c.jurisdiccion ?? ""); setPaisJur(c.jurisdiccion_pais ?? ""); } }); }, []);

  // Busca una transmisión en vivo de esta incidencia y se suscribe a cambios en
  // tiempo real (aparece/desaparece el visor sin recargar).
  useEffect(() => {
    if (!params.id) return;
    async function buscar() {
      const { data } = await supabase
        .from("transmisiones")
        .select("id, estado")
        .eq("llamada_id", params.id)
        .eq("estatus", "activo")
        .eq("estado", "en_vivo")
        .order("iniciado_en", { ascending: false })
        .limit(1)
        .maybeSingle();
      setTxActiva((data as any)?.id ?? null);
    }
    buscar();
    const canal = supabase
      .channel(`cad-tx:${params.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "transmisiones", filter: `llamada_id=eq.${params.id}` }, buscar)
      .subscribe();
    return () => { supabase.removeChannel(canal); };
  }, [params.id]);

  // Guardia/unidad que atiende esta incidencia + realtime sobre sus despachos.
  useEffect(() => {
    if (!params.id) return;
    const cargarUnidad = () => unidadesPorLlamada([params.id]).then((m) => setUnidadDet(m[params.id] ?? null));
    cargarUnidad();
    const canal = supabase
      .channel(`cad-desp:${params.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "despachos", filter: `llamada_id=eq.${params.id}` }, cargarUnidad)
      .subscribe();
    return () => { supabase.removeChannel(canal); };
  }, [params.id]);

  // Un solo guardado: descripción, datos de la incidencia y estado de despacho.
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
    const { data, error } = await supabase
      .from("llamadas_cad")
      .select("*")
      .eq("id", params.id)
      .maybeSingle();

    if (error) {
      setError(error.message);
      return;
    }
    setLlamada(data as LlamadaCad);
    setDescripcion((data as LlamadaCad)?.descripcion ?? "");
    const l = data as any;
    setEd({
      tipo: l.tipo ?? "", prioridad: l.prioridad ?? "media", reportante: l.reportante ?? "",
      telefono: l.telefono ?? "", direccion: l.direccion ?? "",
      lat: l.latitud != null ? String(l.latitud) : "", lng: l.longitud != null ? String(l.longitud) : "",
      estado_despacho: l.estado_despacho ?? "recibida",
    });

    await supabase.rpc("rpc_registrar_bitacora", {
      p_tipo_accion: "CONSULTAR",
      p_entidad_tipo: "llamadas_cad",
      p_entidad_id: params.id,
      p_modulo: "cad",
    });
  }

  useEffect(() => {
    cargarLlamada();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  // Cierra la incidencia con una conclusión; también cierra sus despachos activos
  // y libera las unidades. La cancelación es una conclusión más (no un estatus).
  async function cerrarReporte() {
    if (!llamada) return;
    if (!conclusion) { setError("Selecciona una conclusión de cierre."); return; }
    if (conclusion === "Cancelada" && !motivoCancel) { setError("Selecciona el motivo de la cancelación."); return; }
    setGuardando(true); setError(null);
    const { error } = await supabase.from("llamadas_cad").update({
      estatus: "cerrado",
      estado_despacho: "resuelta",
      conclusion,
      motivo_cierre: conclusion === "Cancelada" ? motivoCancel : null,
      fecha_cierre: llamada.fecha_cierre ?? new Date().toISOString(),
      actualizado_en: new Date().toISOString(),
    }).eq("id", llamada.id);
    if (!error) {
      const { data: desp } = await supabase
        .from("despachos").select("id, patrulla_id")
        .eq("llamada_id", llamada.id).eq("estatus", "activo").neq("estado", "cerrado");
      for (const d of ((desp as any[]) ?? [])) {
        await supabase.from("despachos").update({ estado: "cerrado", actualizado_en: new Date().toISOString() }).eq("id", d.id);
        if (d.patrulla_id) {
          await supabase.from("patrullas").update({ estatus_unidad: "disponible", actualizado_en: new Date().toISOString() }).eq("id", d.patrulla_id);
        }
      }
    }
    setGuardando(false);
    if (error) { setError(error.message); return; }
    setCerrando(false);
    cargarLlamada();
  }

  if (!llamada) {
    return <main className="contenedor">{error ? <p>{error}</p> : <p>Cargando...</p>}</main>;
  }

  const editable = llamada.estatus === "activo";
  const cerrado = llamada.estatus !== "activo";   // cerrado o cancelado
  const puedeEditar = editable && editando;
  // Cerrada = despacho resuelto; cancelada = estatus cancelado. En ambos se oculta narrativas.
  const canceladoOCerrado = !editable || llamada.estado_despacho === "resuelta";

  const abrir = () => { setEditando(true); setMensaje(null); };
  const cancelarEd = () => { setEditando(false); cargarLlamada(); };
  // Barra de acción (se muestra arriba y abajo). "Guardar" se activa al abrir.
  const barraAccion = (pos: string) => (
    <div className="cad-acciones" key={pos}>
      {editable && !editando && <button className="cad-abrir" onClick={abrir}>✏️ Abrir incidencia</button>}
      {editable && (
        <button className="cad-guardar" onClick={guardar} disabled={!editando || guardando}>
          {guardando ? "Guardando…" : "💾 Guardar cambios"}
        </button>
      )}
      {editando && <button className="secundario" onClick={cancelarEd} disabled={guardando}>Cancelar edición</button>}
      {!editable && <span className="dash-sub">Incidencia {llamada.estatus} — solo consulta.</span>}
    </div>
  );

  return (
    <main className="contenedor">
      <h2 style={{ marginBottom: 6 }}>
        {llamada.folio ? `[${llamada.folio}] ` : ""}
        {llamada.tipo ?? "Incidencia"}
      </h2>

      {/* Panel de estado operativo para el operador de central. Al cerrarse se
          ocultan los estados de despacho y unidad y se muestra la conclusión. */}
      <div className="cad-status">
        <div className="cad-stat">
          <span className="cad-stat-lbl">Prioridad</span>
          <span className={`cad-pill prio-${llamada.prioridad}`}>{llamada.prioridad ?? "—"}</span>
        </div>
        {!cerrado && (
          <div className="cad-stat">
            <span className="cad-stat-lbl">Despacho</span>
            <span className={`cad-pill desp-${llamada.estado_despacho}`}>{DESP_REPORTE[llamada.estado_despacho] ?? llamada.estado_despacho}</span>
          </div>
        )}
        <div className="cad-stat">
          <span className="cad-stat-lbl">Estatus</span>
          <span className={`cad-pill est-${llamada.estatus}`}>{EST_LABEL[llamada.estatus] ?? llamada.estatus}</span>
        </div>
        {cerrado && llamada.conclusion && (
          <div className="cad-stat">
            <span className="cad-stat-lbl">Conclusión</span>
            <span className="cad-pill cad-pill-concl">
              {llamada.conclusion}{llamada.motivo_cierre ? ` · ${llamada.motivo_cierre}` : ""}
            </span>
          </div>
        )}
        <div className="cad-stat">
          <span className="cad-stat-lbl">Guardia / unidad{cerrado ? " que atendió" : ""}</span>
          {unidadDet ? (
            <span className="cad-status-uni">
              📍 <b>{unidadDet.numero ? `#${unidadDet.numero}` : "Unidad"}</b>
              {!cerrado && (
                <span className="cad-uni-pill" style={{ background: DESPACHO_COLOR[unidadDet.estado] ?? "#607d8b" }}>
                  {DESPACHO_LABEL[unidadDet.estado] ?? unidadDet.estado}
                </span>
              )}
              {unidadDet.oficial ? <span className="cad-status-of"> · {unidadDet.oficial}</span> : null}
            </span>
          ) : (
            <span style={{ color: "#8a94a6" }}>Sin asignar</span>
          )}
        </div>
      </div>
      <p style={{ fontSize: 13, color: "#555", margin: "6px 0" }}>
        Recepción: {new Date(llamada.fecha_recepcion).toLocaleString()}
        {llamada.fecha_cierre ? ` · Cierre: ${new Date(llamada.fecha_cierre).toLocaleString()}` : ""}
      </p>

      {txActiva && (
        <section className="tx-live">
          <h3 style={{ margin: "8px 0" }}>🔴 Transmisión en vivo del guardia</h3>
          <VisorTransmision transmisionId={txActiva} />
        </section>
      )}

      {barraAccion("top")}

      <h3>Datos de la incidencia</h3>
      <div className="form-grid">
        <label>Tipo de incidencia<CatalogoSelect categoria="tipo_incidencia" value={ed.tipo} onChange={(v) => setEd({ ...ed, tipo: v })} disabled={!puedeEditar} /></label>
        <label>Prioridad
          <select value={ed.prioridad} disabled={!puedeEditar} onChange={(e) => setEd({ ...ed, prioridad: e.target.value })}>
            <option value="alta">alta</option><option value="media">media</option><option value="baja">baja</option>
          </select>
        </label>
        <label>Reportante<input value={ed.reportante} disabled={!puedeEditar} maxLength={45} style={{ width: "45ch", maxWidth: "100%" }} onChange={(e) => setEd({ ...ed, reportante: e.target.value })} /></label>
        <label>Teléfono<input value={ed.telefono} disabled={!puedeEditar} inputMode="numeric" maxLength={10} style={{ width: "14ch" }} onChange={(e) => setEd({ ...ed, telefono: e.target.value.replace(/\D/g, "").slice(0, 10) })} /></label>
        <label>Estado del despacho
          <select value={ed.estado_despacho} disabled={!puedeEditar} onChange={(e) => setEd({ ...ed, estado_despacho: e.target.value })}>
            {ESTADOS.map((s) => (<option key={s} value={s}>{s}</option>))}
          </select>
        </label>
      </div>
      <label className="dash-sub">Ubicación de la incidencia {jur && <span style={{ color: "#667" }}>— se busca en {jur}{paisJur ? `, ${paisJur}` : ""}</span>}</label>
      <DireccionGeocode
        direccion={ed.direccion} lat={ed.lat} lng={ed.lng}
        onDireccion={(v) => setEd({ ...ed, direccion: v })}
        onCoords={(la, lo) => setEd({ ...ed, lat: la, lng: lo })}
        jurisdiccion={jur} pais={paisJur}
        disabled={!puedeEditar} size={100}
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
          gap: 16,
          alignItems: "start",
          marginTop: 8,
        }}
      >
        <div>
          <h3>Descripción</h3>
          <textarea
            style={{ display: "block", width: "100%", height: 320, resize: "vertical" }}
            placeholder="Descripción de la incidencia…"
            value={descripcion}
            disabled={!puedeEditar}
            onChange={(e) => setDescripcion(e.target.value)}
          />
        </div>
        <div>
          <h3>Ubicación</h3>
          <MapaUbicacion latitud={llamada.latitud} longitud={llamada.longitud} />
        </div>
      </div>

      <CamarasCercanas latitud={llamada.latitud} longitud={llamada.longitud} />

      {barraAccion("bottom")}
      {mensaje && <p style={{ color: "#0a7c2f" }}>{mensaje}</p>}

      <GrabacionesTransmision llamadaId={params.id} />

      <DespachosPanel llamadaId={params.id} />

      <HistorialCad llamadaId={params.id} />

      {!canceladoOCerrado && <NarrativasCadPanel llamadaId={params.id} />}

      <VinculosPanel entidadTipo="cad" entidadId={params.id} />

      {error && <p style={{ color: "#b00020" }}>{error}</p>}

      <div style={{ marginTop: 28, borderTop: "1px solid var(--sc-card-line)", paddingTop: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
        {editable && (
          <button className="cad-pill cad-pill-btn act-cerrar" onClick={() => { setError(null); setConclusion(""); setMotivoCancel(""); setCerrando(true); }} disabled={guardando}>
            🔒 Cerrar incidencia
          </button>
        )}
      </div>

      {/* Modal de cierre con conclusión */}
      {cerrando && (
        <div className="cad-modal-back" onClick={() => setCerrando(false)}>
          <div className="cad-modal" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Cerrar incidencia {llamada.folio ? `[${llamada.folio}]` : ""}</h3>
            <p className="dash-sub">Selecciona cómo concluyó la atención.</p>
            <div style={{ marginTop: 10 }}>
              <label className="dash-sub" style={{ display: "block", marginBottom: 4 }}>Conclusión</label>
              <select style={{ width: "100%" }} value={conclusion} onChange={(e) => { setConclusion(e.target.value); setMotivoCancel(""); }}>
                <option value="">— Selecciona —</option>
                {CONCLUSIONES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            {conclusion === "Cancelada" && (
              <div style={{ marginTop: 10 }}>
                <label className="dash-sub" style={{ display: "block", marginBottom: 4 }}>Motivo de la cancelación</label>
                <select style={{ width: "100%" }} value={motivoCancel} onChange={(e) => setMotivoCancel(e.target.value)}>
                  <option value="">— Selecciona —</option>
                  {MOTIVOS_CANCELADO.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            )}
            {error && <p style={{ color: "#b00020", fontSize: 13 }}>{error}</p>}
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button className="cad-guardar" onClick={cerrarReporte} disabled={guardando}>
                {guardando ? "Cerrando…" : "Confirmar cierre"}
              </button>
              <button className="secundario" onClick={() => setCerrando(false)} disabled={guardando}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
