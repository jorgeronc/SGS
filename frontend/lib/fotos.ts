import { supabase } from "./supabaseClient";

const BUCKET = "fotos";

// Resuelve la URL pública de una ruta del bucket de fotos.
export function urlFoto(path?: string | null): string | null {
  if (!path) return null;
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

// URL pública de la primera fotografía de un arreglo `fotografias` (jsonb).
export function primeraFoto(fotografias?: unknown): string | null {
  if (!Array.isArray(fotografias) || fotografias.length === 0) return null;
  return urlFoto(fotografias[0] as string);
}

// Sube un archivo de imagen al bucket y devuelve la ruta guardada (o null).
export async function subirFotoArchivo(carpeta: string, id: string, file: File): Promise<string | null> {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${carpeta}/${id}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || "image/jpeg",
    upsert: true,
  });
  return error ? null : path;
}
