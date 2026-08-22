"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import ListaMaestra from "@/app/components/ListaMaestra";
import { CatalogoSelect } from "@/app/components/CatalogoSelect";

const TIPOS = ["Diurno (08:00-20:00)", "Nocturno (20:00-08:00)", "24 horas", "Mixto / rolado"];
const HORARIO: Record<string, [string, string]> = {
  "Diurno (08:00-20:00)": ["08:00", "20:00"],
  "Nocturno (20:00-08:00)": ["20:00", "08:00"],
  "24 horas": ["00:00", "23:59"],
  "Mixto / rolado": ["", ""],
};
const ESTADOS = ["programado", "cubierto", "falta", "relevado"];

const hoyISO = () => new Date().toISOString().slice(0, 10);
function estaSemana(fecha: string) {
  const d = new Date(fecha + "T00:00:00");
  const hoy = new Date(); const dia = (hoy.getDay() + 6) % 7; // lunes=0
  const lun = new Date(hoy); lun.setDate(hoy.getDate() - dia); lun.setHours(0, 0, 0, 0);
  const dom = new Date(lun); dom.setDate(lun.getDate() + 6); dom.setHours(23, 59, 59, 999);
  return d >= lun && d <= dom;
}
function guardiaNombre(g: any) {
  const p = g?.persona;
  return p ? `${p.nombre ?? ""} ${p.apellido_paterno ?? ""} ${p.apellido_materno ?? ""}`.trim() : "—";
}

function NuevoTurno({ onCreado }: { onCreado: () => void }) {
  const [sitios, setSitios] = useState<any[]>([]);
  const [guardias, setGuardias] = useState<any[]>([]);
  const [f, setF] = useState({ sitio_id: "", personal_id: "", fecha: hoyISO(), tipo_turno: "", hora_inicio: "", hora_fin: "" });
  const [error, setError] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    supabase.from("sitios").select("id, nombre, cliente:clientes(razon_social)").eq("estatus", "activo").order("nombre")
      .then(({ data }) => setSitios((data as any[]) ?? []));
    supabase.from("personal").select("id, numero_placa, categoria, persona:personas(nombre, apellido_paterno, apellido_materno)")
      .eq("estatus", "activo").eq("estado_laboral", "activo")
      .then(({ data }) => setGuardias((data as any[]) ?? []));
  }, []);

  function pickTipo(v: string) {
    const [hi, hf] = HORARIO[v] ?? ["", ""];
    setF((p) => ({ ...p, tipo_turno: v, hora_inicio: hi, hora_fin: hf }));
  }

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!f.sitio_id) { setError("Elige el sitio."); return; }
    if (!f.personal_id) { setError("Elige el guardia."); return; }
    if (!f.fecha) { setError("Indica la fecha."); return; }
    setCreando(true);
    const { error } = await supabase.from("turnos").insert({
      sitio_id: f.sitio_id, personal_id: f.personal_id, fecha: f.fecha,
      tipo_turno: f.tipo_turno || null, hora_inicio: f.hora_inicio || null, hora_fin: f.hora_fin || null,
    });
    setCreando(false);
    if (error) { setError(error.message); return; }
    onCreado();
  }

  return (
    <form onSubmit={crear}>
      <div className="form-fila">
        <select value={f.sitio_id} onChange={(e) => set("sitio_id", e.target.value)} required style={{ flex: 2 }}>
          <option value="">— Sitio —</option>
          {sitios.map((s) => <option key={s.id} value={s.id}>{s.nombre}{s.cliente?.razon_social ? ` · ${s.cliente.razon_social}` : ""}</option>)}
        </select>
        <select value={f.personal_id} onChange={(e) => set("personal_id", e.target.value)} required style={{ flex: 2 }}>
          <option value="">— Guardia —</option>
          {guardias.map((g) => <option key={g.id} value={g.id}>{guardiaNombre(g)}{g.categoria ? ` · ${g.categoria}` : ""}</option>)}
        </select>
      </div>
      <div className="form-fila">
        <label className="dash-sub" style={{ display: "flex", flexDirection: "column" }}>Fecha
          <input type="date" value={f.fecha} onChange={(e) => set("fecha", e.target.value)} required />
        </label>
        <CatalogoSelect categoria="tipo_turno" value={f.tipo_turno} onChange={pickTipo} placeholder="— Tipo de turno —" />
        <label className="dash-sub" style={{ display: "flex", flexDirection: "column" }}>Inicio
          <input type="time" value={f.hora_inicio} onChange={(e) => set("hora_inicio", e.target.value)} />
        </label>
        <label className="dash-sub" style={{ display: "flex", flexDirection: "column" }}>Fin
          <input type="time" value={f.hora_fin} onChange={(e) => set("hora_fin", e.target.value)} />
        </label>
        <button type="submit" disabled={creando}>{creando ? "Creando…" : "Asignar turno"}</button>
      </div>
      {(sitios.length === 0 || guardias.length === 0) && (
        <p className="dash-sub">Necesitas al menos un sitio y un guardia activos.</p>
      )}
      {error && <p style={{ color: "#b00020" }}>{error}</p>}
    </form>
  );
}

