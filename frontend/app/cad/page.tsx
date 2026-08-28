"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import type { LlamadaCad } from "@/lib/types";
import { CatalogoSelect } from "@/app/components/CatalogoSelect";
import { reportesCercanos, type RegistroSimilar } from "@/lib/duplicados";
import AvisoDuplicados from "@/app/components/AvisoDuplicados";
import { unidadesPorLlamada, DESPACHO_LABEL, DESPACHO_COLOR, type UnidadDespacho } from "@/lib/despachos";

// Central / Despacho (seguridad privada) — rediseño tipo consola CAD.
// Reutiliza la infraestructura CAD heredada (llamadas_cad, despachos, sitios,
// transmisiones). Acciones rápidas adaptadas al dominio SGS (sin módulos
// policiales). Branding SGS: botón principal en naranja de marca.

const DESP_LABEL: Record<string, string> = { recibida: "Recibida", despachada: "Despachado", en_atencion: "En atención", resuelta: "Resuelta" };
const PRIO: Record<string, { p: string; lbl: string; col: string }> = {
  alta: { p: "P1", lbl: "Alta", col: "#e23b53" },
  media: { p: "P2", lbl: "Media", col: "#d98a2b" },
  baja: { p: "P3", lbl: "Baja", col: "#1f9d5c" },
};

// Emoji representativo del tipo de incidencia (heurística por palabras clave).
function iconoTipo(t?: string | null): string {
  const s = (t ?? "").toLowerCase();
  if (/rob|hurto|intrus|no autoriz/.test(s)) return "🏃";
  if (/accid|choque|vial/.test(s)) return "🚗";
  if (/falla|cctv|energ|servici/.test(s)) return "⚡";
  if (/ri[ñn]a|agres|pelea/.test(s)) return "🥊";
  if (/alarma/.test(s)) return "🔔";
  if (/p[áa]nico|emerg/.test(s)) return "🆘";
  if (/incendi|fuego/.test(s)) return "🔥";
  if (/m[ée]dic|salud|lesion/.test(s)) return "🚑";
  if (/sospech|merode|vehic/.test(s)) return "🕵️";
  return "⚠️";
}

