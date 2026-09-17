import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";

// Fechas relevantes: AYER y HOY en zona LOCAL. Se incluye ayer porque un turno que
// cruza medianoche (p. ej. 16:00–00:00 o 00:00–08:00) se guarda con la fecha de su
// INICIO; comparar solo contra "hoy" dejaba sin sitio/turno a esos guardias aunque
// el turno estuviera vigente. (Debe coincidir con el gate de sesión en sesion.ts.)
const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fechasRelevantes = (): string[] => {
  const n = new Date();
  return [ymd(new Date(n.getTime() - 86400000)), ymd(n)];
};

// Date LOCAL a partir de 'YYYY-MM-DD' + 'HH:MM[:SS]'.
function combinar(fecha: string, hora?: string | null): Date {
  const [y, m, d] = fecha.split("-").map(Number);
  const [hh = 0, mm = 0, ss = 0] = (hora || "00:00:00").split(":").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, hh, mm, ss, 0);
}

// ¿la ventana REAL [inicio, fin) del turno (con su fecha) contiene "ahora"?
// Maneja el cruce de medianoche sumando un día al fin.
export function ventanaCubre(t: any, ahora: Date): boolean {
  if (!t?.fecha) return false;
  const inicio = combinar(t.fecha, t.hora_inicio ?? "00:00:00");
  let fin = combinar(t.fecha, t.hora_fin ?? "23:59:59");
  if (fin <= inicio) fin = new Date(fin.getTime() + 86400000);
  return ahora >= inicio && ahora <= fin;
}

// De varios turno_guardias, elige el VIGENTE por su ventana REAL; si ninguno cubre
// la hora, el ya iniciado más reciente; si no, el más reciente por inicio.
function elegirTurnoRow(rows: any[], ahora: Date): any | null {
  if (!rows.length) return null;
  const ini = (r: any) => combinar(r.turno?.fecha, r.turno?.hora_inicio).getTime();
  const orden = (arr: any[]) => arr.slice().sort((a, b) => ini(b) - ini(a));
  const cubre = rows.filter((r) => ventanaCubre(r.turno, ahora));
  if (cubre.length) return orden(cubre)[0];
  const iniciados = rows.filter((r) => ini(r) <= ahora.getTime());
  if (iniciados.length) return orden(iniciados)[0];
  return orden(rows)[0];
}

// "Unidad" del guardia TOMADA DEL SISTEMA (no elegida): es el sitio/puesto que
// tiene asignado en su turno vigente (turno_guardias → sitios). Si es supervisor o
// no está en un turno vigente, devuelve null ("sin unidad").
export async function getUnidadDelSistema(personalId: string): Promise<string | null> {
  const ahora = new Date(), fechas = fechasRelevantes();
  const { data } = await supabase
    .from("turno_guardias")
    .select("sitio:sitios(nombre, folio), turno:turnos(estado, fecha, hora_inicio, hora_fin)")
    .eq("personal_id", personalId)
    .eq("estatus", "activo");
  const activos = ((data as any[]) ?? []).filter((r) => r.turno?.estado === "activo" && fechas.includes(r.turno?.fecha));
  const fila = elegirTurnoRow(activos, ahora);
  const s = fila?.sitio;
  return s ? (s.nombre || s.folio || null) : null;
}

export interface TurnoVigente { fecha: string; horaInicio: string | null; horaFin: string | null; }

