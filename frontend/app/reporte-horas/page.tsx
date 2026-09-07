"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { computeHorasTrabajadas, type ReporteHoras } from "@/lib/horas";

const mesActual = () => new Date().toISOString().slice(0, 7);
function rangoMes(mes: string): { ini: string; fin: string; label: string } {
  const [y, mm] = mes.split("-").map(Number);
  const ini = new Date(y, mm - 1, 1, 0, 0, 0);
  const fin = new Date(y, mm, 0, 23, 59, 59);
  return { ini: ini.toISOString(), fin: fin.toISOString(), label: ini.toLocaleDateString("es-MX", { month: "long", year: "numeric" }) };
}

// Reporte de horas trabajadas (normales vs extra) por guardia, exportable a CSV/Excel.
// Las horas extra ayudan a detectar guardias con turnos continuos (fatiga/riesgo).
export default function ReporteHorasPage() {
  const [clientes, setClientes] = useState<any[]>([]);
  const [clienteId, setClienteId] = useState("");
  const [mes, setMes] = useState(mesActual());
  const [rep, setRep] = useState<ReporteHoras | null>(null);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    supabase.from("clientes").select("id, razon_social").eq("estatus", "activo").order("razon_social").then(({ data }) => setClientes((data as any[]) ?? []));
  }, []);

  const generar = useCallback(async () => {
    setCargando(true);
    const { ini, fin } = rangoMes(mes);
    setRep(await computeHorasTrabajadas(clienteId || null, ini, fin));
    setCargando(false);
  }, [clienteId, mes]);

  useEffect(() => { generar(); }, [generar]);

  const clienteNombre = clienteId ? (clientes.find((c) => c.id === clienteId)?.razon_social ?? "Cliente") : "Todos los clientes";
  const { label } = rangoMes(mes);

  function exportarCSV() {
    if (!rep) return;
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const filas = [
      ["Cliente", clienteNombre],
      ["Periodo", label],
      [],
      ["Guardia", "Días trabajados", "Horas normales", "Horas extra", "Horas totales"],
      ...rep.filas.map((f) => [f.nombre, f.dias, f.normal, f.extra, f.total]),
      [],
      ["TOTAL", "", rep.totNormal, rep.totExtra, rep.totTotal],
    ];
    const csv = filas.map((r) => r.map((c) => esc(c as any)).join(",")).join("\r\n");
    // BOM para que Excel abra el UTF-8 correctamente.
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `horas-${clienteId ? clienteNombre.replace(/\s+/g, "_") : "todos"}-${mes}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="contenedor">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 10 }}>
        <div>
          <h2 style={{ margin: 0 }}>Horas trabajadas (normales y extra)</h2>
          <p className="dash-sub">Por guardia y periodo. Las horas extra ayudan a detectar turnos continuos (fatiga/riesgo). Listo para entregar al cliente.</p>
        </div>
        <button className="qbtn2 primary" onClick={exportarCSV} disabled={!rep || rep.filas.length === 0}>⬇️ Exportar CSV / Excel</button>
      </div>

      <div className="form-fila" style={{ margin: "12px 0" }}>
        <select value={clienteId} onChange={(e) => setClienteId(e.target.value)} style={{ maxWidth: 320 }}>
          <option value="">Todos los clientes</option>
          {clientes.map((c) => <option key={c.id} value={c.id}>{c.razon_social}</option>)}
        </select>
        <label className="dash-sub" style={{ display: "flex", flexDirection: "column" }}>Mes
          <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} />
        </label>
      </div>

      {cargando || !rep ? <p className="dash-sub">Calculando…</p> : rep.filas.length === 0 ? (
        <p className="dash-sub">Sin turnos registrados para {clienteNombre} en {label}.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "2px solid var(--sc-card-line)" }}>
                <th style={{ padding: "8px 10px" }}>Guardia</th>
                <th style={{ padding: "8px 10px", textAlign: "right" }}>Días</th>
                <th style={{ padding: "8px 10px", textAlign: "right" }}>Horas normales</th>
                <th style={{ padding: "8px 10px", textAlign: "right" }}>Horas extra</th>
                <th style={{ padding: "8px 10px", textAlign: "right" }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {rep.filas.map((f) => (
                <tr key={f.personalId} style={{ borderBottom: "1px solid var(--sc-card-line)" }}>
                  <td style={{ padding: "8px 10px" }}>{f.nombre}</td>
                  <td style={{ padding: "8px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{f.dias}</td>
                  <td style={{ padding: "8px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{f.normal}</td>
                  <td style={{ padding: "8px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: f.extra > 0 ? "#b45309" : "var(--sc-text)", fontWeight: f.extra > 0 ? 700 : 400 }}>{f.extra}</td>
                  <td style={{ padding: "8px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>{f.total}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: "2px solid var(--sc-card-line)", fontWeight: 800 }}>
                <td style={{ padding: "8px 10px" }}>TOTAL</td>
                <td />
                <td style={{ padding: "8px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{rep.totNormal}</td>
                <td style={{ padding: "8px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: "#b45309" }}>{rep.totExtra}</td>
                <td style={{ padding: "8px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{rep.totTotal}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <p className="dash-sub" style={{ fontSize: 12, marginTop: 10 }}>
        Horas normales = duración del turno asignado del día. Horas extra = turnos adicionales del mismo día (p. ej. diurno seguido de nocturno). Se calcula del rol de turnos.
      </p>
    </main>
  );
}
