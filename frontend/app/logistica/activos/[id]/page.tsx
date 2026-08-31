"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

const AZUL = "#1F3A5F";
const ESTADOS = ["operativo", "inactivo", "mantenimiento"];
const fFecha = (s: any) => (s ? new Date(s).toLocaleString() : "—");

export default function ActivoDetallePage() {
  const params = useParams<{ id: string }>();
  const [r, setR] = useState<any>(null);
  const [movs, setMovs] = useState<any[]>([]);
  const [insp, setInsp] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ed, setEd] = useState<any>(null); const [msg, setMsg] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const { data, error: e } = await supabase.from("transporte_activos")
      .select("*, empresa:transportistas(razon_social)").eq("id", params.id).maybeSingle();
    if (e) { setError(e.message); return; }
    setR(data); setEd(null);
    supabase.from("movimientos").select("id, folio, estado, tipo_movimiento, creado_en").eq("transporte_activo_id", params.id).eq("estatus", "activo").order("creado_en", { ascending: false }).then(({ data }) => setMovs((data as any[]) ?? []));
    supabase.from("inspecciones").select("id, folio, tipo_inspeccion, resultado, creado_en").eq("transporte_activo_id", params.id).eq("estatus", "activo").order("creado_en", { ascending: false }).then(({ data }) => setInsp((data as any[]) ?? []));
  }, [params.id]);
  useEffect(() => { cargar(); }, [cargar]);

  async function guardar() {
    setMsg(null);
    const { error } = await supabase.from("transporte_activos").update({
      tipo_activo: ed.tipo_activo || null, identificador: ed.identificador || null,
      placas: (ed.placas || "").toUpperCase() || null, economico: ed.economico || null,
      estado_activo: ed.estado_activo || null, gps_device_id: ed.gps_device_id || null,
      actualizado_en: new Date().toISOString(),
    }).eq("id", params.id);
    if (error) { setMsg(error.message); return; }
    cargar();
  }

  if (error) return <main className="contenedor"><p style={{ color: "#b00020" }}>{error}</p></main>;
  if (!r) return <main className="contenedor"><p>Cargando…</p></main>;

  const card: React.CSSProperties = { background: "var(--sc-content)", border: "1px solid var(--sc-card-line)", borderRadius: 12, padding: 16, marginBottom: 16 };
  const h3: React.CSSProperties = { margin: "0 0 10px", fontSize: 14, color: AZUL };
  const th: React.CSSProperties = { textAlign: "left", padding: "6px 8px", fontSize: 12, color: "var(--sc-text-soft)", borderBottom: "1px solid var(--sc-card-line)" };
  const td: React.CSSProperties = { padding: "6px 8px", fontSize: 13, borderBottom: "1px solid var(--sc-card-line)" };
  const e = ed ?? r;

  return (
    <main className="contenedor" style={{ padding: 18 }}>
      <div style={{ marginBottom: 10 }}><Link href="/logistica/activos" style={{ color: "var(--sc-btn,#f4a03f)", fontWeight: 700, textDecoration: "none" }}>← Activos de transporte</Link></div>

      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <b style={{ fontSize: 20 }}>{r.folio ?? "Activo"}</b>
          <span style={{ color: "var(--sc-text-soft)" }}>{r.tipo_activo ?? "—"}</span>
          <button className="sc-btn" style={{ marginLeft: "auto" }} onClick={() => (ed ? guardar() : setEd({ ...r }))}>{ed ? "Guardar" : "Editar"}</button>
          {ed && <button className="secundario" onClick={() => setEd(null)}>Cancelar</button>}
        </div>
        {msg && <p style={{ color: "#e23b53", fontSize: 12.5 }}>{msg}</p>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginTop: 12, fontSize: 13 }}>
          <Campo l="Tipo" v={e.tipo_activo} ed={!!ed} onCh={(v) => setEd({ ...ed, tipo_activo: v })} />
          <Campo l="Identificador" v={e.identificador} ed={!!ed} onCh={(v) => setEd({ ...ed, identificador: v })} />
          <Campo l="Placas" v={e.placas} ed={!!ed} onCh={(v) => setEd({ ...ed, placas: v })} />
          <Campo l="Económico" v={e.economico} ed={!!ed} onCh={(v) => setEd({ ...ed, economico: v })} />
          <CampoSel l="Estado" v={e.estado_activo} ed={!!ed} ops={ESTADOS} onCh={(v) => setEd({ ...ed, estado_activo: v })} />
          <Campo l="GPS device id" v={e.gps_device_id} ed={!!ed} onCh={(v) => setEd({ ...ed, gps_device_id: v })} />
          <div><b>Empresa:</b> {r.empresa?.razon_social ?? "—"}</div>
        </div>
      </div>

      <div style={card}>
        <h3 style={h3}>🚚 Movimientos con este activo ({movs.length})</h3>
        {movs.length === 0 ? <p style={{ color: "var(--sc-text-soft)", fontSize: 13 }}>Sin movimientos.</p> : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>{["Folio", "Tipo", "Estado", "Fecha"].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>{movs.map((m) => <tr key={m.id}><td style={td}><Link href={`/logistica/movimientos/${m.id}`}>{m.folio ?? "—"}</Link></td><td style={td}>{m.tipo_movimiento}</td><td style={td}>{m.estado}</td><td style={td}>{fFecha(m.creado_en)}</td></tr>)}</tbody>
          </table>
        )}
      </div>

      <div style={card}>
        <h3 style={h3}>🔎 Inspecciones ({insp.length})</h3>
        {insp.length === 0 ? <p style={{ color: "var(--sc-text-soft)", fontSize: 13 }}>Sin inspecciones.</p> : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>{["Folio", "Tipo", "Resultado", "Fecha"].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>{insp.map((x) => <tr key={x.id}><td style={td}>{x.folio ?? "—"}</td><td style={td}>{x.tipo_inspeccion ?? "—"}</td><td style={td}>{x.resultado ?? "—"}</td><td style={td}>{fFecha(x.creado_en)}</td></tr>)}</tbody>
          </table>
        )}
      </div>
    </main>
  );
}

function Campo({ l, v, ed, onCh }: { l: string; v: any; ed: boolean; onCh: (v: string) => void }) {
  return <div><b>{l}:</b> {ed ? <input value={v ?? ""} onChange={(e) => onCh(e.target.value)} style={{ width: "100%" }} /> : (v ?? "—")}</div>;
}
function CampoSel({ l, v, ed, ops, onCh }: { l: string; v: any; ed: boolean; ops: string[]; onCh: (v: string) => void }) {
  return <div><b>{l}:</b> {ed ? <select value={v ?? ""} onChange={(e) => onCh(e.target.value)}><option value="">—</option>{ops.map((o) => <option key={o} value={o}>{o}</option>)}</select> : (v ?? "—")}</div>;
}
