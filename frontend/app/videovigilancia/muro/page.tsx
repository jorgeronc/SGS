"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import VisorCamara from "@/app/components/VisorCamara";

const LS_KEY = "sgs_muro_camaras";
const MAX = 24; // el muro admite hasta 24 cámaras

// Muro de videovigilancia: el operador apila las cámaras que quiere vigilar; la
// selección se guarda en localStorage (sobrevive recargas). Cada tile resuelve y
// auto-refresca su señal y puede maximizarse a pantalla completa (VisorCamara).
// Al llegar con ?cam=<id> (desde la lista o el mapa) se agrega y abre esa cámara.
export default function MuroCamarasPage() {
  const [camaras, setCamaras] = useState<any[]>([]);
  const [sel, setSel] = useState<string[]>([]);
  const [filtroSitio, setFiltroSitio] = useState("");
  const [busca, setBusca] = useState("");
  const [panel, setPanel] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    supabase.from("camaras")
      .select("id, nombre, estado_operativo, sitio:sitios(nombre)")
      .eq("estatus", "activo").eq("estado_operativo", "activa").order("nombre")
      .then(({ data }) => setCamaras((data as any[]) ?? []));
    // Base: selección guardada + cámara pedida por ?cam (desde lista/mapa).
    let base: string[] = [];
    try { const g = JSON.parse(localStorage.getItem(LS_KEY) || "[]"); if (Array.isArray(g)) base = g; } catch { /* */ }
    let camParam: string | null = null;
    try { camParam = new URLSearchParams(window.location.search).get("cam"); } catch { /* */ }
    if (camParam && !base.includes(camParam)) base = [camParam, ...base];
    setSel(base.slice(0, MAX));
    if (!camParam && base.length === 0) setPanel(true); // muro vacío: abre el selector
  }, []);

  useEffect(() => { try { localStorage.setItem(LS_KEY, JSON.stringify(sel)); } catch { /* */ } }, [sel]);

  const sitios = useMemo(() => Array.from(new Set(camaras.map((c) => c.sitio?.nombre).filter(Boolean))).sort(), [camaras]);
  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return camaras.filter((c) =>
      (!filtroSitio || c.sitio?.nombre === filtroSitio) &&
      (!q || `${c.nombre} ${c.sitio?.nombre ?? ""}`.toLowerCase().includes(q)));
  }, [camaras, filtroSitio, busca]);
  const seleccionadas = sel.map((id) => camaras.find((c) => c.id === id)).filter(Boolean) as any[];

  function toggle(id: string) {
    setAviso(null);
    setSel((p) => {
      if (p.includes(id)) return p.filter((x) => x !== id);
      if (p.length >= MAX) { setAviso(`El muro admite hasta ${MAX} cámaras.`); return p; }
      return [...p, id];
    });
  }

  return (
    <main className="contenedor">
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
        <h2 style={{ margin: 0 }}>Muro de cámaras</h2>
        <span className="dash-sub">{seleccionadas.length}/{MAX} en pantalla</span>
        <button className="qbtn2" onClick={() => setPanel((p) => !p)}>{panel ? "Ocultar selector" : "➕ Elegir cámaras"}</button>
        {sel.length > 0 && <button className="qbtn2" onClick={() => setSel([])}>Limpiar muro</button>}
        <Link href="/videovigilancia" className="qbtn2" style={{ marginLeft: "auto" }}>← Catálogo</Link>
      </div>

      {/* Chips de las cámaras en el muro (quitar sin buscar en la lista larga) */}
      {seleccionadas.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
          {seleccionadas.map((c) => (
            <span key={c.id} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, background: "#eef1f5", border: "1px solid var(--sc-card-line)", borderRadius: 999, padding: "2px 6px 2px 10px" }}>
              {c.nombre}
              <button onClick={() => toggle(c.id)} title="Quitar del muro" style={{ border: "none", background: "transparent", cursor: "pointer", color: "#b00020", fontWeight: 800 }}>×</button>
            </span>
          ))}
        </div>
      )}

      {panel && (
        <div style={{ border: "1px solid var(--sc-card-line)", borderRadius: 8, padding: 10, marginBottom: 14 }}>
          <div className="form-fila" style={{ marginBottom: 8, gap: 8 }}>
            <input placeholder="Buscar cámara…" value={busca} onChange={(e) => setBusca(e.target.value)} style={{ flex: 2 }} />
            <select value={filtroSitio} onChange={(e) => setFiltroSitio(e.target.value)} style={{ flex: 1, maxWidth: 260 }}>
              <option value="">Todos los sitios</option>
              {sitios.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div style={{ maxHeight: 260, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
            {lista.map((c) => {
              const on = sel.includes(c.id);
              return (
                <label key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, padding: "4px 6px", borderRadius: 6, cursor: "pointer", background: on ? "#eef6ee" : undefined }}>
                  <input type="checkbox" checked={on} onChange={() => toggle(c.id)} />
                  <span>{c.nombre}</span>
                  {c.sitio?.nombre && <span className="dash-sub" style={{ marginLeft: "auto" }}>{c.sitio.nombre}</span>}
                </label>
              );
            })}
            {lista.length === 0 && <span className="dash-sub" style={{ padding: 6 }}>Sin coincidencias.</span>}
          </div>
          <p className="dash-sub" style={{ fontSize: 12, margin: "6px 0 0" }}>{lista.length} cámara(s) · seleccionadas {sel.length}/{MAX}</p>
        </div>
      )}

      {aviso && <p style={{ color: "#b00020", fontSize: 13 }}>{aviso}</p>}

      {seleccionadas.length === 0 ? (
        <p className="dash-sub">Elige cámaras con “➕ Elegir cámaras” para armar el muro.</p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
          {seleccionadas.map((c) => <VisorCamara key={c.id} camaraId={c.id} nombre={c.nombre} alto={220} />)}
        </div>
      )}
    </main>
  );
}