function dosDig(n: number) { return String(n).padStart(2, "0"); }
function transcurrido(desdeIso: string, ahora: Date): string {
  const ms = ahora.getTime() - new Date(desdeIso).getTime();
  if (!isFinite(ms) || ms < 0) return "00:00:00";
  const s = Math.floor(ms / 1000);
  return `${dosDig(Math.floor(s / 3600))}:${dosDig(Math.floor((s % 3600) / 60))}:${dosDig(s % 60)}`;
}
function minSeg(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${dosDig(Math.floor(s / 60))}:${dosDig(s % 60)}`;
}
const esHoy = (iso: string) => { const d = new Date(iso), n = new Date(); return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate(); };

// Serie horaria (24 buckets) de hoy, contando lo que cumpla `pred`.
function serieHoraria(lista: LlamadaCad[], pred: (l: LlamadaCad) => boolean): number[] {
  const b = new Array(24).fill(0);
  lista.forEach((l) => { if (esHoy(l.fecha_recepcion) && pred(l)) b[new Date(l.fecha_recepcion).getHours()]++; });
  return b;
}

// --- Sparkline SVG (sin librerías) ---
function Sparkline({ data, color, w = 120, h = 34 }: { data: number[]; color: string; w?: number; h?: number }) {
  if (!data.length || data.every((v) => v === 0)) return <svg width={w} height={h} />;
  const max = Math.max(...data, 1), min = Math.min(...data, 0), rng = max - min || 1;
  const step = w / Math.max(data.length - 1, 1);
  const pts = data.map((v, i) => [i * step, h - ((v - min) / rng) * (h - 6) - 3] as [number, number]);
  const linea = pts.map((p, i) => (i === 0 ? "M" : "L") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  const area = `${linea} L ${w} ${h} L 0 ${h} Z`;
  const ult = pts[pts.length - 1];
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: "block" }}>
      <path d={area} fill={color} opacity={0.12} />
      <path d={linea} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={ult[0]} cy={ult[1]} r={2.6} fill={color} />
    </svg>
  );
}

// --- Acción rápida (dominio SGS) ---
function AccionRapida({ href, icon, label, onClick }: { href?: string; icon: string; label: string; onClick?: () => void }) {
  const cuerpo = (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 6px", borderBottom: "1px solid var(--sc-card-line)", cursor: "pointer" }}>
      <span style={{ width: 30, height: 30, borderRadius: 8, background: "var(--sc-btn-soft,#f6ede1)", color: "var(--sc-btn,#f4a03f)", display: "grid", placeItems: "center", fontSize: 15, flex: "0 0 auto" }}>{icon}</span>
      <span style={{ flex: 1, fontWeight: 600, fontSize: 14 }}>{label}</span>
      <span style={{ color: "var(--sc-text-faint)" }}>›</span>
    </div>
  );
  return href ? <Link href={href} style={{ textDecoration: "none", color: "var(--sc-text)" }}>{cuerpo}</Link>
    : <div onClick={onClick} role="button">{cuerpo}</div>;
}

// Grupo de píldoras-filtro (estatus / prioridad / despacho).
function GrupoFiltro({ label, valor, opciones, onSel }: { label: string; valor: string; opciones: { k: string; t: string; cls?: string }[]; onSel: (k: string) => void }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: "var(--sc-text-soft)", marginBottom: 6 }}>{label}</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {opciones.map((o) => (
          <button key={o.k} type="button" onClick={() => onSel(o.k)}
            className={o.cls ? `cad-pill ${o.cls}` : undefined}
            style={{ padding: "5px 12px", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
              border: valor === o.k ? "1.5px solid var(--sc-btn,#f4a03f)" : "1px solid var(--sc-card-line)",
              background: !o.cls ? (valor === o.k ? "var(--sc-btn,#f4a03f)" : "transparent") : undefined,
              color: !o.cls ? (valor === o.k ? "#fff" : "var(--sc-text)") : undefined,
              opacity: valor === o.k ? 1 : 0.85 }}>
            {o.t}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function CentralDespachoPage() {
  const router = useRouter();
  const [llamadas, setLlamadas] = useState<LlamadaCad[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [limite, setLimite] = useState(50);
  const [enVivo, setEnVivo] = useState<Set<string>>(new Set());
  const [unidades, setUnidades] = useState<Record<string, UnidadDespacho>>({});
  const [ahora, setAhora] = useState<Date | null>(null); // reloj vivo (null en SSR -> sin mismatch)

  // Filtros
  const [fEstatus, setFEstatus] = useState("");
  const [fPrioridad, setFPrioridad] = useState("");
  const [fDespacho, setFDespacho] = useState("");
  const [fDesde, setFDesde] = useState("");
  const [fHasta, setFHasta] = useState("");
  const [busca, setBusca] = useState("");

  // Formulario de registro rápido
  const [tipo, setTipo] = useState("");
  const [prioridad, setPrioridad] = useState("media");
  const [reportante, setReportante] = useState("");
  const [telefono, setTelefono] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [direccion, setDireccion] = useState("");
  const [latitud, setLatitud] = useState("");
  const [longitud, setLongitud] = useState("");
  const [sitios, setSitios] = useState<any[]>([]);
  const [sitioId, setSitioId] = useState("");
  const [despacharYa, setDespacharYa] = useState(false);
  const [reportesUbic, setReportesUbic] = useState<RegistroSimilar[]>([]);
  const formRef = useRef<HTMLFormElement | null>(null);

  useEffect(() => { const t = setInterval(() => setAhora(new Date()), 1000); setAhora(new Date()); return () => clearInterval(t); }, []);

  useEffect(() => {
    supabase.from("sitios").select("id, nombre, latitud, longitud, cliente:clientes(razon_social)")
      .eq("estatus", "activo").order("nombre").then(({ data }) => setSitios((data as any[]) ?? []));
  }, []);

  useEffect(() => {
    const lat = latitud ? Number(latitud) : null, lng = longitud ? Number(longitud) : null;
    if (lat == null && direccion.trim().length < 6) { setReportesUbic([]); return; }
    const t = setTimeout(async () => setReportesUbic(await reportesCercanos({ lat, lng, direccion })), 500);
    return () => clearTimeout(t);
  }, [direccion, latitud, longitud]);

  async function cargarLlamadas() {
    setCargando(true);
    const { data, error } = await supabase.from("llamadas_cad").select("*").order("fecha_recepcion", { ascending: false });
    if (error) setError(error.message);
    else {
      setLlamadas(data as LlamadaCad[]);
      supabase.rpc("rpc_registrar_bitacora", { p_tipo_accion: "CONSULTAR", p_entidad_tipo: "llamadas_cad", p_entidad_id: null, p_modulo: "cad" }).then(() => undefined);
    }
    setCargando(false);
  }
  useEffect(() => { cargarLlamadas(); /* eslint-disable-next-line */ }, []);

  useEffect(() => {
    const cargarVivo = async () => {
      const { data } = await supabase.from("transmisiones").select("llamada_id").eq("estatus", "activo").eq("estado", "en_vivo");
      setEnVivo(new Set(((data as any[]) ?? []).map((r) => r.llamada_id).filter(Boolean)));
    };
    cargarVivo();
    const canal = supabase.channel("cad-lista-tx").on("postgres_changes", { event: "*", schema: "public", table: "transmisiones" }, cargarVivo).subscribe();
    return () => { supabase.removeChannel(canal); };
  }, []);

  useEffect(() => {
    const cargarUnidades = () => unidadesPorLlamada().then(setUnidades);
    cargarUnidades();
    const canal = supabase.channel("cad-lista-desp").on("postgres_changes", { event: "*", schema: "public", table: "despachos" }, cargarUnidades).subscribe();
    return () => { supabase.removeChannel(canal); };
  }, []);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const hasta = fHasta ? new Date(fHasta + "T23:59:59").toISOString() : null;
    const desde = fDesde ? new Date(fDesde + "T00:00:00").toISOString() : null;
    return llamadas.filter((l) =>
      (!fEstatus || l.estatus === fEstatus) &&
      (!fPrioridad || l.prioridad === fPrioridad) &&
      (!fDespacho || l.estado_despacho === fDespacho) &&
      (!desde || l.fecha_recepcion >= desde) &&
      (!hasta || l.fecha_recepcion <= hasta) &&
      (!q || `${l.folio ?? ""} ${l.tipo ?? ""} ${l.direccion ?? ""} ${l.reportante ?? ""} ${unidades[l.id]?.numero ?? ""} ${unidades[l.id]?.oficial ?? ""}`.toLowerCase().includes(q))
    );
  }, [llamadas, fEstatus, fPrioridad, fDespacho, fDesde, fHasta, busca, unidades]);
  const visibles = useMemo(() => filtradas.slice(0, limite), [filtradas, limite]);

  // KPIs
  const kpis = useMemo(() => {
    const hoy = llamadas.filter((l) => esHoy(l.fecha_recepcion));
    const enAtencion = llamadas.filter((l) => l.estatus === "activo" && l.estado_despacho === "en_atencion");
    const resueltosHoy = hoy.filter((l) => l.estado_despacho === "resuelta" || l.estatus === "cerrado");
    const criticos = llamadas.filter((l) => l.prioridad === "alta" && l.estatus === "activo" && l.estado_despacho !== "resuelta");
    // Tiempo prom. de atención (recepción -> cierre) de los cerrados hoy.
    const cerrados = hoy.filter((l) => l.fecha_cierre);
    const prom = cerrados.length
      ? cerrados.reduce((a, l) => a + (new Date(l.fecha_cierre as string).getTime() - new Date(l.fecha_recepcion).getTime()), 0) / cerrados.length
      : null;
    const total = llamadas.length || 1;
    return {
      hoy: hoy.length, hoySerie: serieHoraria(llamadas, () => true),
      enAtencion: enAtencion.length, enAtSerie: serieHoraria(llamadas, (l) => l.estado_despacho === "en_atencion"),
      resueltos: resueltosHoy.length, resSerie: serieHoraria(llamadas, (l) => l.estado_despacho === "resuelta" || l.estatus === "cerrado"),
      prom, promSerie: cerrados.slice(0, 15).reverse().map((l) => (new Date(l.fecha_cierre as string).getTime() - new Date(l.fecha_recepcion).getTime()) / 60000),
      criticos: criticos.length, critSerie: serieHoraria(llamadas, (l) => l.prioridad === "alta"),
      pctAt: Math.round((enAtencion.length / total) * 100), pctRes: Math.round((resueltosHoy.length / Math.max(hoy.length, 1)) * 100),
    };
  }, [llamadas]);

  function mapaHref(): string {
    const p = new URLSearchParams();
    if (fEstatus) p.set("estatus", fEstatus);
    if (fPrioridad) p.set("prioridad", fPrioridad);
    if (fDespacho) p.set("despacho", fDespacho);
    const qs = p.toString();
    return qs ? `/cad/mapa?${qs}` : "/cad/mapa";
  }
  function limpiarFiltros() { setFEstatus(""); setFPrioridad(""); setFDespacho(""); setFDesde(""); setFHasta(""); setBusca(""); }

  async function agregarLlamada(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!sitioId) { setError("Elige el sitio donde ocurrió la incidencia."); return; }
    if (telefono && telefono.length !== 10) { setError("El teléfono debe tener 10 dígitos."); return; }
    const s = sitios.find((x) => x.id === sitioId);
    const { data, error } = await supabase.from("llamadas_cad").insert({
      tipo: tipo || null, prioridad, reportante: reportante || null, telefono: telefono || null,
      descripcion: descripcion || null, sitio_id: sitioId, direccion: direccion.trim() || s?.nombre || "Sitio",
      latitud: latitud ? Number(latitud) : (s?.latitud ?? null), longitud: longitud ? Number(longitud) : (s?.longitud ?? null),
      datos_adicionales: { origen: "central_operador" },
    }).select("id").single();
    if (error) { setError(error.message); return; }
    // "Crear y despachar de inmediato" -> abre el detalle para despachar;
    // si no, se queda en la consola y refresca la lista.
    if (despacharYa) { router.push(`/cad/${(data as any).id}`); return; }
    setTipo(""); setPrioridad("media"); setReportante(""); setTelefono(""); setDescripcion("");
    setSitioId(""); setDireccion(""); setLatitud(""); setLongitud("");
    cargarLlamadas();
  }

  const card: React.CSSProperties = { background: "var(--sc-content)", border: "1px solid var(--sc-card-line)", borderRadius: 14, boxShadow: "0 1px 3px #0000000d" };
  const lbl: React.CSSProperties = { fontSize: 12.5, fontWeight: 600, color: "var(--sc-text-soft)", display: "block", marginBottom: 5 };
  const inp: React.CSSProperties = { width: "100%", padding: "9px 11px", borderRadius: 9, border: "1px solid var(--sc-card-line)", background: "var(--sc-content)", color: "var(--sc-text)", fontSize: 14 };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Cabecera */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0, display: "flex", alignItems: "center", gap: 10 }}>CAD / Despacho</h2>
          <div style={{ color: "var(--sc-text-soft)", fontSize: 13 }}>Atención de incidencias</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <div style={{ position: "relative" }}>
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por folio, ubicación, reportante…"
              style={{ ...inp, width: 320, maxWidth: "60vw", paddingLeft: 32 }} />
            <span style={{ position: "absolute", left: 11, top: 9, color: "var(--sc-text-faint)" }}>🔍</span>
          </div>
          <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
            <div style={{ fontWeight: 800, fontSize: 16 }}>{ahora ? ahora.toLocaleTimeString() : "—"}</div>
            <div style={{ fontSize: 12, color: "var(--sc-text-soft)" }}>{ahora ? ahora.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" }) : ""}</div>
          </div>
        </div>
      </div>

      {/* Registro rápido + Acciones rápidas */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 300px", gap: 16, alignItems: "start" }}>
        <form ref={formRef} onSubmit={agregarLlamada} style={{ ...card, padding: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
            <span style={{ color: "var(--sc-btn,#f4a03f)", fontSize: 18 }}>⚡</span>
            <b style={{ fontSize: 16 }}>Registro rápido de incidente</b>
          </div>
          <div style={{ color: "var(--sc-text-soft)", fontSize: 13, marginBottom: 14 }}>Completa los datos mínimos para crear y despachar un incidente</div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
            <div>
              <label style={lbl}>Tipo de incidente <span style={{ color: "#e23b53" }}>*</span></label>
              <CatalogoSelect categoria="tipo_incidencia" value={tipo} onChange={setTipo} placeholder="— Seleccionar tipo —" />
            </div>
            <div>
              <label style={lbl}>Prioridad</label>
              <select value={prioridad} onChange={(e) => setPrioridad(e.target.value)} style={inp}>
                <option value="alta">Alta</option>
                <option value="media">Media</option>
                <option value="baja">Baja</option>
              </select>
            </div>
            <div>
              <label style={lbl}>Reportante</label>
              <input placeholder="Nombre del reportante" value={reportante} onChange={(e) => setReportante(e.target.value)} maxLength={45} style={inp} />
            </div>
            <div>
              <label style={lbl}>Teléfono / Radio</label>
              <input placeholder="Teléfono o canal" value={telefono} onChange={(e) => setTelefono(e.target.value.replace(/\D/g, "").slice(0, 10))} inputMode="numeric" maxLength={10} style={inp} />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
            <div>
              <label style={lbl}>Sitio donde ocurrió <span style={{ color: "#e23b53" }}>*</span></label>
              <select value={sitioId} required style={inp} onChange={(e) => {
                const id = e.target.value; setSitioId(id);
                const s = sitios.find((x) => x.id === id);
                if (s?.latitud != null && s?.longitud != null) { setLatitud(String(s.latitud)); setLongitud(String(s.longitud)); } else { setLatitud(""); setLongitud(""); }
                setDireccion(s?.nombre ?? "");
              }}>
                <option value="">— Seleccionar sitio —</option>
                {sitios.map((s) => <option key={s.id} value={s.id}>{s.nombre}{s.cliente?.razon_social ? ` · ${s.cliente.razon_social}` : ""}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Referencia dentro del sitio (opcional)</label>
              <input placeholder="Torre A, Piso 2, Oficina 203, etc." value={direccion} onChange={(e) => setDireccion(e.target.value)} style={inp} />
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <label style={lbl}>Descripción breve <span style={{ color: "#e23b53" }}>*</span></label>
            <input placeholder="Describe brevemente lo ocurrido…" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} style={inp} />
          </div>

          <AvisoDuplicados titulo="Este sitio ya tiene incidencias previas cercanas" registros={reportesUbic} />

          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 16, marginTop: 16, flexWrap: "wrap" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, cursor: "pointer", color: "var(--sc-text-soft)" }}>
              <input type="checkbox" checked={despacharYa} onChange={(e) => setDespacharYa(e.target.checked)} />
              Crear y despachar de inmediato
            </label>
            <button type="submit" style={{ background: "var(--sc-btn,#f4a03f)", color: "#fff", border: "none", borderRadius: 10, padding: "11px 22px", fontWeight: 700, fontSize: 14.5, cursor: "pointer" }}>
              Registrar incidente ➤
            </button>
          </div>
          {error && <p style={{ color: "#e23b53", marginTop: 10, fontSize: 13 }}>{error}</p>}
        </form>

        {/* Acciones rápidas (dominio SGS) */}
        <div style={{ ...card, padding: "14px 16px" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--sc-text-soft)", letterSpacing: ".03em", textTransform: "uppercase", marginBottom: 6 }}>Acciones rápidas</div>
          <AccionRapida icon="＋" label="Nuevo incidente" onClick={() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })} />
          <AccionRapida icon="✅" label="Nueva tarea" href="/tareas" />
          <AccionRapida icon="🧭" label="Nuevo rondín" href="/rondines" />
          <AccionRapida icon="📷" label="Videovigilancia" href="/videovigilancia" />
          <AccionRapida icon="🗺️" label="Mapa operacional" href="/mapa-operacional" />
          <AccionRapida icon="📋" label="Nuevo registro en bitácora" href="/bitacora" />
        </div>
      </div>

      {/* Filtros de búsqueda */}
      <div style={{ ...card, padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <span style={{ color: "var(--sc-text-soft)" }}>▽</span><b>Filtros de búsqueda</b>
        </div>
        <div style={{ display: "flex", gap: 22, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 12, color: "var(--sc-text-soft)", marginBottom: 6 }}>Fechas</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="date" value={fDesde} onChange={(e) => setFDesde(e.target.value)} style={{ ...inp, width: 150 }} />
              <span style={{ color: "var(--sc-text-faint)" }}>—</span>
              <input type="date" value={fHasta} onChange={(e) => setFHasta(e.target.value)} style={{ ...inp, width: 150 }} />
            </div>
          </div>
          <GrupoFiltro label="Estatus" valor={fEstatus} onSel={setFEstatus} opciones={[{ k: "", t: "Todos" }, { k: "activo", t: "Activo", cls: "est-activo" }, { k: "cerrado", t: "Cerrado", cls: "est-cerrado" }, { k: "cancelado", t: "Cancelado", cls: "est-cancelado" }]} />
          <GrupoFiltro label="Prioridad" valor={fPrioridad} onSel={setFPrioridad} opciones={[{ k: "", t: "Todas" }, { k: "alta", t: "Alta", cls: "prio-alta" }, { k: "media", t: "Media", cls: "prio-media" }, { k: "baja", t: "Baja", cls: "prio-baja" }]} />
          <GrupoFiltro label="Despacho" valor={fDespacho} onSel={setFDespacho} opciones={[{ k: "", t: "Todos" }, { k: "recibida", t: "Recibida", cls: "desp-recibida" }, { k: "despachada", t: "Despachado", cls: "desp-despachada" }, { k: "en_atencion", t: "En atención", cls: "desp-en_atencion" }, { k: "resuelta", t: "Resuelta", cls: "desp-resuelta" }]} />
          <div style={{ marginLeft: "auto", display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 8 }}>
            <button type="button" onClick={limpiarFiltros} style={{ padding: "8px 14px", borderRadius: 9, border: "1px solid var(--sc-card-line)", background: "transparent", color: "var(--sc-text-soft)", cursor: "pointer", fontSize: 13 }}>🗑 Limpiar filtros</button>
          </div>
        </div>
      </div>

      {/* Incidencias y alertas */}
      <div style={{ ...card, padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
          <div>
            <b style={{ fontSize: 16 }}>Incidencias y alertas</b>
            <div style={{ fontSize: 12.5, color: "var(--sc-text-soft)" }}>Mostrando {visibles.length} de {filtradas.length}{filtradas.length !== llamadas.length ? ` (filtrados de ${llamadas.length})` : ""}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <a href={mapaHref()} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "9px 14px", borderRadius: 10, border: "1px solid var(--sc-btn,#f4a03f)", color: "var(--sc-btn,#f4a03f)", fontWeight: 700, fontSize: 13.5, textDecoration: "none" }}>🗺️ Ver en mapa (según filtros)</a>
            <button type="button" onClick={cargarLlamadas} title="Actualizar" style={{ border: "1px solid var(--sc-card-line)", background: "transparent", color: "var(--sc-text-soft)", borderRadius: 9, padding: "8px 10px", cursor: "pointer" }}>⟳</button>
            <label style={{ fontSize: 12.5, color: "var(--sc-text-soft)", display: "flex", alignItems: "center", gap: 6 }}>
              Registros por página:
              <select value={limite} onChange={(e) => setLimite(Number(e.target.value))} style={{ ...inp, width: 70, padding: "6px 8px" }}>
                {[25, 50, 100, 200].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
          </div>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--sc-text-soft)", fontSize: 11.5, textTransform: "uppercase", letterSpacing: ".03em" }}>
                {["Folio", "Tipo de incidente", "Prioridad", "Ubicación", "Reportante", "Despacho", "Unidad asignada", "Recepción", "Estatus", "Tiempo transcurrido", "Acciones"].map((h) => (
                  <th key={h} style={{ padding: "10px 12px", borderBottom: "1px solid var(--sc-card-line)", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cargando ? (
                <tr><td colSpan={11} style={{ padding: 24, textAlign: "center", color: "var(--sc-text-soft)" }}>Cargando…</td></tr>
              ) : visibles.length === 0 ? (
                <tr><td colSpan={11} style={{ padding: 24, textAlign: "center", color: "var(--sc-text-soft)" }}>Sin incidencias con estos filtros.</td></tr>
              ) : visibles.map((l) => {
                const pr = PRIO[l.prioridad] ?? { p: "P?", lbl: l.prioridad, col: "#607d8b" };
                const u = unidades[l.id];
                return (
                  <tr key={l.id} style={{ borderBottom: "1px solid var(--sc-card-line)", borderLeft: l.prioridad === "alta" ? "3px solid #e23b53" : "3px solid transparent" }}>
                    <td style={{ padding: "12px" }}>
                      <Link href={`/cad/${l.id}`} style={{ fontWeight: 600, color: "var(--sc-text)", textDecoration: "none" }}>{l.folio ?? "s/folio"}</Link>
                      <div><span style={{ background: pr.col, color: "#fff", fontSize: 10, fontWeight: 800, borderRadius: 5, padding: "1px 5px" }}>{pr.p}</span>
                        {enVivo.has(l.id) && <span style={{ marginLeft: 6, color: "#e11d48", fontSize: 10.5, fontWeight: 800 }}>🔴 EN VIVO</span>}</div>
                    </td>
                    <td style={{ padding: "12px" }}><span style={{ marginRight: 7 }}>{iconoTipo(l.tipo)}</span><b>{l.tipo ?? "—"}</b>{l.descripcion && <div style={{ fontSize: 12, color: "var(--sc-text-soft)" }}>{l.descripcion}</div>}</td>
                    <td style={{ padding: "12px" }}><span className={`cad-pill prio-${l.prioridad}`}>{pr.lbl}</span></td>
                    <td style={{ padding: "12px", minWidth: 170 }}>{l.direccion ?? "—"}
                      {l.latitud != null && <div><a href={mapaHref()} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "var(--sc-btn,#f4a03f)", textDecoration: "none" }}>Ver en mapa</a></div>}</td>
                    <td style={{ padding: "12px" }}>{l.reportante ?? "—"}{l.telefono && <div style={{ fontSize: 12, color: "var(--sc-text-soft)" }}>📞 {l.telefono}</div>}</td>
                    <td style={{ padding: "12px" }}><span className={`cad-pill desp-${l.estado_despacho}`}>{DESP_LABEL[l.estado_despacho] ?? l.estado_despacho}</span></td>
                    <td style={{ padding: "12px" }}>{u ? (
                      <span title={u.oficial}><b>{u.numero ? `#${u.numero}` : "unidad"}</b> <span style={{ color: "#fff", fontSize: 10.5, fontWeight: 700, borderRadius: 5, padding: "1px 6px", background: DESPACHO_COLOR[u.estado] ?? "#607d8b" }}>{DESPACHO_LABEL[u.estado] ?? u.estado}</span></span>
                    ) : <span style={{ color: "var(--sc-text-faint)" }}>Sin asignar</span>}</td>
                    <td style={{ padding: "12px", whiteSpace: "nowrap", color: "var(--sc-text-soft)" }}>{new Date(l.fecha_recepcion).toLocaleString("es-MX", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}<div style={{ fontSize: 11.5 }}>{new Date(l.fecha_recepcion).toLocaleDateString("es-MX")}</div></td>
                    <td style={{ padding: "12px" }}><span className={`cad-pill est-${l.estatus}`}>{l.estatus}</span></td>
                    <td style={{ padding: "12px", fontWeight: 700, fontVariantNumeric: "tabular-nums", color: l.estatus === "activo" ? (l.prioridad === "alta" ? "#e23b53" : "var(--sc-text)") : "var(--sc-text-faint)" }}>{ahora ? transcurrido(l.fecha_recepcion, ahora) : "—"}</td>
                    <td style={{ padding: "12px", whiteSpace: "nowrap" }}><Link href={`/cad/${l.id}`} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid var(--sc-card-line)", color: "var(--sc-text)", textDecoration: "none", fontSize: 12.5, fontWeight: 600 }}>Ver detalle</Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* KPIs con mini-gráficas */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 }}>
        {[
          { t: "Incidentes hoy", v: String(kpis.hoy), s: "Total registrados", c: "#e23b53", d: kpis.hoySerie },
          { t: "En atención", v: String(kpis.enAtencion), s: `${kpis.pctAt}% del total`, c: "#d98a2b", d: kpis.enAtSerie },
          { t: "Resueltos hoy", v: String(kpis.resueltos), s: `${kpis.pctRes}% de hoy`, c: "#1f9d5c", d: kpis.resSerie },
          { t: "Tiempo prom. de atención", v: kpis.prom != null ? minSeg(kpis.prom) : "—", s: "min · objetivo 05:00", c: "#2f6bff", d: kpis.promSerie },
          { t: "Incidentes críticos activos", v: String(kpis.criticos), s: "Requieren atención inmediata", c: "#e23b53", d: kpis.critSerie },
        ].map((k, i) => (
          <div key={i} style={{ ...card, padding: 14 }}>
            <div style={{ fontSize: 12.5, color: "var(--sc-text-soft)" }}>{k.t}</div>
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 8, marginTop: 8 }}>
              <div>
                <div style={{ fontSize: 30, fontWeight: 800, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{k.v}</div>
                <div style={{ fontSize: 11, color: "var(--sc-text-faint)", marginTop: 5 }}>{k.s}</div>
              </div>
              <Sparkline data={k.d} color={k.c} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