// Turno vigente del elemento: como guardia (turno_guardias) o como supervisor
// (turnos.supervisor_id o turno_supervisores). Devuelve fecha y franja horaria.
export async function getTurnoVigente(personalId: string): Promise<TurnoVigente | null> {
  const ahora = new Date(), fechas = fechasRelevantes();
  const { data: tg } = await supabase
    .from("turno_guardias")
    .select("turno:turnos(fecha, hora_inicio, hora_fin, estado)")
    .eq("personal_id", personalId)
    .eq("estatus", "activo");
  const activos = ((tg as any[]) ?? []).filter((r) => r.turno?.estado === "activo" && fechas.includes(r.turno?.fecha));
  let t: any = elegirTurnoRow(activos, ahora)?.turno;
  if (!t) {
    // Supervisor por sitio (turno_supervisores) o cabecera (supervisor_id).
    const [{ data: tsup }, { data: ts }] = await Promise.all([
      supabase.from("turno_supervisores").select("turno:turnos(fecha, hora_inicio, hora_fin, estado)")
        .eq("supervisor_personal_id", personalId).eq("estatus", "activo"),
      supabase.from("turnos").select("fecha, hora_inicio, hora_fin, estado")
        .eq("supervisor_id", personalId).eq("estado", "activo").in("fecha", fechas),
    ]);
    const sup = [
      ...(((tsup as any[]) ?? []).map((r) => r.turno).filter(Boolean)),
      ...(((ts as any[]) ?? [])),
    ].filter((x) => x?.estado === "activo" && fechas.includes(x.fecha));
    t = elegirTurnoRow(sup.map((x) => ({ turno: x })), ahora)?.turno;
  }
  return t ? { fecha: t.fecha, horaInicio: t.hora_inicio ?? null, horaFin: t.hora_fin ?? null } : null;
}

export interface SitioAsignado { id: string; nombre: string | null; }

// Sitio (id + nombre) que el guardia tiene asignado en su turno vigente. Usa la
// misma lógica robusta (ayer+hoy, ventana real) para no fallar por zona horaria ni
// con turnos que cruzan medianoche.
export async function getSitioAsignado(personalId: string): Promise<SitioAsignado | null> {
  const ahora = new Date(), fechas = fechasRelevantes();
  const { data } = await supabase
    .from("turno_guardias")
    .select("sitio_id, sitio:sitios(nombre), turno:turnos(estado, fecha, hora_inicio, hora_fin)")
    .eq("personal_id", personalId).eq("estatus", "activo");
  const activos = ((data as any[]) ?? []).filter((r) => r.turno?.estado === "activo" && fechas.includes(r.turno?.fecha) && r.sitio_id);
  const fila = elegirTurnoRow(activos, ahora);
  return fila?.sitio_id ? { id: fila.sitio_id, nombre: fila.sitio?.nombre ?? null } : null;
}

// Todos los sitios distintos que el guardia tiene asignados en turnos vigentes
// (para pantallas que dejan elegir el sitio, p. ej. Incidente).
export async function getSitiosAsignados(personalId: string): Promise<SitioAsignado[]> {
  const fechas = fechasRelevantes();
  const { data } = await supabase
    .from("turno_guardias")
    .select("sitio_id, sitio:sitios(nombre), turno:turnos(estado, fecha)")
    .eq("personal_id", personalId).eq("estatus", "activo");
  const rows = ((data as any[]) ?? []).filter((r) => r.turno?.estado === "activo" && fechas.includes(r.turno?.fecha) && r.sitio_id);
  return Array.from(new Map(rows.map((r) => [r.sitio_id, { id: r.sitio_id, nombre: r.sitio?.nombre ?? null }])).values());
}

// Sitios que el SUPERVISOR cubre en su turno vigente (turno_supervisores del turno
// activo, fecha ayer/hoy). Base para ver tareas/incidentes de sus guardias.
export async function getSitiosSupervisados(personalId: string): Promise<string[]> {
  const fechas = fechasRelevantes();
  const { data } = await supabase
    .from("turno_supervisores")
    .select("sitio_id, turno:turnos(estado, fecha)")
    .eq("supervisor_personal_id", personalId).eq("estatus", "activo");
  const rows = ((data as any[]) ?? []).filter((r) => r.turno?.estado === "activo" && fechas.includes(r.turno?.fecha) && r.sitio_id);
  return Array.from(new Set(rows.map((r) => r.sitio_id as string)));
}

// "Mi unidad": la patrulla que el elemento está operando en el turno actual.
// El oficial la elige en Perfil (a partir del rol de servicio vigente) y desde
// ahí puede fijar su estatus operativo. Los Despachos se filtran a esta patrulla.
const KEY = "scp_mi_unidad";

export interface MiUnidad {
  patrullaId: string;
  etiqueta: string;
}

export async function setMiUnidad(u: MiUnidad): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(u));
}

export async function getMiUnidad(): Promise<MiUnidad | null> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as MiUnidad;
  } catch {
    return null;
  }
}

export async function clearMiUnidad(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}
