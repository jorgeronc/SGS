"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { hoyLocal } from "@/lib/fechas";

// Tablero de supervisores (coordinador/administrador): por supervisor del día,
// % de sitios visitados, brechas de relevo en sus sitios y cumplimiento de rondines.
interface Fila {
  supervisor_id: string; supervisor: string;
  sitios: number; visitados: number; brechas: number; rondines: number; rondines_rango: number;
}
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : null);
const colorPct = (v: number | null) => (v == null ? "#9aa4b2" : v >= 90 ? "#1f9d5c" : v >= 70 ? "#d98a2b" : "#d32f2f");

export default function SupervisoresPage() {
  const [fecha, setFecha] = useState(hoyLocal());
  const [filas, setFilas] = useState<Fila[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true); setError(null);
    const { data, error } = await supabase.rpc("rpc_tablero_supervisores", { p_fecha: fecha });
    if (error) setError(error.message);
    setFilas((data as Fila[]) ?? []);
    setCargando(false);
  }, [fecha]);

  useEffect(() => { cargar(); }, [cargar]);

  return (
    <main className="contenedor">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 10 }}>
        <div>
          <h2 style={{ margin: 0 }}>Supervisores</h2>
          <p className="dash-sub">Desempeño por supervisor: sitios visitados, brechas de relevo y cumplimiento de rondines.</p>
        </div>
        <label className="dash-sub" style={{ display: "flex", flexDirection: "column" }}>Fecha
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </label>
      </div>

      {error ? (
        <p style={{ color: "#b00020", marginTop: 16 }}>{error}</p>
      ) : cargando ? (
        <p className="dash-sub" style={{ marginTop: 16 }}>Cargando…</p>
      ) : filas.length === 0 ? (
        <p className="dash-sub" style={{ marginTop: 16 }}>Sin supervisores asignados en esta fecha. Asigna supervisor por sitio en Rol de turnos.</p>
      ) : (
        <table style={{ marginTop: 14 }}>
          <thead>
            <tr><th>Supervisor</th><th>Sitios</th><th>Visitados</th><th>Brechas de relevo</th><th>Rondines en rango</th></tr>
          </thead>
          <tbody>
            {filas.map((f) => {
              const pv = pct(f.visitados, f.sitios);
              const pr = pct(f.rondines_rango, f.rondines);
              return (
                <tr key={f.supervisor_id}>
                  <td>{f.supervisor || "—"}</td>
                  <td>{f.sitios}</td>
                  <td><b style={{ color: colorPct(pv) }}>{pv == null ? "—" : `${pv}%`}</b> <span className="dash-sub">({f.visitados}/{f.sitios})</span></td>
                  <td><b style={{ color: f.brechas > 0 ? "#d32f2f" : "#1f9d5c" }}>{f.brechas}</b></td>
                  <td><b style={{ color: colorPct(pr) }}>{pr == null ? "—" : `${pr}%`}</b> <span className="dash-sub">({f.rondines_rango}/{f.rondines})</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <p className="dash-sub" style={{ fontSize: 12, marginTop: 12 }}>
        Visitado = el supervisor estuvo dentro de la geocerca del sitio ese día (su GPS). Brechas de relevo vienen del barrido automático. Solo coordinador/administrador.
      </p>
    </main>
  );
}
