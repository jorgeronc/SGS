"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { computeSla } from "@/lib/sla";
import { ESTADO_CONTRATO } from "@/lib/contratos";

const mesActual = () => new Date().toISOString().slice(0, 7);
function rangoMes(mes: string): { ini: string; fin: string; label: string } {
  const [y, mm] = mes.split("-").map(Number);
  const ini = new Date(y, mm - 1, 1, 0, 0, 0);
  const fin = new Date(y, mm, 0, 23, 59, 59);
  return { ini: ini.toISOString(), fin: fin.toISOString(), label: ini.toLocaleDateString("es-MX", { month: "long", year: "numeric" }) };
}
const colorIdx = (v: number | null) => (v == null ? "#9aa4b2" : v >= 90 ? "#1f9d5c" : v >= 75 ? "#d98a2b" : "#d32f2f");
// Color del contador de días para vencer (alertas 90/60/30/15).
function colorDias(d: number | null): string {
  if (d == null) return "#9aa4b2";
  if (d < 0) return "#8a1220";
  if (d <= 15) return "#d32f2f";
  if (d <= 30) return "#d98a2b";
  if (d <= 90) return "#8a6d00";
  return "#5a6a7a";
}

interface Fila { id: string; folio: string | null; nombre: string; cliente: string; estado: string; fecha_fin: string | null; dias: number | null; sitios: number; servicios: number; index: number | null; }

