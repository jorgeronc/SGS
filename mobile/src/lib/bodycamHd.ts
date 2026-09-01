import { Platform, PermissionsAndroid } from "react-native";
// En SDK 54 las funciones clásicas (readAsStringAsync…) viven en /legacy.
import * as FileSystem from "expo-file-system/legacy";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";
import { getMiOficialValido } from "./oficial";
import { getMiUnidad } from "./unidad";
import { getMiBodycam } from "./bodycam";

// Módulo nativo (solo Android, solo en build de EAS). En Expo Go / iOS no existe.
let Native: any = null;
try {
  if (Platform.OS === "android") Native = require("../../modules/bodycamhd").default;
} catch {
  Native = null;
}

export const bodycamDisponible = !!Native;
export function bodycamGrabando(): boolean {
  try { return Native?.isRecording?.() ?? false; } catch { return false; }
}

// Pide cámara + micrófono (+ notificaciones para el foreground service) en Android.
export async function pedirPermisosBodycam(): Promise<boolean> {
  if (Platform.OS !== "android") return true;
  const perms: any[] = [PermissionsAndroid.PERMISSIONS.CAMERA, PermissionsAndroid.PERMISSIONS.RECORD_AUDIO];
  const notif = (PermissionsAndroid.PERMISSIONS as any).POST_NOTIFICATIONS;
  if (notif) perms.push(notif);
  const res = await PermissionsAndroid.requestMultiple(perms);
  return res[PermissionsAndroid.PERMISSIONS.CAMERA] === "granted"
    && res[PermissionsAndroid.PERMISSIONS.RECORD_AUDIO] === "granted";
}

// Registro (Caso, Tarea, Informe, Accidente, Abordamiento, Despacho/CAD) desde el
// cual se inició la grabación; la evidencia queda asociada a ese folio.
export interface BodycamOrigen { tipo: string; id: string; folio: string | null }

// Sesión de grabación en curso + su origen. Cada "Activar bodycam" abre una sesión;
// los segmentos que se finalicen se sellan con el origen vigente. Los formularios
// (Abordamiento/Accidente) sellan el origen al guardar (cuando ya hay folio).
let sesionActual: string | null = null;
let origenActual: BodycamOrigen | null = null;

// Cola de segmentos grabados pendientes de subir (se guardan en el teléfono).
const KEY = "scp_bodycam_pendientes";
interface Segmento {
  uri: string; fecha: string; durSeg: number;
  elemento: string; unidad: string | null; personalId: string | null;
  bodycamFolio: string | null; bodycamId: string | null;
  sesion: string | null; origenTipo: string | null; origenId: string | null; origenFolio: string | null;
}

async function leerCola(): Promise<Segmento[]> {
  try { return JSON.parse((await AsyncStorage.getItem(KEY)) ?? "[]"); } catch { return []; }
}
async function guardarCola(c: Segmento[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(c));
}
export async function pendientesBodycam(): Promise<number> {
  return (await leerCola()).length;
}

let subSeg: any = null;
let subError: any = null;

export async function iniciarBodycam(origen?: BodycamOrigen | null): Promise<{ ok: boolean; error?: string }> {
  if (!Native) return { ok: false, error: "La bodycam local requiere el build de la app en Android." };
  try {
    // Cada segmento finalizado se ENCOLA (no se sube hasta "Descargar bodycam").
    if (!subSeg) subSeg = Native.addListener("onSegment", (p: any) => { encolar(p.uri, p.durationMs); });
    if (!subError) subError = Native.addListener("onError", () => {});
    sesionActual = `${Date.now()}`;
    origenActual = origen ?? null;
    await Native.start();
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? String(e) };
  }
}

export async function detenerBodycam(): Promise<void> {
  if (!Native) return;
  try { await Native.stop(); } catch { /* ignore */ }
}

// Sostén de transmisión en vivo: foreground service de tipo cámara+micrófono
// (sin abrir la cámara) para que WebRTC siga capturando con la pantalla bloqueada
// durante una alerta. Solo Android build; en iOS/Expo Go es no-op.
export async function iniciarSostenTransmision(): Promise<void> {
  try { await Native?.startStreamHold?.(); } catch { /* ignore */ }
}
export async function detenerSostenTransmision(): Promise<void> {
  try { await Native?.stopStreamHold?.(); } catch { /* ignore */ }
}

// Asocia (o reasigna) el origen de la sesión de grabación en curso. Sella también
// los segmentos ya encolados de esta sesión que aún no tuvieran origen — para los
// formularios que solo conocen el folio DESPUÉS de guardar (Abordamiento/Accidente).
export async function asociarBodycamActual(origen: BodycamOrigen): Promise<void> {
  origenActual = origen;
  if (!sesionActual) return;
  const cola = await leerCola();
  let cambio = false;
  for (const s of cola) {
    if (s.sesion === sesionActual && !s.origenTipo) {
      s.origenTipo = origen.tipo; s.origenId = origen.id; s.origenFolio = origen.folio; cambio = true;
    }
  }
  if (cambio) await guardarCola(cola);
}

