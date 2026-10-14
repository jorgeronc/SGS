import { supabase } from "@/lib/supabaseClient";

// IDs de personas/vehículos involucrados en un incidente de Central/Despacho
// (`llamadas_cad`), reuniendo TODAS las fuentes para que la pestaña del
// incidente no quede vacía según cómo se haya capturado al involucrado:
//   1. Vínculos creados desde la web   -> entidad_origen_tipo = 'cad'
//   2. Vínculos creados desde el móvil  -> entidad_origen_tipo = 'incidente'
//   3. Control de acceso que generó el incidente -> fila `accesos.incidente_id`
//      (persona_id / vehiculo_id viven en el registro de acceso, no en vinculos).
// Dedupe por id. Las tres fuentes se piden en paralelo.
export async function idsInvolucradosCad(
  llamadaId: string
): Promise<{ perIds: string[]; vehIds: string[] }> {
  const per = new Set<string>();
  const veh = new Set<string>();

  const [vinRes, accRes] = await Promise.all([
    supabase
      .from("vinculos")
      .select("entidad_destino_tipo, entidad_destino_id")
      .in("entidad_origen_tipo", ["cad", "incidente"])
      .eq("entidad_origen_id", llamadaId)
      .eq("estatus", "activo"),
    supabase
      .from("accesos")
      .select("persona_id, vehiculo_id")
      .eq("incidente_id", llamadaId)
      .eq("estatus", "activo"),
  ]);

  for (const v of ((vinRes.data as any[]) ?? [])) {
    if (v.entidad_destino_id == null) continue;
    if (v.entidad_destino_tipo === "persona") per.add(v.entidad_destino_id);
    else if (v.entidad_destino_tipo === "vehiculo") veh.add(v.entidad_destino_id);
  }
  for (const a of ((accRes.data as any[]) ?? [])) {
    if (a.persona_id) per.add(a.persona_id);
    if (a.vehiculo_id) veh.add(a.vehiculo_id);
  }

  return { perIds: [...per], vehIds: [...veh] };
}
