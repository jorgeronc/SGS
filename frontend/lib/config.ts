import { supabase } from "./supabaseClient";

// Parámetros de configuración del sistema (datos de la Corporación).
export interface ConfigSistema {
  corporacion: string;
  escudo: string;
  jurisdiccion: string;
  jurisdiccion_pais: string;
  domicilio: string | null;
  telefono: string | null;
  correo: string | null;
  gps_activo: boolean;
  gps_intervalo_seg: number;
  gps_ventana_seg: number;
}

let cache: ConfigSistema | null = null;

// Lee la configuración (fila singleton). Cachea en memoria durante la sesión.
export async function getConfig(): Promise<ConfigSistema | null> {
  if (cache) return cache;
  const { data } = await supabase.from("config_sistema").select("*").eq("id", true).maybeSingle();
  if (data) cache = data as ConfigSistema;
  return cache;
}

// Invalida el caché (tras guardar en la pantalla de Parámetros).
export function limpiarConfigCache() {
  cache = null;
}
