"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import FotosPanel from "@/app/components/FotosPanel";
import MapaUbicacion from "@/app/components/MapaUbicacion";
import { CatalogoSelect } from "@/app/components/CatalogoSelect";
import { urlFoto } from "@/lib/fotos";

const dtLocal = (s: string | null) => (s ? new Date(new Date(s).getTime() - new Date(s).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "");

const RESPUESTAS: Record<string, { label: string; color: string }> = {
  pendiente:  { label: "Pendiente",  color: "#777" },
  enterado:   { label: "Enterado",   color: "#0b62c4" },
  atendiendo: { label: "Atendiendo", color: "#b06a00" },
  completada: { label: "Completada", color: "#0a7c2f" },
};

function nombreGuardia(a: any): string {
  const per = a.personal;
  if (!per) return "—";
  const nom = per.persona ? `${per.persona.nombre ?? ""} ${per.persona.apellido_paterno ?? ""} ${per.persona.apellido_materno ?? ""}`.trim() : "";
  return nom || (per.numero_placa ? `#${per.numero_placa}` : "—");
}

export default function TareaDetallePage({ params }: { params: { id: string } }) {
  const [tarea, setTarea] = useState<any | null>(null);
  const [asignaciones, setAsignaciones] = useState<any[]>([]);
  const [evidencias, setEvidencias] = useState<any[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  // Edición de los datos de la tarea.
  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState<any>({});
  const [guardandoEd, setGuardandoEd] = useState(false);

  // Asignar más guardias (por sitio o por guardias).
  const [agregando, setAgregando] = useState(false);
  const [modo, setModo] = useState<"sitio" | "guardias">("sitio");
  const [sitios, setSitios] = useState<any[]>([]);
  const [guardias, setGuardias] = useState<any[]>([]);
  const [sitioSel, setSitioSel] = useState("");
  const [guardiaSel, setGuardiaSel] = useState<string[]>([]);

  const consultadoRef = useRef<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    const { data, error: err } = await supabase.from("tareas").select("*").eq("id", params.id).maybeSingle();
    if (err) { setError(err.message); setCargando(false); return; }
    setTarea(data);
    // Auditoría: registra el registro CONSULTADO (con snapshot) una vez por apertura.
    if (data && consultadoRef.current !== params.id) {
      consultadoRef.current = params.id;
      supabase.rpc("rpc_registrar_bitacora", { p_tipo_accion: "CONSULTAR", p_entidad_tipo: "tareas", p_entidad_id: params.id, p_modulo: "tareas", p_valores: data as any });
    }

    const { data: asig } = await supabase
      .from("tarea_asignaciones")
      .select("id, respuesta, respondido_en, notas, creado_en, personal:personal(numero_placa,rango,persona:personas(nombre,apellido_paterno,apellido_materno))")
      .eq("tarea_id", params.id)
      .eq("estatus", "activo")
      .order("creado_en");
    setAsignaciones((asig as any[]) ?? []);

    // Evidencia devuelta por el guardia (fotos/video), ligada a la tarea. Solo lectura.
    const { data: ev } = await supabase.from("evidencias")
      .select("id, folio, tipo, descripcion, fotografias, datos_adicionales, creado_en")
      .eq("estatus", "activo")
      .contains("datos_adicionales", { origen_tipo: "tarea", origen_id: params.id })
      .order("creado_en", { ascending: false });
    setEvidencias((ev as any[]) ?? []);
    setCargando(false);
  }, [params.id]);

  useEffect(() => { cargar(); }, [cargar]);

  useEffect(() => {
    supabase.from("sitios").select("id, nombre").eq("estatus", "activo").order("nombre")
      .then(({ data }) => setSitios((data as any[]) ?? []));
    supabase.from("personal").select("id, persona:personas(nombre, apellido_paterno, apellido_materno)")
      .eq("estatus", "activo").eq("estado_laboral", "activo").order("id")
      .then(({ data }) => setGuardias((data as any[]) ?? []));
  }, []);

  function iniciarEdicion() {
    setBorrador({
      tipo: tarea.tipo ?? "", prioridad: tarea.prioridad ?? "media", asunto: tarea.asunto ?? "",
      instrucciones: tarea.instrucciones ?? "",
      vigencia_desde: dtLocal(tarea.vigencia_desde), vigencia_hasta: dtLocal(tarea.vigencia_hasta),
    });
    setMensaje(null); setEditando(true);
  }
  async function guardarTarea() {
    setGuardandoEd(true); setMensaje(null);
    const upd: Record<string, any> = {
      tipo: borrador.tipo || null, prioridad: borrador.prioridad || "media",
      asunto: borrador.asunto || null, instrucciones: borrador.instrucciones || null,
      vigencia_desde: borrador.vigencia_desde ? new Date(borrador.vigencia_desde).toISOString() : null,
      vigencia_hasta: borrador.vigencia_hasta ? new Date(borrador.vigencia_hasta).toISOString() : null,
      actualizado_en: new Date().toISOString(),
    };
    const { error: err } = await supabase.from("tareas").update(upd).eq("id", params.id);
    setGuardandoEd(false);
    if (err) { setMensaje(err.message); return; }
    setEditando(false); setMensaje("Cambios guardados."); cargar();
  }

  async function agregarGuardias() {
    if (modo === "sitio" && !sitioSel) { setMensaje("Elige el sitio."); return; }
    if (modo === "guardias" && guardiaSel.length === 0) { setMensaje("Elige al menos un guardia."); return; }
    const { data: n, error: err } = await supabase.rpc("rpc_asignar_tarea_guardias", {
      p_tarea_id: params.id,
      p_personal: modo === "guardias" ? guardiaSel : null,
      p_sitio: modo === "sitio" ? sitioSel : null,
    });
    if (err) { setMensaje(err.message); return; }
    setMensaje(n ? `${n} guardia(s) asignado(s) y notificado(s).` : "No se agregó ningún guardia nuevo.");
    setAgregando(false); setSitioSel(""); setGuardiaSel([]);
    cargar();
  }

  const chip = (on: boolean): React.CSSProperties => ({ padding: "6px 12px", borderRadius: 16, fontSize: 12.5, fontWeight: 600, cursor: "pointer", border: on ? "1.5px solid var(--sc-btn,#f4a03f)" : "1px solid var(--sc-card-line)", background: on ? "var(--sc-btn,#f4a03f)" : "transparent", color: on ? "#fff" : "var(--sc-text)" });
  const seg = (on: boolean): React.CSSProperties => ({ padding: "8px 14px", borderRadius: 9, fontWeight: 700, fontSize: 13, cursor: "pointer", border: on ? "1.5px solid var(--sc-btn,#f4a03f)" : "1px solid var(--sc-card-line)", background: on ? "var(--sc-btn,#f4a03f)" : "transparent", color: on ? "#fff" : "var(--sc-text)" });

  if (cargando) return <main className="contenedor"><p>Cargando…</p></main>;
  if (error) return <main className="contenedor"><p style={{ color: "#b00020" }}>{error}</p></main>;
  if (!tarea) return <main className="contenedor"><p>Tarea no encontrada.</p></main>;

  const vencida = tarea.vigencia_hasta && new Date(tarea.vigencia_hasta) < new Date();
  const completada = asignaciones.find((a) => a.respuesta === "completada");
  const atendiendo = asignaciones.find((a) => a.respuesta === "atendiendo");

  return (
    <main className="contenedor">
      <p><Link href="/tareas">← Tareas</Link></p>
      <h1 className="dash-h1">{tarea.folio ?? "Tarea"} · {tarea.tipo}</h1>
      <p className="dash-sub">
        Estado: <b>{tarea.estado}</b>
        {completada ? <> · Completada por <b>{nombreGuardia(completada)}</b></> : atendiendo ? <> · Atendiendo: <b>{nombreGuardia(atendiendo)}</b></> : null}
        {tarea.estatus === "cancelado" ? " · CANCELADA" : ""}
      </p>

      <div className="form-fila" style={{ gap: 10, margin: "6px 0" }}>
        {!editando ? (
          <button onClick={iniciarEdicion} disabled={tarea.estatus === "cancelado"}>✏️ Editar</button>
        ) : (
          <>
            <button onClick={guardarTarea} disabled={guardandoEd}>{guardandoEd ? "Guardando…" : "💾 Guardar cambios"}</button>
            <button className="secundario" onClick={() => { setEditando(false); setMensaje(null); }}>Cancelar</button>
          </>
        )}
      </div>
      {mensaje && <p style={{ color: "#0a7c2f" }}>{mensaje}</p>}

      <h3>Datos de la tarea</h3>
      {!editando ? (
        <dl className="sc-kv">
          <dt>Tipo</dt><dd>{tarea.tipo ?? "—"}</dd>
          <dt>Prioridad</dt><dd>{tarea.prioridad ?? "—"}</dd>
          <dt>Asunto</dt><dd>{tarea.asunto ?? "—"}</dd>
          <dt>Vigente desde</dt><dd>{new Date(tarea.vigencia_desde).toLocaleString()}</dd>
          <dt>Vigente hasta</dt>
          <dd style={vencida ? { color: "#b00020", fontWeight: 700 } : undefined}>
            {tarea.vigencia_hasta ? `${new Date(tarea.vigencia_hasta).toLocaleString()}${vencida ? " (vencida)" : ""}` : "Sin vencimiento"}
          </dd>
          <dt>Lugar / área</dt><dd>{tarea.direccion ?? "—"}</dd>
          <dt>Instrucciones</dt><dd style={{ whiteSpace: "pre-wrap" }}>{tarea.instrucciones || "—"}</dd>
        </dl>
      ) : (
        <div className="form-grid">
          <label>Tipo
            <CatalogoSelect categoria="tipo_tarea" value={borrador.tipo} onChange={(v) => setBorrador((b: any) => ({ ...b, tipo: v }))} placeholder="— Selecciona —" />
          </label>
          <label>Prioridad
            <select value={borrador.prioridad} onChange={(e) => setBorrador((b: any) => ({ ...b, prioridad: e.target.value }))}>
              <option value="alta">alta</option><option value="media">media</option><option value="baja">baja</option>
            </select>
          </label>
          <label>Vigente desde
            <input type="datetime-local" value={borrador.vigencia_desde} onChange={(e) => setBorrador((b: any) => ({ ...b, vigencia_desde: e.target.value }))} />
          </label>
          <label>Vigente hasta
            <input type="datetime-local" value={borrador.vigencia_hasta} onChange={(e) => setBorrador((b: any) => ({ ...b, vigencia_hasta: e.target.value }))} />
          </label>
          <label style={{ gridColumn: "1 / -1" }}>Asunto
            <input value={borrador.asunto} onChange={(e) => setBorrador((b: any) => ({ ...b, asunto: e.target.value }))} />
          </label>
          <label style={{ gridColumn: "1 / -1" }}>Instrucciones
            <textarea style={{ minHeight: 80, resize: "vertical" }} value={borrador.instrucciones} onChange={(e) => setBorrador((b: any) => ({ ...b, instrucciones: e.target.value }))} />
          </label>
        </div>
      )}

      <h3>Guardias asignados ({asignaciones.length})</h3>
      <table className="sc-table">
        <thead>
          <tr><th>Guardia</th><th>Respuesta</th><th>Respondió</th><th>Notas</th></tr>
        </thead>
        <tbody>
          {asignaciones.map((a) => {
            const r = RESPUESTAS[a.respuesta] ?? RESPUESTAS.pendiente;
            return (
              <tr key={a.id}>
                <td>{nombreGuardia(a)}</td>
                <td><span style={{ color: r.color, fontWeight: 700 }}>{r.label}</span></td>
                <td>{a.respondido_en ? new Date(a.respondido_en).toLocaleString() : "—"}</td>
                <td>{a.notas ?? "—"}</td>
              </tr>
            );
          })}
          {asignaciones.length === 0 && (
            <tr><td colSpan={4} style={{ color: "#555" }}>Sin guardias asignados.</td></tr>
          )}
        </tbody>
      </table>

      <div style={{ marginTop: 10 }}>
        {!agregando ? (
          <button onClick={() => setAgregando(true)}>+ Asignar más guardias</button>
        ) : (
          <div className="sc-nuevo">
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <span style={seg(modo === "sitio")} onClick={() => setModo("sitio")}>🛡 Por sitio</span>
              <span style={seg(modo === "guardias")} onClick={() => setModo("guardias")}>👷 Por guardias</span>
            </div>
            {modo === "sitio" ? (
              <label className="dash-sub" style={{ display: "block" }}>Sitio (todos sus guardias con turno vigente hoy)
                <select value={sitioSel} onChange={(e) => setSitioSel(e.target.value)} style={{ width: "100%", maxWidth: 360 }}>
                  <option value="">— Selecciona el sitio —</option>
                  {sitios.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                </select>
              </label>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, maxHeight: 160, overflow: "auto" }}>
                {guardias.map((g) => {
                  const on = guardiaSel.includes(g.id);
                  const nom = `${g.persona?.nombre ?? ""} ${g.persona?.apellido_paterno ?? ""}`.trim() || "Guardia";
                  return (
                    <button type="button" key={g.id} style={chip(on)}
                      onClick={() => setGuardiaSel((p) => on ? p.filter((x) => x !== g.id) : [...p, g.id])}>{nom}</button>
                  );
                })}
              </div>
            )}
            <div style={{ marginTop: 10 }}>
              <button onClick={agregarGuardias}>Asignar y notificar</button>
              <button className="secundario" style={{ marginLeft: 10 }} onClick={() => setAgregando(false)}>Cancelar</button>
            </div>
          </div>
        )}
      </div>

      <h3>Ubicación</h3>
      <MapaUbicacion latitud={tarea.latitud} longitud={tarea.longitud} />

      <h3>Evidencia del guardia ({evidencias.length})</h3>
      <p className="dash-sub" style={{ fontSize: 12 }}>Fotos y videos que el guardia sube desde el móvil. Quedan ligadas a la tarea y no se pueden eliminar desde aquí.</p>
      {evidencias.length === 0 ? (
        <p className="dash-sub">Sin evidencia todavía.</p>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {evidencias.map((ev) => {
            const foto = Array.isArray(ev.fotografias) ? ev.fotografias[0] : null;
            const video = ev.datos_adicionales?.video_url ?? ev.datos_adicionales?.video ?? null;
            return (
              <figure key={ev.id} style={{ margin: 0, width: 150 }}>
                {foto ? (
                  <a href={urlFoto(foto) ?? undefined} target="_blank" rel="noreferrer"><img src={urlFoto(foto) ?? undefined} alt="Evidencia" style={{ width: 150, height: 110, objectFit: "cover", borderRadius: 8 }} /></a>
                ) : video ? (
                  <a href={urlFoto(video) ?? undefined} target="_blank" rel="noreferrer" style={{ display: "grid", placeItems: "center", width: 150, height: 110, borderRadius: 8, background: "#0b1220", color: "#fff" }}>▶ Video</a>
                ) : (
                  <div style={{ width: 150, height: 110, borderRadius: 8, background: "var(--sc-btn-soft,#f6ede1)", display: "grid", placeItems: "center", fontSize: 12 }}>{ev.tipo ?? "Evidencia"}</div>
                )}
                <figcaption className="dash-sub" style={{ fontSize: 11, marginTop: 2 }}>{ev.folio ?? ev.tipo ?? "Evidencia"} · {new Date(ev.creado_en).toLocaleDateString()}</figcaption>
              </figure>
            );
          })}
        </div>
      )}

      <h3>Fotografías de instrucción</h3>
      <p className="dash-sub" style={{ fontSize: 12 }}>Imágenes que acompañan la indicación (se envían al guardia).</p>
      <FotosPanel tabla="tareas" id={params.id} />
    </main>
  );
}
