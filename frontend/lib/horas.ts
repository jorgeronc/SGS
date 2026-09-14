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
export interface GrupoCliente {
  clienteId: string;
  clienteNombre: string;
  filas: HorasGuardia[];
  totNormal: number;
  totExtra: number;
  totTotal: number;
}
export interface ReporteHorasAgrupado {
  grupos: GrupoCliente[];
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

// Igual que computeHorasTrabajadas pero AGRUPADO por cliente, con desglose por
// guardia dentro de cada cliente. Cada turno se atribuye al cliente del sitio donde
// se cubrió; el criterio normal/extra sigue siendo por guardia y día (1er turno del
// día = normal, los demás = extra). Útil para el reporte "Todos los clientes".
export async function computeHorasPorCliente(clienteId: string | null, ini: string, fin: string): Promise<ReporteHorasAgrupado> {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const vacio: ReporteHorasAgrupado = { grupos: [], totNormal: 0, totExtra: 0, totTotal: 0 };

  // Sitios (del cliente o todos) con su cliente.
  let sq = supabase.from("sitios").select("id, cliente_id, cliente:clientes(razon_social)").eq("estatus", "activo");
  if (clienteId) sq = sq.eq("cliente_id", clienteId);
  const { data: sit } = await sq;
  const sitios = (sit as any[]) ?? [];
  if (!sitios.length) return vacio;
  const sitioCliente = new Map<string, { id: string; nombre: string }>(
    sitios.map((s) => [s.id, { id: s.cliente_id ?? "__sin__", nombre: s.cliente?.razon_social ?? "Sin cliente" }]));
  const sitiosIds = sitios.map((s) => s.id);

  // Turnos del periodo (no cancelados ni borrador).
  const { data: tur } = await supabase.from("turnos")
    .select("id, fecha, hora_inicio, hora_fin")
    .eq("estatus", "activo").neq("estado", "borrador")
    .gte("fecha", dstr(ini)).lte("fecha", dstr(fin));
  const turnos = (tur as any[]) ?? [];
  if (!turnos.length) return vacio;
  const turnoById = new Map<string, any>(turnos.map((t) => [t.id, t]));

  // Asignaciones (guardia + turno + sitio) en esos sitios.
  const { data: tg } = await supabase.from("turno_guardias")
    .select("personal_id, turno_id, sitio_id, personal:personal(persona:personas(nombre, apellido_paterno, apellido_materno))")
    .in("turno_id", turnos.map((t) => t.id)).in("sitio_id", sitiosIds).eq("estatus", "activo");
  const asigs = (tg as any[]) ?? [];

  // Por guardia → por fecha → asignaciones (con su cliente), para ordenar normal/extra.
  type Asig = { inicio: string | null; dur: number; cliId: string; cliNom: string };
  const porGuardia = new Map<string, { nombre: string; dias: Map<string, Asig[]> }>();
  for (const a of asigs) {
    if (!a.personal_id) continue;
    const t = turnoById.get(a.turno_id);
    const cli = sitioCliente.get(a.sitio_id);
    if (!t || !cli) continue;
    const g = porGuardia.get(a.personal_id) ?? { nombre: nombreDe(a.personal), dias: new Map() };
    const lista = g.dias.get(t.fecha) ?? [];
    lista.push({ inicio: t.hora_inicio, dur: duracionHoras(t.hora_inicio, t.hora_fin), cliId: cli.id, cliNom: cli.nombre });
    g.dias.set(t.fecha, lista);
    porGuardia.set(a.personal_id, g);
  }

  // Acumula por (cliente, guardia).
  const acc = new Map<string, { nombre: string; guardias: Map<string, { nombre: string; dias: Set<string>; normal: number; extra: number }> }>();
  for (const [personalId, g] of porGuardia) {
    for (const [fecha, delDia] of g.dias) {
      const orden = [...delDia].sort((x, y) => (x.inicio ?? "").localeCompare(y.inicio ?? ""));
      orden.forEach((a, i) => {
        const grp = acc.get(a.cliId) ?? { nombre: a.cliNom, guardias: new Map() };
        const gr = grp.guardias.get(personalId) ?? { nombre: g.nombre, dias: new Set<string>(), normal: 0, extra: 0 };
        if (i === 0) gr.normal += a.dur; else gr.extra += a.dur;
        gr.dias.add(fecha);
        grp.guardias.set(personalId, gr);
        acc.set(a.cliId, grp);
      });
    }
  }

  const grupos: GrupoCliente[] = [];
  for (const [cliId, grp] of acc) {
    const filas: HorasGuardia[] = [];
    for (const [pid, gr] of grp.guardias) {
      const normal = r2(gr.normal), extra = r2(gr.extra);
      filas.push({ personalId: pid, nombre: gr.nombre, dias: gr.dias.size, normal, extra, total: r2(normal + extra) });
    }
    filas.sort((a, b) => b.extra - a.extra || b.total - a.total);
    const tN = r2(filas.reduce((s, f) => s + f.normal, 0));
    const tE = r2(filas.reduce((s, f) => s + f.extra, 0));
    grupos.push({ clienteId: cliId, clienteNombre: grp.nombre, filas, totNormal: tN, totExtra: tE, totTotal: r2(tN + tE) });
  }
  grupos.sort((a, b) => a.clienteNombre.localeCompare(b.clienteNombre));

  const totNormal = r2(grupos.reduce((s, g) => s + g.totNormal, 0));
  const totExtra = r2(grupos.reduce((s, g) => s + g.totExtra, 0));
  return { grupos, totNormal, totExtra, totTotal: r2(totNormal + totExtra) };
}
