import * as ImagePicker from "expo-image-picker";
import { decode } from "base64-arraybuffer";
import { supabase, BUCKET_FOTOS } from "./supabase";

// Evidencia de TAREA (foto). Crea un registro en `evidencias` ligado a la tarea
// (datos_adicionales.origen_tipo/id = 'tarea' + vínculo), sube la foto y registra
// cadena de custodia. La bodycam (video) usa BodycamBoton, que ya liga por origen.
// Las evidencias NO se pueden borrar desde tareas (son WORM).

export interface EvidenciaMini { foto: string | null; video: boolean }

// Abre la cámara y sube la foto como evidencia de la tarea. Devuelve true si subió.
export async function tomarFotoEvidenciaTarea(tareaId: string, folio: string | null): Promise<boolean> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) throw new Error("Se necesita permiso de cámara.");
  const r = await ImagePicker.launchCameraAsync({ quality: 0.6, base64: true });
  if (r.canceled || !r.assets?.[0]?.base64) return false;
  const foto = { base64: r.assets[0].base64 as string, mime: r.assets[0].mimeType ?? "image/jpeg" };

  const { data: ev, error } = await supabase.from("evidencias").insert({
    tipo: "Fotografía",
    descripcion: `Tarea ${folio ?? ""}`.trim(),
    estado_evidencia: "recolectada",
    fecha_recoleccion: new Date().toISOString(),
    datos_adicionales: { origen: "tarea_movil", origen_tipo: "tarea", origen_id: tareaId, origen_folio: folio },
  }).select("id").single();
  if (error || !ev) throw error ?? new Error("No se pudo crear la evidencia.");

  const path = `evidencias/${(ev as any).id}/${Date.now()}.jpg`;
  const up = await supabase.storage.from(BUCKET_FOTOS).upload(path, decode(foto.base64), { contentType: foto.mime });
  if (!up.error) {
    await supabase.from("evidencias").update({ fotografias: [path], actualizado_en: new Date().toISOString() }).eq("id", (ev as any).id);
  }
  await supabase.from("vinculos").insert({
    entidad_origen_tipo: "tarea", entidad_origen_id: tareaId,
    entidad_destino_tipo: "evidencia", entidad_destino_id: (ev as any).id,
    tipo_relacion: "evidencia",
  });
  return true;
}

// Miniatura de evidencia por tarea (primera foto y si hay video), para las listas.
export async function evidenciasMiniPorTarea(tareaIds: string[]): Promise<Record<string, EvidenciaMini>> {
  const out: Record<string, EvidenciaMini> = {};
  if (!tareaIds.length) return out;
  const { data } = await supabase.from("evidencias")
    .select("tipo, fotografias, datos_adicionales, creado_en")
    .eq("estatus", "activo")
    .in("datos_adicionales->>origen_id", tareaIds)
    .order("creado_en", { ascending: true });
  for (const e of ((data as any[]) ?? [])) {
    if (e.datos_adicionales?.origen_tipo !== "tarea") continue;
    const id = e.datos_adicionales?.origen_id as string;
    if (!id) continue;
    const cur = out[id] ?? { foto: null, video: false };
    const foto = Array.isArray(e.fotografias) ? e.fotografias[0] : null;
    if (foto && !cur.foto) cur.foto = foto;
    if ((e.tipo ?? "").toLowerCase().includes("video") || e.datos_adicionales?.video_ruta) cur.video = true;
    out[id] = cur;
  }
  return out;
}
