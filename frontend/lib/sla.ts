import { supabase } from "@/lib/supabaseClient";
import { computeHorasTrabajadas } from "@/lib/horas";

// Metas de SLA como CATÁLOGO seleccionable por cliente (ver 0094_sla_catalogo).
// Cada meta se calcula con datos reales; el cliente elige cuáles aplican y su valor.

export type Unidad = "%" | "min" | "n" | "h";
export type Dir = ">=" | "<=";

export interface MetaCat {
  clave: string; nombre: string; unidad: Unidad; dir: Dir;
  defecto: number; peso: number; activaDefecto: boolean; modulo: string;
}

// Catálogo de metas. `peso` pondera el índice; `activaDefecto` = aplica si el
// cliente no ha configurado nada. Las 3 últimas quedan listas para seleccionarse;
// su cálculo por cliente se habilita cuando se mapee su fuente (hoy muestran "—").
export const SLA_CATALOGO: MetaCat[] = [
  { clave: "cobertura",           nombre: "Cobertura / asistencia GPS",        unidad: "%",   dir: ">=", defecto: 95, peso: 0.18, activaDefecto: true,  modulo: "Turnos" },
  { clave: "rondines_rango",      nombre: "Rondines en rango",                 unidad: "%",   dir: ">=", defecto: 90, peso: 0.14, activaDefecto: true,  modulo: "Rondines" },
  { clave: "supervision",         nombre: "Supervisión de turnos",             unidad: "%",   dir: ">=", defecto: 90, peso: 0.08, activaDefecto: false, modulo: "Supervisión" },
  { clave: "tiempo_atencion",     nombre: "Tiempo de atención",                unidad: "min", dir: "<=", defecto: 10, peso: 0.10, activaDefecto: false, modulo: "Incidentes" },
  { clave: "tiempo_resolucion",   nombre: "Tiempo de resolución",              unidad: "min", dir: "<=", defecto: 60, peso: 0.10, activaDefecto: true,  modulo: "Incidentes" },
  { clave: "incidentes_atendidos",nombre: "Incidentes atendidos a tiempo",     unidad: "%",   dir: ">=", defecto: 90, peso: 0.08, activaDefecto: false, modulo: "Incidentes" },
  { clave: "incidentes_criticos", nombre: "Incidentes críticos",               unidad: "n",   dir: "<=", defecto: 0,  peso: 0.10, activaDefecto: true,  modulo: "Incidentes" },
  { clave: "accesos_rechazados",  nombre: "Accesos rechazados",                unidad: "%",   dir: "<=", defecto: 5,  peso: 0.06, activaDefecto: false, modulo: "Control de acceso" },
  { clave: "horas_extra_guardia", nombre: "Horas extra por guardia (mes)",     unidad: "h",   dir: "<=", defecto: 40, peso: 0.08, activaDefecto: false, modulo: "Turnos" },
  { clave: "guardias_sobre_extra",nombre: "Guardias que exceden horas extra",  unidad: "%",   dir: "<=", defecto: 10, peso: 0.06, activaDefecto: false, modulo: "Turnos" },
  { clave: "movimientos_liberados",nombre: "Movimientos con liberación",       unidad: "%",   dir: ">=", defecto: 95, peso: 0.05, activaDefecto: false, modulo: "Logística" },
  { clave: "inspecciones_sin_novedad", nombre: "Inspecciones sin novedad",     unidad: "%",   dir: ">=", defecto: 95, peso: 0.05, activaDefecto: false, modulo: "Logística" },
  { clave: "tareas_a_tiempo",     nombre: "Tareas completadas a tiempo",       unidad: "%",   dir: ">=", defecto: 90, peso: 0.03, activaDefecto: false, modulo: "Tareas" },
];

export interface MetricaSla {
  clave: string; nombre: string; unidad: Unidad; dir: Dir;
  valor: number | null; meta: number | null; activa: boolean; cumple: boolean | null;
  detalle?: string; modulo: string;
}
export interface SlaResultado { sitios: number; index: number | null; metricas: MetricaSla[]; }
// Alias de compatibilidad (lo importan reporte-sla e imprimir).
export type ReporteSla = SlaResultado;

const dstr = (d: string | Date) => new Date(d).toISOString().slice(0, 10);

