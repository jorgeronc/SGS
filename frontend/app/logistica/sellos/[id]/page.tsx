"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Campo, CampoSel, cardStyle, thStyle, tdStyle, fFechaU } from "@/app/components/CampoDetalle";

const AZUL = "#1F3A5F";
const ESTADOS = ["DISPONIBLE", "ASIGNADO", "VALIDADO", "ALTERADO", "REEMPLAZADO", "RETIRADO", "PERDIDO"];

export default function SelloDetallePage() {
  const params = useParams<{ id: string }>();
  const [r, setR] = useState<any>(null);
  const [vals, setVals] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ed, setEd] = useState<any>(null); const [msg, setMsg] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const { data, error: e } = await supabase.from("sellos")
      .select("*, unidad:unidades_carga(id, identificador, folio)").eq("id", params.id).maybeSingle();
    if (e) { setError(e.message); return; }
    setR(data); setEd(null);
    supabase.from("sello_validaciones").select("id, resultado, notas, creado_en, movimiento:movimientos(folio), realizada:personal(numero_placa)").eq("sello_id", params.id).order("creado_en", { ascending: false }).then(({ data }) => setVals((data as any[]) ?? []));
  }, [params.id]);
  useEffect(() => { cargar(); }, [cargar]);

  async function guardar() {
    setMsg(null);
    const { error } = await supabase.from("sellos").update({
      codigo_sello: (ed.codigo_sello || "").toUpperCase() || null, tipo_sello: ed.tipo_sello || null,
      estado: ed.estado || null, actualizado_en: new Date().toISOString(),
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
      <div style={{ marginBottom: 10 }}><Link href="/logistica/sellos" style={{ color: "var(--sc-btn,#f4a03f)", fontWeight: 700, textDecoration: "none" }}>← Sellos</Link></div>

      <div style={cardStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <b style={{ fontSize: 20 }}>{r.codigo_sello ?? r.folio ?? "Sello"}</b>
          <span style={{ background: r.estado === "ALTERADO" ? "#b00020" : "#607d8b", color: "#fff", borderRadius: 999, padding: "3px 11px", fontSize: 12, fontWeight: 800 }}>{r.estado}</span>
          <button className="sc-btn" style={{ marginLeft: "auto" }} onClick={() => (ed ? guardar() : setEd({ ...r }))}>{ed ? "Guardar" : "Editar"}</button>
          {ed && <button className="secundario" onClick={() => setEd(null)}>Cancelar</button>}
        </div>
        {msg && <p style={{ color: "#e23b53", fontSize: 12.5 }}>{msg}</p>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginTop: 12, fontSize: 13 }}>
          <Campo l="Código" v={e.codigo_sello} ed={!!ed} onCh={(v) => setEd({ ...ed, codigo_sello: v })} />
          <Campo l="Tipo" v={e.tipo_sello} ed={!!ed} onCh={(v) => setEd({ ...ed, tipo_sello: v })} />
          <CampoSel l="Estado" v={e.estado} ed={!!ed} ops={ESTADOS} onCh={(v) => setEd({ ...ed, estado: v })} />
          <div><b>Unidad asignada:</b> {r.unidad ? (r.unidad.identificador ?? r.unidad.folio) : "—"}</div>
          <div><b>Folio:</b> {r.folio ?? "—"}</div>
        </div>
      </div>

      <div style={cardStyle}>
        <h3 style={h3}>🔒 Validaciones ({vals.length})</h3>
        {vals.length === 0 ? <p style={{ color: "var(--sc-text-soft)", fontSize: 13 }}>Sin validaciones registradas.</p> : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>{["Resultado", "Movimiento", "Notas", "Fecha"].map((h) => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
            <tbody>{vals.map((x) => (
              <tr key={x.id}><td style={tdStyle}><b style={{ color: x.resultado === "VALIDO" ? "#0a7c2f" : "#b00020" }}>{x.resultado}</b></td><td style={tdStyle}>{x.movimiento?.folio ?? "—"}</td><td style={tdStyle}>{x.notas ?? "—"}</td><td style={tdStyle}>{fFechaU(x.creado_en)}</td></tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </main>
  );
}