async function encolar(uri: string, durationMs: number) {
  try {
    const [oficial, unidad, bodycam] = await Promise.all([getMiOficialValido(), getMiUnidad(), getMiBodycam()]);
    const cola = await leerCola();
    cola.push({
      uri, fecha: new Date().toISOString(), durSeg: Math.round((durationMs || 0) / 1000),
      elemento: oficial?.etiqueta ?? "sin identificar", unidad: unidad?.etiqueta ?? null,
      personalId: oficial?.personalId ?? null, bodycamFolio: bodycam?.folio ?? null, bodycamId: bodycam?.bodycamId ?? null,
      sesion: sesionActual,
      origenTipo: origenActual?.tipo ?? null, origenId: origenActual?.id ?? null, origenFolio: origenActual?.folio ?? null,
    });
    await guardarCola(cola);
  } catch { /* ignore */ }
}

// Sube todos los segmentos pendientes (idealmente en WiFi) como evidencias.
// Usa uploadAsync (streaming desde disco, SIN cargar el video a memoria) contra
// una URL firmada de subida de Supabase. Devuelve el último error para diagnóstico.
export async function descargarPendientes(
  onProgreso?: (hechos: number, total: number) => void
): Promise<{ subidos: number; fallidos: number; error?: string }> {
  const cola = await leerCola();
  const total = cola.length;
  let subidos = 0, fallidos = 0;
  let ultimoError: string | undefined;
  const exitos = new Set<string>();

  for (let i = 0; i < total; i++) {
    const s = cola[i];
    try {
      const info = await FileSystem.getInfoAsync(s.uri);
      if (!info.exists) { exitos.add(s.uri); subidos++; onProgreso?.(subidos + fallidos, total); continue; }

      const path = `bodycam_local/${Date.parse(s.fecha) || Date.now()}_${i}.mp4`;
      const { data: signed, error: eSign } = await supabase.storage.from("videos").createSignedUploadUrl(path);
      if (eSign || !signed?.signedUrl) { ultimoError = `firma: ${eSign?.message ?? "sin URL"}`; fallidos++; onProgreso?.(subidos + fallidos, total); continue; }

      const res = await FileSystem.uploadAsync(signed.signedUrl, s.uri, {
        httpMethod: "PUT",
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        headers: { "content-type": "video/mp4", "x-upsert": "true" },
      });
      if (res.status < 200 || res.status >= 300) {
        ultimoError = `HTTP ${res.status}: ${(res.body ?? "").slice(0, 140)}`; fallidos++; onProgreso?.(subidos + fallidos, total); continue;
      }

      const origenTxt = s.origenFolio ? ` · Origen ${s.origenFolio}` : "";
      const { data: ev, error: eEv } = await supabase.from("evidencias").insert({
        tipo: "video_bodycam",
        estado_evidencia: "recolectada",
        fecha_recoleccion: s.fecha,
        descripcion: `Grabación bodycam HD${s.bodycamFolio ? ` ${s.bodycamFolio}` : ""} — ${s.elemento}${s.unidad ? ` · ${s.unidad}` : ""}${origenTxt}.`,
        datos_adicionales: {
          bucket: "videos", video_ruta: path, duracion_seg: s.durSeg, modo: "local_hd",
          personal_id: s.personalId, bodycam_folio: s.bodycamFolio, bodycam_id: s.bodycamId,
          elemento: s.elemento, unidad: s.unidad, grabado_en: s.fecha,
          origen_tipo: s.origenTipo, origen_id: s.origenId, origen_folio: s.origenFolio,
        },
      }).select("id").single();
      if (eEv) { ultimoError = `registro: ${eEv.message}`; fallidos++; onProgreso?.(subidos + fallidos, total); continue; }

      if ((ev as any)?.id) {
        await supabase.from("cadena_custodia").insert({
          evidencia_id: (ev as any).id, tipo_evento: "recoleccion", responsable: s.elemento,
          ubicacion: "Almacenamiento digital (bucket privado 'videos')",
          notas: `Segmento bodycam HD local${s.bodycamFolio ? ` · Bodycam ${s.bodycamFolio}` : ""}${origenTxt}. Descargado en la agencia.`,
        });
        // Vincula la evidencia al registro (Caso/Tarea/Informe/…) donde se originó.
        if (s.origenTipo && s.origenId) {
          await supabase.from("vinculos").insert({
            entidad_origen_tipo: s.origenTipo, entidad_origen_id: s.origenId,
            entidad_destino_tipo: "evidencia", entidad_destino_id: (ev as any).id,
            tipo_relacion: "EVIDENCIA",
          });
        }
      }
      try { await FileSystem.deleteAsync(s.uri, { idempotent: true }); } catch { /* ignore */ }
      exitos.add(s.uri); subidos++;
    } catch (e: any) {
      ultimoError = e?.message ?? String(e); fallidos++;
    }
    onProgreso?.(subidos + fallidos, total);
  }

  await guardarCola(cola.filter((s) => !exitos.has(s.uri)));
  return { subidos, fallidos, error: ultimoError };
}
