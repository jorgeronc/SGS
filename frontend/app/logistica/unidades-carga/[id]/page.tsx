"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Campo, cardStyle, thStyle, tdStyle, fFechaU } from "@/app/components/CampoDetalle";

const AZUL = "#1F3A5F";

export default function UnidadCargaDetallePage() {
  const params = useParams<{ id: string }>();
  const [r, setR] = useState<any>(null);
  const [movs, setMovs] = useState<any[]>([]);
  const [insp, setInsp] = useState<any[]>([]);
  const [sellos, setSellos] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ed, setEd] = useState<any>(null); const [msg, setMsg] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const { data, error: e } = await supabase.from("unidades_carga")
      .select("*, empresa:transportistas(razon_social)").eq("id", params.id).maybeSingle();
    if (e) { setError(e.message); return; }
    setR(data); setEd(null);
    supabase.from("movimiento_unidades").select("movimiento:movimientos(id, folio, estado, tipo_movimiento, creado_en)").eq("unidad_carga_id", params.id).eq("estatus", "activo").then(({ data }) => setMovs(((data as any[]) ?? []).map((x) => x.movimiento).filter(Boolean)));
    supabase.from("inspecciones").select("id, folio, tipo_inspeccion, resultado, creado_en").eq("unidad_carga_id", params.id).eq("estatus", "activo").order("creado_en", { ascending: false }).then(({ data }) => setInsp((data as any[]) ?? []));
    supabase.from("sellos").select("id, folio, codigo_sello, estado").eq("unidad_carga_asignada_id", params.id).eq("estatus", "activo").then(({ data }) => setSellos((data as any[]) ?? []));
  }, [params.id]);
  useEffect(() => { cargar(); }, [cargar]);

  async function guardar() {
    setMsg(null);
    const { error } = await supabase.from("unidades_carga").update({
      tipo_unidad: ed.tipo_unidad || null, identificador: ed.identificador || null,
      estado_unidad: ed.estado_unidad || null, actualizado_en: new Date().toISOString(),
    }).eq("id", params.id);
    if (error) { setMsg(error.message); return; }
    cargar();
  }

  if (error) return <main className="contenedor"><p style={{ color: "#b00020" }}>{error}</p></main>;
  if (!r) return <main className="contenedor"><p>Cargando…</p></main>;
  const e = ed ?? r;
  const h3: React.CSSProperties = { margin: "0 0 10px", fontSize: 14, color: AZUL };

  return (
    <main className="contenedor" style={{ padding: 18 }}>
      <div style={{ marginBottom: 10 }}><Link href="/logistica/unidades-carga" style={{ color: "var(--sc-btn,#f4a03f)", fontWeight: 700, textDecoration: "none" }}>← Unidades de carga</Link></div>

      <div style={cardStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <b style={{ fontSize: 20 }}>{r.folio ?? "Unidad"}</b>
          <span style={{ color: "var(--sc-text-soft)" }}>{r.identificador ?? r.tipo_unidad ?? "—"}</span>
          <button className="sc-btn" style={{ marginLeft: "auto" }} onClick={() => (ed ? guardar() : setEd({ ...r }))}>{ed ? "Guardar" : "Editar"}</button>
          {ed && <button className="secundario" onClick={() => setEd(null)}>Cancelar</button>}
        </div>
        {msg && <p style={{ color: "#e23b53", fontSize: 12.5 }}>{msg}</p>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginTop: 12, fontSize: 13 }}>
          <Campo l="Tipo de unidad" v={e.tipo_unidad} ed={!!ed} onCh={(v) => setEd({ ...ed, tipo_unidad: v })} />
          <Campo l="Identificador" v={e.identificador} ed={!!ed} onCh={(v) => setEd({ ...ed, identificador: v })} />
          <Campo l="Estado" v={e.estado_unidad} ed={!!ed} onCh={(v) => setEd({ ...ed, estado_unidad: v })} />
          <div><b>Empresa:</b> {r.empresa?.razon_social ?? "—"}</div>
        </div>
      </div>

      <div style={cardStyle}>
        <h3 style={h3}>🚚 Movimientos ({movs.length})</h3>
        {movs.length === 0 ? <p style={{ color: "var(--sc-text-soft)", fontSize: 13 }}>Sin movimientos.</p> : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>{["Folio", "Tipo", "Estado", "Fecha"].map((h) => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
            <tbody>{movs.map((m) => <tr key={m.id}><td style={tdStyle}><Link href={`/logistica/movimientos/${m.id}`}>{m.folio ?? "—"}</Link></td><td style={tdStyle}>{m.tipo_movimiento}</td><td style={tdStyle}>{m.estado}</td><td style={tdStyle}>{fFechaU(m.creado_en)}</td></tr>)}</tbody>
          </table>
        )}
      </div>

      <div style={cardStyle}>
        <h3 style={h3}>🔒 Sellos asignados ({sellos.length})</h3>
        {sellos.length === 0 ? <p style={{ color: "var(--sc-text-soft)", fontSize: 13 }}>Sin sellos.</p> : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>{["Folio", "Código", "Estado"].map((h) => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
            <tbody>{sellos.map((s) => <tr key={s.id}><td style={tdStyle}>{s.folio ?? "—"}</td><td style={tdStyle}>{s.codigo_sello}</td><td style={tdStyle}>{s.estado}</td></tr>)}</tbody>
          </table>
        )}
      </div>

      <div style={cardStyle}>
        <h3 style={h3}>🔎 Inspecciones ({insp.length})</h3>
        {insp.length === 0 ? <p style={{ color: "var(--sc-text-soft)", fontSize: 13 }}>Sin inspecciones.</p> : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>{["Folio", "Tipo", "Resultado", "Fecha"].map((h) => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
            <tbody>{insp.map((x) => <tr key={x.id}><td style={tdStyle}>{x.folio ?? "—"}</td><td style={tdStyle}>{x.tipo_inspeccion ?? "—"}</td><td style={tdStyle}>{x.resultado ?? "—"}</td><td style={tdStyle}>{fFechaU(x.creado_en)}</td></tr>)}</tbody>
          </table>
        )}
      </div>
    </main>
  );
}