// Config del cliente: por cada clave, valor + si aplica (cliente > global > default).
export async function getSlaConfig(clienteId: string | null): Promise<Record<string, { valor: number | null; activa: boolean }>> {
  const filtro = clienteId ? `cliente_id.is.null,cliente_id.eq.${clienteId}` : "cliente_id.is.null";
  const { data } = await supabase.from("sla_metas_cliente").select("cliente_id, clave, valor, activa").or(filtro);
  const glob = new Map<string, any>(), cli = new Map<string, any>();
  ((data as any[]) ?? []).forEach((r) => (r.cliente_id ? cli : glob).set(r.clave, r));
  const out: Record<string, { valor: number | null; activa: boolean }> = {};
  SLA_CATALOGO.forEach((c) => {
    const rc = cli.get(c.clave), rg = glob.get(c.clave);
    out[c.clave] = {
      valor: rc?.valor ?? rg?.valor ?? c.defecto,
      activa: rc?.activa ?? rg?.activa ?? c.activaDefecto,
    };
  });
  return out;
}

function score(v: number, meta: number, dir: Dir): number {
  if (dir === ">=") { if (meta <= 0) return 100; return Math.max(0, Math.min(100, (v / meta) * 100)); }
  if (v <= meta) return 100;
  if (meta <= 0) return Math.max(0, 100 - (v - meta) * 20);
  return Math.max(0, 100 - ((v - meta) / meta) * 100);
}
// Ancho de barra (0–100) para la vista del reporte.
export function puntajeMetrica(m: MetricaSla): number {
  if (m.valor == null || m.meta == null) return 0;
  return Math.round(score(m.valor, m.meta, m.dir));
}

