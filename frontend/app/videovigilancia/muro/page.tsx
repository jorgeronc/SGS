"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import VisorCamara from "@/app/components/VisorCamara";

const LS_KEY = "sgs_muro_camaras";

// Muro de videovigilancia: el operador apila las cámaras que quiere vigilar; la
// selección se guarda en localStorage (sobrevive recargas). Cada tile resuelve y
// auto-refresca su señal por su cuenta (VisorCamara).
export default function MuroCamarasPage() {
  const [camaras, setCamaras] = useState<any[]>([]);
  const [sel, setSel] = useState<string[]>([]);
  const [filtroSitio, setFiltroSitio] = useState("");
  const [panel, setPanel] = useState(true);

  useEffect(() => {
    supabase.from("camaras")
      .select("id, nombre, estado_operativo, sitio:sitios(nombre)")
      .eq("estatus", "activo").eq("estado_operativo", "activa").order("nombre")
      .then(({ data }) => setCamaras((data as any[]) ?? []));
    try { const g = JSON.parse(localStorage.getItem(LS_KEY) || "[]"); if (Array.isArray(g)) setSel(g); } catch { /* */ }
  }, []);

  useEffect(() => { try { localStorage.setItem(LS_KEY, JSON.stringify(sel)); } catch { /* */ } }, [sel]);

  const sitios = useMemo(() => Array.from(new Set(camaras.map((c) => c.sitio?.nombre).filter(Boolean))).sort(), [camaras]);
  const lista = useMemo(() => camaras.filter((c) => !filtroSitio || c.sitio?.nombre === filtroSitio), [camaras, filtroSitio]);
  const seleccionadas = camaras.filter((c) => sel.includes(c.id));
  const toggle = (id: string) => setSel((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <main className="contenedor">
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
        <h2 style={{ margin: 0 }}>Muro de cámaras</h2>
        <span className="dash-sub">{seleccionadas.length} en pantalla</span>
        <button className="qbtn2" onClick={() => setPanel((p) => !p)}>{panel ? "Ocultar selector" : "Elegir cámaras"}</button>
        {sel.length > 0 && <button className="qbtn2" onClick={() => setSel([])}>Limpiar muro</button>}
        <Link href="/videovigilancia" className="qbtn2" style={{ marginLeft: "auto" }}>← Catálogo</Link>
      </div>

      {panel && (
        <div style={{ border: "1px solid var(--sc-card-line)", borderRadius: 8, padding: 10, marginBottom: 14 }}>
          <div className="form-fila" style={{ marginBottom: 6 }}>
            <select value={filtroSitio} onChange={(e) => setFiltroSitio(e.target.value)} style={{ maxWidth: 280 }}>
              <option value="">Todos los sitios</option>
              {sitios.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {lista.map((c) => (
              <label key={c.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, border: "1px solid var(--sc-card-line)", borderRadius: 6, padding: "4px 8px", cursor: "pointer" }}>
                <input type="checkbox" checked={sel.includes(c.id)} onChange={() => toggle(c.id)} />
                {c.nombre}{c.sitio?.nombre ? <span className="dash-sub"> · {c.sitio.nombre}</span> : null}
              </label>
            ))}
            {lista.length === 0 && <span className="dash-sub">No hay cámaras activas.</span>}
          </div>
        </div>
      )}

      {seleccionadas.length === 0 ? (
        <p className="dash-sub">Elige cámaras arriba para armar el muro.</p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
          {seleccionadas.map((c) => <VisorCamara key={c.id} camaraId={c.id} nombre={c.nombre} alto={220} />)}
        </div>
      )}
    </main>
  );
}
