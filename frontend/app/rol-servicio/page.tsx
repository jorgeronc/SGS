"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import ListaMaestra from "@/app/components/ListaMaestra";
import { SelectPersonal } from "@/app/components/Pickers";

// Calcula la ventana de 12 h del turno. `fecha` es el día en que INICIA el turno
// (diurno 07:00–19:00 del mismo día; nocturno 19:00 → 07:00 del día siguiente).
// Ojo: las horas se fijan en hora local y se envían como instante UTC real
// (toISOString). No restar el offset: la columna es timestamptz y hacerlo
// desplazaba el turno por el huso (07:00 se guardaba como 07:00Z → 01:00 local).
function ventana(fecha: string, turno: string): { inicio: string; fin: string } {
  const base = new Date(`${fecha}T00:00:00`);
  const iso = (d: Date) => d.toISOString();
  if (turno === "nocturno") {
    const ini = new Date(base); ini.setHours(19, 0, 0, 0);
    const fin = new Date(base); fin.setDate(fin.getDate() + 1); fin.setHours(7, 0, 0, 0);
    return { inicio: iso(ini), fin: iso(fin) };
  }
  const ini = new Date(base); ini.setHours(7, 0, 0, 0);
  const fin = new Date(base); fin.setHours(19, 0, 0, 0);
  return { inicio: iso(ini), fin: iso(fin) };
}

function NuevoRol({ onCreado }: { onCreado: () => void }) {
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [turno, setTurno] = useState("diurno");
  const [supervisorId, setSupervisorId] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const { inicio, fin } = ventana(fecha, turno);
    const { error } = await supabase.from("rol_servicio").insert({
      fecha, turno, inicio, fin, supervisor_personal_id: supervisorId || null,
    });
    if (error) { setError(error.message); return; }
    onCreado();
  }

  return (
    <form onSubmit={crear}>
      <p className="dash-sub">El rol se elabora por turno de 12 h. Agrega las unidades y oficiales en el detalle.</p>
      <div className="form-fila">
        <label className="dash-sub" style={{ display: "flex", flexDirection: "column" }}>Fecha
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required />
        </label>
        <select value={turno} onChange={(e) => setTurno(e.target.value)}>
          <option value="diurno">Diurno (07:00–19:00)</option>
          <option value="nocturno">Nocturno (19:00–07:00)</option>
        </select>
        <SelectPersonal value={supervisorId} onChange={setSupervisorId} placeholder="— Supervisor —" />
        <button type="submit">Crear rol</button>
      </div>
      {error && <p style={{ color: "#b00020" }}>{error}</p>}
    </form>
  );
}

export default function RolServicioPage() {
  return (
    <ListaMaestra
      titulo="Rol de Servicio"
      subtitulo="Oficiales y CRP (patrullas) en servicio por turno (lo elabora el supervisor)"
      tabla="rol_servicio"
      modulo="rol_servicio"
      orderBy="fecha"
      select="id, folio, fecha, turno, inicio, fin, estatus, creado_en"
      placeholderBuscar="Buscar folio, fecha, turno…"
      columnas={[
        { header: "Folio", campo: "folio", celda: (r) => <span className="sc-folio">{r.folio ?? "s/folio"}</span> },
        { header: "Fecha", campo: "fecha", celda: (r) => new Date(r.fecha + "T00:00:00").toLocaleDateString() },
        { header: "Turno", campo: "turno", celda: (r) => r.turno },
        { header: "Horario", celda: (r) => `${new Date(r.inicio).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}–${new Date(r.fin).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` },
        { header: "Estatus", campo: "estatus", celda: (r) => <span className={r.estatus === "activo" ? "badge-activo" : "badge-cancelado"}>{r.estatus}</span> },
      ]}
      textoBusqueda={(r) => `${r.folio ?? ""} ${r.fecha} ${r.turno}`}
      detalleHref={(r) => `/rol-servicio/${r.id}`}
      filtros={[{ k: "todos", label: "Todos" }, { k: "activos", label: "Activos", test: (r) => r.estatus === "activo" }]}
      quickView={(r) => (
        <>
          <div className="sc-folio" style={{ fontSize: 16 }}>{r.folio ?? "s/folio"}</div>
          <h3 style={{ margin: "6px 0 8px" }}>{new Date(r.fecha + "T00:00:00").toLocaleDateString()} · {r.turno}</h3>
          <dl className="sc-kv">
            <dt>Inicio</dt><dd>{new Date(r.inicio).toLocaleString()}</dd>
            <dt>Fin</dt><dd>{new Date(r.fin).toLocaleString()}</dd>
          </dl>
        </>
      )}
      nuevo={(onCreado) => <NuevoRol onCreado={onCreado} />}
    />
  );
}
