import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";

// Fecha de HOY en zona LOCAL (no UTC). Con toISOString(), por la tarde/noche en
// MX (UTC−6) "hoy" saltaba al día siguiente y no empataba con turnos.fecha, así
// que sitio/turno salían vacíos aunque el turno estuviera activo.
const hoyLocal = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const horaLocal = (): string => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
};

// ¿la hora actual cae dentro de la franja [hi, hf] del turno? (soporta cruce de medianoche)
function dentroVentana(hi?: string | null, hf?: string | null, ahora?: string): boolean {
  if (!hi || !hf || !ahora) return false;
  const a = ahora.slice(0, 8), i = hi.slice(0, 8), f = hf.slice(0, 8);
  return f >= i ? a >= i && a <= f : a >= i || a <= f;
}

// De varios turno_guardias activos HOY, elige el VIGENTE por franja horaria; si
// ninguno coincide, el de inicio más reciente ya comenzado; si no, el más reciente.
// (El turno anterior puede seguir con estado 'activo' si no se cerró; por eso no
// basta con el primero que empate fecha+estado.)
function elegirTurnoRow(rows: any[], ahora: string): any | null {
  if (!rows.length) return null;
  const hi = (r: any) => (r.turno?.hora_inicio ?? "").slice(0, 8);
  const orden = (arr: any[]) => arr.slice().sort((a, b) => hi(b).localeCompare(hi(a)));
  const enVentana = rows.filter((r) => dentroVentana(r.turno?.hora_inicio, r.turno?.hora_fin, ahora));
  if (enVentana.length) return orden(enVentana)[0];
  const iniciados = rows.filter((r) => hi(r) && hi(r) <= ahora.slice(0, 8));
  if (iniciados.length) return orden(iniciados)[0];
  return orden(rows)[0];
}

// "Unidad" del guardia TOMADA DEL SISTEMA (no elegida): es el sitio/puesto que
// tiene asignado en su turno activo de hoy (turno_guardias → sitios). Si es
// supervisor o no está en un turno activo, devuelve null ("sin unidad").
export async function getUnidadDelSistema(personalId: string): Promise<string | null> {
  const hoy = hoyLocal(), ahora = horaLocal();
  const { data } = await supabase
    .from("turno_guardias")
    .select("sitio:sitios(nombre, folio), turno:turnos(estado, fecha, hora_inicio, hora_fin)")
    .eq("personal_id", personalId)
    .eq("estatus", "activo");
  const activos = ((data as any[]) ?? []).filter((r) => r.turno?.estado === "activo" && r.turno?.fecha === hoy);
  const fila = elegirTurnoRow(activos, ahora);
  const s = fila?.sitio;
  return s ? (s.nombre || s.folio || null) : null;
}

export interface TurnoVigente { fecha: string; horaInicio: string | null; horaFin: string | null; }

// Turno vigente hoy del elemento: como guardia (turno_guardias) o como supervisor
// (turnos.supervisor_id). Devuelve fecha y franja horaria para mostrar el horario.
export async function getTurnoVigente(personalId: string): Promise<TurnoVigente | null> {
  const hoy = hoyLocal(), ahora = horaLocal();
  const { data: tg } = await supabase
    .from("turno_guardias")
    .select("turno:turnos(fecha, hora_inicio, hora_fin, estado)")
    .eq("personal_id", personalId)
    .eq("estatus", "activo");
  const activos = ((tg as any[]) ?? []).filter((r) => r.turno?.estado === "activo" && r.turno?.fecha === hoy);
  let t: any = elegirTurnoRow(activos, ahora)?.turno;
  if (!t) {
    const { data: ts } = await supabase
      .from("turnos")
      .select("fecha, hora_inicio, hora_fin, estado")
      .eq("supervisor_id", personalId).eq("estado", "activo").eq("fecha", hoy).limit(1);
    t = ((ts as any[]) ?? [])[0];
  }
  return t ? { fecha: t.fecha, horaInicio: t.hora_inicio ?? null, horaFin: t.hora_fin ?? null } : null;
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
