"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

// Programar rondín: el supervisor/central fija la HORA a la que debe iniciar una
// sesión de rondín (por sitio o por guardia). La sesión inicia cuando el guardia
// pone su estatus "en rondín" (si está dentro de ±15 min de la hora, cuenta como
// la programada) o, si no la inicia, 15 min después de la hora (automático).
const hoyISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
function nombreGuardia(p: any): string {
  const x = p?.persona ?? p;
  return x ? `${x.nombre ?? ""} ${x.apellido_paterno ?? ""} ${x.apellido_materno ?? ""}`.trim() : "—";
}
const ESTADO_LBL: Record<string, { t: string; c: string }> = {
  pendiente: { t: "Pendiente", c: "#b06a00" },
  iniciada: { t: "Iniciada", c: "#0a7c2f" },
  omitida: { t: "Omitida", c: "#b00020" },
  cancelada: { t: "Cancelada", c: "#777" },
};

export default function ProgramarRondinPage() {
  const [sitios, setSitios] = useState<any[]>([]);
  const [guardias, setGuardias] = useState<any[]>([]);
  const [lista, setLista] = useState<any[]>([]);
  const [cargando, setCargando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [sitioId, setSitioId] = useState("");
  const [modo, setModo] = useState<"sitio" | "guardia">("sitio");
  const [guardiaId, setGuardiaId] = useState("");
  const [fecha, setFecha] = useState(hoyISO());
  const [hora, setHora] = useState("08:00");
  const [repetir, setRepetir] = useState(false);
  const [motivo, setMotivo] = useState("Rutina");
  const [guardando, setGuardando] = useState(false);

  const cargarLista = useCallback(async () => {
    setCargando(true);
    const { data } = await supabase.from("rondines_programados")
      .select("id, folio, fecha, hora, repetir_diario, motivo, estado, personal_id, sitio:sitios(nombre), guardia:personal(persona:personas(nombre, apellido_paterno, apellido_materno))")
      .eq("estatus", "activo").gte("fecha", hoyISO())
      .order("fecha").order("hora").limit(200);
    setLista((data as any[]) ?? []);
    setCargando(false);
  }, []);

  useEffect(() => {
    supabase.from("sitios").select("id, nombre").eq("estatus", "activo").order("nombre").then(({ data }) => setSitios((data as any[]) ?? []));
    supabase.from("personal").select("id, persona:personas(nombre, apellido_paterno, apellido_materno)").eq("estatus", "activo").eq("estado_laboral", "activo").order("id").then(({ data }) => setGuardias((data as any[]) ?? []));
    cargarLista();
  }, [cargarLista]);

  async function programar(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!sitioId) { setMsg("Elige el sitio."); return; }
    if (modo === "guardia" && !guardiaId) { setMsg("Elige el guardia."); return; }
    if (!hora) { setMsg("Indica la hora."); return; }
    setGuardando(true);
    const { error } = await supabase.from("rondines_programados").insert({
      sitio_id: sitioId,
      personal_id: modo === "guardia" ? guardiaId : null,
      fecha, hora,
      repetir_diario: repetir,
      motivo: motivo.trim() || null,
    });
    setGuardando(false);
    if (error) { setMsg(error.message); return; }
    setMsg("Rondín programado.");
    setGuardiaId("");
    cargarLista();
  }

  async function cancelar(id: string) {
    if (!confirm("¿Cancelar este rondín programado?")) return;
    await supabase.rpc("rpc_cancelar_registro", { p_tabla: "rondines_programados", p_id: id, p_motivo: "Cancelado desde la agenda" });
    cargarLista();
  }

  const input: React.CSSProperties = { width: "100%" };

  return (
    <main className="contenedor">
      <h2 style={{ marginBottom: 4 }}>Programar rondín</h2>
      <p className="dash-sub" style={{ marginTop: 0 }}>
        Fija la hora a la que debe iniciar la sesión de rondín. El guardia la inicia poniendo su estatus
        «En rondín»; si no lo hace, inicia sola 15 min después de la hora.
      </p>

      <form onSubmit={programar} style={{ border: "1px solid var(--sc-card-line)", borderRadius: 12, padding: 14, marginBottom: 18 }}>
        <div className="form-fila" style={{ alignItems: "flex-end", flexWrap: "wrap", gap: 10 }}>
          <label className="dash-sub" style={{ display: "flex", flexDirection: "column", flex: 2, minWidth: 200 }}>Sitio
            <select value={sitioId} onChange={(e) => setSitioId(e.target.value)} style={input}>
              <option value="">— Selecciona el sitio —</option>
              {sitios.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          </label>
          <label className="dash-sub" style={{ display: "flex", flexDirection: "column" }}>Fecha
            <input type="date" value={fecha} min={hoyISO()} onChange={(e) => setFecha(e.target.value)} />
          </label>
          <label className="dash-sub" style={{ display: "flex", flexDirection: "column" }}>Hora
            <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
          </label>
          <label className="dash-sub" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input type="checkbox" checked={repetir} onChange={(e) => setRepetir(e.target.checked)} /> Repetir diario
          </label>
        </div>

        <div style={{ display: "flex", gap: 16, marginTop: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <div className="dash-sub" style={{ fontWeight: 700, marginBottom: 4 }}>¿A quién?</div>
            <label style={{ marginRight: 12 }}><input type="radio" checked={modo === "sitio"} onChange={() => setModo("sitio")} /> Todos los guardias del sitio (turno del día)</label>
            <label><input type="radio" checked={modo === "guardia"} onChange={() => setModo("guardia")} /> Un guardia</label>
          </div>
          {modo === "guardia" && (
            <label className="dash-sub" style={{ display: "flex", flexDirection: "column", minWidth: 220 }}>Guardia
              <select value={guardiaId} onChange={(e) => setGuardiaId(e.target.value)}>
                <option value="">— Selecciona —</option>
                {guardias.map((g) => <option key={g.id} value={g.id}>{nombreGuardia(g)}</option>)}
              </select>
            </label>
          )}
          <label className="dash-sub" style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 180 }}>Motivo
            <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Rutina, por incidente, etc." list="motivos-rondin" />
            <datalist id="motivos-rondin"><option value="Rutina" /><option value="Por incidente" /><option value="Verificación" /></datalist>
          </label>
        </div>

        {msg && <p style={{ color: msg === "Rondín programado." ? "#0a7c2f" : "#b00020", marginTop: 8 }}>{msg}</p>}
        <div style={{ marginTop: 10 }}>
          <button type="submit" disabled={guardando}>{guardando ? "Programando…" : "Programar rondín"}</button>
        </div>
      </form>

      <h3 style={{ marginBottom: 8 }}>Programados (hoy y próximos)</h3>
      {cargando ? <p>Cargando…</p> : lista.length === 0 ? (
        <p className="dash-sub">Sin rondines programados.</p>
      ) : (
        <table className="sc-table">
          <thead>
            <tr><th>Folio</th><th>Fecha</th><th>Hora</th><th>Sitio</th><th>Asignado</th><th>Motivo</th><th>Estado</th><th></th></tr>
          </thead>
          <tbody>
            {lista.map((r) => {
              const est = ESTADO_LBL[r.estado] ?? ESTADO_LBL.pendiente;
              return (
                <tr key={r.id}>
                  <td>{r.folio ?? "—"}</td>
                  <td>{r.fecha}{r.repetir_diario ? " (diario)" : ""}</td>
                  <td>{String(r.hora).slice(0, 5)}</td>
                  <td>{r.sitio?.nombre ?? "—"}</td>
                  <td>{r.personal_id ? nombreGuardia(r.guardia) : "Todos del sitio"}</td>
                  <td>{r.motivo ?? "—"}</td>
                  <td><span style={{ color: est.c, fontWeight: 700 }}>{est.t}</span></td>
                  <td>{r.estado === "pendiente" && <button className="secundario" onClick={() => cancelar(r.id)}>Cancelar</button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </main>
  );
}
