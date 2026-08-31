"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

const hhmm = (t: any) => (t ? String(t).slice(0, 5) : "");

// Catálogo de tipos de turno (nombre + horario). Solo administrador escribe.
export default function TiposTurnoPanel() {
  const [tipos, setTipos] = useState<any[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  // Alta
  const [nombre, setNombre] = useState("");
  const [ini, setIni] = useState("");
  const [fin, setFin] = useState("");

  async function cargar() {
    setCargando(true);
    const { data, error } = await supabase.from("tipos_turno").select("*").order("orden").order("nombre");
    if (error) setError(error.message);
    setTipos((data as any[]) ?? []);
    setCargando(false);
  }
  useEffect(() => { cargar(); }, []);

  async function crear() {
    setError(null); setMsg(null);
    if (!nombre.trim()) { setError("Captura el nombre del tipo de turno."); return; }
    const { error } = await supabase.from("tipos_turno").insert({
      nombre: nombre.trim(), hora_inicio: ini || null, hora_fin: fin || null,
      orden: (tipos.length ? Math.max(...tipos.map((t) => t.orden ?? 0)) : 0) + 1,
    });
    if (error) { setError(error.message); return; }
    setNombre(""); setIni(""); setFin(""); setMsg("Tipo de turno agregado."); cargar();
  }

  async function actualizar(id: string, campos: any) {
    setError(null);
    const { error } = await supabase.from("tipos_turno").update({ ...campos, actualizado_en: new Date().toISOString() }).eq("id", id);
    if (error) { setError(error.message); return; }
    cargar();
  }

  async function eliminar(id: string, nom: string) {
    if (!window.confirm(`¿Eliminar el tipo de turno "${nom}"?`)) return;
    setError(null);
    const { error } = await supabase.from("tipos_turno").delete().eq("id", id);
    if (error) { setError(error.message); return; }
    cargar();
  }

  return (
    <div>
      <p style={{ fontSize: 13, color: "#555" }}>Tipos de turno con su horario. Se usan al crear el rol de turnos. Solo administrador.</p>

      <div className="dash-eyebrow">Nuevo tipo de turno</div>
      <div className="form-fila" style={{ flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
        <label className="dash-sub" style={{ display: "flex", flexDirection: "column" }}>Nombre
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Matutino, Nocturno…" maxLength={40} />
        </label>
        <label className="dash-sub" style={{ display: "flex", flexDirection: "column" }}>Inicio
          <input type="time" value={ini} onChange={(e) => setIni(e.target.value)} />
        </label>
        <label className="dash-sub" style={{ display: "flex", flexDirection: "column" }}>Fin
          <input type="time" value={fin} onChange={(e) => setFin(e.target.value)} />
        </label>
        <button className="sc-btn" onClick={crear}>Agregar</button>
      </div>
      {msg && <p style={{ color: "#0a7c2f" }}>{msg}</p>}
      {error && <p style={{ color: "#b00020" }}>{error}</p>}

      <h3 style={{ marginTop: 16 }}>Tipos de turno</h3>
      {cargando ? <p>Cargando…</p> : tipos.length === 0 ? <p className="dash-sub">Sin tipos de turno.</p> : (
        <table>
          <thead><tr><th>Nombre</th><th>Inicio</th><th>Fin</th><th>Activo</th><th></th></tr></thead>
          <tbody>
            {tipos.map((t) => (
              <tr key={t.id} style={t.activo ? undefined : { opacity: 0.55 }}>
                <td>{t.nombre}</td>
                <td><input type="time" defaultValue={hhmm(t.hora_inicio)} onBlur={(e) => e.target.value !== hhmm(t.hora_inicio) && actualizar(t.id, { hora_inicio: e.target.value || null })} /></td>
                <td><input type="time" defaultValue={hhmm(t.hora_fin)} onBlur={(e) => e.target.value !== hhmm(t.hora_fin) && actualizar(t.id, { hora_fin: e.target.value || null })} /></td>
                <td><input type="checkbox" checked={!!t.activo} onChange={(e) => actualizar(t.id, { activo: e.target.checked })} /></td>
                <td><button className="secundario" onClick={() => eliminar(t.id, t.nombre)}>Eliminar</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
