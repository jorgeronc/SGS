import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import { decode } from "base64-arraybuffer";
import { supabase, BUCKET_FOTOS } from "./supabase";

// Cola offline de inspecciones (Seguridad Logística, Fase 1).
// El guardia realiza la inspección en campo (a veces sin señal en patios/vías);
// la inspección se intenta subir de inmediato y, si falla, se guarda en el
// dispositivo para reintentar al recuperar conexión (al abrir la app / enfocar).

const CLAVE = "sgs_inspecciones_pendientes";

export interface ItemInspeccion {
  codigo_item: string | null;
  descripcion: string | null;
  resultado: "OK" | "NO_OK" | "NO_APLICA" | "PENDIENTE";
  requerido: boolean;
  notas: string | null;
}

export interface ValidacionSelloPend {
  sello_id: string | null;
  codigo_sello: string | null;
  unidad_carga_id: string | null;
  resultado: "VALIDO" | "NO_COINCIDE" | "ALTERADO" | "NO_ENCONTRADO" | "DANADO";
  notas: string | null;
}

export interface InspeccionPendiente {
  clientId: string;
  tipo_inspeccion: string | null;
  movimiento_id: string | null;
  unidad_carga_id: string | null;
  transporte_activo_id: string | null;
  sitio_id: string | null;
  realizada_por: string | null;
  resultado: string | null;
  latitud: number | null;
  longitud: number | null;
  items: ItemInspeccion[];
  sello: ValidacionSelloPend | null;
  // Foto opcional de respaldo (base64) — se sube como evidencia con cadena.
  foto: { base64: string; mime: string } | null;
  creado_en: string;
}

async function leerCola(): Promise<InspeccionPendiente[]> {
  try {
    const raw = await AsyncStorage.getItem(CLAVE);
    return raw ? (JSON.parse(raw) as InspeccionPendiente[]) : [];
  } catch {
    return [];
  }
}

async function escribirCola(cola: InspeccionPendiente[]): Promise<void> {
  try {
    await AsyncStorage.setItem(CLAVE, JSON.stringify(cola));
  } catch {
    /* almacenamiento lleno: se pierde el respaldo, pero no rompe la app */
  }
}

export async function pendientesInspeccion(): Promise<number> {
  return (await leerCola()).length;
}

// Sube una foto (base64) como evidencia con cadena de custodia y la vincula a
// la inspección. Devuelve el id de la evidencia (o null si falla).
async function subirFotoEvidencia(
  insId: string,
  folioIns: string | null,
  foto: { base64: string; mime: string },
  correo: string | null,
  lat: number | null,
  lng: number | null
): Promise<string | null> {
  const { data: ev, error } = await supabase
    .from("evidencias")
    .insert({
      tipo: "Fotografía",
      descripcion: `Inspección ${folioIns ?? ""}`.trim(),
      estado_evidencia: "recolectada",
      fecha_recoleccion: new Date().toISOString(),
      datos_adicionales: { gps: lat != null && lng != null ? { lat, lng } : null, origen: "inspeccion_movil", origen_tipo: "inspeccion", origen_id: insId, origen_folio: folioIns },
    })
    .select("id, folio")
    .single();
  if (error || !ev) return null;
  const path = `evidencias/${(ev as any).id}/${Date.now()}.jpg`;
  const up = await supabase.storage.from(BUCKET_FOTOS).upload(path, decode(foto.base64), { contentType: foto.mime });
  if (!up.error) {
    await supabase.from("evidencias").update({ fotografias: [path], actualizado_en: new Date().toISOString() }).eq("id", (ev as any).id);
  }
  await supabase.from("cadena_custodia").insert({
    evidencia_id: (ev as any).id,
    tipo_evento: "recoleccion",
    responsable: correo,
    ubicacion: lat != null && lng != null ? `${lat}, ${lng}` : null,
    notas: "Foto de inspección en campo (app móvil).",
  });
  await supabase.from("vinculos").insert({
    entidad_origen_tipo: "inspeccion", entidad_origen_id: insId,
    entidad_destino_tipo: "evidencia", entidad_destino_id: (ev as any).id,
    tipo_relacion: "EVIDENCIA",
  });
  return (ev as any).id;
}

