import { supabase } from "@/lib/supabaseClient";

// Horas trabajadas por guardia: NORMALES (la duración del turno asignado del día)
// y EXTRA (turnos adicionales del mismo día — p. ej. diurno + nocturno inmediato).
// Se calcula desde el rol de turnos (turnos + turno_guardias). Ver 0058/0084.

export interface HorasGuardia {
  personalId: string;
  nombre: string;
  dias: number;
  normal: number;   // horas
  extra: number;    // horas
  total: number;    // horas
}
export interface ReporteHoras {
  filas: HorasGuardia[];
  totNormal: number;
  totExtra: number;
  totTotal: number;
}

const dstr = (d: string | Date) => new Date(d).toISOString().slice(0, 10);

// Duración en horas de un turno (maneja cruce de medianoche, p. ej. 22:00→06:00).
export function duracionHoras(ini: string | null, fin: string | null): number {
  if (!ini || !fin) return 0;
  const [h1, m1] = ini.split(":").map(Number);
  const [h2, m2] = fin.split(":").map(Number);
  let mins = (h2 * 60 + m2) - (h1 * 60 + m1);
  if (mins <= 0) mins += 24 * 60; // cruza medianoche
  return Math.round((mins / 60) * 100) / 100;
}

const nombreDe = (p: any) => {
  const x = p?.persona;
  return x ? `${x.nombre ?? ""} ${x.apellido_paterno ?? ""} ${x.apellido_materno ?? ""}`.trim() : "—";
};

export async function computeHorasTrabajadas(clienteId: string | null, ini: string, fin: string): Promise<ReporteHoras> {
  const vacio: ReporteHoras = { filas: [], totNormal: 0, totExtra: 0, totTotal: 0 };

  // Sitios del cliente (o todos), para acotar las asignaciones.
  let sq = supabase.from("sitios").select("id").eq("estatus", "activo");
  if (clienteId) sq = sq.eq("cliente_id", clienteId);
  const { data: sit } = await sq;
  const sitiosIds = ((sit as any[]) ?? []).map((s) => s.id);
  if (!sitiosIds.length) return vacio;

  // Turnos del periodo (no cancelados ni borrador) con su horario.
  const { data: tur } = await supabase.from("turnos")
    .select("id, fecha, hora_inicio, hora_fin")
    .eq("estatus", "activo").neq("estado", "borrador")
    .gte("fecha", dstr(ini)).lte("fecha", dstr(fin));
  const turnos = (tur as any[]) ?? [];
  if (!turnos.length) return vacio;
  const turnoById = new Map<string, any>(turnos.map((t) => [t.id, t]));
  const turnoIds = turnos.map((t) => t.id);

  // Guardias asignados a esos turnos en los sitios del cliente.
  const { data: tg } = await supabase.from("turno_guardias")
    .select("personal_id, turno_id, personal:personal(persona:personas(nombre, apellido_paterno, apellido_materno))")
    .in("turno_id", turnoIds).in("sitio_id", sitiosIds).eq("estatus", "activo");
  const asigs = (tg as any[]) ?? [];

  // Agrupa por guardia → por fecha → lista de turnos (con su duración).
  type Turno = { inicio: string | null; fin: string | null; dur: number };
  const porGuardia = new Map<string, { nombre: string; dias: Map<string, Turno[]> }>();
  for (const a of asigs) {
    if (!a.personal_id) continue;
    const t = turnoById.get(a.turno_id);
    if (!t) continue;
    const g = porGuardia.get(a.personal_id) ?? { nombre: nombreDe(a.personal), dias: new Map() };
    const lista = g.dias.get(t.fecha) ?? [];
    lista.push({ inicio: t.hora_inicio, fin: t.hora_fin, dur: duracionHoras(t.hora_inicio, t.hora_fin) });
    g.dias.set(t.fecha, lista);
    porGuardia.set(a.personal_id, g);
  }

  const filas: HorasGuardia[] = [];
  for (const [personalId, g] of porGuardia) {
    let normal = 0, extra = 0;
    for (const [, turnosDia] of g.dias) {
      // El PRIMER turno del día (por hora de inicio) es normal; los demás, extra.
      const orden = [...turnosDia].sort((x, y) => (x.inicio ?? "").localeCompare(y.inicio ?? ""));
      orden.forEach((t, i) => { if (i === 0) normal += t.dur; else extra += t.dur; });
    }
    normal = Math.round(normal * 100) / 100;
    extra = Math.round(extra * 100) / 100;
    filas.push({ personalId, nombre: g.nombre, dias: g.dias.size, normal, extra, total: Math.round((normal + extra) * 100) / 100 });
  }
  filas.sort((a, b) => b.extra - a.extra || b.total - a.total);

  const totNormal = Math.round(filas.reduce((s, f) => s + f.normal, 0) * 100) / 100;
  const totExtra = Math.round(filas.reduce((s, f) => s + f.extra, 0) * 100) / 100;
  return { filas, totNormal, totExtra, totTotal: Math.round((totNormal + totExtra) * 100) / 100 };
}
