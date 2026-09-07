"use client";

import type { SlaResultado, MetricaSla } from "@/lib/sla";
import { puntajeMetrica } from "@/lib/sla";

// Vista del reporte de cumplimiento SLA / Índice de Seguridad. La usan la página
// interactiva (/reporte-sla) y la versión imprimible (/reporte-sla/imprimir).
// Renderiza SOLO las metas que el cliente tiene activas (catálogo por cliente).

const idxColor = (v: number | null) => (v == null ? "#607d8b" : v >= 90 ? "#2e7d32" : v >= 75 ? "#f9a825" : "#d32f2f");

function fmtValor(m: MetricaSla): string {
  if (m.valor == null) return "—";
  const u = m.unidad === "%" ? "%" : m.unidad === "min" ? " min" : m.unidad === "h" ? " h" : "";
  const base = `${m.valor}${u}`;
  return m.detalle ? `${base} (${m.detalle})` : base;
}
function fmtMeta(m: MetricaSla): string {
  const u = m.unidad === "%" ? "%" : m.unidad === "min" ? " min" : m.unidad === "h" ? " h" : "";
  return `${m.dir} ${m.meta}${u}`;
}

function Barra({ m }: { m: MetricaSla }) {
  const w = puntajeMetrica(m);
  const color = m.cumple == null ? "#607d8b" : m.cumple ? "#2e7d32" : "#d32f2f";
  return (
    <div style={{ margin: "8px 0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 3, gap: 10 }}>
        <span><b>{m.nombre}</b><span style={{ color: "#888" }}> · meta {fmtMeta(m)}</span></span>
        <span style={{ color, fontWeight: 700, whiteSpace: "nowrap" }}>{fmtValor(m)} {m.cumple == null ? "" : m.cumple ? "✓" : "✗"}</span>
      </div>
      <div style={{ height: 10, background: "#e6eaef", borderRadius: 6, overflow: "hidden" }}>
        <div style={{ width: `${w}%`, height: "100%", background: color }} />
      </div>
    </div>
  );
}

export default function ReporteSlaVista({ r, cliente, periodo }: { r: SlaResultado; cliente: string; periodo: string }) {
  const activas = r.metricas.filter((m) => m.activa);
  const conDato = activas.filter((m) => m.valor != null);
  const cumplidas = conDato.filter((m) => m.cumple === true).length;
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 14, borderBottom: "2px solid #1F3A5F", paddingBottom: 10 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/escudo.png" alt="" style={{ width: 48, height: 48 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 18, color: "#1F3A5F" }}>Reporte de Cumplimiento de Seguridad</div>
          <div style={{ fontSize: 13, color: "#555" }}>{cliente} · {periodo}</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 34, fontWeight: 900, color: idxColor(r.index), lineHeight: 1 }}>{r.index ?? "—"}</div>
          <div style={{ fontSize: 11, color: "#888" }}>ÍNDICE / 100</div>
        </div>
      </div>

      {activas.length === 0 ? (
        <p style={{ color: "#666", marginTop: 14 }}>Este cliente no tiene metas de SLA seleccionadas. Configúralas en <b>Metas de SLA</b>.</p>
      ) : (
        <>
          <div style={{ marginTop: 14 }}>
            {activas.map((m) => <Barra key={m.clave} m={m} />)}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginTop: 16 }}>
            <Caja t="Metas cumplidas" v={`${cumplidas}/${conDato.length}`} s="de las que aplican con dato" />
            <Caja t="Metas seleccionadas" v={`${activas.length}`} s="para este cliente" />
            <Caja t="Sitios evaluados" v={`${r.sitios}`} s="del cliente" />
          </div>
        </>
      )}
    </div>
  );
}

function Caja({ t, v, s }: { t: string; v: string; s: string }) {
  return (
    <div style={{ border: "1px solid var(--sc-card-line, #e2e6ec)", borderRadius: 8, padding: 10 }}>
      <div style={{ fontSize: 12, color: "#888" }}>{t}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: "#1F3A5F" }}>{v}</div>
      <div style={{ fontSize: 11.5, color: "#666" }}>{s}</div>
    </div>
  );
}
