"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { primeraFoto } from "@/lib/fotos";
import MapaReportes, { type ReporteMapa } from "./MapaReportes";

interface DefInd { key: string; label: string; href: string; tabla: string; fecha: string; color: string; ico: string; mod?: (q: any) => any; }
// Indicadores del dominio SGS (seguridad privada).
const INDS: DefInd[] = [
  { key: "emergencias", label: "Emergencias / alertas", href: "/cad", tabla: "llamadas_cad", fecha: "fecha_recepcion", color: "c-red", ico: "🚨" },
  { key: "rondines", label: "Rondines registrados", href: "/rondines", tabla: "rondines", fecha: "creado_en", color: "c-blue", ico: "🔁" },
  { key: "tareas", label: "Tareas nuevas", href: "/tareas", tabla: "tareas", fecha: "creado_en", color: "c-teal", ico: "✔" },
  { key: "evidencias", label: "Evidencias nuevas", href: "/evidencias", tabla: "evidencias", fecha: "creado_en", color: "c-purple", ico: "◧" },
  { key: "turnos", label: "Turnos programados", href: "/turnos", tabla: "turnos", fecha: "creado_en", color: "c-amber", ico: "🗓" },
  { key: "sitios", label: "Sitios nuevos", href: "/sitios", tabla: "sitios", fecha: "creado_en", color: "c-green", ico: "📍" },
];

interface ItemReciente { id: string; titulo: string; sub: string; href: string; foto: string | null; iniciales: string; gradiente: string; }
interface Dato { label: string; valor: number; }
interface BitRow { usuario_id: string | null; tipo_accion: string; modulo: string | null; creado_en: string; }

const PRIO_COLOR: Record<string, string> = { alta: "#d32f2f", media: "#f9a825", baja: "#2e7d32" };
const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function inicioSemana(): string {
  const d = new Date();
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}
function inicioAnio(): string { return new Date(new Date().getFullYear(), 0, 1).toISOString(); }

