"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

const hhmm = (t: any) => (t ? String(t).slice(0, 5) : "");
const hoyISO = () => new Date().toISOString().slice(0, 10);
function nombre(p: any) {
  const x = p?.persona;
  return x ? `${x.nombre ?? ""} ${x.apellido_paterno ?? ""} ${x.apellido_materno ?? ""}`.trim() : "—";
}
function EstadoBadge({ e }: { e: string }) {
  const c: Record<string, string> = { borrador: "#7a5c00", activo: "#0a7c2f", cerrado: "#555" };
  return <span className={`cad-pill`} style={{ background: c[e] ?? "#607d8b", color: "#fff" }}>{e}</span>;
}

// Rol de turnos (cabecera): un turno = supervisor + fecha + franja, con varios
// guardias (se agregan al abrir el turno). Se crea en borrador y luego se activa.
export default function TurnosPage() {
  const router = useRouter();
  const [turnos, setTurnos] = useState<any[]>([]);
  const [supervisores, setSupervisores] = useState<any[]>([]);
  const [tiposTurno, setTiposTurno] = useState<any[]>([]);
  const [sitios, setSitios] = useState<any[]>([]);
  const [cargando, setCargando] = useState(true);
  const [f, setF] = useState({ supervisor_id: "", fecha: hoyISO(), sitio_id: "", tipo_turno: "", hora_inicio: "", hora_fin: "" });
  const [error, setError] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  async function cargar() {
    setCargando(true);
    const { data } = await supabase.from("turnos")
      .select("id, folio, fecha, tipo_turno, hora_inicio, hora_fin, estado, estatus, sitio:sitios(nombre), supervisor:personal!turnos_supervisor_id_fkey(persona:personas(nombre, apellido_paterno, apellido_materno)), turno_guardias(count)")
      .eq("estatus", "activo").order("fecha", { ascending: false });
    setTurnos((data as any[]) ?? []);
    setCargando(false);
  }

  useEffect(() => {
    cargar();
    supabase.from("personal").select("id, categoria, persona:personas(nombre, apellido_paterno, apellido_materno)")
      .eq("estatus", "activo").eq("estado_laboral", "activo")
      .then(({ data }) => setSupervisores((data as any[]) ?? []));
    supabase.from("tipos_turno").select("id, nombre, hora_inicio, hora_fin").eq("activo", true).order("orden").order("nombre")
      .then(({ data }) => setTiposTurno((data as any[]) ?? []));
    supabase.from("sitios").select("id, nombre, cliente:clientes(razon_social)").eq("estatus", "activo").order("nombre")
      .then(({ data }) => setSitios((data as any[]) ?? []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pickTipo(nombre: string) {
    const t = tiposTurno.find((x) => x.nombre === nombre);
    setF((p) => ({ ...p, tipo_turno: nombre, hora_inicio: hhmm(t?.hora_inicio), hora_fin: hhmm(t?.hora_fin) }));
  }

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!f.supervisor_id) { setError("Elige el supervisor del turno."); return; }
    if (!f.fecha) { setError("Indica la fecha."); return; }
    setCreando(true);
    const { data, error } = await supabase.from("turnos").insert({
      supervisor_id: f.supervisor_id, fecha: f.fecha, estado: "borrador", sitio_id: f.sitio_id || null,
      tipo_turno: f.tipo_turno || null, hora_inicio: f.hora_inicio || null, hora_fin: f.hora_fin || null,
    }).select("id").single();
    setCreando(false);
    if (error) { setError(error.message); return; }
    // Abre el turno para agregar los guardias.
    router.push(`/turnos/${(data as any).id}`);
  }

  const nGuardias = (t: any) => t.turno_guardias?.[0]?.count ?? 0;

  return (
    <main className="contenedor">
      <h2>Rol de turnos</h2>
      <p style={{ fontSize: 13, color: "#555" }}>Crea el turno con su supervisor; luego ábrelo para agregar los guardias y actívalo.</p>

      <form onSubmit={crear}>
        <div className="dash-eyebrow">Nuevo turno</div>
        <div className="form-fila">
          <select value={f.supervisor_id} onChange={(e) => set("supervisor_id", e.target.value)} required style={{ flex: 2 }}>
            <option value="">— Supervisor del turno —</option>
            {supervisores.map((s) => <option key={s.id} value={s.id}>{nombre(s)}{s.categoria ? ` · ${s.categoria}` : ""}</option>)}
          </select>
          <label className="dash-sub" style={{ display: "flex", flexDirection: "column" }}>Fecha
            <input type="date" value={f.fecha} onChange={(e) => set("fecha", e.target.value)} required />
          </label>
          <select value={f.sitio_id} onChange={(e) => set("sitio_id", e.target.value)} style={{ flex: 2 }}>
            <option value="">— Sitio (opcional) —</option>
            {sitios.map((s) => <option key={s.id} value={s.id}>{s.nombre}{s.cliente?.razon_social ? ` · ${s.cliente.razon_social}` : ""}</option>)}
          </select>
          <select value={f.tipo_turno} onChange={(e) => pickTipo(e.target.value)}>
            <option value="">— Tipo de turno —</option>
            {tiposTurno.map((t) => <option key={t.id} value={t.nombre}>{t.nombre}{t.hora_inicio ? ` (${hhmm(t.hora_inicio)}–${hhmm(t.hora_fin)})` : ""}</option>)}
          </select>
          <label className="dash-sub" style={{ display: "flex", flexDirection: "column" }}>Inicio
            <input type="time" value={f.hora_inicio} onChange={(e) => set("hora_inicio", e.target.value)} />
          </label>
          <label className="dash-sub" style={{ display: "flex", flexDirection: "column" }}>Fin
            <input type="time" value={f.hora_fin} onChange={(e) => set("hora_fin", e.target.value)} />
          </label>
          <button type="submit" disabled={creando}>{creando ? "Creando…" : "Crear y agregar guardias"}</button>
        </div>
        {supervisores.length === 0 && <p className="dash-sub">Necesitas al menos un guardia/supervisor activo.</p>}
        {error && <p style={{ color: "#b00020" }}>{error}</p>}
      </form>

      <h3 style={{ marginTop: 18 }}>Turnos</h3>
      {cargando ? <p>Cargando…</p> : turnos.length === 0 ? (
        <p className="dash-sub">Aún no hay turnos.</p>
      ) : (
        <table>
          <thead><tr><th>Folio</th><th>Fecha</th><th>Sitio</th><th>Supervisor</th><th>Turno</th><th>Horario</th><th>Guardias</th><th>Estado</th></tr></thead>
          <tbody>
            {turnos.map((t) => (
              <tr key={t.id}>
                <td><Link href={`/turnos/${t.id}`} className="sc-folio">{t.folio ?? "s/folio"}</Link></td>
                <td>{t.fecha ? new Date(t.fecha + "T00:00:00").toLocaleDateString() : "—"}</td>
                <td>{t.sitio?.nombre ?? "—"}</td>
                <td>{nombre(t.supervisor)}</td>
                <td>{t.tipo_turno ?? "—"}</td>
                <td>{t.hora_inicio ? `${String(t.hora_inicio).slice(0, 5)}–${String(t.hora_fin ?? "").slice(0, 5)}` : "—"}</td>
                <td>{nGuardias(t)}</td>
                <td><EstadoBadge e={t.estado} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
