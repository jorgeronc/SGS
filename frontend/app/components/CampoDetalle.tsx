"use client";

// Campos editables reutilizables para las páginas de detalle de logística.
export function Campo({ l, v, ed, onCh }: { l: string; v: any; ed: boolean; onCh: (v: string) => void }) {
  return <div><b>{l}:</b> {ed ? <input value={v ?? ""} onChange={(e) => onCh(e.target.value)} style={{ width: "100%" }} /> : (v ?? "—")}</div>;
}

export function CampoSel({ l, v, ed, ops, onCh }: { l: string; v: any; ed: boolean; ops: string[]; onCh: (v: string) => void }) {
  return <div><b>{l}:</b> {ed ? <select value={v ?? ""} onChange={(e) => onCh(e.target.value)}><option value="">—</option>{ops.map((o) => <option key={o} value={o}>{o}</option>)}</select> : (v ?? "—")}</div>;
}

export const cardStyle: React.CSSProperties = { background: "var(--sc-content)", border: "1px solid var(--sc-card-line)", borderRadius: 12, padding: 16, marginBottom: 16 };
export const thStyle: React.CSSProperties = { textAlign: "left", padding: "6px 8px", fontSize: 12, color: "var(--sc-text-soft)", borderBottom: "1px solid var(--sc-card-line)" };
export const tdStyle: React.CSSProperties = { padding: "6px 8px", fontSize: 13, borderBottom: "1px solid var(--sc-card-line)" };
export const fFechaU = (s: any) => (s ? new Date(s).toLocaleString() : "—");
