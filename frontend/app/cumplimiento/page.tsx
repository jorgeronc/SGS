"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { computeSla, puntajeMetrica, type SlaResultado } from "@/lib/sla";

// Tablero directivo de Cumplimiento SLA: índice global del mes, desglose por
// cliente y métricas activas. Reusa el cálculo de SLA (lib/sla) del reporte
// mensual. Para el detalle imprimible por cliente, enlaza a /reporte-sla.
const mesActual = () => new Date().toISOString().slice(0, 7);
function rangoMes(mes: string): { ini: string; fin: string; label: string } {
  const [y, mm] = mes.split("-").map(Number);
  const ini = new Date(y, mm - 1, 1, 0, 0, 0);
  const fin = new Date(y, mm, 0, 23, 59, 59);
  return { ini: ini.toISOString(), fin: fin.toISOString(), label: ini.toLocaleDateString("es-MX", { month: "long", year: "numeric" }) };
}
const colorIdx = (v: number | null) => (v == null ? "#9aa4b2" : v >= 90 ? "#1f9d5c" : v >= 75 ? "#d98a2b" : "#d32f2f");
const fmt = (m: { valor: number | null; unidad: string }) => (m.valor == null ? "—" : `${m.valor}${m.unidad === "%" ? "%" : m.unidad === "min" ? " min" : m.unidad === "h" ? " h" : ""}`);

