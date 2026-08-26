"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { computeReporteSla, type ReporteSla } from "@/lib/sla";
import ReporteSlaVista from "@/app/components/ReporteSlaVista";

function rangoMes(mes: string): { ini: string; fin: string; label: string } {
  const [y, mm] = mes.split("-").map(Number);
  const ini = new Date(y, mm - 1, 1, 0, 0, 0);
  const fin = new Date(y, mm, 0, 23, 59, 59);
  return { ini: ini.toISOString(), fin: fin.toISOString(), label: ini.toLocaleDateString("es-MX", { month: "long", year: "numeric" }) };
}

// Versión imprimible del reporte SLA (AppShell la muestra a pantalla completa por
// terminar en /imprimir) y dispara window.print().
export default function ReporteSlaImprimirPage() {
  const [rep, setRep] = useState<ReporteSla | null>(null);
  const [cliente, setCliente] = useState("Todos los clientes");
  const [periodo, setPeriodo] = useState("");

  useEffect(() => {
    (async () => {
      const q = new URLSearchParams(window.location.search);
      const clienteId = q.get("cliente");
      const mes = q.get("mes") || new Date().toISOString().slice(0, 7);
      const { ini, fin, label } = rangoMes(mes);
      setPeriodo(label);
      if (clienteId) {
        const { data } = await supabase.from("clientes").select("razon_social").eq("id", clienteId).maybeSingle();
        setCliente((data as any)?.razon_social ?? "Cliente");
      }
      const r = await computeReporteSla(clienteId, ini, fin);
      setRep(r);
      setTimeout(() => window.print(), 500);
    })();
  }, []);

  return (
    <div style={{ padding: 28, maxWidth: 820, margin: "0 auto", fontFamily: "Arial, sans-serif", color: "#111" }}>
      {!rep ? <p>Generando reporte…</p> : <ReporteSlaVista r={rep} cliente={cliente} periodo={periodo} />}
      <p style={{ marginTop: 20, fontSize: 11, color: "#888" }}>Generado {new Date().toLocaleString()} · SGS — Sistema de Gestión de Seguridad</p>
    </div>
  );
}
