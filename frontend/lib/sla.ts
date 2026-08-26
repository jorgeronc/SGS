import { supabase } from "@/lib/supabaseClient";

// Cálculo del cumplimiento SLA y del Índice de Cumplimiento de Seguridad (0–100)
// con datos reales del sistema (turnos, recorrido GPS, rondines, incidencias).
// Ver migración 0066_sla_metas.

export interface SlaMetas {
  cobertura_pct: number; rondines_pct: number; tiempo_resp_min: number;
  supervision_pct: number; incidentes_criticos_max: number;
}
const DEFAULT_METAS: SlaMetas = { cobertura_pct: 95, rondines_pct: 90, tiempo_resp_min: 10, supervision_pct: 90, incidentes_criticos_max: 0 };

export interface ReporteSla {
  sitios: number; horasContratadas: number | null; horasCubiertas: number | null;
  coberturaPct: number | null; cubiertos: number; programados: number;
  rondinesPct: number | null; rondinesTotal: number; rondinesDentro: number;
  tiempoRespMin: number | null; incTotal: number; incCriticos: number;
  sev: { alta: number; media: number; baja: number };
  index: number | null; metas: SlaMetas;
  cumple: { cobertura: boolean | null; rondines: boolean | null; resp: boolean | null; incidentes: boolean };
}

export async function getMetas(clienteId: string | null): Promise<SlaMetas> {
  if (clienteId) {
    const { data } = await supabase.from("sla_metas").select("cobertura_pct, rondines_pct, tiempo_resp_min, supervision_pct, incidentes_criticos_max").eq("estatus", "activo").eq("cliente_id", clienteId).maybeSingle();
    if (data) return data as SlaMetas;
  }
  const { data: g } = await supabase.from("sla_metas").select("cobertura_pct, rondines_pct, tiempo_resp_min, supervision_pct, incidentes_criticos_max").eq("estatus", "activo").is("cliente_id", null).maybeSingle();
  return (g as SlaMetas) ?? DEFAULT_METAS;
}

const dstr = (d: string | Date) => new Date(d).toISOString().slice(0, 10);

