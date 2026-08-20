import { supabase, BUCKET_FOTOS } from "./supabase";

// URL pública original de una ruta del bucket de fotos.
export function urlFoto(path?: string | null): string | null {
  if (!path) return null;
  return supabase.storage.from(BUCKET_FOTOS).getPublicUrl(path).data.publicUrl;
}

// Miniatura optimizada vía transformaciones de imagen de Supabase (menos bytes
// que llegan al móvil). Si el plan no soporta transformaciones, el componente
// Foto hace fallback al original.
export function urlFotoMini(path?: string | null, size = 160): string | null {
  if (!path) return null;
  return supabase.storage.from(BUCKET_FOTOS).getPublicUrl(path, {
    transform: { width: size, height: size, resize: "cover", quality: 55 },
  }).data.publicUrl;
}

// Primera fotografía de un arreglo `fotografias` (jsonb) → ruta del bucket.
export function primeraFoto(fotografias?: unknown): string | null {
  if (!Array.isArray(fotografias) || fotografias.length === 0) return null;
  return (fotografias[0] as string) ?? null;
}
