"use client";

import type { ReporteSla } from "@/lib/sla";

// Vista del reporte de cumplimiento SLA / Índice de Seguridad. La usan la página
// interactiva (/reporte-sla) y la versión imprimible (/reporte-sla/imprimir).

function fmtDur(min: number | null): string {
  if (min == null) return "—";
  const m = Math.floor(min); const s = Math.round((min - m) * 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")} min`;
}
const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v)}%`);
const idxColor = (v: number | null) => (v == null ? "#607d8b" : v >= 90 ? "#2e7d32" : v >= 75 ? "#f9a825" : "#d32f2f");

function Barra({ label, valor, meta, texto, ok }: { label: string; valor: number | null; meta?: string; texto: string; ok: boolean | null }) {
  const w = valor == null ? 0 : Math.max(0, Math.min(100, valor));
  const color = ok == null ? "#607d8b" : ok ? "#2e7d32" : "#d32f2f";
  return (
    <div style={{ margin: "8px 0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 3 }}>
        <span><b>{label}</b>{meta ? <span style={{ color: "#888" }}> · meta {meta}</span> : null}</span>
        <span style={{ color, fontWeight: 700 }}>{texto} {ok == null ? "" : ok ? "✓" : "✗"}</span>
      </div>
      <div style={{ height: 10, background: "#e6eaef", borderRadius: 6, overflow: "hidden" }}>
        <div style={{ width: `${w}%`, height: "100%", background: color }} />
      </div>
    </div>
  );
}

export default function ReporteSlaVista({ r, cliente, periodo }: { r: ReporteSla; cliente: string; periodo: string }) {
  const m = r.metas;
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 14, borderBottom: "2px solid #1F3A5F", paddingBottom: 10 }}>
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

      <div style={{ marginTop: 14 }}>
        <Barra label="Cobertura / asistencia GPS" valor={r.coberturaPct} meta={`≥ ${m.cobertura_pct}%`} texto={`${pct(r.coberturaPct)} (${r.cubiertos}/${r.programados})`} ok={r.cumple.cobertura} />
        <Barra label="Rondines en rango" valor={r.rondinesPct} meta={`≥ ${m.rondines_pct}%`} texto={`${pct(r.rondinesPct)} (${r.rondinesDentro}/${r.rondinesTotal})`} ok={r.cumple.rondines} />
        <Barra label="Tiempo de respuesta" valor={r.tiempoRespMin == null ? null : Math.max(0, 100 - (r.tiempoRespMin / (m.tiempo_resp_min * 2)) * 100)} meta={`≤ ${m.tiempo_resp_min} min`} texto={fmtDur(r.tiempoRespMin)} ok={r.cumple.resp} />
        <Barra label="Incidentes críticos" valor={r.incCriticos === 0 ? 100 : Math.max(0, 100 - r.incCriticos * 20)} meta={`≤ ${m.incidentes_criticos_max}`} texto={`${r.incCriticos} críticos`} ok={r.cumple.incidentes} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginTop: 16 }}>
        <Caja t="Incidentes" v={`${r.incTotal}`} s={`🔴 ${r.sev.alta} · 🟠 ${r.sev.media} · 🟢 ${r.sev.baja}`} />
        <Caja t="Tiempo prom. respuesta" v={fmtDur(r.tiempoRespMin)} s="recepción → cierre" />
        <Caja t="Sitios evaluados" v={`${r.sitios}`} s="del cliente" />
        {r.horasContratadas != null && <Caja t="Horas contratadas / cubiertas" v={`${r.horasContratadas} h`} s={`≈ ${r.horasCubiertas ?? "—"} h cubiertas (est.)`} />}
      </div>
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