export async function computeReporteSla(clienteId: string | null, ini: string, fin: string): Promise<ReporteSla> {
  const metas = await getMetas(clienteId);
  const vacio: ReporteSla = {
    sitios: 0, horasContratadas: null, horasCubiertas: null, coberturaPct: null, cubiertos: 0, programados: 0,
    rondinesPct: null, rondinesTotal: 0, rondinesDentro: 0, tiempoRespMin: null, incTotal: 0, incCriticos: 0,
    sev: { alta: 0, media: 0, baja: 0 }, index: null, metas,
    cumple: { cobertura: null, rondines: null, resp: null, incidentes: true },
  };

  // Sitios del cliente (o todos).
  let sq = supabase.from("sitios").select("id, horas_contratadas_mes").eq("estatus", "activo");
  if (clienteId) sq = sq.eq("cliente_id", clienteId);
  const { data: sit } = await sq;
  const sitios = (sit as any[]) ?? [];
  const sitiosIds = sitios.map((s) => s.id);
  if (!sitiosIds.length) return vacio;
  const horasContratadas = sitios.reduce((a, s) => a + (Number(s.horas_contratadas_mes) || 0), 0) || null;

  // Incidencias del periodo (por sitio del cliente).
  const { data: inc } = await supabase.from("llamadas_cad")
    .select("prioridad, fecha_recepcion, fecha_cierre").in("sitio_id", sitiosIds)
    .neq("estatus", "cancelado").gte("fecha_recepcion", ini).lte("fecha_recepcion", fin);
  const incs = (inc as any[]) ?? [];
  const sev = { alta: 0, media: 0, baja: 0 };
  let sumaMin = 0, nCerr = 0;
  incs.forEach((r) => {
    if (r.prioridad === "alta") sev.alta++; else if (r.prioridad === "baja") sev.baja++; else sev.media++;
    if (r.fecha_cierre) { sumaMin += (new Date(r.fecha_cierre).getTime() - new Date(r.fecha_recepcion).getTime()) / 60000; nCerr++; }
  });
  const tiempoRespMin = nCerr ? sumaMin / nCerr : null;

  // Rondines en rango (calidad) del periodo.
  const { data: pts } = await supabase.from("puntos_control").select("id").in("sitio_id", sitiosIds);
  const puntoIds = ((pts as any[]) ?? []).map((p) => p.id);
  let rondinesTotal = 0, rondinesDentro = 0, rondinesPct: number | null = null;
  if (puntoIds.length) {
    const { data: ron } = await supabase.from("rondines").select("dentro_geocerca").in("punto_id", puntoIds)
      .eq("estatus", "activo").gte("creado_en", ini).lte("creado_en", fin);
    const rr = (ron as any[]) ?? [];
    rondinesTotal = rr.length;
    rondinesDentro = rr.filter((x) => x.dentro_geocerca === true).length;
    rondinesPct = rondinesTotal ? (rondinesDentro / rondinesTotal) * 100 : null;
  }

  // Cobertura / asistencia GPS: asignaciones (turno_guardia) con actividad GPS ese día.
  let coberturaPct: number | null = null, cubiertos = 0, programados = 0;
  const { data: tur } = await supabase.from("turnos").select("id, fecha").eq("estatus", "activo")
    .gte("fecha", dstr(ini)).lte("fecha", dstr(fin));
  const turnos = (tur as any[]) ?? [];
  const turnoFecha = new Map<string, string>(turnos.map((t) => [t.id, t.fecha]));
  const turnoIds = turnos.map((t) => t.id);
  if (turnoIds.length) {
    const { data: tg } = await supabase.from("turno_guardias").select("personal_id, turno_id").in("turno_id", turnoIds).in("sitio_id", sitiosIds);
    const asigs = ((tg as any[]) ?? []).filter((a) => a.personal_id).map((a) => ({ p: a.personal_id, f: turnoFecha.get(a.turno_id) }));
    programados = asigs.length;
    if (programados) {
      const personalIds = Array.from(new Set(asigs.map((a) => a.p)));
      const { data: rec } = await supabase.from("recorrido_gps").select("personal_id, fecha_hora")
        .in("personal_id", personalIds).gte("fecha_hora", ini).lte("fecha_hora", fin);
      const presentes = new Set(((rec as any[]) ?? []).map((r) => `${r.personal_id}|${dstr(r.fecha_hora)}`));
      cubiertos = asigs.filter((a) => a.f && presentes.has(`${a.p}|${a.f}`)).length;
      coberturaPct = (cubiertos / programados) * 100;
    }
  }

  // Índice 0–100 (promedio ponderado de los componentes disponibles).
  const respScore = tiempoRespMin == null ? null
    : tiempoRespMin <= metas.tiempo_resp_min ? 100 : Math.max(0, 100 - ((tiempoRespMin - metas.tiempo_resp_min) / metas.tiempo_resp_min) * 100);
  const incScore = incCriticosScore(sev.alta, metas.incidentes_criticos_max);
  const comps: [number | null, number][] = [
    [coberturaPct, 0.3], [rondinesPct, 0.25], [respScore, 0.2], [incScore, 0.25],
  ];
  let sw = 0, ssum = 0;
  comps.forEach(([v, w]) => { if (v != null) { sw += w; ssum += v * w; } });
  const index = sw ? Math.round(ssum / sw) : null;

  const horasCubiertas = horasContratadas != null && coberturaPct != null ? Math.round(horasContratadas * (coberturaPct / 100)) : null;

  return {
    sitios: sitiosIds.length, horasContratadas, horasCubiertas, coberturaPct, cubiertos, programados,
    rondinesPct, rondinesTotal, rondinesDentro, tiempoRespMin, incTotal: incs.length, incCriticos: sev.alta, sev,
    index, metas,
    cumple: {
      cobertura: coberturaPct == null ? null : coberturaPct >= metas.cobertura_pct,
      rondines: rondinesPct == null ? null : rondinesPct >= metas.rondines_pct,
      resp: tiempoRespMin == null ? null : tiempoRespMin <= metas.tiempo_resp_min,
      incidentes: sev.alta <= metas.incidentes_criticos_max,
    },
  };
}

function incCriticosScore(criticos: number, max: number): number {
  if (criticos <= max) return 100;
  return Math.max(0, 100 - (criticos - max) * 20);
}