export default function ContratosTableroPage() {
  const [mes, setMes] = useState(mesActual());
  const [filas, setFilas] = useState<Fila[]>([]);
  const [cargando, setCargando] = useState(false);

  const generar = useCallback(async () => {
    setCargando(true);
    // Actualiza estados por fecha (vencido / por vencer) antes de listar.
    await supabase.rpc("rpc_actualizar_estados_contratos").then(() => undefined, () => undefined);
    const { ini, fin } = rangoMes(mes);
    const { data } = await supabase.from("contratos")
      .select("id, folio, nombre, fecha_fin, estado, cliente_id, cliente:clientes(razon_social), contrato_servicios(sitio_id, estatus, estado)")
      .eq("estatus", "activo").order("fecha_fin", { ascending: true, nullsFirst: false });
    const rows = (data as any[]) ?? [];
    const out: Fila[] = await Promise.all(rows.map(async (c) => {
      const svs = ((c.contrato_servicios ?? []) as any[]).filter((s) => s.estatus === "activo");
      const sitiosIds = Array.from(new Set(svs.filter((s) => s.sitio_id).map((s) => s.sitio_id))) as string[];
      const dias = c.fecha_fin ? Math.ceil((new Date(c.fecha_fin + "T00:00:00").getTime() - Date.now()) / 86400000) : null;
      let index: number | null = null;
      if (sitiosIds.length) index = (await computeSla(c.cliente_id, ini, fin, { contratoId: c.id, sitiosIds })).index;
      return { id: c.id, folio: c.folio, nombre: c.nombre, cliente: c.cliente?.razon_social ?? "—", estado: c.estado, fecha_fin: c.fecha_fin, dias, sitios: sitiosIds.length, servicios: svs.length, index };
    }));
    // Urgencia: vencidos/por vencer primero; luego por días ascendente; SLA bajo arriba.
    const rank = (e: string) => (e === "vencido" ? 0 : e === "por_vencer" ? 1 : e === "suspendido" ? 2 : 3);
    out.sort((a, b) => rank(a.estado) - rank(b.estado) || (a.dias ?? 99999) - (b.dias ?? 99999) || (a.index ?? 999) - (b.index ?? 999));
    setFilas(out);
    setCargando(false);
  }, [mes]);

  useEffect(() => { generar(); }, [generar]);

  const cuenta = (e: string) => filas.filter((f) => f.estado === e).length;
  const porVencer = filas.filter((f) => f.dias != null && f.dias >= 0 && f.dias <= 90).length;
  const { label } = rangoMes(mes);
  const th: React.CSSProperties = { textAlign: "left", padding: "8px 10px", fontSize: 12, color: "var(--sc-text-soft)", textTransform: "uppercase", letterSpacing: ".03em" };
  const td: React.CSSProperties = { padding: "8px 10px", fontSize: 13.5, borderTop: "1px solid var(--sc-card-line)" };

  return (
    <main className="contenedor">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 10 }}>
        <div>
          <h2 style={{ margin: 0 }}>Tablero de contratos</h2>
          <p className="dash-sub">Vigencia, vencimientos y cumplimiento (SLA del mes) por contrato. <Link href="/contratos" style={{ color: "var(--sc-btn,#f4a03f)" }}>Ir a Contratos →</Link></p>
        </div>
        <label className="dash-sub" style={{ display: "flex", flexDirection: "column" }}>Mes (SLA)
          <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} />
        </label>
      </div>

      {/* Resumen */}
      <div style={{ display: "flex", gap: 12, margin: "14px 0", flexWrap: "wrap" }}>
        {[["Activos", cuenta("activo"), "#0a7c2f"], ["Por vencer", cuenta("por_vencer"), "#d98a2b"], ["Vencidos", cuenta("vencido"), "#d32f2f"], ["≤ 90 días", porVencer, "#8a6d00"]].map(([l, n, c]) => (
          <div key={l as string} style={{ border: "1px solid var(--sc-card-line)", borderRadius: 12, padding: "10px 16px", minWidth: 120, background: "var(--sc-content)" }}>
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".03em", color: "var(--sc-text-soft)" }}>{l as string}</div>
            <b style={{ fontSize: 26, color: c as string, fontVariantNumeric: "tabular-nums" }}>{n as number}</b>
          </div>
        ))}
      </div>

      <div style={{ border: "1px solid var(--sc-card-line)", borderRadius: 12, overflowX: "auto", background: "var(--sc-content)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
          <thead><tr><th style={th}>Folio</th><th style={th}>Cliente</th><th style={th}>Contrato</th><th style={th}>Vence</th><th style={th}>Días</th><th style={th}>Estado</th><th style={th}>Sitios/Serv.</th><th style={th}>SLA {mes}</th></tr></thead>
          <tbody>
            {cargando ? (
              <tr><td style={td} colSpan={8}>Calculando…</td></tr>
            ) : filas.length === 0 ? (
              <tr><td style={td} colSpan={8}>Sin contratos activos.</td></tr>
            ) : filas.map((f) => {
              const est = ESTADO_CONTRATO[f.estado] ?? { lbl: f.estado, bg: "#607d8b", fg: "#fff" };
              return (
                <tr key={f.id}>
                  <td style={td}><Link href={`/contratos/${f.id}`} className="sc-folio">{f.folio ?? "s/folio"}</Link></td>
                  <td style={td}>{f.cliente}</td>
                  <td style={td}>{f.nombre}</td>
                  <td style={td}>{f.fecha_fin ? new Date(f.fecha_fin + "T00:00:00").toLocaleDateString() : "—"}</td>
                  <td style={{ ...td, fontWeight: 700, color: colorDias(f.dias) }}>{f.dias == null ? "—" : f.dias < 0 ? `vencido ${-f.dias}d` : `${f.dias} d`}</td>
                  <td style={td}><span style={{ background: est.bg, color: est.fg, fontWeight: 700, fontSize: 11.5, borderRadius: 7, padding: "2px 8px" }}>{est.lbl}</span></td>
                  <td style={td}>{f.sitios} · {f.servicios}</td>
                  <td style={{ ...td, fontWeight: 800, color: colorIdx(f.index), fontVariantNumeric: "tabular-nums" }}>{f.index == null ? "—" : f.index}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="dash-sub" style={{ fontSize: 12, marginTop: 8 }}>Periodo SLA: {label}. Los estados "por vencer/vencido" se actualizan por fecha al abrir este tablero.</p>
    </main>
  );
}
