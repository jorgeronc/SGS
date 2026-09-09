"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import MapaTrazaLiberty, { type PuntoMapa } from "@/app/components/MapaTrazaLiberty";
import { type ReporteMapa } from "@/app/components/MapaReportes";

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
const hace = (iso?: string | null): string => {
  if (!iso) return "—";
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  return s < 60 ? `${s} s` : s < 3600 ? `${Math.round(s / 60)} min` : `${Math.round(s / 3600)} h`;
};

// Distancia Haversine (m) y detección de PARADAS (permanencia > minMin dentro de radioM).
function distM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000, toR = (d: number) => (d * Math.PI) / 180;
  const dLat = toR(bLat - aLat), dLng = toR(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toR(aLat)) * Math.cos(toR(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
interface Parada { lat: number; lng: number; durMin: number; desde: string }
function detectarParadas(pts: { lat: number; lng: number; t: string }[], radioM = 25, minMin = 5): Parada[] {
  const out: Parada[] = []; let i = 0;
  while (i < pts.length) {
    let j = i + 1;
    while (j < pts.length && distM(pts[i].lat, pts[i].lng, pts[j].lat, pts[j].lng) <= radioM) j++;
    const durMin = (new Date(pts[j - 1].t).getTime() - new Date(pts[i].t).getTime()) / 60000;
    if (durMin >= minMin) { out.push({ lat: pts[i].lat, lng: pts[i].lng, durMin: Math.round(durMin), desde: pts[i].t }); i = j; }
    else i++;
  }
  return out;
}

// --- Ruta esperada vs real (opción A: ruta = puntos de control en orden) ---
// Distancia (m) de un punto a la polilínea de la ruta, con proyección local plana.
function distARutaM(pLat: number, pLng: number, ruta: [number, number][], lat0: number): number {
  if (ruta.length === 0) return Infinity;
  if (ruta.length === 1) return distM(pLat, pLng, ruta[0][0], ruta[0][1]);
  const kx = Math.cos((lat0 * Math.PI) / 180) * 111320, ky = 111320;
  const px = pLng * kx, py = pLat * ky;
  let min = Infinity;
  for (let i = 1; i < ruta.length; i++) {
    const ax = ruta[i - 1][1] * kx, ay = ruta[i - 1][0] * ky, bx = ruta[i][1] * kx, by = ruta[i][0] * ky;
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
    let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0; t = Math.max(0, Math.min(1, t));
    const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
    if (d < min) min = d;
  }
  return min;
}
function muestrearRuta(ruta: [number, number][], pasoM: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 1; i < ruta.length; i++) {
    const a = ruta[i - 1], b = ruta[i], seg = distM(a[0], a[1], b[0], b[1]);
    const n = Math.max(1, Math.round(seg / pasoM));
    for (let j = 0; j < n; j++) { const t = j / n; out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
  }
  if (ruta.length) out.push(ruta[ruta.length - 1]);
  return out;
}
interface MetricasRuta { cobertura: number; desvMax: number; desvProm: number; distFueraM: number; tFueraMin: number }
function metricasRuta(recorrido: { lat: number; lng: number; t: string }[], ruta: [number, number][], corredorM: number): MetricasRuta | null {
  if (ruta.length < 2 || recorrido.length === 0) return null;
  const lat0 = ruta[0][0];
  let sum = 0, max = 0, distFuera = 0, tFuera = 0;
  recorrido.forEach((g, i) => {
    const d = distARutaM(g.lat, g.lng, ruta, lat0);
    sum += d; if (d > max) max = d;
    if (d > corredorM && i > 0) {
      tFuera += (new Date(g.t).getTime() - new Date(recorrido[i - 1].t).getTime()) / 60000;
      distFuera += distM(recorrido[i - 1].lat, recorrido[i - 1].lng, g.lat, g.lng);
    }
  });
  const muestras = muestrearRuta(ruta, Math.max(15, corredorM));
  let cub = 0;
  muestras.forEach((m) => { if (recorrido.some((g) => distM(g.lat, g.lng, m[0], m[1]) <= corredorM)) cub++; });
  return {
    cobertura: muestras.length ? Math.round((cub / muestras.length) * 100) : 0,
    desvMax: Math.round(max), desvProm: Math.round(sum / recorrido.length),
    distFueraM: Math.round(distFuera), tFueraMin: Math.round(tFuera),
  };
}

interface Sesion {
  id: string; folio: string | null; estado: string; iniciada_en: string; finalizada_en: string | null;
  cumplimiento_pct: number | null; checkpoints_esperados: number; checkpoints_visitados: number;
  distancia_m: number | null; duracion_min: number | null; sitio: string; guardia: string;
  personal_id: string | null; sitio_id: string | null; corredor_m: number;
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
  const [recorrido, setRecorrido] = useState<{ lat: number; lng: number; t: string }[]>([]);
  const [rutaEsperada, setRutaEsperada] = useState<[number, number][]>([]);
  const [checks, setChecks] = useState<any[]>([]);
  const [guardiaVivo, setGuardiaVivo] = useState<{ latitud: number; longitud: number; actualizado_en: string | null } | null>(null);
  const [cargando, setCargando] = useState(false);
  const canalVivo = useRef<any>(null);

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
      .select("id, folio, estado, iniciada_en, finalizada_en, cumplimiento_pct, checkpoints_esperados, checkpoints_visitados, distancia_m, duracion_min, personal_id, sitio_id, sitio:sitios(nombre, rondin_corredor_m), guardia:personal(persona:personas(nombre, apellido_paterno, apellido_materno))")
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
      distancia_m: s.distancia_m, duracion_min: s.duracion_min, personal_id: s.personal_id ?? null, sitio_id: s.sitio_id ?? null, corredor_m: s.sitio?.rondin_corredor_m ?? 30, sitio: s.sitio?.nombre ?? "—", guardia: nombreGuardia(s.guardia),
    })));
    setCargando(false);
  }, [fecha, clienteId, sitioId, guardiaId, estado, sitios]);

  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => {
    const onFoco = () => { if (!document.hidden) cargar(); };
    // Auto-refresco (supervisión de sesiones en curso) cada 30 s en primer plano.
    const t = setInterval(() => { if (!document.hidden) cargar(); }, 30000);
    window.addEventListener("focus", cargar);
    document.addEventListener("visibilitychange", onFoco);
    return () => { clearInterval(t); window.removeEventListener("focus", cargar); document.removeEventListener("visibilitychange", onFoco); };
  }, [cargar]);

  // Detalle de la sesión seleccionada: traza + checks (+ guardia en vivo si está en curso).
  const abrir = useCallback(async (s: Sesion) => {
    setSel(s); setRuta([]); setRecorrido([]); setChecks([]); setGuardiaVivo(null); setRutaEsperada([]);
    if (canalVivo.current) { supabase.removeChannel(canalVivo.current); canalVivo.current = null; }
    // Ruta esperada = puntos de control activos del sitio, en su orden.
    if (s.sitio_id) {
      supabase.from("puntos_control").select("latitud, longitud, orden, creado_en")
        .eq("sitio_id", s.sitio_id).eq("estatus", "activo").not("latitud", "is", null)
        .order("orden", { ascending: true, nullsFirst: false }).order("creado_en", { ascending: true })
        .then(({ data }) => setRutaEsperada(((data as any[]) ?? []).map((p) => [Number(p.latitud), Number(p.longitud)] as [number, number])));
    }
    const [{ data: rec }, { data: chk }] = await Promise.all([
      supabase.from("recorrido_gps").select("latitud, longitud, fecha_hora").eq("sesion_id", s.id).order("fecha_hora", { ascending: true }),
      supabase.from("rondines").select("id, fecha_hora, latitud, longitud, novedad, dentro_geocerca, distancia_m, metodo, punto:puntos_control(nombre)")
        .eq("sesion_id", s.id).eq("estatus", "activo").order("fecha_hora", { ascending: true }),
    ]);
    const pts = ((rec as any[]) ?? []).filter((p) => p.latitud != null && p.longitud != null);
    setRuta(pts.map((p) => [Number(p.latitud), Number(p.longitud)] as [number, number]));
    setRecorrido(pts.map((p) => ({ lat: Number(p.latitud), lng: Number(p.longitud), t: p.fecha_hora })));
    setChecks((chk as any[]) ?? []);

    // Supervisión en vivo: posición actual del guardia + Realtime (solo en curso).
    if (s.estado === "en_progreso" && s.personal_id) {
      const { data: u } = await supabase.from("ubicaciones_guardias")
        .select("latitud, longitud, actualizado_en").eq("personal_id", s.personal_id).maybeSingle();
      if (u) setGuardiaVivo(u as any);
      canalVivo.current = supabase.channel(`sesion-vivo:${s.personal_id}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "ubicaciones_guardias", filter: `personal_id=eq.${s.personal_id}` },
          (payload: any) => { const n = payload.new; if (n) setGuardiaVivo({ latitud: n.latitud, longitud: n.longitud, actualizado_en: n.actualizado_en }); })
        .subscribe();
    }
  }, []);

  // Limpia el canal Realtime al desmontar.
  useEffect(() => () => { if (canalVivo.current) { supabase.removeChannel(canalVivo.current); canalVivo.current = null; } }, []);

  const paradas = useMemo<Parada[]>(() => detectarParadas(recorrido), [recorrido]);
  const paradasMapa = useMemo<PuntoMapa[]>(() => paradas.map((p) => ({ latitud: p.lat, longitud: p.lng, titulo: `⏸ Parada ${p.durMin} min · desde ${hhmm(p.desde)}` })), [paradas]);
  const guardiaMapa = useMemo<PuntoMapa | null>(() => (guardiaVivo && guardiaVivo.latitud != null
    ? { latitud: Number(guardiaVivo.latitud), longitud: Number(guardiaVivo.longitud), titulo: `👷 ${sel?.guardia ?? "Guardia"} · GPS hace ${hace(guardiaVivo.actualizado_en)}` }
    : null), [guardiaVivo, sel]);
  const mr = useMemo(() => metricasRuta(recorrido, rutaEsperada, sel?.corredor_m ?? 30), [recorrido, rutaEsperada, sel]);

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
              {sel.estado === "en_progreso" && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, padding: "7px 12px", border: "1px solid #2f6bff55", background: "#2f6bff14", borderRadius: 10, color: "#2f6bff", fontWeight: 700, fontSize: 13 }}>
                  <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#2f6bff" }} /> En vivo
                  <span style={{ fontWeight: 400, color: "var(--sc-text-soft)" }}>
                    {guardiaVivo ? `· último GPS hace ${hace(guardiaVivo.actualizado_en)}` : "· esperando posición del guardia…"}
                  </span>
                </div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 10, marginBottom: 12 }}>
                <Caja t="Cumplimiento" v={sel.cumplimiento_pct != null ? `${sel.cumplimiento_pct}%` : "—"} c={(EST[sel.estado] ?? EST.en_progreso).c} />
                <Caja t="Checkpoints" v={`${sel.checkpoints_visitados}/${sel.checkpoints_esperados}`} />
                <Caja t="Distancia" v={km(sel.distancia_m)} />
                <Caja t="Duración" v={sel.duracion_min != null ? `${sel.duracion_min} min` : "—"} />
                <Caja t="Paradas >5min" v={`${paradas.length}`} c={paradas.length ? "#d98a2b" : undefined} />
                <Caja t="Cobertura ruta" v={mr ? `${mr.cobertura}%` : "—"} c={mr ? (mr.cobertura >= 90 ? "#1f9d5c" : mr.cobertura >= 70 ? "#d98a2b" : "#d32f2f") : undefined} />
                <Caja t="Desv. máx" v={mr ? `${mr.desvMax} m` : "—"} c={mr && mr.desvMax > (sel.corredor_m ?? 30) ? "#d98a2b" : undefined} />
                <Caja t="Fuera de ruta" v={mr ? `${mr.tFueraMin} min · ${km(mr.distFueraM)}` : "—"} c={mr && mr.tFueraMin > 0 ? "#d98a2b" : undefined} />
              </div>
              <div className="mapcard">
                <MapaTrazaLiberty reportes={reportes} ruta={ruta} rutaEsperada={rutaEsperada} paradas={paradasMapa} guardia={guardiaMapa} className="mapbox-dash" />
              </div>
              {rutaEsperada.length >= 2 && (
                <div style={{ fontSize: 11.5, color: "var(--sc-text-soft)", marginTop: 4 }}>
                  <span style={{ color: "#7c5cff" }}>— — ruta esperada</span> (puntos de control, corredor ±{sel.corredor_m ?? 30} m) · <span style={{ color: "#2563eb" }}>—— recorrido real</span>
                </div>
              )}
              <div style={{ fontSize: 12, color: "var(--sc-text-soft)", margin: "8px 0" }}>
                <b>{ruta.length}</b> puntos GPS · <b>{checks.length}</b> checks · <b>{paradas.length}</b> parada(s) · inicio {new Date(sel.iniciada_en).toLocaleString()}{sel.finalizada_en ? ` · fin ${new Date(sel.finalizada_en).toLocaleString()}` : " · en curso"}
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
