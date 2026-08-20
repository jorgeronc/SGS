import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";
import { getMiUnidad } from "./unidad";

// "Mi elemento": el registro de `personal` que corresponde al oficial que opera
// este dispositivo. Como no hay un vínculo cuenta↔personal en la base, el
// oficial se identifica una vez desde Perfil (igual que "Mi unidad"). Con esto
// se filtran los indicadores del usuario y se guarda su fotografía de identidad.
const KEY = "scp_mi_oficial";

export interface MiOficial {
  personalId: string;
  etiqueta: string;
}

export async function setMiOficial(o: MiOficial): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(o));
}

export async function getMiOficial(): Promise<MiOficial | null> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as MiOficial;
  } catch {
    return null;
  }
}

export async function clearMiOficial(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}

// CRP (Carro Radio Patrulla) = la patrulla asignada en el rol de servicio, que el
// elemento tiene fijada como "Mi unidad". Se hereda a los registros nuevos. Se
// devuelve el número de patrulla (o su etiqueta si no se pudo resolver el número).
export async function getMiCrp(): Promise<string | null> {
  const u = await getMiUnidad();
  if (!u) return null;
  const { data } = await supabase.from("patrullas").select("numero").eq("id", u.patrullaId).maybeSingle();
  const numero = (data as any)?.numero;
  return numero != null ? String(numero) : (u.etiqueta || null);
}

// Devuelve el elemento guardado SOLO si su registro (y su persona) siguen
// activos. Si fue cancelado/dado de baja, limpia la selección y devuelve null,
// para que el dispositivo deje de asociarse a un elemento cancelado.
export async function getMiOficialValido(): Promise<MiOficial | null> {
  const o = await getMiOficial();
  if (!o) return null;
  const { data, error } = await supabase
    .from("personal")
    .select("id, estatus, persona:personas(estatus)")
    .eq("id", o.personalId)
    .maybeSingle();
  if (error) return o; // sin conexión: no invalidamos por un error de red
  const activo = !!data && (data as any).estatus === "activo" && (((data as any).persona?.estatus ?? "activo") === "activo");
  if (!activo) { await clearMiOficial(); return null; }
  return o;
}
