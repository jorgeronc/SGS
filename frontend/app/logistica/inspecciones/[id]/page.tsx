"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { cardStyle, thStyle, tdStyle, fFechaU } from "@/app/components/CampoDetalle";

const AZUL = "#1F3A5F";
const RES_COLOR: Record<string, string> = { OK: "#0a7c2f", NO_OK: "#b00020", NO_APLICA: "#607d8b", PENDIENTE: "#b8860b" };
const nom = (p: any) => (p?.persona ? `${p.persona.nombre ?? ""} ${p.persona.apellido_paterno ?? ""}`.trim() : "—");

export default function InspeccionDetallePage() {
  const params = useParams<{ id: string }>();
  const [r, setR] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const { data, error: e } = await supabase.from("inspecciones")
      .select("*, movimiento:movimientos(id, folio), sitio:sitios(nombre), unidad:unidades_carga(identificador, folio), activo:transporte_activos(identificador, placas), realizada:personal(numero_placa, persona:personas(nombre, apellido_paterno))")
      .eq("id", params.id).maybeSingle();
    if (e) { setError(e.message); return; }
    setR(data);
    supabase.from("inspeccion_items").select("id, codigo_item, descripcion, resultado, requerido, notas").eq("inspeccion_id", params.id).order("creado_en").then(({ data }) => setItems((data as any[]) ?? []));
  }, [params.id]);
  useEffect(() => { cargar(); }, [cargar]);

  if (error) return <main className="contenedor"><p style={{ color: "#b00020" }}>{error}</p></main>;
  if (!r) return <main className="contenedor"><p>Cargando…</p></main>;
  const h3: React.CSSProperties = { margin: "0 0 10px", fontSize: 14, color: AZUL };

  return (
    <main className="contenedor" style={{ padding: 18 }}>
      <div style={{ marginBottom: 10 }}><Link href="/logistica/inspecciones" style={{ color: "var(--sc-btn,#f4a03f)", fontWeight: 700, textDecoration: "none" }}>← Inspecciones</Link></div>

      <div style={cardStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <b style={{ fontSize: 20 }}>{r.folio ?? "Inspección"}</b>
          <span style={{ color: "var(--sc-text-soft)" }}>{r.tipo_inspeccion ?? "—"}</span>
          {r.resultado && <span style={{ background: /rechaz/i.test(r.resultado) ? "#b00020" : /novedad/i.test(r.resultado) ? "#b8860b" : "#0a7c2f", color: "#fff", borderRadius: 999, padding: "3px 11px", fontSize: 12, fontWeight: 800 }}>{r.resultado}</span>}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginTop: 12, fontSize: 13 }}>
          <div><b>Movimiento:</b> {r.movimiento ? <Link href={`/logistica/movimientos/${r.movimiento.id}`}>{r.movimiento.folio}</Link> : "—"}</div>
          <div><b>Sitio:</b> {r.sitio?.nombre ?? "—"}</div>
          <div><b>Unidad:</b> {r.unidad ? (r.unidad.identificador ?? r.unidad.folio) : "—"}</div>
          <div><b>Activo:</b> {r.activo ? [r.activo.identificador, r.activo.placas].filter(Boolean).join(" ") : "—"}</div>
          <div><b>Realizó:</b> {nom(r.realizada)}</div>
          <div><b>Fecha:</b> {fFechaU(r.creado_en)}</div>
          <div><b>GPS:</b> {r.latitud != null ? `${r.latitud}, ${r.longitud}` : "—"}</div>
        </div>
      </div>

      <div style={cardStyle}>
        <h3 style={h3}>✔ Checklist ({items.length})</h3>
        {items.length === 0 ? <p style={{ color: "var(--sc-text-soft)", fontSize: 13 }}>Sin ítems.</p> : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>{["Ítem", "Resultado", "Obligatorio", "Notas"].map((h) => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
            <tbody>{items.map((it) => (
              <tr key={it.id}>
                <td style={tdStyle}>{it.descripcion ?? it.codigo_item ?? "—"}</td>
                <td style={{ ...tdStyle, color: RES_COLOR[it.resultado] ?? undefined, fontWeight: 700 }}>{it.resultado}</td>
                <td style={tdStyle}>{it.requerido ? "Sí" : "No"}</td>
                <td style={tdStyle}>{it.notas ?? "—"}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </main>
  );
}
