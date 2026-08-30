"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import VinculosPanel from "@/app/components/VinculosPanel";

const AZUL = "#1F3A5F";
const EST_COLOR: Record<string, string> = {
  PROGRAMADO: "#607d8b", EN_PREPARACION: "#b8860b", EN_TRANSITO: "#1e73be", DETENIDO: "#e23b53",
  EN_PATIO: "#7a3fbf", FINALIZADO: "#0a7c2f", CANCELADO: "#8a1220",
};
const fFecha = (s: any) => (s ? new Date(s).toLocaleString() : "—");
const nom = (p: any) => (p?.persona ? `${p.persona.nombre ?? ""} ${p.persona.apellido_paterno ?? ""}`.trim() : "—");

export default function MovimientoDetallePage() {
  const params = useParams<{ id: string }>();
  const [mov, setMov] = useState<any>(null);
  const [unidades, setUnidades] = useState<any[]>([]);
  const [inspecciones, setInspecciones] = useState<any[]>([]);
  const [validaciones, setValidaciones] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Alta de unidad
  const [opcUC, setOpcUC] = useState<any[]>([]);
  const [opcCarga, setOpcCarga] = useState<any[]>([]);
  const [opcSello, setOpcSello] = useState<any[]>([]);
  const [ucSel, setUcSel] = useState(""); const [cargaSel, setCargaSel] = useState(""); const [selloSel, setSelloSel] = useState("");
  const [addMsg, setAddMsg] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const { data: m, error: e } = await supabase.from("movimientos")
      .select("*, origen:sitios!sitio_origen_id(nombre), destino:sitios!sitio_destino_id(nombre), activo:transporte_activos(identificador, placas, tipo_activo)")
      .eq("id", params.id).maybeSingle();
    if (e) { setError(e.message); return; }
    setMov(m);
    const { data: u } = await supabase.from("movimiento_unidades")
      .select("id, secuencia, nivel_seguridad, estatus, unidad:unidades_carga(folio, identificador, tipo_unidad), carga:cargas(folio, descripcion, nivel_riesgo), sello_id")
      .eq("movimiento_id", params.id).eq("estatus", "activo").order("secuencia");
    setUnidades((u as any[]) ?? []);
    const { data: ins } = await supabase.from("inspecciones")
      .select("id, folio, tipo_inspeccion, resultado, creado_en, realizada:personal(numero_placa, persona:personas(nombre, apellido_paterno))")
      .eq("movimiento_id", params.id).eq("estatus", "activo").order("creado_en", { ascending: false });
    setInspecciones((ins as any[]) ?? []);
    const { data: val } = await supabase.from("sello_validaciones")
      .select("id, resultado, creado_en, notas, sello:sellos(codigo_sello)")
      .eq("movimiento_id", params.id).order("creado_en", { ascending: false });
    setValidaciones((val as any[]) ?? []);
  }, [params.id]);

  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => {
    supabase.from("unidades_carga").select("id, folio, identificador, tipo_unidad").eq("estatus", "activo").order("creado_en", { ascending: false }).then(({ data }) => setOpcUC((data as any[]) ?? []));
    supabase.from("cargas").select("id, folio, descripcion, nivel_riesgo").eq("estatus", "activo").order("creado_en", { ascending: false }).then(({ data }) => setOpcCarga((data as any[]) ?? []));
    supabase.from("sellos").select("id, codigo_sello, estado").eq("estatus", "activo").in("estado", ["DISPONIBLE", "ASIGNADO", "VALIDADO"]).order("creado_en", { ascending: false }).then(({ data }) => setOpcSello((data as any[]) ?? []));
  }, []);

  async function agregarUnidad() {
    if (!ucSel) { setAddMsg("Elige una unidad de carga."); return; }
    const { error: e } = await supabase.from("movimiento_unidades").insert({
      movimiento_id: params.id, unidad_carga_id: ucSel, carga_id: cargaSel || null, sello_id: selloSel || null, secuencia: unidades.length + 1,
    });
    if (e) { setAddMsg(e.message); return; }
    setAddMsg(null); setUcSel(""); setCargaSel(""); setSelloSel(""); cargar();
  }

  if (error) return <main className="contenedor"><p style={{ color: "#b00020" }}>{error}</p></main>;
  if (!mov) return <main className="contenedor"><p>Cargando…</p></main>;

  const card: React.CSSProperties = { background: "var(--sc-content)", border: "1px solid var(--sc-card-line)", borderRadius: 12, padding: 16, marginBottom: 16 };
  const h3: React.CSSProperties = { margin: "0 0 10px", fontSize: 14, color: AZUL };
  const th: React.CSSProperties = { textAlign: "left", padding: "6px 8px", fontSize: 12, color: "var(--sc-text-soft)", borderBottom: "1px solid var(--sc-card-line)" };
  const td: React.CSSProperties = { padding: "6px 8px", fontSize: 13, borderBottom: "1px solid var(--sc-card-line)" };

  return (
    <main className="contenedor" style={{ padding: 18 }}>
      <div style={{ marginBottom: 10 }}><Link href="/logistica/movimientos" style={{ color: "var(--sc-btn,#f4a03f)", fontWeight: 700, textDecoration: "none" }}>← Movimientos</Link></div>

      {/* Cabecera */}
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <b style={{ fontSize: 20 }}>{mov.folio ?? "Movimiento"}</b>
          <span style={{ background: EST_COLOR[mov.estado] ?? "#607d8b", color: "#fff", borderRadius: 999, padding: "3px 11px", fontSize: 12, fontWeight: 800 }}>{mov.estado}</span>
          <span style={{ color: "var(--sc-text-soft)" }}>{mov.tipo_movimiento}{mov.nivel_riesgo ? ` · Riesgo: ${mov.nivel_riesgo}` : ""}</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 24px", marginTop: 12, fontSize: 13 }}>
          <div><b>Origen:</b> {mov.origen?.nombre ?? "—"}</div>
          <div><b>Destino:</b> {mov.destino?.nombre ?? "—"}</div>
          <div><b>Activo:</b> {mov.activo ? [mov.activo.identificador, mov.activo.placas].filter(Boolean).join(" ") : "—"}</div>
          <div><b>Referencia:</b> {mov.referencia_externa ?? "—"}</div>
          <div><b>Programado:</b> {fFecha(mov.programado_inicio)} → {fFecha(mov.programado_fin)}</div>
          <div><b>Real:</b> {fFecha(mov.real_inicio)} → {fFecha(mov.real_fin)}</div>
        </div>
      </div>

      {/* Unidades de carga */}
      <div style={card}>
        <h3 style={h3}>📦 Unidades de carga ({unidades.length})</h3>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>{["#", "Unidad", "Tipo", "Carga", "Riesgo", "Sello"].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>
              {unidades.map((u, i) => (
                <tr key={u.id}>
                  <td style={td}>{u.secuencia ?? i + 1}</td>
                  <td style={td}>{u.unidad?.identificador ?? u.unidad?.folio ?? "—"}</td>
                  <td style={td}>{u.unidad?.tipo_unidad ?? "—"}</td>
                  <td style={td}>{u.carga?.descripcion ?? u.carga?.folio ?? "—"}</td>
                  <td style={td}>{u.carga?.nivel_riesgo ?? "—"}</td>
                  <td style={td}>{u.sello_id ? "🔒" : "—"}</td>
                </tr>
              ))}
              {unidades.length === 0 && <tr><td colSpan={6} style={{ ...td, textAlign: "center", color: "var(--sc-text-faint)" }}>Sin unidades ligadas.</td></tr>}
            </tbody>
          </table>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12, alignItems: "center" }}>
          <select value={ucSel} onChange={(e) => setUcSel(e.target.value)}><option value="">— Unidad de carga —</option>{opcUC.map((x) => <option key={x.id} value={x.id}>{[x.identificador, x.tipo_unidad].filter(Boolean).join(" · ")}</option>)}</select>
          <select value={cargaSel} onChange={(e) => setCargaSel(e.target.value)}><option value="">— Carga (opcional) —</option>{opcCarga.map((x) => <option key={x.id} value={x.id}>{[x.descripcion, x.nivel_riesgo].filter(Boolean).join(" · ") || x.folio}</option>)}</select>
          <select value={selloSel} onChange={(e) => setSelloSel(e.target.value)}><option value="">— Sello (opcional) —</option>{opcSello.map((x) => <option key={x.id} value={x.id}>{x.codigo_sello}</option>)}</select>
          <button className="sc-btn" onClick={agregarUnidad}>Agregar unidad</button>
          {addMsg && <span style={{ color: "#e23b53", fontSize: 12.5 }}>{addMsg}</span>}
        </div>
      </div>

      {/* Inspecciones */}
      <div style={card}>
        <h3 style={h3}>🔎 Inspecciones ({inspecciones.length})</h3>
        {inspecciones.length === 0 ? <p style={{ color: "var(--sc-text-soft)", fontSize: 13 }}>Sin inspecciones registradas.</p> : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>{["Folio", "Tipo", "Realizó", "Resultado", "Fecha"].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
              <tbody>{inspecciones.map((x) => (
                <tr key={x.id}><td style={td}>{x.folio ?? "—"}</td><td style={td}>{x.tipo_inspeccion ?? "—"}</td><td style={td}>{nom(x.realizada)}</td><td style={td}>{x.resultado ?? "—"}</td><td style={td}>{fFecha(x.creado_en)}</td></tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>

      {/* Validaciones de sello */}
      <div style={card}>
        <h3 style={h3}>🔒 Validaciones de sello ({validaciones.length})</h3>
        {validaciones.length === 0 ? <p style={{ color: "var(--sc-text-soft)", fontSize: 13 }}>Sin validaciones.</p> : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>{["Sello", "Resultado", "Notas", "Fecha"].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
              <tbody>{validaciones.map((x) => (
                <tr key={x.id}><td style={td}>{x.sello?.codigo_sello ?? "—"}</td><td style={td}><b style={{ color: x.resultado === "VALIDO" ? "#0a7c2f" : "#b00020" }}>{x.resultado}</b></td><td style={td}>{x.notas ?? "—"}</td><td style={td}>{fFecha(x.creado_en)}</td></tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>

      {/* Vínculos (incidentes, evidencias, etc.) */}
      <div style={card}>
        <h3 style={h3}>🔗 Vínculos</h3>
        <VinculosPanel entidadTipo="movimiento" entidadId={params.id} />
      </div>
    </main>
  );
}