export default function TurnosPage() {
  return (
    <ListaMaestra
      titulo="Rol de turnos"
      subtitulo="Asignación de guardias a sitios por fecha y turno"
      tabla="turnos"
      modulo="turnos"
      orderBy="fecha"
      select="id, fecha, tipo_turno, hora_inicio, hora_fin, estado, estatus, sitio_id, personal_id, sitio:sitios(nombre, cliente_id, cliente:clientes(razon_social)), guardia:personal(numero_placa, persona:personas(nombre, apellido_paterno, apellido_materno))"
      placeholderBuscar="Buscar sitio, guardia, cliente…"
      columnas={[
        { header: "Fecha", celda: (r) => (r.fecha ? new Date(r.fecha + "T00:00:00").toLocaleDateString() : "—") },
        { header: "Sitio", celda: (r) => r.sitio?.nombre ?? "—" },
        { header: "Cliente", celda: (r) => r.sitio?.cliente?.razon_social ?? "—" },
        { header: "Guardia", celda: (r) => guardiaNombre(r.guardia) },
        { header: "Turno", celda: (r) => r.tipo_turno ?? "—" },
        { header: "Horario", celda: (r) => (r.hora_inicio ? `${String(r.hora_inicio).slice(0, 5)}–${String(r.hora_fin ?? "").slice(0, 5)}` : "—") },
        { header: "Estado", celda: (r) => <EstadoBadge e={r.estado} /> },
        { header: "Estatus", celda: (r) => <span className={r.estatus === "activo" ? "badge-activo" : "badge-cancelado"}>{r.estatus}</span> },
      ]}
      textoBusqueda={(r) => `${r.sitio?.nombre ?? ""} ${r.sitio?.cliente?.razon_social ?? ""} ${guardiaNombre(r.guardia)} ${r.tipo_turno ?? ""}`}
      detalleHref={(r) => `/clientes/${r.sitio?.cliente_id ?? ""}`}
      filtros={[
        { k: "todos", label: "Todos" },
        { k: "hoy", label: "Hoy", test: (r) => r.fecha === hoyISO() },
        { k: "semana", label: "Esta semana", test: (r) => !!r.fecha && estaSemana(r.fecha) },
        { k: "programados", label: "Programados", test: (r) => r.estado === "programado" },
        { k: "faltas", label: "Faltas", test: (r) => r.estado === "falta" },
      ]}
      quickView={(r) => (
        <>
          <h3 style={{ margin: "0 0 8px" }}>{r.sitio?.nombre ?? "Turno"} · {r.fecha ? new Date(r.fecha + "T00:00:00").toLocaleDateString() : ""}</h3>
          <dl className="sc-kv">
            <dt>Cliente</dt><dd>{r.sitio?.cliente?.razon_social ?? "—"}</dd>
            <dt>Guardia</dt><dd>{guardiaNombre(r.guardia)}</dd>
            <dt>Tipo de turno</dt><dd>{r.tipo_turno ?? "—"}</dd>
            <dt>Horario</dt><dd>{r.hora_inicio ? `${String(r.hora_inicio).slice(0, 5)} – ${String(r.hora_fin ?? "").slice(0, 5)}` : "—"}</dd>
            <dt>Estado</dt><dd><EstadoBadge e={r.estado} /></dd>
          </dl>
          {r.sitio?.cliente_id && <p style={{ marginTop: 10 }}><Link href={`/clientes/${r.sitio.cliente_id}`} className="qbtn2">▤ Ver cliente →</Link></p>}
        </>
      )}
      editar={[
        { campo: "estado", label: "Estado del turno", tipo: "select", opciones: ESTADOS },
        { campo: "tipo_turno", label: "Tipo de turno", tipo: "select", opciones: TIPOS },
        { campo: "hora_inicio", label: "Hora inicio (HH:MM)" },
        { campo: "hora_fin", label: "Hora fin (HH:MM)" },
        { campo: "notas", label: "Notas", tipo: "textarea" },
      ]}
      nuevo={(onCreado) => <NuevoTurno onCreado={onCreado} />}
    />
  );
}

function EstadoBadge({ e }: { e: string }) {
  const color: Record<string, string> = { programado: "#2f7cc4", cubierto: "#0a7c2f", falta: "#b00020", relevado: "#7a5c00" };
  return <span style={{ color: color[e] ?? "#555", fontWeight: 600 }}>{e}</span>;
}
