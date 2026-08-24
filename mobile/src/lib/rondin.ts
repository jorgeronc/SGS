import * as Location from "expo-location";
import { supabase } from "./supabase";
import { getMiOficialValido } from "./oficial";

export interface RondinResultado {
  ok: boolean;
  error?: string;
  punto?: string;
  distancia_m?: number | null;
  dentro?: boolean | null;
  radio_m?: number;
  margen_m?: number;
  metodo?: "qr" | "nfc";
}

// Registra el paso de un guardia por un punto de control (por su código QR/NFC).
// Toma la identidad del guardia ("Mi elemento") y el GPS, y llama a
// rpc_rondin_marcar, que calcula la distancia guardia↔etiqueta y si está dentro
// de la geocerca (radio + margen). Devuelve esos datos para avisar al guardia.
export async function marcarRondin(
  codigo: string,
  novedad?: string,
  metodo: "qr" | "nfc" = "qr"
): Promise<RondinResultado> {
  const cod = codigo.trim();
  if (!cod) return { ok: false, error: "Código vacío." };

  const oficial = await getMiOficialValido();

  let lat: number | null = null;
  let lng: number | null = null;
  try {
    const perm = await Location.getForegroundPermissionsAsync();
    const ok = perm.granted || (await Location.requestForegroundPermissionsAsync()).granted;
    if (ok) {
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      lat = pos.coords.latitude;
      lng = pos.coords.longitude;
    }
  } catch {
    /* sin GPS: el paso igual se registra (sin validación de geocerca) */
  }

  const { data, error } = await supabase.rpc("rpc_rondin_marcar", {
    p_codigo: cod,
    p_personal: oficial?.personalId ?? null,
    p_lat: lat,
    p_lng: lng,
    p_novedad: novedad?.trim() || null,
    p_metodo: metodo,
  });
  if (error) return { ok: false, error: error.message };
  const r = (data ?? {}) as any;
  return {
    ok: true, metodo,
    punto: r.punto ?? undefined,
    distancia_m: r.distancia_m ?? null,
    dentro: r.dentro ?? null,
    radio_m: r.radio_m,
    margen_m: r.margen_m,
  };
}
