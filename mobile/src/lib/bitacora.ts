import { supabase } from "./supabase";

// Registra una CONSULTA significativa (abrir un registro concreto) en la
// bitácora, igual que la web. Las escrituras ya se auditan por triggers en la BD;
// esto cubre las lecturas de detalle desde el móvil. Best-effort: si falla, no
// interrumpe la navegación.
export async function registrarConsulta(
  entidad: string,
  id: string | null,
  modulo = "movil"
): Promise<void> {
  try {
    await supabase.rpc("rpc_registrar_bitacora", {
      p_tipo_accion: "CONSULTAR",
      p_entidad_tipo: entidad,
      p_entidad_id: id,
      p_modulo: modulo,
    });
  } catch {
    /* ignore */
  }
}
