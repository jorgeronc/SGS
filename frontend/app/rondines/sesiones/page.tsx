"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import MapaReportes, { type ReporteMapa } from "@/app/components/MapaReportes";

// Sesiones de rondín (trazabilidad, Fase 1A). Lista histórica con filtros y, al
// elegir una sesión, su TRAZA GPS (recorrido_gps) + CHECKS (rondines) sobre el
// mapa, con indicadores de cumplimiento. La sesión se abre/cierra sola por
// geocerca (ver migración 0095). Reusa MapaReportes (ruta + pines).

const hoyISO = () => new Date().toISOString().slice(0, 10);
const nombreGuardia = (p: any): string => {
  const x = p?.persona ?? p;
  return x ? `${x.nombre ?? ""} ${x.apellido_paterno ?? ""} ${x.apellido_materno ?? ""}`.trim() : "—";
};
const conNovedad = (n: string | null) => !!n && n.trim() !== "" && n.trim().toLowerCase() !== "sin novedad";

const EST: Record<string, { t: string; c: string }> = {
  en_progreso: { t: "En curso", c: "#2f6bff" },
  completado: { t: "Completado", c: "#1f9d5c" },
  incompleto: { t: "Incompleto", c: "#d98a2b" },
  cancelado: { t: "Cancelado", c: "#9aa4b2" },
};
const hhmm = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—");

interface Sesion {
  id: string; folio: string | null; estado: string; iniciada_en: string; finalizada_en: string | null;
  cumplimiento_pct: number | null; checkpoints_esperados: number; checkpoints_visitados: number;
  distancia_m: number | null; duracion_min: number | null; sitio: string; guardia: string;
}

