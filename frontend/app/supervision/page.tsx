"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import MapaReportes, { type ReporteMapa } from "@/app/components/MapaReportes";

const hoyISO = () => new Date().toISOString().slice(0, 10);
function nombreGuardia(p: any): string {
  const x = p?.persona ?? p;
  return x ? `${x.nombre ?? ""} ${x.apellido_paterno ?? ""} ${x.apellido_materno ?? ""}`.trim() : "—";
}
const conNovedad = (n: string | null) => !!n && n.trim() !== "" && n.trim().toLowerCase() !== "sin novedad";
const PAL = ["#1e88e5", "#8e24aa", "#00897b", "#f4511e", "#3949ab", "#c0ca33", "#00acc1", "#6d4c41"];

interface Paso {
  id: string; fecha_hora: string; latitud: number | null; longitud: number | null; novedad: string | null;
  personalId: string; guardia: string; punto: string; sitio: string;
}

// Supervisión de rondín: filtros en cascada (fecha → cliente → sitio → guardia
// opcional) fijos en pantalla; mapa con puntos por guardia (clic → registro) e
// historial agrupado por sitio y guardia, colapsable.
export default function SupervisionPage() {
  const [fecha, setFecha] = useState(hoyISO());
  const [clientes, setClientes] = useState<any[]>([]);
  const [sitios, setSitios] = useState<any[]>([]);
  const [guardias, setGuardias] = useState<any[]>([]);
  const [clienteId, setClienteId] = useState("");
  const [sitioId, setSitioId] = useState("");
  const [guardiaId, setGuardiaId] = useState("");
  const [pasos, setPasos] = useState<Paso[]>([]);
  const [ruta, setRuta] = useState<[number, number][]>([]);
  const [cargando, setCargando] = useState(false);
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());

  useEffect(() => {
    supabase.from("clientes").select("id, razon_social").eq("estatus", "activo").order("razon_social")
      .then(({ data }) => setClientes((data as any[]) ?? []));
    supabase.from("personal").select("id, persona:personas(nombre, apellido_paterno, apellido_materno)")
      .eq("estatus", "activo").eq("estado_laboral", "activo")
      .then(({ data }) => setGuardias((data as any[]) ?? []));
  }, []);

  // Cliente → sitios.
  useEffect(() => {
    setSitioId("");
    if (!clienteId) { setSitios([]); return; }
    supabase.from("sitios").select("id, nombre").eq("cliente_id", clienteId).eq("estatus", "activo").order("nombre")
      .then(({ data }) => setSitios((data as any[]) ?? []));
  }, [clienteId]);

  // Filtros → resultados (requiere fecha + sitio).
  useEffect(() => {
    if (!sitioId) { setPasos([]); setRuta([]); return; }
    (async () => {
      setCargando(true);
      const desde = `${fecha}T00:00:00`, hasta = `${fecha}T23:59:59.999`;
      const { data: pts } = await supabase.from("puntos_control").select("id").eq("sitio_id", sitioId).eq("estatus", "activo");
      const ids = ((pts as any[]) ?? []).map((p) => p.id);
      if (ids.length === 0) { setPasos([]); setRuta([]); setCargando(false); return; }
      let q = supabase.from("rondines")
        .select("id, fecha_hora, latitud, longitud, novedad, personal_id, punto:puntos_control(nombre, sitio:sitios(nombre)), guardia:personal(persona:personas(nombre, apellido_paterno, apellido_materno))")
        .in("punto_id", ids).eq("estatus", "activo")
        .gte("fecha_hora", desde).lte("fecha_hora", hasta).order("fecha_hora", { ascending: true });
      if (guardiaId) q = q.eq("personal_id", guardiaId);
      const { data } = await q;
      setPasos(((data as any[]) ?? []).map((r) => ({
        id: r.id, fecha_hora: r.fecha_hora, latitud: r.latitud, longitud: r.longitud, novedad: r.novedad,
        personalId: r.personal_id, guardia: nombreGuardia(r.guardia), punto: r.punto?.nombre ?? "Punto", sitio: r.punto?.sitio?.nombre ?? "—",
      })));

      if (guardiaId) {
        const { data: rec } = await supabase.from("recorrido_gps").select("latitud, longitud")
          .eq("personal_id", guardiaId).gte("fecha_hora", desde).lte("fecha_hora", hasta).order("fecha_hora", { ascending: true });
        setRuta(((rec as any[]) ?? []).filter((p) => p.latitud != null && p.longitud != null).map((p) => [Number(p.latitud), Number(p.longitud)] as [number, number]));
      } else setRuta([]);
      setCargando(false);
    })();
  }, [fecha, sitioId, guardiaId]);

  // Color por guardia (rojo si novedad).
  const colorGuardia = useMemo(() => {
    const ids = Array.from(new Set(pasos.map((p) => p.personalId)));
    const m: Record<string, string> = {};
    ids.forEach((id, i) => { m[id] = PAL[i % PAL.length]; });
    return m;
  }, [pasos]);

  const reportes = useMemo<ReporteMapa[]>(() => pasos.filter((p) => p.latitud != null && p.longitud != null).map((p, i) => ({
    id: p.id, folio: `#${i + 1}`,
    titulo: `👷 ${p.guardia}<br>${p.punto} · ${new Date(p.fecha_hora).toLocaleString()}${conNovedad(p.novedad) ? `<br>⚠ ${p.novedad}` : ""}`,
    latitud: Number(p.latitud), longitud: Number(p.longitud), href: `/rondines/${p.id}`,
    color: conNovedad(p.novedad) ? "#d32f2f" : (colorGuardia[p.personalId] ?? "#f4a03f"),
  })), [pasos, colorGuardia]);

  // Agrupado: sitio → guardia → pasos.
  const grupos = useMemo(() => {
    const g: Record<string, Record<string, Paso[]>> = {};
    for (const p of pasos) { (g[p.sitio] ??= {})[p.guardia] ??= []; g[p.sitio][p.guardia].push(p); }
    return g;
  }, [pasos]);

  function toggle(k: string) { setAbiertos((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; }); }
  const novedades = pasos.filter((p) => conNovedad(p.novedad)).length;
  const pdfHref = guardiaId ? `/supervision/imprimir?guardia=${guardiaId}&fecha=${fecha}` : "#";

  return (
    <main className="contenedor">
      <h2 style={{ marginBottom: 4 }}>Supervisión de rondín</h2>

      {/* Filtros fijos (sticky) */}
      <div style={{ position: "sticky", top: 0, zIndex: 6, background: "var(--sc-surface, #fff)", padding: "8px 0 12px", borderBottom: "1px solid var(--sc-card-line, #e2e6ec)" }}>
        <div className="form-fila" style={{ alignItems: "flex-end", flexWrap: "wrap", gap: 10 }}>
          <label className="dash-sub" style={{ display: "flex", flexDirection: "column" }}>Fecha
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </label>
          <label className="dash-sub" style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 180 }}>Cliente
            <select value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
              <option value="">— Cliente —</option>
              {clientes.map((c) => <option key={c.id} value={c.id}>{c.razon_social}</option>)}
            </select>
          </label>
          <label className="dash-sub" style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 180 }}>Sitio
            <select value={sitioId} onChange={(e) => setSitioId(e.target.value)} disabled={!clienteId}>
              <option value="">{clienteId ? "— Sitio —" : "elige cliente"}</option>
              {sitios.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          </label>
          <label className="dash-sub" style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 180 }}>Guardia (opcional)
            <select value={guardiaId} onChange={(e) => setGuardiaId(e.target.value)}>
              <option value="">— Todos —</option>
              {guardias.map((g) => <option key={g.id} value={g.id}>{nombreGuardia(g)}</option>)}
            </select>
          </label>
          <a href={pdfHref} target="_blank" rel="noopener noreferrer" className="cad-mapbtn"
             style={{ pointerEvents: guardiaId && sitioId ? "auto" : "none", opacity: guardiaId && sitioId ? 1 : 0.5 }}>🖨️ PDF ↗</a>
        </div>
        {sitioId && (
          <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 13, color: "#555" }}>
            <span><b>{pasos.length}</b> lecturas</span>
            <span style={{ color: novedades ? "#b00020" : undefined }}><b>{novedades}</b> con novedad</span>
            {guardiaId && <span><b>{ruta.length}</b> puntos GPS (trayecto)</span>}
          </div>
        )}
      </div>

      {/* Resultados */}
      {!sitioId ? (
        <p className="dash-sub" style={{ marginTop: 16 }}>Elige fecha, cliente y sitio para ver el recorrido. El guardia es opcional (por defecto se muestran todos).</p>
      ) : cargando ? (
        <p style={{ marginTop: 16 }}>Cargando…</p>
      ) : (
        <>
          <div className="mapcard" style={{ marginTop: 12 }}>
            <MapaReportes reportes={reportes} ruta={ruta} className="mapbox-dash" />
          </div>

          <h3 style={{ marginTop: 18 }}>Historial del recorrido</h3>
          {pasos.length === 0 ? (
            <p className="dash-sub">Sin lecturas de rondín para este filtro.</p>
          ) : (
            <div>
              {Object.entries(grupos).map(([sitio, porGuardia]) => (
                <div key={sitio} style={{ marginBottom: 14 }}>
                  <div style={{ fontWeight: 800, color: "#0b3d66", margin: "6px 0" }}>📍 {sitio}</div>
                  {Object.entries(porGuardia).map(([guardia, items]) => {
                    const k = `${sitio}||${guardia}`;
                    const abierto = abiertos.has(k);
                    const nov = items.filter((p) => conNovedad(p.novedad)).length;
                    return (
                      <div key={k} style={{ border: "1px solid var(--sc-card-line, #e2e6ec)", borderRadius: 8, marginBottom: 8, overflow: "hidden" }}>
                        <button onClick={() => toggle(k)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "var(--sc-surface-2, #f7f9fb)", border: "none", cursor: "pointer", textAlign: "left" }}>
                          <span style={{ transform: abierto ? "rotate(90deg)" : "none", transition: "transform .15s", color: "#888" }}>▶</span>
                          <b style={{ flex: 1 }}>👷 {guardia}</b>
                          <span style={{ fontSize: 12, color: "#666" }}>{items.length} lecturas</span>
                          {nov > 0 && <span className="cad-pill" style={{ background: "#d32f2f", color: "#fff", fontSize: 11 }}>{nov} novedad</span>}
                        </button>
                        {abierto && (
                          <ol className="cad-timeline" style={{ padding: "12px 16px 6px" }}>
                            {items.map((p, i) => (
                              <li key={p.id} className="cad-tl-item">
                                <span className="cad-tl-dot" style={conNovedad(p.novedad) ? { background: "#d32f2f" } : undefined} />
                                <div className="cad-tl-body">
                                  <span className="cad-tl-estado">{i + 1}. {p.punto}</span>
                                  <span className="cad-tl-meta">
                                    {new Date(p.fecha_hora).toLocaleString()}
                                    {conNovedad(p.novedad) ? ` · ⚠ ${p.novedad}` : " · Sin novedad"}
                                    {"  "}<Link href={`/rondines/${p.id}`}>ver registro →</Link>
                                  </span>
                                </div>
                              </li>
                            ))}
                          </ol>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </main>
  );
}
