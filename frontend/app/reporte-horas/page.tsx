"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { computeHorasPorCliente, type ReporteHorasAgrupado } from "@/lib/horas";

const hoyISO = () => new Date().toISOString().slice(0, 10);
const primeroMes = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10); };
const fFecha = (s: string) => new Date(s + "T00:00:00").toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });

// Reporte de horas trabajadas (normales vs extra) por guardia, por periodo y cliente.
// Con "Todos los clientes" se agrupa por cliente con desglose por guardia. Export CSV/Excel.
export default function ReporteHorasPage() {
  const [clientes, setClientes] = useState<any[]>([]);
  const [clienteId, setClienteId] = useState("");
  const [ini, setIni] = useState(primeroMes());
  const [fin, setFin] = useState(hoyISO());
  const [rep, setRep] = useState<ReporteHorasAgrupado | null>(null);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    supabase.from("clientes").select("id, razon_social").eq("estatus", "activo").order("razon_social").then(({ data }) => setClientes((data as any[]) ?? []));
  }, []);

  const generar = useCallback(async () => {
    if (ini > fin) { setRep({ grupos: [], totNormal: 0, totExtra: 0, totTotal: 0 }); return; }
    setCargando(true);
    setRep(await computeHorasPorCliente(clienteId || null, ini, fin));
    setCargando(false);
  }, [clienteId, ini, fin]);

  useEffect(() => { generar(); }, [generar]);

  const clienteNombre = clienteId ? (clientes.find((c) => c.id === clienteId)?.razon_social ?? "Cliente") : "Todos los clientes";
  const periodo = `${fFecha(ini)} — ${fFecha(fin)}`;
  const varios = !clienteId; // agrupado por cliente

  function exportarCSV() {
    if (!rep) return;
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const filas: (string | number)[][] = [["Cliente", clienteNombre], ["Periodo", periodo], []];
    for (const g of rep.grupos) {
      if (varios) filas.push([`Cliente: ${g.clienteNombre}`]);
      filas.push(["Guardia", "Días trabajados", "Horas normales", "Horas extra", "Horas totales"]);
      for (const f of g.filas) filas.push([f.nombre, f.dias, f.normal, f.extra, f.total]);
      filas.push(["Subtotal", "", g.totNormal, g.totExtra, g.totTotal], []);
    }
    filas.push(["TOTAL GENERAL", "", rep.totNormal, rep.totExtra, rep.totTotal]);
    const csv = filas.map((r) => r.map((c) => esc(c as any)).join(",")).join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `horas-${clienteId ? clienteNombre.replace(/\s+/g, "_") : "todos"}-${ini}_a_${fin}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  const th = { padding: "8px 10px" } as const;
  const thR = { padding: "8px 10px", textAlign: "right" as const };
  const tdR = { padding: "8px 10px", textAlign: "right" as const, fontVariantNumeric: "tabular-nums" as const };

  return (
    <main className="contenedor">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 10 }}>
        <div>
          <h2 style={{ margin: 0 }}>Horas trabajadas (normales y extra)</h2>
          <p className="dash-sub">Por guardia y periodo. Con “Todos los clientes” se agrupa por cliente con desglose por guardia. Listo para entregar al cliente.</p>
        </div>
        <button className="qbtn2 primary" onClick={exportarCSV} disabled={!rep || rep.grupos.length === 0}>⬇️ Exportar CSV / Excel</button>
      </div>

      <div className="form-fila" style={{ margin: "12px 0", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
        <label className="dash-sub" style={{ display: "flex", flexDirection: "column" }}>Cliente
          <select value={clienteId} onChange={(e) => setClienteId(e.target.value)} style={{ maxWidth: 320 }}>
            <option value="">Todos los clientes</option>
            {clientes.map((c) => <option key={c.id} value={c.id}>{c.razon_social}</option>)}
          </select>
        </label>
        <label className="dash-sub" style={{ display: "flex", flexDirection: "column" }}>Desde
          <input type="date" value={ini} max={fin} onChange={(e) => setIni(e.target.value)} />
        </label>
        <label className="dash-sub" style={{ display: "flex", flexDirection: "column" }}>Hasta
          <input type="date" value={fin} min={ini} onChange={(e) => setFin(e.target.value)} />
        </label>
      </div>

      {ini > fin ? (
        <p style={{ color: "#b00020" }}>La fecha inicial no puede ser mayor que la final.</p>
      ) : cargando || !rep ? (
        <p className="dash-sub">Calculando…</p>
      ) : rep.grupos.length === 0 ? (
        <p className="dash-sub">Sin turnos registrados para {clienteNombre} en {periodo}.</p>
      ) : (
        <>
          {rep.grupos.map((g) => (
            <div key={g.clienteId} style={{ marginBottom: 22 }}>
              {varios && (
                <h3 style={{ margin: "0 0 6px", borderBottom: "2px solid var(--sc-btn,#f4a03f)", paddingBottom: 4 }}>
                  {g.clienteNombre} <span className="dash-sub" style={{ fontWeight: 400, fontSize: 13 }}>· {g.filas.length} guardia{g.filas.length === 1 ? "" : "s"} · {g.totExtra} h extra</span>
                </h3>
              )}
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ textAlign: "left", borderBottom: "2px solid var(--sc-card-line)" }}>
                      <th style={th}>Guardia</th>
                      <th style={thR}>Días</th>
                      <th style={thR}>Horas normales</th>
                      <th style={thR}>Horas extra</th>
                      <th style={thR}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.filas.map((f) => (
                      <tr key={f.personalId} style={{ borderBottom: "1px solid var(--sc-card-line)" }}>
                        <td style={th}>{f.nombre}</td>
                        <td style={tdR}>{f.dias}</td>
                        <td style={tdR}>{f.normal}</td>
                        <td style={{ ...tdR, color: f.extra > 0 ? "#b45309" : "var(--sc-text)", fontWeight: f.extra > 0 ? 700 : 400 }}>{f.extra}</td>
                        <td style={{ ...tdR, fontWeight: 700 }}>{f.total}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: "2px solid var(--sc-card-line)", fontWeight: 800 }}>
                      <td style={th}>{varios ? "Subtotal" : "TOTAL"}</td>
                      <td />
                      <td style={tdR}>{g.totNormal}</td>
                      <td style={{ ...tdR, color: "#b45309" }}>{g.totExtra}</td>
                      <td style={tdR}>{g.totTotal}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          ))}

          {varios && rep.grupos.length > 1 && (
            <div style={{ borderTop: "3px double var(--sc-text)", paddingTop: 8, display: "flex", justifyContent: "flex-end", gap: 24, fontWeight: 800, flexWrap: "wrap" }}>
              <span>TOTAL GENERAL</span>
              <span>Normales: {rep.totNormal}</span>
              <span style={{ color: "#b45309" }}>Extra: {rep.totExtra}</span>
              <span>Total: {rep.totTotal}</span>
            </div>
          )}
        </>
      )}

      <p className="dash-sub" style={{ fontSize: 12, marginTop: 10 }}>
        Horas normales = duración del turno asignado del día. Horas extra = turnos adicionales del mismo día (p. ej. diurno seguido de nocturno). Cada turno se atribuye al cliente del sitio donde se cubrió. Se calcula del rol de turnos.
      </p>
    </main>
  );
}
