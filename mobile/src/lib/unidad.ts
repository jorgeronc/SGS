import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";

// "Unidad" del guardia TOMADA DEL SISTEMA (no elegida): es el sitio/puesto que
// tiene asignado en su turno activo de hoy (turno_guardias → sitios). Si es
// supervisor o no está en un turno activo, devuelve null ("sin unidad").
export async function getUnidadDelSistema(personalId: string): Promise<string | null> {
  const hoy = new Date().toISOString().slice(0, 10);
  const { data } = await supabase
    .from("turno_guardias")
    .select("sitio:sitios(nombre, folio), turno:turnos(estado, fecha)")
    .eq("personal_id", personalId)
    .eq("estatus", "activo");
  const fila = ((data as any[]) ?? []).find((r) => r.turno?.estado === "activo" && r.turno?.fecha === hoy);
  const s = fila?.sitio;
  return s ? (s.nombre || s.folio || null) : null;
}

export interface TurnoVigente { fecha: string; horaInicio: string | null; horaFin: string | null; }

// Turno vigente hoy del elemento: como guardia (turno_guardias) o como supervisor
// (turnos.supervisor_id). Devuelve fecha y franja horaria para mostrar el horario.
export async function getTurnoVigente(personalId: string): Promise<TurnoVigente | null> {
  const hoy = new Date().toISOString().slice(0, 10);
  const { data: tg } = await supabase
    .from("turno_guardias")
    .select("turno:turnos(fecha, hora_inicio, hora_fin, estado)")
    .eq("personal_id", personalId)
    .eq("estatus", "activo");
  let t = ((tg as any[]) ?? []).map((r) => r.turno).find((x) => x?.estado === "activo" && x?.fecha === hoy);
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
