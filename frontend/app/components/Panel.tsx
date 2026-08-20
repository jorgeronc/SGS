"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { primeraFoto } from "@/lib/fotos";
import MapaReportes, { type ReporteMapa } from "./MapaReportes";

interface DefInd { key: string; label: string; href: string; tabla: string; fecha: string; color: string; ico: string; mod?: (q: any) => any; }
const INDS: DefInd[] = [
  { key: "reportes", label: "Nuevos reportes", href: "/cad", tabla: "llamadas_cad", fecha: "creado_en", color: "c-red", ico: "◎" },
  { key: "incidentes", label: "Nuevos informes de incidente", href: "/incidentes", tabla: "incidentes", fecha: "creado_en", color: "c-blue", ico: "▤" },
  { key: "abordamientos", label: "Nuevos abordamientos", href: "/abordamientos", tabla: "abordamientos", fecha: "creado_en", color: "c-teal", ico: "◈" },
  { key: "custodia", label: "Nuevas personas en custodia", href: "/barandilla", tabla: "barandilla", fecha: "fecha_ingreso", color: "c-purple", ico: "⛓" },
  { key: "accidentes", label: "Accidentes viales", href: "/accidentes", tabla: "accidentes", fecha: "creado_en", color: "c-amber", ico: "🚗" },
  { key: "casos", label: "Casos abiertos", href: "/casos", tabla: "casos", fecha: "creado_en", color: "c-green", ico: "▦", mod: (q: any) => q.in("estado_investigacion", ["abierto", "en_investigacion"]) },
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
  const [incidentes, setIncidentes] = useState<ItemReciente[]>([]);
  const [detenidos, setDetenidos] = useState<ItemReciente[]>([]);
  const [abordamientos, setAbordamientos] = useState<ItemReciente[]>([]);
  const [accidentes, setAccidentes] = useState<ItemReciente[]>([]);
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

      const { data: inc } = await supabase.from("incidentes").select("id, folio, tipo, delito, fotografias, creado_en, fecha_incidente").eq("estatus", "activo").order("creado_en", { ascending: false }).limit(3);
      setIncidentes(((inc as any[]) ?? []).map((r) => ({ id: r.id, titulo: r.delito ?? r.tipo ?? "Incidente", sub: r.folio ?? new Date(r.fecha_incidente ?? r.creado_en).toLocaleDateString(), href: `/incidentes/${r.id}`, foto: primeraFoto(r.fotografias), iniciales: "▤", gradiente: "linear-gradient(135deg,#1f6feb,#0b3d8f)" })));

      const { data: det } = await supabase.from("barandilla").select("id, folio, fotografias, fecha_ingreso, persona:personas(nombre, apellido_paterno, fotografias)").eq("estatus", "activo").order("fecha_ingreso", { ascending: false }).limit(3);
      setDetenidos(((det as any[]) ?? []).map((d) => { const nom = d.persona ? `${d.persona.nombre ?? ""} ${d.persona.apellido_paterno ?? ""}`.trim() : "Detenido"; return { id: d.id, titulo: nom || "Detenido", sub: new Date(d.fecha_ingreso).toLocaleDateString(), href: `/barandilla/${d.id}`, foto: primeraFoto(d.fotografias) ?? primeraFoto(d.persona?.fotografias), iniciales: iniciales(nom, "D"), gradiente: "linear-gradient(135deg,#b03a4a,#6d2530)" }; }));

      const { data: abo } = await supabase.from("abordamientos").select("id, folio, motivo, creado_en, persona:personas(nombre, apellido_paterno, fotografias), vehiculo:vehiculos(placas, fotografias)").eq("estatus", "activo").order("creado_en", { ascending: false }).limit(3);
      setAbordamientos(((abo as any[]) ?? []).map((a) => { const nom = a.persona ? `${a.persona.nombre ?? ""} ${a.persona.apellido_paterno ?? ""}`.trim() : ""; return { id: a.id, titulo: a.motivo ?? "Abordamiento", sub: nom || a.vehiculo?.placas || a.folio || "—", href: `/abordamientos/${a.id}`, foto: primeraFoto(a.persona?.fotografias) ?? primeraFoto(a.vehiculo?.fotografias), iniciales: "◈", gradiente: "linear-gradient(135deg,#0e8f86,#0b5c56)" }; }));

      const { data: acc } = await supabase.from("accidentes").select("id, folio, tipo_hecho, direccion, fotografias, creado_en").eq("estatus", "activo").order("creado_en", { ascending: false }).limit(3);
      setAccidentes(((acc as any[]) ?? []).map((a) => ({ id: a.id, titulo: a.tipo_hecho ?? "Accidente vial", sub: a.direccion ?? a.folio ?? "—", href: `/accidentes/${a.id}`, foto: primeraFoto(a.fotografias), iniciales: "🚗", gradiente: "linear-gradient(135deg,#8a5a00,#5c3c00)" })));

      // Mapa: SOLO reportes abiertos (aún en atención), coloreados por prioridad, del más reciente al más antiguo.
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
          <Galeria titulo="Últimos 3 incidentes" items={incidentes} vacio="Sin incidentes." />
          <Galeria titulo="Últimos 3 detenidos" items={detenidos} vacio="Sin registros de custodia." />
          <Galeria titulo="Últimos 3 abordamientos" items={abordamientos} vacio="Sin abordamientos." />
          <Galeria titulo="Últimos 3 accidentes viales" items={accidentes} vacio="Sin accidentes." />
        </div>

        <div>
          <div className="dash-eyebrow">Reportes abiertos · mapa</div>
          <div className="mapcard">
            <div className="maphead">
              <span className="t">Reportes abiertos</span>
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
              {!cargando && reportes.length === 0 && <p className="dash-sub" style={{ padding: "10px 16px" }}>No hay reportes abiertos con coordenadas.</p>}
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