async function contar(ind: DefInd, desde: string): Promise<number | null> {
  let q = supabase.from(ind.tabla).select("*", { count: "exact", head: true }).eq("estatus", "activo").gte(ind.fecha, desde);
  if (ind.mod) q = ind.mod(q);
  const { count, error } = await q;
  return error ? null : count ?? 0;
}
function iniciales(nombre: string, def: string): string {
  return nombre.split(" ").map((s) => s[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || def;
}
function agrupar(rows: BitRow[], key: (r: BitRow) => string | null): Dato[] {
  const m = new Map<string, number>();
  for (const r of rows) { const k = key(r); if (!k) continue; m.set(k, (m.get(k) ?? 0) + 1); }
  return Array.from(m.entries()).map(([label, valor]) => ({ label, valor })).sort((a, b) => b.valor - a.valor).slice(0, 8);
}
function porDia(rows: BitRow[]): Dato[] {
  const c = [0, 0, 0, 0, 0, 0, 0];
  for (const r of rows) { const d = new Date(r.creado_en).getDay(); c[d === 0 ? 6 : d - 1]++; }
  return DIAS.map((label, i) => ({ label, valor: c[i] }));
}
function porMes(rows: BitRow[]): Dato[] {
  const c = new Array(12).fill(0);
  for (const r of rows) c[new Date(r.creado_en).getMonth()]++;
  return MESES.map((label, i) => ({ label, valor: c[i] }));
}

function Barras({ titulo, datos, color }: { titulo: string; datos: Dato[]; color: string }) {
  const max = Math.max(1, ...datos.map((d) => d.valor));
  return (
    <div className="chart-card">
      <div className="chart-title">{titulo}</div>
      {datos.length === 0 || datos.every((d) => d.valor === 0) ? <p className="dash-sub">Sin datos.</p> : datos.filter((d) => d.valor > 0).map((d) => (
        <div key={d.label} className="chart-bar-row">
          <span className="chart-bar-lbl" title={d.label}>{d.label}</span>
          <span className="chart-bar-track"><span className="chart-bar-fill" style={{ width: `${(d.valor / max) * 100}%`, background: color }} /></span>
          <span className="chart-bar-val">{d.valor}</span>
        </div>
      ))}
    </div>
  );
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

export default function Panel({ correo }: { correo?: string | null }) {
  const [sem, setSem] = useState<Record<string, number | null>>({});
  const [ano, setAno] = useState<Record<string, number | null>>({});
  const [guardias, setGuardias] = useState<ItemReciente[]>([]);
  const [evidencias, setEvidencias] = useState<ItemReciente[]>([]);
  const [tareas, setTareas] = useState<ItemReciente[]>([]);
  const [rondines, setRondines] = useState<ItemReciente[]>([]);
  const [reportes, setReportes] = useState<ReporteMapa[]>([]);
  const [bitAnio, setBitAnio] = useState<BitRow[]>([]);
  const [bitSem, setBitSem] = useState<BitRow[]>([]);
  const [usuarios, setUsuarios] = useState<Record<string, string>>({});
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);

  const cargar = useCallback(async () => {
      setRefrescando(true);
      const desdeSem = inicioSemana();
      const desdeAno = inicioAnio();
      const [semVals, anoVals] = await Promise.all([
        Promise.all(INDS.map(async (i) => [i.key, await contar(i, desdeSem)] as const)),
        Promise.all(INDS.map(async (i) => [i.key, await contar(i, desdeAno)] as const)),
      ]);
      setSem(Object.fromEntries(semVals));
      setAno(Object.fromEntries(anoVals));

      // Últimos guardias dados de alta.
      const { data: gs } = await supabase.from("personal")
        .select("id, categoria, creado_en, persona:personas(nombre, apellido_paterno, fotografias)")
        .eq("estatus", "activo").order("creado_en", { ascending: false }).limit(3);
      setGuardias(((gs as any[]) ?? []).map((g) => {
        const nom = g.persona ? `${g.persona.nombre ?? ""} ${g.persona.apellido_paterno ?? ""}`.trim() : "Guardia";
        return { id: g.id, titulo: nom || "Guardia", sub: g.categoria ?? "Guardia", href: `/personal/${g.id}`, foto: primeraFoto(g.persona?.fotografias), iniciales: iniciales(nom, "G"), gradiente: "linear-gradient(135deg,#1f6feb,#0b3d8f)" };
      }));

      // Últimas evidencias.
      const { data: ev } = await supabase.from("evidencias")
        .select("id, folio, tipo, descripcion, fotografias, creado_en")
        .eq("estatus", "activo").order("creado_en", { ascending: false }).limit(3);
      setEvidencias(((ev as any[]) ?? []).map((e) => ({ id: e.id, titulo: e.tipo ?? e.descripcion ?? "Evidencia", sub: e.folio ?? new Date(e.creado_en).toLocaleDateString(), href: `/evidencias/${e.id}`, foto: primeraFoto(e.fotografias), iniciales: "◧", gradiente: "linear-gradient(135deg,#7a3fbf,#4a2374)" })));

      // Últimas tareas.
      const { data: ts } = await supabase.from("tareas")
        .select("id, folio, tipo, asunto, motivo, prioridad, fotografias, creado_en")
        .eq("estatus", "activo").order("creado_en", { ascending: false }).limit(3);
      setTareas(((ts as any[]) ?? []).map((t) => ({ id: t.id, titulo: t.asunto ?? t.tipo ?? t.motivo ?? "Tarea", sub: `${t.folio ?? ""}${t.prioridad ? ` · ${t.prioridad}` : ""}`.trim() || "—", href: `/tareas/${t.id}`, foto: primeraFoto(t.fotografias), iniciales: "✔", gradiente: "linear-gradient(135deg,#0e8f86,#0b5c56)" })));

      // Últimos rondines (con o sin novedad).
      const { data: ro } = await supabase.from("rondines")
        .select("id, novedad, creado_en, punto:puntos_control(nombre, sitio:sitios(nombre))")
        .eq("estatus", "activo").order("creado_en", { ascending: false }).limit(3);
      setRondines(((ro as any[]) ?? []).map((r) => {
        const nov = r.novedad && r.novedad.trim() && r.novedad.trim().toLowerCase() !== "sin novedad";
        const punto = r.punto?.nombre ? `${r.punto.nombre}${r.punto.sitio?.nombre ? ` · ${r.punto.sitio.nombre}` : ""}` : "Punto de control";
        return { id: r.id, titulo: nov ? r.novedad : "Sin novedad", sub: `${punto} · ${new Date(r.creado_en).toLocaleString()}`, href: `/rondines`, foto: null, iniciales: nov ? "⚠" : "🔁", gradiente: nov ? "linear-gradient(135deg,#c62828,#7f1616)" : "linear-gradient(135deg,#546e7a,#37474f)" };
      }));

      // Mapa: emergencias / despachos abiertos (incluye alertas de pánico del móvil).
      const { data: cad } = await supabase.from("llamadas_cad")
        .select("id, folio, tipo, direccion, prioridad, latitud, longitud, fecha_recepcion")
        .eq("estatus", "activo").in("estado_despacho", ["recibida", "despachada", "en_atencion"])
        .not("latitud", "is", null).not("longitud", "is", null)
        .order("fecha_recepcion", { ascending: false }).limit(60);
      setReportes(((cad as any[]) ?? []).map((c) => ({ id: c.id, folio: c.folio, titulo: `${c.tipo ?? "Reporte"} · prioridad ${c.prioridad ?? "—"}${c.direccion ? `<br>${c.direccion}` : ""}`, latitud: c.latitud, longitud: c.longitud, href: `/cad/${c.id}`, color: PRIO_COLOR[c.prioridad] ?? "#546e7a" })));

      // Bitácora del año para las gráficas de análisis.
      const { data: bit } = await supabase.from("bitacora").select("usuario_id, tipo_accion, modulo, creado_en").gte("creado_en", desdeAno).order("creado_en", { ascending: false }).limit(3000);
      const filas = (bit as BitRow[]) ?? [];
      setBitAnio(filas);
      setBitSem(filas.filter((r) => r.creado_en >= desdeSem));

      try {
        const { data: us } = await supabase.rpc("rpc_listar_usuarios");
        const umap: Record<string, string> = {};
        ((us as any[]) ?? []).forEach((u) => { umap[u.id] = u.nombre || u.email || String(u.id).slice(0, 8); });
        setUsuarios(umap);
      } catch { /* sin permiso de admin */ }

      setCargando(false);
      setRefrescando(false);
  }, []);

  // Carga inicial + re-consulta al volver a la pestaña/panel (el App Router de Next
  // reutiliza el árbol montado; sin esto los datos quedan viejos hasta recargar).
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
            <Link key={t.key} href={t.href} className="dcard dkpi">
              <div className="k-top"><span>{t.ico}</span> {t.label}</div>
              <div className="rows"><div className="row"><span className={`num ${t.color}`}>{cargando ? "…" : datos[t.key] ?? "—"}</span><span className="lbl">{sufijo}</span></div></div>
            </Link>
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

      <KpiGrupo titulo="Indicadores semanales (lunes a domingo)" sufijo="esta semana" datos={sem} />
      <KpiGrupo titulo="Indicadores anuales" sufijo="este año" datos={ano} />

      <div className="dash-lower2">
        <div>
          <Galeria titulo="Últimos 3 guardias" items={guardias} vacio="Sin guardias." />
          <Galeria titulo="Últimas 3 evidencias" items={evidencias} vacio="Sin evidencias." />
          <Galeria titulo="Últimas 3 tareas" items={tareas} vacio="Sin tareas." />
          <Galeria titulo="Últimos 3 rondines" items={rondines} vacio="Sin rondines." />
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
            <div className="maplist">
              {reportes.map((r) => (
                <Link key={r.id + r.href} href={r.href}>
                  <span className="mdot" style={{ background: r.color ?? "var(--sc-alta)" }}></span>
                  <span className="mfolio">{r.folio ?? "s/folio"}</span>
                  <span style={{ color: "var(--sc-text-soft)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} dangerouslySetInnerHTML={{ __html: r.titulo }} />
                </Link>
              ))}
              {!cargando && reportes.length === 0 && <p className="dash-sub" style={{ padding: "10px 16px" }}>No hay emergencias ni despachos abiertos con coordenadas.</p>}
            </div>
          </div>
        </div>
      </div>

      <div className="dash-eyebrow">Análisis de actividad</div>
      {cargando ? (
        <p className="dash-sub">Cargando...</p>
      ) : bitAnio.length === 0 ? (
        <p className="dash-sub">Sin actividad visible (la bitácora es solo para supervisor/administrador).</p>
      ) : (
        <div className="dash-charts">
          <Barras titulo="Semana · por tipo de acción" datos={agrupar(bitSem, (r) => r.tipo_accion)} color="#1f6feb" />
          <Barras titulo="Semana · por módulo" datos={agrupar(bitSem, (r) => r.modulo)} color="#0e8f86" />
          <Barras titulo="Semana · por usuario" datos={agrupar(bitSem, (r) => (r.usuario_id ? (usuarios[r.usuario_id] ?? String(r.usuario_id).slice(0, 8)) : null))} color="#8a5cf6" />
          <Columnas titulo="Semana · por día" datos={porDia(bitSem)} color="#e65100" />
          <Columnas titulo="Año · por mes" datos={porMes(bitAnio)} color="#2e7d32" />
        </div>
      )}
      <p style={{ fontSize: 13, marginTop: 12 }}><Link href="/bitacora">Ver bitácora completa →</Link></p>
    </div>
  );
}
