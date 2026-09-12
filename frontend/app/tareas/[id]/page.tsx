"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import FotosPanel from "@/app/components/FotosPanel";
import MapaUbicacion from "@/app/components/MapaUbicacion";

const RESPUESTAS: Record<string, { label: string; color: string }> = {
  pendiente:  { label: "Pendiente",  color: "#777" },
  enterado:   { label: "Enterado",   color: "#0b62c4" },
  atendiendo: { label: "Atendiendo", color: "#b06a00" },
  completada: { label: "Completada", color: "#0a7c2f" },
};

const ESTADOS = ["abierta", "en_proceso", "completada", "vencida"];

function nombreGuardia(a: any): string {
  const per = a.personal;
  if (!per) return "—";
  const nom = per.persona ? `${per.persona.nombre ?? ""} ${per.persona.apellido_paterno ?? ""} ${per.persona.apellido_materno ?? ""}`.trim() : "";
  return nom || (per.numero_placa ? `#${per.numero_placa}` : "—");
}

export default function TareaDetallePage({ params }: { params: { id: string } }) {
  const [tarea, setTarea] = useState<any | null>(null);
  const [asignaciones, setAsignaciones] = useState<any[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  // Asignar más guardias (por sitio o por guardias).
  const [agregando, setAgregando] = useState(false);
  const [modo, setModo] = useState<"sitio" | "guardias">("sitio");
  const [sitios, setSitios] = useState<any[]>([]);
  const [guardias, setGuardias] = useState<any[]>([]);
  const [sitioSel, setSitioSel] = useState("");
  const [guardiaSel, setGuardiaSel] = useState<string[]>([]);

  const cargar = useCallback(async () => {
    setCargando(true);
    const { data, error: err } = await supabase.from("tareas").select("*").eq("id", params.id).maybeSingle();
    if (err) { setError(err.message); setCargando(false); return; }
    setTarea(data);

    const { data: asig } = await supabase
      .from("tarea_asignaciones")
      .select("id, respuesta, respondido_en, notas, creado_en, personal:personal(numero_placa,rango,persona:personas(nombre,apellido_paterno,apellido_materno))")
      .eq("tarea_id", params.id)
      .eq("estatus", "activo")
      .order("creado_en");
    setAsignaciones((asig as any[]) ?? []);
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

  async function cambiarEstado(nuevo: string) {
    const { error: err } = await supabase
      .from("tareas")
      .update({ estado: nuevo, actualizado_en: new Date().toISOString() })
      .eq("id", params.id);
    setMensaje(err ? err.message : `Tarea marcada como ${nuevo}.`);
    if (!err) cargar();
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

  return (
    <main className="contenedor">
      <p><Link href="/tareas">← Tareas</Link></p>
      <h1 className="dash-h1">{tarea.folio ?? "Tarea"} · {tarea.tipo}</h1>
      <p className="dash-sub">
        Prioridad {tarea.prioridad} · Estado {tarea.estado}
        {tarea.estatus === "cancelado" ? " · CANCELADA" : ""}
      </p>

      <h3>Datos de la tarea</h3>
      <dl className="sc-kv">
        <dt>Asunto</dt><dd>{tarea.asunto ?? "—"}</dd>
        <dt>Vigente desde</dt><dd>{new Date(tarea.vigencia_desde).toLocaleString()}</dd>
        <dt>Vigente hasta</dt>
        <dd style={vencida ? { color: "#b00020", fontWeight: 700 } : undefined}>
          {tarea.vigencia_hasta ? `${new Date(tarea.vigencia_hasta).toLocaleString()}${vencida ? " (vencida)" : ""}` : "Sin vencimiento"}
        </dd>
        <dt>Lugar / área</dt><dd>{tarea.direccion ?? "—"}</dd>
      </dl>

      <h3>Instrucciones</h3>
      <p style={{ whiteSpace: "pre-wrap" }}>{tarea.instrucciones || "—"}</p>

      <h3>Cambiar estado</h3>
      <div className="form-fila">
        {ESTADOS.map((e) => (
          <button key={e} className={e === tarea.estado ? "" : "secundario"} onClick={() => cambiarEstado(e)}>
            {e}
          </button>
        ))}
      </div>
      {mensaje && <p style={{ color: "#0a7c2f" }}>{mensaje}</p>}

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

      <h3>Fotografía</h3>
      <FotosPanel tabla="tareas" id={params.id} />
    </main>
  );
}
