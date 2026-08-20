import { Platform } from "react-native";
import * as Application from "expo-application";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";

// La bodycam (smartphone) asignada al oficial en este dispositivo. El folio es
// el número de bodycam que se registra en el despacho y la evidencia.
export interface MiBodycam { folio: string; bodycamId: string; }

const KEY = "scp_mi_bodycam";

// Identificador único y estable del teléfono (para atar la bodycam al aparato).
export async function getDeviceId(): Promise<string> {
  try {
    if (Platform.OS === "android") return Application.getAndroidId() ?? "";
    if (Platform.OS === "ios") return (await Application.getIosIdForVendorAsync()) ?? "";
  } catch {
    /* ignore */
  }
  return "";
}

export async function getMiBodycam(): Promise<MiBodycam | null> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return null;
  try { return JSON.parse(raw) as MiBodycam; } catch { return null; }
}
async function setMiBodycam(v: MiBodycam): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(v));
}
export async function clearMiBodycam(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}

export interface ResultadoBodycam {
  ok: boolean;
  folio?: string;
  bodycamId?: string;
  vinculado?: boolean;   // true si se acaba de atar el teléfono por primera vez
  motivo?: "sin_bodycam" | "otro_dispositivo" | "datos_incompletos" | "error";
}

// Valida (y vincula la primera vez) que este teléfono sea la bodycam-Smartphone
// asignada al oficial. Guarda "Mi bodycam" si todo cuadra.
export async function validarBodycam(personalId: string): Promise<ResultadoBodycam> {
  const deviceId = await getDeviceId();
  if (!deviceId) return { ok: false, motivo: "datos_incompletos" };
  const { data, error } = await supabase.rpc("rpc_validar_bodycam", {
    p_personal_id: personalId,
    p_device_id: deviceId,
    p_plataforma: Platform.OS,
  });
  if (error) return { ok: false, motivo: "error" };
  const r = (data ?? {}) as any;
  if (r.ok && r.folio) {
    await setMiBodycam({ folio: r.folio, bodycamId: r.bodycam_id });
    return { ok: true, folio: r.folio, bodycamId: r.bodycam_id, vinculado: !!r.vinculado };
  }
  return { ok: false, motivo: r.motivo ?? "error", folio: r.folio };
}

// Mensaje legible para el usuario según el motivo del bloqueo.
export function mensajeBloqueo(r: ResultadoBodycam): string {
  switch (r.motivo) {
    case "sin_bodycam":
      return "Este elemento no tiene un smartphone (bodycam) asignado en el inventario. Regístralo y asígnaselo desde el módulo de Bodycams.";
    case "otro_dispositivo":
      return `El smartphone asignado a este elemento es OTRO dispositivo${r.folio ? ` (bodycam ${r.folio})` : ""}. Pide a un administrador que lo desvincule para poder usar este teléfono.`;
    default:
      return "No se pudo validar la bodycam de este elemento. Revisa tu conexión e inténtalo de nuevo.";
  }
}
