"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { primeraFoto } from "@/lib/fotos";
import { computeReporteSla } from "@/lib/sla";
import MapaReportes, { type ReporteMapa } from "./MapaReportes";

interface DefInd { key: string; label: string; href: string; tabla: string; fecha: string; color: string; ico: string; mod?: (q: any) => any; }
// Indicadores del dominio SGS (seguridad privada).
const INDS: DefInd[] = [
  { key: "emergencias", label: "Alertas de pánico (móvil)", href: "/cad", tabla: "llamadas_cad", fecha: "fecha_recepcion", color: "c-red", ico: "🚨", mod: (q: any) => q.eq("datos_adicionales->>origen", "panico_movil") },
  { key: "incidentes", label: "Incidentes levantados", href: "/cad", tabla: "llamadas_cad", fecha: "fecha_recepcion", color: "c-amber", ico: "📝", mod: (q: any) => q.eq("datos_adicionales->>origen", "incidente_movil") },
  { key: "rondines", label: "Rondines registrados", href: "/rondines", tabla: "rondines", fecha: "creado_en", color: "c-blue", ico: "🔁" },
  { key: "fuera_rango", label: "Rondines fuera de rango", href: "/rondines", tabla: "rondines", fecha: "creado_en", color: "c-red", ico: "⚠", mod: (q: any) => q.eq("dentro_geocerca", false) },
  { key: "tareas", label: "Tareas nuevas", href: "/tareas", tabla: "tareas", fecha: "creado_en", color: "c-teal", ico: "✔" },
  { key: "evidencias", label: "Evidencias nuevas", href: "/evidencias", tabla: "evidencias", fecha: "creado_en", color: "c-purple", ico: "◧" },
  { key: "accesos", label: "Accesos (mes)", href: "/accesos", tabla: "accesos", fecha: "fecha_evento", color: "c-teal", ico: "🚧" },
  { key: "accesos_rechazados", label: "Accesos rechazados", href: "/accesos", tabla: "accesos", fecha: "fecha_evento", color: "c-red", ico: "⛔", mod: (q: any) => q.eq("resultado", "rechazado") },
  { key: "citas", label: "Citas (mes)", href: "/citas", tabla: "citas", fecha: "creado_en", color: "c-blue", ico: "📅" },
];

interface ItemReciente { id: string; titulo: string; sub: string; href: string; foto: string | null; iniciales: string; gradiente: string; }
interface Dato { label: string; valor: number; }
interface Atencion { nivel: "alto" | "medio"; texto: string; href: string; }

const PRIO_COLOR: Record<string, string> = { alta: "#d32f2f", media: "#f9a825", baja: "#2e7d32" };