export default function CumplimientoPage() {
  const [mes, setMes] = useState(mesActual());
  const [clientes, setClientes] = useState<any[]>([]);
  const [overall, setOverall] = useState<SlaResultado | null>(null);
  const [porCliente, setPorCliente] = useState<{ id: string; nombre: string; index: number | null }[]>([]);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    supabase.from("clientes").select("id, razon_social").eq("estatus", "activo").order("razon_social")
      .then(({ data }) => setClientes((data as any[]) ?? []));
  }, []);

  const generar = useCallback(async () => {
    setCargando(true);
    const { ini, fin } = rangoMes(mes);
    setOverall(await computeSla(null, ini, fin));
    const res = await Promise.all(clientes.map(async (c) => ({
      id: c.id, nombre: c.razon_social, index: (await computeSla(c.id, ini, fin)).index,
    })));
    // Peor primero (los que requieren atención directiva arriba).
    res.sort((a, b) => (a.index ?? 999) - (b.index ?? 999));
    setPorCliente(res);
    setCargando(false);
  }, [mes, clientes]);

  useEffect(() => { generar(); }, [generar]);

  const { label } = rangoMes(mes);
  const idx = overall?.index ?? null;
  const activas = (overall?.metricas ?? []).filter((m) => m.activa);

  return (
    <main className="contenedor">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 10 }}>
        <div>
          <h2 style={{ margin: 0 }}>Cumplimiento SLA</h2>
          <p className="dash-sub">Tablero directivo del índice de cumplimiento y las metas de servicio del periodo.</p>
        </div>
        <label className="dash-sub" style={{ display: "flex", flexDirection: "column" }}>Mes
          <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} />
        </label>
      </div>

      {cargando ? (
        <p className="dash-sub" style={{ marginTop: 16 }}>Calculando…</p>
      ) : (
        <>
          {/* Índice global */}
          <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap", margin: "16px 0", padding: 18, border: "1px solid var(--sc-card-line, #e2e6ec)", borderRadius: 14 }}>
            <div style={{ width: 120, height: 120, borderRadius: "50%", display: "grid", placeItems: "center", background: `conic-gradient(${colorIdx(idx)} ${(idx ?? 0) * 3.6}deg, var(--sc-surface-2,#eef2f6) 0)` }}>
              <div style={{ width: 92, height: 92, borderRadius: "50%", background: "var(--sc-content,#fff)", display: "grid", placeItems: "center" }}>
                <div style={{ fontSize: 30, fontWeight: 800, color: colorIdx(idx) }}>{idx ?? "—"}</div>
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontSize: 13, color: "var(--sc-text-soft)", textTransform: "uppercase", letterSpacing: ".08em" }}>Índice de cumplimiento · {label}</div>
              <div style={{ fontSize: 15, marginTop: 4 }}>Todos los clientes · <b>{overall?.sitios ?? 0}</b> sitios · <b>{activas.length}</b> metas activas</div>
              <div style={{ fontSize: 12.5, color: "var(--sc-text-soft)", marginTop: 6 }}>Verde ≥ 90 · Ámbar 75–89 · Rojo &lt; 75. La cifra pondera las metas activas por su peso.</div>
            </div>
          </div>

          {/* Métricas activas (global) */}
          <h3 style={{ marginBottom: 6 }}>Metas del servicio (global)</h3>
          {activas.length === 0 ? (
            <p className="dash-sub">No hay metas activas. Configúralas en <Link href="/sla">Metas de SLA</Link>.</p>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10, marginBottom: 20 }}>
              {activas.map((m) => {
                const pj = puntajeMetrica(m);
                const c = m.cumple == null ? "#9aa4b2" : m.cumple ? "#1f9d5c" : "#d32f2f";
                return (
                  <div key={m.clave} style={{ border: "1px solid var(--sc-card-line, #e2e6ec)", borderRadius: 10, padding: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 700 }}>{m.nombre}</span>
                      <span style={{ fontSize: 12, color: "var(--sc-text-soft)" }}>{m.modulo}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 6 }}>
                      <span style={{ fontSize: 22, fontWeight: 800, color: c }}>{fmt(m)}</span>
                      <span style={{ fontSize: 12, color: "var(--sc-text-soft)" }}>meta {m.dir} {m.meta ?? "—"}{m.unidad === "%" ? "%" : ""}</span>
                    </div>
                    <div style={{ height: 6, borderRadius: 6, background: "var(--sc-surface-2,#eef2f6)", marginTop: 8, overflow: "hidden" }}>
                      <div style={{ width: `${pj}%`, height: "100%", background: c }} />
                    </div>
                    {m.detalle && <div style={{ fontSize: 11.5, color: "var(--sc-text-soft)", marginTop: 4 }}>{m.detalle}</div>}
                  </div>
                );
              })}
            </div>
          )}

          {/* Por cliente */}
          <h3 style={{ marginBottom: 6 }}>Índice por cliente</h3>
          {porCliente.length === 0 ? (
            <p className="dash-sub">Sin clientes activos.</p>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 10 }}>
              {porCliente.map((c) => (
                <Link key={c.id} href={`/reporte-sla?cliente=${c.id}&mes=${mes}`}
                  style={{ display: "flex", alignItems: "center", gap: 12, border: "1px solid var(--sc-card-line, #e2e6ec)", borderRadius: 10, padding: 12, textDecoration: "none", color: "var(--sc-text)" }}>
                  <div style={{ width: 46, height: 46, borderRadius: "50%", flex: "0 0 auto", display: "grid", placeItems: "center", background: `conic-gradient(${colorIdx(c.index)} ${(c.index ?? 0) * 3.6}deg, var(--sc-surface-2,#eef2f6) 0)` }}>
                    <div style={{ width: 34, height: 34, borderRadius: "50%", background: "var(--sc-content,#fff)", display: "grid", placeItems: "center", fontSize: 13, fontWeight: 800, color: colorIdx(c.index) }}>{c.index ?? "—"}</div>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.nombre}</div>
                    <div style={{ fontSize: 12, color: "var(--sc-text-soft)" }}>ver reporte →</div>
                  </div>
                </Link>
              ))}
            </div>
          )}
          <p className="dash-sub" style={{ fontSize: 12, marginTop: 14 }}>
            Las metas y sus pesos se configuran en <Link href="/sla">Metas de SLA</Link>. El detalle imprimible por cliente está en <Link href="/reporte-sla">Reporte mensual</Link>.
          </p>
        </>
      )}
    </main>
  );
}
