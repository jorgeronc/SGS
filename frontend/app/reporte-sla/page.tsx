"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { computeReporteSla, type ReporteSla } from "@/lib/sla";
import ReporteSlaVista from "@/app/components/ReporteSlaVista";

const mesActual = () => new Date().toISOString().slice(0, 7);
function rangoMes(mes: string): { ini: string; fin: string; label: string } {
  const [y, mm] = mes.split("-").map(Number);
  const ini = new Date(y, mm - 1, 1, 0, 0, 0);
  const fin = new Date(y, mm, 0, 23, 59, 59);
  return { ini: ini.toISOString(), fin: fin.toISOString(), label: ini.toLocaleDateString("es-MX", { month: "long", year: "numeric" }) };
}

// Reporte mensual de cumplimiento SLA por cliente (Tanda B). Interactivo + enlace
// a la versión imprimible para entregar al cliente.
export default function ReporteSlaPage() {
  const [clientes, setClientes] = useState<any[]>([]);
  const [clienteId, setClienteId] = useState("");
  const [mes, setMes] = useState(mesActual());
  const [rep, setRep] = useState<ReporteSla | null>(null);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    supabase.from("clientes").select("id, razon_social").eq("estatus", "activo").order("razon_social").then(({ data }) => setClientes((data as any[]) ?? []));
  }, []);

  const generar = useCallback(async () => {
    setCargando(true);
    const { ini, fin } = rangoMes(mes);
    setRep(await computeReporteSla(clienteId || null, ini, fin));
    setCargando(false);
  }, [clienteId, mes]);

  useEffect(() => { generar(); }, [generar]);

  const clienteNombre = clienteId ? (clientes.find((c) => c.id === clienteId)?.razon_social ?? "Cliente") : "Todos los clientes";
  const { label } = rangoMes(mes);

  return (
    <main className="contenedor">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 10 }}>
        <div>
          <h2 style={{ margin: 0 }}>Reporte mensual de cumplimiento</h2>
          <p className="dash-sub">Índice de seguridad y SLA del periodo, listo para entregar al cliente.</p>
        </div>
        <a href={`/reporte-sla/imprimir?${clienteId ? `cliente=${clienteId}&` : ""}mes=${mes}`} target="_blank" rel="noopener noreferrer" className="qbtn2">🖨️ Imprimir / PDF ↗</a>
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

      <div style={{ border: "1px solid var(--sc-card-line, #e2e6ec)", borderRadius: 10, padding: 16, maxWidth: 820 }}>
        {cargando || !rep ? <p className="dash-sub">Calculando…</p> : <ReporteSlaVista r={rep} cliente={clienteNombre} periodo={label} />}
      </div>
      <p className="dash-sub" style={{ fontSize: 12, marginTop: 10 }}>
        Nota: la cobertura se mide por presencia GPS (asistencia) de los guardias asignados; los rondines por lecturas dentro de rango. Configura las metas en <b>SLA</b>.
      </p>
    </main>
  );
}