export async function computeSla(clienteId: string | null, ini: string, fin: string): Promise<SlaResultado> {
  const cfg = await getSlaConfig(clienteId);
  const act = (k: string) => cfg[k]?.activa;

  let sq = supabase.from("sitios").select("id").eq("estatus", "activo");
  if (clienteId) sq = sq.eq("cliente_id", clienteId);
  const { data: sit } = await sq;
  const sitiosIds = ((sit as any[]) ?? []).map((s) => s.id);

  const val: Record<string, number | null> = {};
  const det: Record<string, string> = {};

  if (sitiosIds.length) {
    // --- Incidentes del periodo ---
    if (act("tiempo_atencion") || act("tiempo_resolucion") || act("incidentes_atendidos") || act("incidentes_criticos")) {
      const { data: inc } = await supabase.from("llamadas_cad").select("id, prioridad, fecha_recepcion, fecha_cierre")
        .in("sitio_id", sitiosIds).neq("estatus", "cancelado").gte("fecha_recepcion", ini).lte("fecha_recepcion", fin);
      const incs = (inc as any[]) ?? [];
      const incIds = incs.map((i) => i.id);
      const atMin = new Map<string, number>();
      if (incIds.length && (act("tiempo_atencion") || act("incidentes_atendidos"))) {
        const { data: hist } = await supabase.from("cad_estado_historial")
          .select("llamada_id, cambiado_en").eq("ambito", "reporte").eq("campo", "estado_despacho").eq("estado", "en_atencion").in("llamada_id", incIds);
        const first = new Map<string, string>();
        ((hist as any[]) ?? []).forEach((h) => { const c = first.get(h.llamada_id); if (!c || h.cambiado_en < c) first.set(h.llamada_id, h.cambiado_en); });
        incs.forEach((i) => { const a = first.get(i.id); if (a) atMin.set(i.id, (new Date(a).getTime() - new Date(i.fecha_recepcion).getTime()) / 60000); });
      }
      if (act("tiempo_atencion")) { const a = [...atMin.values()]; val.tiempo_atencion = a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null; det.tiempo_atencion = "recepción → en atención"; }
      if (act("tiempo_resolucion")) { const c = incs.filter((i) => i.fecha_cierre); const s = c.reduce((x, i) => x + (new Date(i.fecha_cierre).getTime() - new Date(i.fecha_recepcion).getTime()) / 60000, 0); val.tiempo_resolucion = c.length ? Math.round(s / c.length) : null; det.tiempo_resolucion = "recepción → cierre"; }
      if (act("incidentes_atendidos")) { const metaA = cfg.tiempo_atencion.valor ?? 10; const a = [...atMin.values()]; val.incidentes_atendidos = a.length ? Math.round((a.filter((m) => m <= metaA).length / a.length) * 100) : null; }
      if (act("incidentes_criticos")) { val.incidentes_criticos = incs.filter((i) => i.prioridad === "alta").length; }
    }

    // --- Rondines en rango ---
    if (act("rondines_rango")) {
      const { data: pts } = await supabase.from("puntos_control").select("id").in("sitio_id", sitiosIds);
      const puntoIds = ((pts as any[]) ?? []).map((p) => p.id);
      if (puntoIds.length) {
        const { data: ron } = await supabase.from("rondines").select("dentro_geocerca").in("punto_id", puntoIds).eq("estatus", "activo").gte("creado_en", ini).lte("creado_en", fin);
        const rr = (ron as any[]) ?? []; const dentro = rr.filter((x) => x.dentro_geocerca === true).length;
        val.rondines_rango = rr.length ? Math.round((dentro / rr.length) * 100) : null; det.rondines_rango = `${dentro}/${rr.length}`;
      } else val.rondines_rango = null;
    }

    // --- Cobertura (presencia GPS) y Supervisión (turnos con supervisor) ---
    if (act("cobertura") || act("supervision")) {
      const { data: tur } = await supabase.from("turnos").select("id, fecha, supervisor_id").eq("estatus", "activo").neq("estado", "borrador").gte("fecha", dstr(ini)).lte("fecha", dstr(fin));
      const turnos = (tur as any[]) ?? [];
      const turnoFecha = new Map(turnos.map((t) => [t.id, t.fecha]));
      const turnoSup = new Map(turnos.map((t) => [t.id, t.supervisor_id]));
      const turnoIds = turnos.map((t) => t.id);
      if (turnoIds.length) {
        const { data: tg } = await supabase.from("turno_guardias").select("personal_id, turno_id").in("turno_id", turnoIds).in("sitio_id", sitiosIds).eq("estatus", "activo");
        const asigs = ((tg as any[]) ?? []).filter((a) => a.personal_id);
        if (act("supervision")) { const set = new Set(asigs.map((a) => a.turno_id)); const arr = [...set]; val.supervision = arr.length ? Math.round((arr.filter((id) => turnoSup.get(id)).length / arr.length) * 100) : null; }
        if (act("cobertura")) {
          const programados = asigs.length;
          if (programados) {
            const personalIds = Array.from(new Set(asigs.map((a) => a.personal_id)));
            const { data: rec } = await supabase.from("recorrido_gps").select("personal_id, fecha_hora").in("personal_id", personalIds).gte("fecha_hora", ini).lte("fecha_hora", fin);
            const presentes = new Set(((rec as any[]) ?? []).map((r) => `${r.personal_id}|${dstr(r.fecha_hora)}`));
            const cubiertos = asigs.filter((a) => presentes.has(`${a.personal_id}|${turnoFecha.get(a.turno_id)}`)).length;
            val.cobertura = Math.round((cubiertos / programados) * 100); det.cobertura = `${cubiertos}/${programados}`;
          } else val.cobertura = null;
        }
      } else { if (act("cobertura")) val.cobertura = null; if (act("supervision")) val.supervision = null; }
    }

    // --- Accesos rechazados ---
    if (act("accesos_rechazados")) {
      const { data: acc } = await supabase.from("accesos").select("resultado").in("sitio_id", sitiosIds).eq("estatus", "activo").gte("fecha_evento", ini).lte("fecha_evento", fin);
      const aa = (acc as any[]) ?? []; const rech = aa.filter((x) => x.resultado === "rechazado").length;
      val.accesos_rechazados = aa.length ? Math.round((rech / aa.length) * 100) : null; det.accesos_rechazados = `${rech}/${aa.length}`;
    }

    // --- Horas extra (fatiga/riesgo) ---
    if (act("horas_extra_guardia") || act("guardias_sobre_extra")) {
      const rh = await computeHorasTrabajadas(clienteId, ini, fin);
      const metaE = cfg.horas_extra_guardia.valor ?? 40;
      if (act("horas_extra_guardia")) { val.horas_extra_guardia = rh.filas.length ? Math.max(...rh.filas.map((f) => f.extra)) : 0; det.horas_extra_guardia = `${rh.filas.filter((f) => f.extra > metaE).length} guardia(s) exceden`; }
      if (act("guardias_sobre_extra")) { val.guardias_sobre_extra = rh.filas.length ? Math.round((rh.filas.filter((f) => f.extra > metaE).length / rh.filas.length) * 100) : 0; }
    }

    // --- Logística: movimientos con liberación + inspecciones sin novedad ---
    let movIdsCliente: string[] = [];
    if (act("movimientos_liberados") || act("inspecciones_sin_novedad")) {
      const idsCsv = sitiosIds.join(",");
      const { data: mov } = await supabase.from("movimientos").select("id")
        .eq("estatus", "activo").neq("estado", "CANCELADO").gte("creado_en", ini).lte("creado_en", fin)
        .or(`sitio_origen_id.in.(${idsCsv}),sitio_destino_id.in.(${idsCsv})`);
      movIdsCliente = ((mov as any[]) ?? []).map((m) => m.id);
    }
    if (act("movimientos_liberados")) {
      if (movIdsCliente.length) {
        const { data: lib } = await supabase.from("liberaciones_seguridad").select("movimiento_id, resultado").in("movimiento_id", movIdsCliente).eq("estatus", "activo");
        const aprob = new Set(((lib as any[]) ?? []).filter((l) => l.resultado === "APPROVED").map((l) => l.movimiento_id));
        val.movimientos_liberados = Math.round((aprob.size / movIdsCliente.length) * 100); det.movimientos_liberados = `${aprob.size}/${movIdsCliente.length}`;
      } else val.movimientos_liberados = null;
    }
    if (act("inspecciones_sin_novedad")) {
      const idsCsv = sitiosIds.join(",");
      const orFiltro = movIdsCliente.length ? `sitio_id.in.(${idsCsv}),movimiento_id.in.(${movIdsCliente.join(",")})` : `sitio_id.in.(${idsCsv})`;
      const { data: insp } = await supabase.from("inspecciones").select("resultado").eq("estatus", "activo").gte("creado_en", ini).lte("creado_en", fin).not("resultado", "is", null).or(orFiltro);
      const ii = (insp as any[]) ?? [];
      const sinNov = ii.filter((x) => /(\bok\b|sin novedad|aprob)/i.test(String(x.resultado))).length;
      val.inspecciones_sin_novedad = ii.length ? Math.round((sinNov / ii.length) * 100) : null; det.inspecciones_sin_novedad = `${sinNov}/${ii.length}`;
    }

    // --- Tareas completadas a tiempo (organización; sin liga a cliente) ---
    if (act("tareas_a_tiempo")) {
      const { data: tar } = await supabase.from("tareas").select("estado, vigencia_hasta").eq("estatus", "activo").not("vigencia_hasta", "is", null).gte("vigencia_hasta", ini).lte("vigencia_hasta", fin);
      const rel = ((tar as any[]) ?? []).filter((t) => t.estado === "completada" || t.estado === "vencida");
      val.tareas_a_tiempo = rel.length ? Math.round((rel.filter((t) => t.estado === "completada").length / rel.length) * 100) : null;
      det.tareas_a_tiempo = "organización";
    }
  }

  const metricas: MetricaSla[] = SLA_CATALOGO.map((c) => {
    const conf = cfg[c.clave];
    const v = c.clave in val ? val[c.clave] : null;
    const meta = conf.valor;
    let cumple: boolean | null = null;
    if (conf.activa && v != null && meta != null) cumple = c.dir === ">=" ? v >= meta : v <= meta;
    return { clave: c.clave, nombre: c.nombre, unidad: c.unidad, dir: c.dir, valor: conf.activa ? v : null, meta, activa: conf.activa, cumple, detalle: det[c.clave], modulo: c.modulo };
  });

  let sw = 0, ss = 0;
  metricas.forEach((mt) => {
    if (mt.activa && mt.valor != null && mt.meta != null) {
      const cat = SLA_CATALOGO.find((x) => x.clave === mt.clave)!;
      const w = cat.peso || 0.05;
      sw += w; ss += score(mt.valor, mt.meta, mt.dir) * w;
    }
  });
  const index = sw ? Math.round(ss / sw) : null;
  return { sitios: sitiosIds.length, index, metricas };
}

// Compat: el mapa y el dashboard solo usan `.index`.
export async function computeReporteSla(clienteId: string | null, ini: string, fin: string): Promise<SlaResultado> {
  return computeSla(clienteId, ini, fin);
}
