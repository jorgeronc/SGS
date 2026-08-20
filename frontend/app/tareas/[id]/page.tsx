"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import FotosPanel from "@/app/components/FotosPanel";
import MapaUbicacion from "@/app/components/MapaUbicacion";
import SelectorUnidades from "@/app/components/SelectorUnidades";

const RESPUESTAS: Record<string, { label: string; color: string }> = {
  pendiente:  { label: "Pendiente",  color: "#777" },
  enterado:   { label: "Enterado",   color: "#0b62c4" },
  atendiendo: { label: "Atendiendo", color: "#b06a00" },
  completada: { label: "Completada", color: "#0a7c2f" },
};

const ESTADOS = ["abierta", "en_proceso", "completada", "vencida"];

function nombreUnidad(a: any): string {
  const p = a.patrulla;
  return p ? `${p.numero ? `#${p.numero}` : ""} ${p.tipo ?? ""} ${p.marca ?? ""} ${p.modelo ?? ""}`.trim() : "—";
}
function nombreOficial(a: any): string {
  const per = a.personal;
  if (!per) return "—";
  const nom = per.persona ? `${per.persona.nombre ?? ""} ${per.persona.apellido_paterno ?? ""}`.trim() : "";
  const emp = `${per.rango ?? ""}${per.numero_placa ? ` #${per.numero_placa}` : ""}`.trim();
  return [nom, emp].filter(Boolean).join(" — ") || "—";
}

export default function TareaDetallePage({ params }: { params: { id: string } }) {
  const [tarea, setTarea] = useState<any | null>(null);
  const [asignaciones, setAsignaciones] = useState<any[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  // Alta de más unidades
  const [agregando, setAgregando] = useState(false);
  const [todas, setTodas] = useState(false);
  const [seleccion, setSeleccion] = useState<string[]>([]);

  const cargar = useCallback(async () => {
    setCargando(true);
    const { data, error: err } = await supabase.from("tareas").select("*").eq("id", params.id).maybeSingle();
    if (err) { setError(err.message); setCargando(false); return; }
    setTarea(data);

    const { data: asig } = await supabase
      .from("tarea_asignaciones")
      .select("id, respuesta, respondido_en, notas, creado_en, patrulla:patrullas(numero,tipo,marca,modelo), personal:personal(numero_placa,rango,persona:personas(nombre,apellido_paterno))")
      .eq("tarea_id", params.id)
      .eq("estatus", "activo")
      .order("creado_en");
    setAsignaciones((asig as any[]) ?? []);
    setCargando(false);
  }, [params.id]);

  useEffect(() => { cargar(); }, [cargar]);

  async function cambiarEstado(nuevo: string) {
    const { error: err } = await supabase
      .from("tareas")
      .update({ estado: nuevo, actualizado_en: new Date().toISOString() })
      .eq("id", params.id);
    setMensaje(err ? err.message : `Tarea marcada como ${nuevo}.`);
    if (!err) cargar();
  }

  async function agregarUnidades() {
    if (!todas && seleccion.length === 0) { setMensaje("Elige al menos una unidad."); return; }
    const { data: n, error: err } = await supabase.rpc("rpc_asignar_tarea", {
      p_tarea_id: params.id,
      p_patrullas: todas ? null : seleccion,
    });
    if (err) { setMensaje(err.message); return; }
    setMensaje(n ? `${n} unidad(es) asignada(s) y notificada(s).` : "No se agregó ninguna unidad nueva.");
    setAgregando(false); setSeleccion([]); setTodas(false);
    cargar();
  }

  if (cargando) return <main className="contenedor"><p>Cargando…</p></main>;
  if (error) return <main className="contenedor"><p style={{ color: "#b00020" }}>{error}</p></main>;
  if (!tarea) return <main className="contenedor"><p>Tarea no encontrada.</p></main>;

  const vencida = tarea.vigencia_hasta && new Date(tarea.vigencia_hasta) < new Date();

  return (
    <main className="contenedor">
      <p><Link href="/tareas">← Tareas</Link></p>
      <h1 className="dash-h1">{tarea.folio ?? "Tarea"} · {tarea.tipo}</h1>
      <p className="dash-sub">
        {tarea.motivo ? `Motivo: ${tarea.motivo} — ` : ""}
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
        <dt>Lugar</dt><dd>{tarea.direccion ?? "—"}</dd>
        {tarea.orden_id && (
          <>
            <dt>Origen</dt>
            <dd><Link href={`/ordenes/${tarea.orden_id}`}>Orden relacionada ↗</Link></dd>
          </>
        )}
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

      <h3>Unidades asignadas ({asignaciones.length})</h3>
      <table className="sc-table">
        <thead>
          <tr><th>Unidad</th><th>Oficial</th><th>Respuesta</th><th>Respondió</th><th>Notas</th></tr>
        </thead>
        <tbody>
          {asignaciones.map((a) => {
            const r = RESPUESTAS[a.respuesta] ?? RESPUESTAS.pendiente;
            return (
              <tr key={a.id}>
                <td>{nombreUnidad(a)}</td>
                <td>{nombreOficial(a)}</td>
                <td><span style={{ color: r.color, fontWeight: 700 }}>{r.label}</span></td>
                <td>{a.respondido_en ? new Date(a.respondido_en).toLocaleString() : "—"}</td>
                <td>{a.notas ?? "—"}</td>
              </tr>
            );
          })}
          {asignaciones.length === 0 && (
            <tr><td colSpan={5} style={{ color: "#555" }}>Sin unidades asignadas.</td></tr>
          )}
        </tbody>
      </table>

      <div style={{ marginTop: 10 }}>
        {!agregando ? (
          <button onClick={() => setAgregando(true)}>+ Asignar más unidades</button>
        ) : (
          <div className="sc-nuevo">
            <SelectorUnidades todas={todas} setTodas={setTodas} seleccion={seleccion} setSeleccion={setSeleccion} />
            <div style={{ marginTop: 10 }}>
              <button onClick={agregarUnidades}>Asignar y notificar</button>
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