export default function SesionesRondinPage() {
  const [fecha, setFecha] = useState(hoyISO());
  const [clientes, setClientes] = useState<any[]>([]);
  const [sitios, setSitios] = useState<any[]>([]);
  const [guardias, setGuardias] = useState<any[]>([]);
  const [clienteId, setClienteId] = useState("");
  const [sitioId, setSitioId] = useState("");
  const [guardiaId, setGuardiaId] = useState("");
  const [estado, setEstado] = useState("");
  const [sesiones, setSesiones] = useState<Sesion[]>([]);
  const [sel, setSel] = useState<Sesion | null>(null);
  const [ruta, setRuta] = useState<[number, number][]>([]);
  const [checks, setChecks] = useState<any[]>([]);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    supabase.from("clientes").select("id, razon_social").eq("estatus", "activo").order("razon_social")
      .then(({ data }) => setClientes((data as any[]) ?? []));
    supabase.from("personal").select("id, persona:personas(nombre, apellido_paterno, apellido_materno)")
      .eq("estatus", "activo").eq("estado_laboral", "activo")
      .then(({ data }) => setGuardias((data as any[]) ?? []));
  }, []);

  useEffect(() => {
    setSitioId("");
    if (!clienteId) { setSitios([]); return; }
    supabase.from("sitios").select("id, nombre").eq("cliente_id", clienteId).eq("estatus", "activo").order("nombre")
      .then(({ data }) => setSitios((data as any[]) ?? []));
  }, [clienteId]);

  const cargar = useCallback(async () => {
    setCargando(true);
    // Cancela sesiones "de presencia" (abiertas sin ningún check y ya vencidas).
    await supabase.rpc("rpc_rondin_barrer_vencidas").then(() => undefined, () => undefined);
    const desde = `${fecha}T00:00:00`, hasta = `${fecha}T23:59:59.999`;
    let q = supabase.from("sesiones_rondin")
      .select("id, folio, estado, iniciada_en, finalizada_en, cumplimiento_pct, checkpoints_esperados, checkpoints_visitados, distancia_m, duracion_min, sitio:sitios(nombre), guardia:personal(persona:personas(nombre, apellido_paterno, apellido_materno))")
      .eq("estatus", "activo").gte("iniciada_en", desde).lte("iniciada_en", hasta)
      .order("iniciada_en", { ascending: false });
    if (sitioId) q = q.eq("sitio_id", sitioId);
    else if (clienteId) q = q.in("sitio_id", sitios.map((s) => s.id).length ? sitios.map((s) => s.id) : ["00000000-0000-0000-0000-000000000000"]);
    if (guardiaId) q = q.eq("personal_id", guardiaId);
    if (estado) q = q.eq("estado", estado);
    const { data } = await q;
    setSesiones(((data as any[]) ?? []).map((s) => ({
      id: s.id, folio: s.folio, estado: s.estado, iniciada_en: s.iniciada_en, finalizada_en: s.finalizada_en,
      cumplimiento_pct: s.cumplimiento_pct, checkpoints_esperados: s.checkpoints_esperados, checkpoints_visitados: s.checkpoints_visitados,
      distancia_m: s.distancia_m, duracion_min: s.duracion_min, sitio: s.sitio?.nombre ?? "—", guardia: nombreGuardia(s.guardia),
    })));
    setCargando(false);
  }, [fecha, clienteId, sitioId, guardiaId, estado, sitios]);

  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => {
    const onFoco = () => { if (!document.hidden) cargar(); };
    window.addEventListener("focus", cargar);
    document.addEventListener("visibilitychange", onFoco);
    return () => { window.removeEventListener("focus", cargar); document.removeEventListener("visibilitychange", onFoco); };
  }, [cargar]);

  // Detalle de la sesión seleccionada: traza + checks.
  const abrir = useCallback(async (s: Sesion) => {
    setSel(s); setRuta([]); setChecks([]);
    const [{ data: rec }, { data: chk }] = await Promise.all([
      supabase.from("recorrido_gps").select("latitud, longitud, fecha_hora").eq("sesion_id", s.id).order("fecha_hora", { ascending: true }),
      supabase.from("rondines").select("id, fecha_hora, latitud, longitud, novedad, dentro_geocerca, distancia_m, metodo, punto:puntos_control(nombre)")
        .eq("sesion_id", s.id).eq("estatus", "activo").order("fecha_hora", { ascending: true }),
    ]);
    setRuta(((rec as any[]) ?? []).filter((p) => p.latitud != null && p.longitud != null).map((p) => [Number(p.latitud), Number(p.longitud)] as [number, number]));
    setChecks((chk as any[]) ?? []);
  }, []);

  const reportes = useMemo<ReporteMapa[]>(() => checks.filter((p) => p.latitud != null && p.longitud != null).map((p, i) => ({
    id: p.id, folio: `#${i + 1}`,
    titulo: `${p.punto?.nombre ?? "Punto"} · ${new Date(p.fecha_hora).toLocaleString()}${conNovedad(p.novedad) ? `<br>⚠ ${p.novedad}` : ""}${p.dentro_geocerca === false ? `<br>⚠ Fuera de rango (${p.distancia_m ?? "?"} m)` : ""}`,
    latitud: Number(p.latitud), longitud: Number(p.longitud), href: `/rondines/${p.id}`,
    color: (conNovedad(p.novedad) || p.dentro_geocerca === false) ? "#d32f2f" : "#1f9d5c",
  })), [checks]);

  const km = (m: number | null) => (m == null ? "—" : m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`);

  return (
    <main className="contenedor">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <h2 style={{ margin: 0 }}>🧭 Sesiones de rondín</h2>
        <button onClick={() => cargar()} className="qbtn2" title="Actualizar">⟳ Actualizar</button>
      </div>
      <p className="dash-sub" style={{ marginTop: 2 }}>Cada sesión (RN) se abre y cierra sola al entrar/salir de la geocerca del sitio. Elige una para ver su recorrido y cumplimiento.</p>

      {/* Filtros */}
      <div className="form-fila" style={{ alignItems: "flex-end", flexWrap: "wrap", gap: 10, margin: "10px 0" }}>
        <label className="dash-sub" style={{ display: "flex", flexDirection: "column" }}>Fecha
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </label>
        <label className="dash-sub" style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 170 }}>Cliente
          <select value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
            <option value="">— Todos —</option>
            {clientes.map((c) => <option key={c.id} value={c.id}>{c.razon_social}</option>)}
          </select>
        </label>
        <label className="dash-sub" style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 160 }}>Sitio
          <select value={sitioId} onChange={(e) => setSitioId(e.target.value)} disabled={!clienteId}>
            <option value="">{clienteId ? "— Todos —" : "elige cliente"}</option>
            {sitios.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
        </label>
        <label className="dash-sub" style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 160 }}>Guardia
          <select value={guardiaId} onChange={(e) => setGuardiaId(e.target.value)}>
            <option value="">— Todos —</option>
            {guardias.map((g) => <option key={g.id} value={g.id}>{nombreGuardia(g)}</option>)}
          </select>
        </label>
        <label className="dash-sub" style={{ display: "flex", flexDirection: "column", minWidth: 140 }}>Estado
          <select value={estado} onChange={(e) => setEstado(e.target.value)}>
            <option value="">— Todos —</option>
            {Object.entries(EST).map(([k, v]) => <option key={k} value={k}>{v.t}</option>)}
          </select>
        </label>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 380px) 1fr", gap: 16, alignItems: "start" }}>
        {/* Lista */}
        <div>
          {cargando ? <p className="dash-sub">Cargando…</p> : sesiones.length === 0 ? (
            <p className="dash-sub">Sin sesiones para este filtro.</p>
          ) : sesiones.map((s) => {
            const e = EST[s.estado] ?? EST.en_progreso;
            const activa = sel?.id === s.id;
            return (
              <button key={s.id} onClick={() => abrir(s)} style={{
                width: "100%", textAlign: "left", cursor: "pointer", marginBottom: 8, padding: "10px 12px",
                border: `1px solid ${activa ? "var(--sc-btn,#f4a03f)" : "var(--sc-card-line,#e2e6ec)"}`, borderRadius: 10,
                background: activa ? "var(--sc-surface-2,#f7f9fb)" : "transparent", color: "var(--sc-text)",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <b>{s.folio ?? "—"}</b>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#fff", background: e.c, borderRadius: 20, padding: "2px 9px" }}>{e.t}</span>
                </div>
                <div style={{ fontSize: 13, marginTop: 3 }}>👷 {s.guardia}</div>
                <div style={{ fontSize: 12.5, color: "var(--sc-text-soft)" }}>📍 {s.sitio}</div>
                <div style={{ fontSize: 12, color: "var(--sc-text-soft)", marginTop: 3, display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <span>{hhmm(s.iniciada_en)}{s.finalizada_en ? `→${hhmm(s.finalizada_en)}` : ""}</span>
                  <span>✓ {s.checkpoints_visitados}/{s.checkpoints_esperados}</span>
                  {s.cumplimiento_pct != null && <span>{s.cumplimiento_pct}%</span>}
                </div>
              </button>
            );
          })}
        </div>

        {/* Detalle */}
        <div>
          {!sel ? (
            <p className="dash-sub">Selecciona una sesión para ver su recorrido en el mapa.</p>
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10, marginBottom: 12 }}>
                <Caja t="Cumplimiento" v={sel.cumplimiento_pct != null ? `${sel.cumplimiento_pct}%` : "—"} c={(EST[sel.estado] ?? EST.en_progreso).c} />
                <Caja t="Checkpoints" v={`${sel.checkpoints_visitados}/${sel.checkpoints_esperados}`} />
                <Caja t="Distancia" v={km(sel.distancia_m)} />
                <Caja t="Duración" v={sel.duracion_min != null ? `${sel.duracion_min} min` : "—"} />
              </div>
              <div className="mapcard">
                <MapaReportes reportes={reportes} ruta={ruta} className="mapbox-dash" />
              </div>
              <div style={{ fontSize: 12, color: "var(--sc-text-soft)", margin: "8px 0" }}>
                <b>{ruta.length}</b> puntos GPS · <b>{checks.length}</b> checks · inicio {new Date(sel.iniciada_en).toLocaleString()}{sel.finalizada_en ? ` · fin ${new Date(sel.finalizada_en).toLocaleString()}` : " · en curso"}
              </div>
              {checks.length > 0 && (
                <ol className="cad-timeline" style={{ padding: "6px 4px" }}>
                  {checks.map((p, i) => (
                    <li key={p.id} className="cad-tl-item">
                      <span className="cad-tl-dot" style={conNovedad(p.novedad) || p.dentro_geocerca === false ? { background: "#d32f2f" } : { background: "#1f9d5c" }} />
                      <div className="cad-tl-body">
                        <span className="cad-tl-estado">{i + 1}. {p.punto?.nombre ?? "Punto"}</span>
                        <span className="cad-tl-meta">
                          {new Date(p.fecha_hora).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          {p.metodo ? ` · ${p.metodo === "nfc" ? "NFC" : p.metodo === "manual" ? "Manual" : "QR"}` : ""}
                          {conNovedad(p.novedad) ? ` · ⚠ ${p.novedad}` : " · Sin novedad"}
                          {p.dentro_geocerca === false && <span style={{ color: "#b00020", fontWeight: 700 }}> · fuera de rango ({p.distancia_m ?? "?"} m)</span>}
                          {"  "}<Link href={`/rondines/${p.id}`}>ver →</Link>
                        </span>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </>
          )}
        </div>
      </div>
    </main>
  );
}

function Caja({ t, v, c }: { t: string; v: string; c?: string }) {
  return (
    <div style={{ border: "1px solid var(--sc-card-line,#e2e6ec)", borderRadius: 10, padding: "8px 10px" }}>
      <div style={{ fontSize: 11.5, color: "var(--sc-text-soft)" }}>{t}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: c ?? "var(--sc-text)" }}>{v}</div>
    </div>
  );
}