function inicioSemana(): string {
  const d = new Date();
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}
function inicioMes(): string { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString(); }
function inicioHoy(): string { const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString(); }
const dkey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function serieUltimosDias(fechas: string[], n = 14): Dato[] {
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const idx: Record<string, number> = {}; const out: Dato[] = [];
  for (let i = n - 1; i >= 0; i--) { const d = new Date(hoy); d.setDate(hoy.getDate() - i); idx[dkey(d)] = out.length; out.push({ label: `${d.getDate()}/${d.getMonth() + 1}`, valor: 0 }); }
  for (const f of fechas) { const k = idx[dkey(new Date(f))]; if (k != null) out[k].valor++; }
  return out;
}
function fmtDur(min: number | null): string {
  if (min == null) return "—";
  const m = Math.floor(min); const s = Math.round((min - m) * 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")} min`;
}
const nomPersona = (p: any) => (p ? `${p.nombre ?? ""} ${p.apellido_paterno ?? ""}`.trim() : "Guardia");

async function contar(ind: DefInd, desde: string): Promise<number | null> {
  let q = supabase.from(ind.tabla).select("*", { count: "exact", head: true }).eq("estatus", "activo").gte(ind.fecha, desde);
  if (ind.mod) q = ind.mod(q);
  const { count, error } = await q;
  return error ? null : count ?? 0;
}
function iniciales(nombre: string, def: string): string {
  return nombre.split(" ").map((s) => s[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || def;
}
function Columnas({ titulo, datos, color }: { titulo: string; datos: Dato[]; color: string }) {
  const max = Math.max(1, ...datos.map((d) => d.valor));
  return (
    <div className="chart-card">
      <div className="chart-title">{titulo}</div>
      <div className="chart-cols">
        {datos.map((d) => (
          <div key={d.label} className="chart-col">
            <div className="chart-col-bar-wrap"><div className="chart-col-bar" style={{ height: `${(d.valor / max) * 100}%`, background: color }} title={`${d.valor}`} /></div>
            <div className="chart-col-val">{d.valor}</div>
            <div className="chart-col-lbl">{d.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Tarjeta KPI simple (número + etiqueta), con color y enlace.
function Kpi({ ico, label, valor, sufijo, color, href }: { ico: string; label: string; valor: React.ReactNode; sufijo?: string; color: string; href: string }) {
  return (
    <Link href={href} className="dcard dkpi">
      <div className="k-top"><span>{ico}</span> {label}</div>
      <div className="rows"><div className="row"><span className={`num ${color}`}>{valor}</span>{sufijo ? <span className="lbl">{sufijo}</span> : null}</div></div>
    </Link>
  );
}

export default function Panel({ correo }: { correo?: string | null }) {
  const [tab, setTab] = useState<"operacion" | "direccion">("operacion");
  const [sem, setSem] = useState<Record<string, number | null>>({});
  const [mes, setMes] = useState<Record<string, number | null>>({});
  const [guardias, setGuardias] = useState<ItemReciente[]>([]);
  const [evidencias, setEvidencias] = useState<ItemReciente[]>([]);
  const [tareas, setTareas] = useState<ItemReciente[]>([]);
  const [rondines, setRondines] = useState<ItemReciente[]>([]);
  const [reportes, setReportes] = useState<ReporteMapa[]>([]);
  // Tanda A
  const [puestos, setPuestos] = useState<{ cub: number; prog: number }>({ cub: 0, prog: 0 });
  const [guardiasProg, setGuardiasProg] = useState<number | null>(null);
  const [guardiasPres, setGuardiasPres] = useState<number | null>(null);
  const [guardiasLinea, setGuardiasLinea] = useState<number | null>(null);
  const [personasDentro, setPersonasDentro] = useState<number | null>(null);
  const [vehiculosDentro, setVehiculosDentro] = useState<number | null>(null);
  const [incAbiertos, setIncAbiertos] = useState<number | null>(null);
  const [sev, setSev] = useState<{ alta: number; media: number; baja: number }>({ alta: 0, media: 0, baja: 0 });
  const [tend, setTend] = useState<{ actual: number; previa: number }>({ actual: 0, previa: 0 });
  const [tResp, setTResp] = useState<number | null>(null);
  const [atencion, setAtencion] = useState<Atencion[]>([]);
  const [indice, setIndice] = useState<number | null>(null);
  const [incDia, setIncDia] = useState<Dato[]>([]);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);

  const cargar = useCallback(async () => {
      setRefrescando(true);
      const desdeSem = inicioSemana();
      const desdeMes = inicioMes();
      const desdeHoy = inicioHoy();
      const [semVals, mesVals] = await Promise.all([
        Promise.all(INDS.map(async (i) => [i.key, await contar(i, desdeSem)] as const)),
        Promise.all(INDS.map(async (i) => [i.key, await contar(i, desdeMes)] as const)),
      ]);
      setSem(Object.fromEntries(semVals));
      setMes(Object.fromEntries(mesVals));

      // --- Galerías (recientes) ---
      const { data: gs } = await supabase.from("personal")
        .select("id, categoria, creado_en, persona:personas(nombre, apellido_paterno, fotografias)")
        .eq("estatus", "activo").order("creado_en", { ascending: false }).limit(3);
      setGuardias(((gs as any[]) ?? []).map((g) => {
        const nom = g.persona ? `${g.persona.nombre ?? ""} ${g.persona.apellido_paterno ?? ""}`.trim() : "Guardia";
        return { id: g.id, titulo: nom || "Guardia", sub: g.categoria ?? "Guardia", href: `/personal/${g.id}`, foto: primeraFoto(g.persona?.fotografias), iniciales: iniciales(nom, "G"), gradiente: "linear-gradient(135deg,#1f6feb,#0b3d8f)" };
      }));
      const { data: ev } = await supabase.from("evidencias")
        .select("id, folio, tipo, descripcion, fotografias, creado_en")
        .eq("estatus", "activo").order("creado_en", { ascending: false }).limit(3);
      setEvidencias(((ev as any[]) ?? []).map((e) => ({ id: e.id, titulo: e.tipo ?? e.descripcion ?? "Evidencia", sub: e.folio ?? new Date(e.creado_en).toLocaleDateString(), href: `/evidencias/${e.id}`, foto: primeraFoto(e.fotografias), iniciales: "◧", gradiente: "linear-gradient(135deg,#7a3fbf,#4a2374)" })));
      const { data: ts } = await supabase.from("tareas")
        .select("id, folio, tipo, asunto, motivo, prioridad, fotografias, creado_en")
        .eq("estatus", "activo").order("creado_en", { ascending: false }).limit(3);
      setTareas(((ts as any[]) ?? []).map((t) => ({ id: t.id, titulo: t.asunto ?? t.tipo ?? t.motivo ?? "Tarea", sub: `${t.folio ?? ""}${t.prioridad ? ` · ${t.prioridad}` : ""}`.trim() || "—", href: `/tareas/${t.id}`, foto: primeraFoto(t.fotografias), iniciales: "✔", gradiente: "linear-gradient(135deg,#0e8f86,#0b5c56)" })));
      const { data: ro } = await supabase.from("rondines")
        .select("id, novedad, creado_en, punto:puntos_control(nombre, sitio:sitios(nombre))")
        .eq("estatus", "activo").order("creado_en", { ascending: false }).limit(3);
      setRondines(((ro as any[]) ?? []).map((r) => {
        const nov = r.novedad && r.novedad.trim() && r.novedad.trim().toLowerCase() !== "sin novedad";
        const punto = r.punto?.nombre ? `${r.punto.nombre}${r.punto.sitio?.nombre ? ` · ${r.punto.sitio.nombre}` : ""}` : "Punto de control";
        return { id: r.id, titulo: nov ? r.novedad : "Sin novedad", sub: `${punto} · ${new Date(r.creado_en).toLocaleString()}`, href: `/rondines`, foto: null, iniciales: nov ? "⚠" : "🔁", gradiente: nov ? "linear-gradient(135deg,#c62828,#7f1616)" : "linear-gradient(135deg,#546e7a,#37474f)" };
      }));

      // --- Mapa: emergencias / despachos abiertos ---
      const { data: cad } = await supabase.from("llamadas_cad")
        .select("id, folio, tipo, direccion, prioridad, latitud, longitud, fecha_recepcion")
        .eq("estatus", "activo").in("estado_despacho", ["recibida", "despachada", "en_atencion"])
        .not("latitud", "is", null).not("longitud", "is", null)
        .order("fecha_recepcion", { ascending: false }).limit(60);
      setReportes(((cad as any[]) ?? []).map((c) => ({ id: c.id, folio: c.folio, titulo: `${c.tipo ?? "Reporte"} · prioridad ${c.prioridad ?? "—"}${c.direccion ? `<br>${c.direccion}` : ""}`, latitud: c.latitud, longitud: c.longitud, href: `/cad/${c.id}`, color: PRIO_COLOR[c.prioridad] ?? "#546e7a" })));

      // --- Cobertura de puestos + presentes (turnos activos hoy vs GPS en línea) ---
      const hoy = new Date().toISOString().slice(0, 10);
      const { data: cfg } = await supabase.from("config_sistema").select("gps_ventana_seg").eq("id", true).maybeSingle();
      const ventana = Number((cfg as any)?.gps_ventana_seg ?? 180);
      const cutoff = new Date(Date.now() - ventana * 1000).toISOString();
      const { data: ulg } = await supabase.from("ubicaciones_guardias").select("personal_id").eq("en_linea", true).gt("actualizado_en", cutoff);
      const enLinea = new Set(((ulg as any[]) ?? []).map((x) => x.personal_id).filter(Boolean));
      setGuardiasLinea(enLinea.size);

      const { data: tHoy } = await supabase.from("turnos").select("id").eq("estatus", "activo").eq("fecha", hoy);
      const turnoIds = ((tHoy as any[]) ?? []).map((t) => t.id);
      const sinCobertura: string[] = [];
      if (turnoIds.length) {
        const { data: tg } = await supabase.from("turno_guardias").select("personal_id, sitio_id, sitio:sitios(nombre)").in("turno_id", turnoIds);
        const rows = (tg as any[]) ?? [];
        const prog = new Set(rows.map((r) => r.personal_id).filter(Boolean));
        const sitiosMap = new Map<string, { nombre: string; cub: boolean }>();
        rows.forEach((r) => {
          if (!r.sitio_id) return;
          const cur = sitiosMap.get(r.sitio_id) ?? { nombre: r.sitio?.nombre ?? "Sitio", cub: false };
          if (enLinea.has(r.personal_id)) cur.cub = true;
          sitiosMap.set(r.sitio_id, cur);
        });
        setPuestos({ cub: [...sitiosMap.values()].filter((s) => s.cub).length, prog: sitiosMap.size });
        setGuardiasProg(prog.size);
        setGuardiasPres([...prog].filter((p) => enLinea.has(p)).length);
        [...sitiosMap.values()].filter((s) => !s.cub).forEach((s) => sinCobertura.push(s.nombre));
      } else { setPuestos({ cub: 0, prog: 0 }); setGuardiasProg(0); setGuardiasPres(0); }

      // --- Personas / vehículos dentro ---
      const { count: dentro } = await supabase.from("v_personas_dentro").select("*", { count: "exact", head: true });
      setPersonasDentro(dentro ?? 0);
      const { count: vdentro } = await supabase.from("v_vehiculos_dentro").select("*", { count: "exact", head: true });
      setVehiculosDentro(vdentro ?? 0);

      // --- Incidentes: abiertos, severidad, tendencia, tiempo de respuesta ---
      const { count: abiertos } = await supabase.from("llamadas_cad").select("*", { count: "exact", head: true })
        .eq("estatus", "activo").in("estado_despacho", ["recibida", "despachada", "en_atencion"]);
      setIncAbiertos(abiertos ?? 0);

      const { data: inSem } = await supabase.from("llamadas_cad")
        .select("prioridad, fecha_recepcion, fecha_cierre").neq("estatus", "cancelado").gte("fecha_recepcion", desdeSem);
      const filas = (inSem as any[]) ?? [];
      const s = { alta: 0, media: 0, baja: 0 };
      let sumaMin = 0, nCerr = 0;
      filas.forEach((r) => {
        if (r.prioridad === "alta") s.alta++; else if (r.prioridad === "baja") s.baja++; else s.media++;
        if (r.fecha_cierre) { sumaMin += (new Date(r.fecha_cierre).getTime() - new Date(r.fecha_recepcion).getTime()) / 60000; nCerr++; }
      });
      setSev(s);
      setTResp(nCerr ? sumaMin / nCerr : null);
      const prevIni = new Date(new Date(desdeSem).getTime() - 7 * 86400000).toISOString();
      const { count: prevN } = await supabase.from("llamadas_cad").select("*", { count: "exact", head: true })
        .neq("estatus", "cancelado").gte("fecha_recepcion", prevIni).lt("fecha_recepcion", desdeSem);
      setTend({ actual: filas.length, previa: prevN ?? 0 });

      // Incidentes por día (14 días) — origen móvil.
      const desde14 = new Date(Date.now() - 14 * 86400000).toISOString();
      const { data: incs } = await supabase.from("llamadas_cad")
        .select("fecha_recepcion").eq("estatus", "activo")
        .eq("datos_adicionales->>origen", "incidente_movil").gte("fecha_recepcion", desde14);
      setIncDia(serieUltimosDias(((incs as any[]) ?? []).map((x) => x.fecha_recepcion), 14));

      // --- "Requiere atención ahora" ---
      const feed: Atencion[] = [];
      sinCobertura.slice(0, 5).forEach((n) => feed.push({ nivel: "alto", texto: `Puesto sin cobertura: ${n}`, href: "/monitoreo" }));
      const { data: crit } = await supabase.from("llamadas_cad")
        .select("id, folio, tipo").eq("estatus", "activo").eq("prioridad", "alta")
        .in("estado_despacho", ["recibida", "despachada", "en_atencion"]).order("fecha_recepcion", { ascending: false }).limit(5);
      ((crit as any[]) ?? []).forEach((c) => feed.push({ nivel: "alto", texto: `Incidente crítico: ${c.tipo ?? "Incidencia"} (${c.folio ?? "s/folio"})`, href: `/cad/${c.id}` }));
      const { data: sal } = await supabase.from("geocerca_eventos")
        .select("id, fecha_hora, sitio:sitios(nombre), personal:personal(persona:personas(nombre, apellido_paterno))")
        .eq("tipo", "salida").gte("fecha_hora", desdeHoy).order("fecha_hora", { ascending: false }).limit(5);
      ((sal as any[]) ?? []).forEach((e) => feed.push({ nivel: "medio", texto: `Salida de zona: ${nomPersona(e.personal?.persona)}${e.sitio?.nombre ? ` · ${e.sitio.nombre}` : ""}`, href: "/monitoreo" }));
      const { data: fr } = await supabase.from("rondines")
        .select("id, punto:puntos_control(nombre, sitio:sitios(nombre))").eq("estatus", "activo").eq("dentro_geocerca", false).gte("creado_en", desdeHoy).order("creado_en", { ascending: false }).limit(5);
      ((fr as any[]) ?? []).forEach((r) => feed.push({ nivel: "medio", texto: `Rondín fuera de rango: ${r.punto?.nombre ?? "punto"}${r.punto?.sitio?.nombre ? ` · ${r.punto.sitio.nombre}` : ""}`, href: `/rondines/${r.id}` }));
      feed.sort((a, b) => (a.nivel === b.nivel ? 0 : a.nivel === "alto" ? -1 : 1));
      setAtencion(feed);

      // Índice de Cumplimiento de Seguridad (global, este mes).
      try { const rep = await computeReporteSla(null, desdeMes, new Date().toISOString()); setIndice(rep.index); } catch { setIndice(null); }

      setCargando(false);
      setRefrescando(false);
  }, []);

  useEffect(() => {
    cargar();
    const onFocus = () => cargar();
    const onVis = () => { if (document.visibilityState === "visible") cargar(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [cargar]);

  function KpiGrupo({ titulo, sufijo, datos }: { titulo: string; sufijo: string; datos: Record<string, number | null> }) {
    return (
      <>
        <div className="dash-eyebrow">{titulo}</div>
        <div className="dash-kpis una-fila">
          {INDS.map((t) => (
            <Kpi key={t.key} ico={t.ico} label={t.label} valor={cargando ? "…" : datos[t.key] ?? "—"} sufijo={sufijo} color={t.color} href={t.href} />
          ))}
        </div>
      </>
    );
  }
  function Galeria({ titulo, items, vacio }: { titulo: string; items: ItemReciente[]; vacio: string }) {
    return (
      <>
        <div className="dash-eyebrow">{titulo}</div>
        <div className="dgallery">
          {items.map((d) => (
            <Link key={d.id} href={d.href} className="gcard">
              <div className="gphoto" style={d.foto ? { backgroundImage: `url(${d.foto})` } : { background: d.gradiente }}>{d.foto ? "" : d.iniciales}</div>
              <div className="gmeta"><div className="t">{d.titulo}</div><div className="d">{d.sub}</div></div>
            </Link>
          ))}
          {!cargando && items.length === 0 && <p className="dash-sub">{vacio}</p>}
        </div>
      </>
    );
  }

  const covPct = puestos.prog ? Math.round((puestos.cub / puestos.prog) * 100) : null;
  const covColor = covPct == null ? "c-blue" : covPct >= 95 ? "c-green" : covPct >= 80 ? "c-amber" : "c-red";
  const delta = tend.actual - tend.previa;
  const deltaPct = tend.previa ? Math.round((delta / tend.previa) * 100) : null;

  return (
    <div className="contenedor">
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 className="dash-h1">Panel de operación</h1>
          <p className="dash-sub">Haz clic en cualquier tarjeta para abrir su módulo o registro.</p>
        </div>
        <button
          onClick={() => cargar()}
          disabled={cargando || refrescando}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6, cursor: refrescando ? "default" : "pointer",
            padding: "8px 14px", borderRadius: 8, border: "1px solid var(--sc-border, #d5dae2)",
            background: "var(--sc-surface, #fff)", color: "var(--sc-text, #1f2937)", fontSize: 13, fontWeight: 600,
            opacity: cargando || refrescando ? 0.6 : 1,
          }}
        >
          {refrescando ? "Actualizando…" : "↻ Actualizar"}
        </button>
      </div>

      {/* Pestañas: Central/Operación (¿qué pasa ahora?) vs Dirección/Cliente (¿se cumple?) */}
      <div style={{ display: "flex", gap: 8, margin: "14px 0 4px", borderBottom: "1px solid var(--sc-card-line, #e2e6ec)" }}>
        {([["operacion", "🛰 Central / Operación"], ["direccion", "📊 Dirección / Cliente"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            padding: "8px 16px", border: "none", cursor: "pointer", fontSize: 14, fontWeight: 700,
            background: "transparent", color: tab === k ? "#11223C" : "#8a94a6",
            borderBottom: tab === k ? "3px solid #f4a03f" : "3px solid transparent", marginBottom: -1,
          }}>{l}</button>
        ))}
      </div>

      {tab === "operacion" ? (
        <>
          <div className="dash-eyebrow">Situación ahora</div>
          <div className="dash-kpis una-fila">
            <Kpi ico="🛡" label="Cobertura de puestos" color={covColor} href="/monitoreo"
              valor={cargando ? "…" : (covPct == null ? "—" : `${covPct}%`)} sufijo={cargando ? "" : `${puestos.cub}/${puestos.prog} puestos`} />
            <Kpi ico="👮" label="Guardias presentes" color="c-green" href="/monitoreo"
              valor={cargando ? "…" : `${guardiasPres ?? 0}/${guardiasProg ?? 0}`} sufijo="en línea / programados" />
            <Kpi ico="📡" label="Guardias en línea" color="c-blue" href="/monitoreo" valor={cargando ? "…" : guardiasLinea ?? "—"} sufijo="GPS reportando" />
            <Kpi ico="🚨" label="Incidentes abiertos" color={incAbiertos ? "c-red" : "c-green"} href="/cad" valor={cargando ? "…" : incAbiertos ?? "—"} sufijo="por atender" />
            <Kpi ico="🚧" label="Personas dentro" color="c-blue" href="/accesos" valor={cargando ? "…" : personasDentro ?? "—"} sufijo="ahora" />
            <Kpi ico="🚚" label="Vehículos dentro" color="c-teal" href="/citas" valor={cargando ? "…" : vehiculosDentro ?? "—"} sufijo="ahora" />
          </div>

          <div className="dash-lower2">
            <div>
              <div className="dash-eyebrow">Lo que requiere atención ahora</div>
              <div className="mapcard">
                <div className="maplist" style={{ maxHeight: 360, overflowY: "auto" }}>
                  {!cargando && atencion.length === 0 && <p className="dash-sub" style={{ padding: "12px 16px" }}>✓ Sin alertas operativas ahora mismo.</p>}
                  {atencion.map((a, i) => (
                    <Link key={i} href={a.href}>
                      <span className="mdot" style={{ background: a.nivel === "alto" ? PRIO_COLOR.alta : PRIO_COLOR.media }}></span>
                      <span style={{ color: "var(--sc-text-soft)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.texto}</span>
                    </Link>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <div className="dash-eyebrow">Emergencias / despachos abiertos · mapa</div>
              <div className="mapcard">
                <div className="maphead">
                  <span className="t">Emergencias / despachos abiertos</span>
                  <span className="maplegend">
                    <span className="lg"><span className="mdot" style={{ background: PRIO_COLOR.alta }}></span>Alta</span>
                    <span className="lg"><span className="mdot" style={{ background: PRIO_COLOR.media }}></span>Media</span>
                    <span className="lg"><span className="mdot" style={{ background: PRIO_COLOR.baja }}></span>Baja</span>
                  </span>
                </div>
                <MapaReportes reportes={reportes} className="mapbox-dash" />
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
          {/* Índice de Cumplimiento de Seguridad (global, este mes) */}
          <div className="dash-eyebrow">Índice de cumplimiento de seguridad (este mes)</div>
          <Link href="/reporte-sla" className="dcard" style={{ display: "flex", alignItems: "center", gap: 18, padding: "16px 20px", marginBottom: 12 }}>
            <div style={{ fontSize: 44, fontWeight: 900, lineHeight: 1, color: indice == null ? "#607d8b" : indice >= 90 ? "#2e7d32" : indice >= 75 ? "#f9a825" : "#d32f2f" }}>
              {cargando ? "…" : indice ?? "—"}
            </div>
            <div>
              <div style={{ fontWeight: 700, color: "var(--sc-text, #1f2937)" }}>de 100 — cumplimiento global</div>
              <div className="dash-sub" style={{ fontSize: 12.5 }}>Combina cobertura, rondines, tiempo de respuesta e incidentes críticos. Ver reporte por cliente →</div>
            </div>
          </Link>

          {/* Incidentes por severidad + tendencia + tiempo de respuesta */}
          <div className="dash-eyebrow">Incidentes y respuesta (esta semana)</div>
          <div className="dash-kpis una-fila">
            <Kpi ico="🔴" label="Críticos / altos" color="c-red" href="/cad" valor={cargando ? "…" : sev.alta} sufijo="prioridad alta" />
            <Kpi ico="🟠" label="Medios" color="c-amber" href="/cad" valor={cargando ? "…" : sev.media} sufijo="prioridad media" />
            <Kpi ico="🟢" label="Bajos" color="c-green" href="/cad" valor={cargando ? "…" : sev.baja} sufijo="prioridad baja" />
            <Kpi ico="⏱️" label="Tiempo prom. de respuesta" color="c-blue" href="/cad" valor={cargando ? "…" : fmtDur(tResp)} sufijo="recepción → cierre" />
            <Kpi ico="📈" label="Tendencia semanal" color={delta <= 0 ? "c-green" : "c-red"} href="/cad"
              valor={cargando ? "…" : `${tend.actual}`} sufijo={cargando ? "" : (deltaPct == null ? "vs 0 previa" : `${delta <= 0 ? "↓" : "↑"} ${Math.abs(deltaPct)}% vs previa`)} />
          </div>

          <KpiGrupo titulo="Indicadores semanales (lunes a domingo)" sufijo="esta semana" datos={sem} />
          <KpiGrupo titulo="Indicadores mensuales (este mes)" sufijo="este mes" datos={mes} />

          {cargando ? (
            <p className="dash-sub">Cargando...</p>
          ) : (
            <div className="dash-charts">
              <Columnas titulo="Incidentes por día (últimos 14 días)" datos={incDia} color="#e65100" />
            </div>
          )}

          <div className="dash-lower2">
            <div>
              <Galeria titulo="Últimos 3 guardias" items={guardias} vacio="Sin guardias." />
              <Galeria titulo="Últimas 3 evidencias" items={evidencias} vacio="Sin evidencias." />
            </div>
            <div>
              <Galeria titulo="Últimas 3 tareas" items={tareas} vacio="Sin tareas." />
              <Galeria titulo="Últimos 3 rondines" items={rondines} vacio="Sin rondines." />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