// Intenta subir UNA inspección completa (cabecera + ítems + sello + foto).
// Lanza si algo del núcleo (inspección/ítems) falla, para que se reencole.
async function subirUna(p: InspeccionPendiente): Promise<void> {
  const { data: u } = await supabase.auth.getUser();
  const correo = u.user?.email ?? null;

  const { data: ins, error } = await supabase
    .from("inspecciones")
    .insert({
      tipo_inspeccion: p.tipo_inspeccion,
      movimiento_id: p.movimiento_id,
      unidad_carga_id: p.unidad_carga_id,
      transporte_activo_id: p.transporte_activo_id,
      sitio_id: p.sitio_id,
      realizada_por: p.realizada_por,
      resultado: p.resultado,
      latitud: p.latitud,
      longitud: p.longitud,
      datos_adicionales: { origen: "app_movil", client_id: p.clientId, capturado_en: p.creado_en },
    })
    .select("id, folio")
    .single();
  if (error || !ins) throw error ?? new Error("No se pudo crear la inspección.");
  const insId = (ins as any).id as string;
  const folioIns = (ins as any).folio as string | null;

  if (p.items.length) {
    const filas = p.items.map((it) => ({
      inspeccion_id: insId,
      codigo_item: it.codigo_item,
      descripcion: it.descripcion,
      resultado: it.resultado,
      requerido: it.requerido,
      notas: it.notas,
    }));
    const { error: eItems } = await supabase.from("inspeccion_items").insert(filas);
    if (eItems) throw eItems;
  }

  // Foto (best-effort: no reencola por foto si el núcleo ya entró).
  if (p.foto) {
    try { await subirFotoEvidencia(insId, folioIns, p.foto, correo, p.latitud, p.longitud); } catch { /* ignora */ }
  }

  // Validación de sello (best-effort, append-only).
  if (p.sello) {
    try {
      await supabase.from("sello_validaciones").insert({
        sello_id: p.sello.sello_id,
        unidad_carga_id: p.sello.unidad_carga_id ?? p.unidad_carga_id,
        movimiento_id: p.movimiento_id,
        personal_id: p.realizada_por,
        latitud: p.latitud, longitud: p.longitud,
        resultado: p.sello.resultado,
        notas: p.sello.notas ?? (p.sello.codigo_sello ? `Código leído: ${p.sello.codigo_sello}` : null),
      });
      // Si el sello resultó alterado/no coincide, refleja el estado del sello.
      if (p.sello.sello_id && (p.sello.resultado === "ALTERADO" || p.sello.resultado === "NO_COINCIDE")) {
        await supabase.from("sellos").update({ estado: "ALTERADO", actualizado_en: new Date().toISOString() }).eq("id", p.sello.sello_id);
      } else if (p.sello.sello_id && p.sello.resultado === "VALIDO") {
        await supabase.from("sellos").update({ estado: "VALIDADO", actualizado_en: new Date().toISOString() }).eq("id", p.sello.sello_id);
      }
    } catch { /* ignora: la inspección ya quedó registrada */ }
  }
}

// ¿El error fue por falta de red (fetch falló) y NO una respuesta del servidor?
// Un error de Postgres/RLS trae `code`/`details` (el servidor SÍ respondió) — eso
// NO es "sin conexión". Solo los fallos de fetch/timeout se tratan como offline.
export function esErrorDeRed(e: any): boolean {
  if (!e) return false;
  if (e.code || e.details || e.hint) return false; // respuesta del servidor
  const msg = String(e?.message ?? e).toLowerCase();
  return e instanceof TypeError || /network|fetch|timeout|connection|offline|failed to/.test(msg);
}

// Guarda una inspección: intenta subirla; si falla, la encola para reintentar
// (nunca se pierde). Distingue "sin conexión" (fetch) de un error de servidor
// (p. ej. permiso/RLS), para no mentir en el mensaje.
export async function guardarInspeccion(
  p: InspeccionPendiente
): Promise<{ subida: boolean; offline?: boolean; error?: string }> {
  try {
    await subirUna(p);
    return { subida: true };
  } catch (e: any) {
    const cola = await leerCola();
    cola.push(p);
    await escribirCola(cola);
    const red = esErrorDeRed(e);
    return { subida: false, offline: red, error: red ? undefined : (e?.message ?? String(e)) };
  }
}

// Reintenta subir las inspecciones pendientes. Devuelve cuántas se subieron.
export async function sincronizarInspecciones(): Promise<number> {
  const cola = await leerCola();
  if (!cola.length) return 0;
  const quedan: InspeccionPendiente[] = [];
  let subidas = 0;
  for (const p of cola) {
    try {
      await subirUna(p);
      subidas++;
    } catch {
      quedan.push(p);
    }
  }
  await escribirCola(quedan);
  return subidas;
}

// Utilidad: lee una foto local (uri) a base64 para respaldo offline.
export async function fotoABase64(uri: string): Promise<string> {
  return FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
}
