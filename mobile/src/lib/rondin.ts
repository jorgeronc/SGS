import * as Location from "expo-location";
import { supabase } from "./supabase";
import { getMiOficialValido } from "./oficial";

// Registra el paso de un guardia por un punto de control (por su código QR/NFC).
// Toma la identidad del guardia ("Mi elemento") y el GPS (best-effort), y llama
// a rpc_rondin_marcar que resuelve el punto por su código. Ver 0053_rondines.
export async function marcarRondin(
  codigo: string,
  novedad?: string
): Promise<{ ok: boolean; punto?: string; error?: string }> {
  const cod = codigo.trim();
  if (!cod) return { ok: false, error: "Código vacío." };

  const oficial = await getMiOficialValido();

  let lat: number | null = null;
  let lng: number | null = null;
  try {
    const perm = await Location.getForegroundPermissionsAsync();
    const ok = perm.granted || (await Location.requestForegroundPermissionsAsync()).granted;
    if (ok) {
      const pos = await Location.getCurrentPositionAsync({});
      lat = pos.coords.latitude;
      lng = pos.coords.longitude;
    }
  } catch {
    /* sin GPS: el paso igual se registra */
  }

  const { error } = await supabase.rpc("rpc_rondin_marcar", {
    p_codigo: cod,
    p_personal: oficial?.personalId ?? null,
    p_lat: lat,
    p_lng: lng,
    p_novedad: novedad?.trim() || null,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
