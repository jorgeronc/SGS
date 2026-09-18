"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { computeReporteSla, computeSla, type ReporteSla } from "@/lib/sla";
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
      const contratoId = q.get("contrato");
      const mes = q.get("mes") || new Date().toISOString().slice(0, 7);
      const { ini, fin, label } = rangoMes(mes);
      setPeriodo(label);
      let etiqueta = clienteId ? "Cliente" : "Todos los clientes";
      if (clienteId) {
        const { data } = await supabase.from("clientes").select("razon_social").eq("id", clienteId).maybeSingle();
        etiqueta = (data as any)?.razon_social ?? "Cliente";
      }
      let r: ReporteSla;
      if (contratoId) {
        const [{ data: ct }, { data: sv }] = await Promise.all([
          supabase.from("contratos").select("folio, nombre").eq("id", contratoId).maybeSingle(),
          supabase.from("contrato_servicios").select("sitio_id").eq("contrato_id", contratoId).eq("estatus", "activo").eq("estado", "activo"),
        ]);
        if (ct) etiqueta = `${etiqueta} · ${(ct as any).folio ? `[${(ct as any).folio}] ` : ""}${(ct as any).nombre}`;
        const sitiosIds = Array.from(new Set(((sv as any[]) ?? []).filter((s) => s.sitio_id).map((s) => s.sitio_id))) as string[];
        r = await computeSla(clienteId, ini, fin, { contratoId, sitiosIds });
      } else {
        r = await computeReporteSla(clienteId, ini, fin);
      }
      setCliente(etiqueta);
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
