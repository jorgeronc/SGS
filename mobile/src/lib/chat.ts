import * as FileSystem from "expo-file-system/legacy";
import { supabase } from "./supabase";

// Helpers del chat (móvil). El oficial solo participa: lee canales donde es
// miembro y envía mensajes; la gestión de canales vive en la web.
export interface CanalMovil {
  id: string;
  nombre: string;
  tema: string | null;
  estado: "abierto" | "cerrado";
  actualizado_en: string;
}
export interface MensajeMovil {
  id: string;
  canal_id: string;
  usuario_id: string | null;
  tipo: "texto" | "foto" | "archivo" | "sistema";
  cuerpo: string | null;
  adjunto_url: string | null;
  creado_en: string;
}
export interface MiembroMovil { usuario_id: string; nombre: string | null }

const BUCKET = "chat";

export async function miId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

// Solo canales ABIERTOS: un canal cerrado desaparece de la app móvil (no se
// borra en ningún lado, solo deja de verse aquí).
export async function listarCanales(): Promise<CanalMovil[]> {
  const { data } = await supabase
    .from("chat_canales")
    .select("id, nombre, tema, estado, actualizado_en")
    .eq("estado", "abierto")
    .order("actualizado_en", { ascending: false });
  return (data as CanalMovil[]) ?? [];
}

// Mensajes no leídos por canal (mapa canal_id -> n).
export async function noLeidosPorCanal(): Promise<Record<string, number>> {
  const { data } = await supabase.rpc("rpc_chat_no_leidos");
  const map: Record<string, number> = {};
  ((data as { canal_id: string; n: number }[]) ?? []).forEach((r) => { map[r.canal_id] = r.n; });
  return map;
}

export async function marcarLeido(canalId: string): Promise<void> {
  await supabase.rpc("rpc_chat_marcar_leido", { p_canal: canalId });
}

export async function cargarMiembros(canalId: string): Promise<MiembroMovil[]> {
  const { data } = await supabase
    .from("chat_miembros")
    .select("usuario_id, perfil:usuarios_perfil(nombre)")
    .eq("canal_id", canalId);
  return ((data as any[]) ?? []).map((m) => ({ usuario_id: m.usuario_id, nombre: m.perfil?.nombre ?? null }));
}

export async function cargarMensajes(canalId: string): Promise<MensajeMovil[]> {
  const { data } = await supabase
    .from("chat_mensajes")
    .select("id, canal_id, usuario_id, tipo, cuerpo, adjunto_url, creado_en")
    .eq("canal_id", canalId)
    .order("creado_en", { ascending: true })
    .limit(200);
  return (data as MensajeMovil[]) ?? [];
}

export async function enviarTexto(canalId: string, cuerpo: string): Promise<string | null> {
  const uid = await miId();
  if (!uid) return "Sin sesión.";
  const { error } = await supabase.from("chat_mensajes").insert({ canal_id: canalId, usuario_id: uid, cuerpo });
  return error?.message ?? null;
}

// Sube una imagen al bucket 'chat' (URL firmada + PUT en streaming) y postea el
// mensaje con la ruta del objeto en adjunto_url.
export async function enviarAdjunto(canalId: string, uri: string): Promise<string | null> {
  const uid = await miId();
  if (!uid) return "Sin sesión.";
  const ext = (uri.split(".").pop() || "jpg").split("?")[0].toLowerCase();
  const ruta = `${canalId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { data: signed, error: eSign } = await supabase.storage.from(BUCKET).createSignedUploadUrl(ruta);
  if (eSign || !signed?.signedUrl) return `firma: ${eSign?.message ?? "sin URL"}`;
  const tipo = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
  const res = await FileSystem.uploadAsync(signed.signedUrl, uri, {
    httpMethod: "PUT",
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: { "content-type": tipo, "x-upsert": "true" },
  });
  if (res.status < 200 || res.status >= 300) return `HTTP ${res.status}`;
  const { error } = await supabase.from("chat_mensajes").insert({ canal_id: canalId, usuario_id: uid, adjunto_url: ruta });
  return error?.message ?? null;
}

export async function urlFirmada(ruta: string): Promise<string | null> {
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(ruta, 3600);
  return data?.signedUrl ?? null;
}
