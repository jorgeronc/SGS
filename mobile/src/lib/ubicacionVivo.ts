import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";
import { getMiOficial, getMiCrp } from "./oficial";

// Rastreo de ubicación del guardia: reporta la posición cada N segundos (N viene
// de config_sistema, leído al iniciar sesión) hacia `ubicaciones_guardias`.
// Funciona en segundo plano / pantalla bloqueada vía un servicio en primer plano
// (Android). La tarea corre en un contexto separado, así que la identidad del
// guardia se guarda en AsyncStorage para que la tarea la lea.

const TASK = "sgs-gps-guardia";
const IDENT_KEY = "sgs_gps_ident";
const EST_KEY = "sgs_estatus_servicio";

export type EstatusServicio = "en_servicio" | "en_rondin" | "en_pausa";

// Estatus de servicio elegido por el guardia (persistente). Se incluye en cada
// reporte de ubicación para que el monitoreo lo muestre.
export async function getEstatusServicio(): Promise<{ estatus: EstatusServicio; motivo: string | null }> {
  try {
    const raw = await AsyncStorage.getItem(EST_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { estatus: "en_servicio", motivo: null };
}

export async function setEstatusServicio(estatus: EstatusServicio, motivo?: string | null): Promise<void> {
  await AsyncStorage.setItem(EST_KEY, JSON.stringify({ estatus, motivo: motivo ?? null }));
  try {
    const raw = await AsyncStorage.getItem(IDENT_KEY);
    if (raw) {
      const id = JSON.parse(raw) as Ident;
      await supabase.from("ubicaciones_guardias")
        .update({ estatus_servicio: estatus, motivo_pausa: motivo ?? null, actualizado_en: new Date().toISOString() })
        .eq("personal_id", id.personalId);
    }
  } catch { /* se aplicará en el próximo reporte */ }
}

interface Ident {
  personalId: string;
  userId: string;
  etiqueta: string;
  unidad: string | null;
}

// Envía a la base la última posición del lote, con la identidad guardada.
async function reportar(loc: Location.LocationObject): Promise<void> {
  const raw = await AsyncStorage.getItem(IDENT_KEY);
  if (!raw) return;
  const id = JSON.parse(raw) as Ident;
  const est = await getEstatusServicio();
  // Última posición viva (upsert) para el mapa de monitoreo.
  await supabase.from("ubicaciones_guardias").upsert(
    {
      personal_id: id.personalId,
      user_id: id.userId,
      etiqueta: id.etiqueta,
      unidad: id.unidad,
      latitud: loc.coords.latitude,
      longitud: loc.coords.longitude,
      precision_m: loc.coords.accuracy ?? null,
      rumbo: loc.coords.heading ?? null,
      velocidad: loc.coords.speed ?? null,
      en_linea: true,
      estatus_servicio: est.estatus,
      motivo_pausa: est.motivo,
      actualizado_en: new Date().toISOString(),
    },
    { onConflict: "personal_id" }
  );
  // Historial acumulado (trayecto) para supervisar el recorrido del rondín.
  await supabase.from("recorrido_gps").insert({
    personal_id: id.personalId,
    user_id: id.userId,
    latitud: loc.coords.latitude,
    longitud: loc.coords.longitude,
    precision_m: loc.coords.accuracy ?? null,
    rumbo: loc.coords.heading ?? null,
    velocidad: loc.coords.speed ?? null,
  }).then(() => {}, () => {});
}

// Tarea de fondo (debe definirse a nivel de módulo, no dentro de un componente).
TaskManager.defineTask(TASK, async ({ data, error }) => {
  if (error) return;
  const locs = (data as { locations?: Location.LocationObject[] } | null)?.locations;
  const loc = locs?.[locs.length - 1];
  if (!loc) return;
  try {
    await reportar(loc);
  } catch {
    /* sin conexión: se reintenta en el siguiente reporte */
  }
});

// Estado del rastreo. En PRIMER PLANO se usa un watcher (sin servicio ni
// notificación); al pasar a SEGUNDO PLANO se arranca el foreground-service (que
// en Android obliga a mostrar la notificación "Ubicación activa"). Así la
// notificación solo aparece cuando la app está en segundo plano.
let rastreando = false;
let intervaloSeg = 60;
let fgSub: Location.LocationSubscription | null = null;
// Cuando hay una transmisión en vivo (alerta), se FUERZA el foreground-service
// aunque la app esté en primer plano, para que el proceso —y la cámara ya
// abierta por WebRTC— sigan vivos al bloquear la pantalla (si no, el video se
// congela). Se activa desde la pantalla de Transmisión.
let txActiva = false;

async function iniciarWatcherFg(): Promise<void> {
  if (fgSub) return;
  fgSub = await Location.watchPositionAsync(
    { accuracy: Location.Accuracy.Balanced, timeInterval: intervaloSeg * 1000, distanceInterval: 0 },
    (loc) => { reportar(loc).catch(() => {}); }
  );
}
function detenerWatcherFg(): void {
  if (fgSub) { fgSub.remove(); fgSub = null; }
}

async function iniciarServicioBg(): Promise<void> {
  const ya = await Location.hasStartedLocationUpdatesAsync(TASK).catch(() => false);
  if (ya) return;
  await Location.startLocationUpdatesAsync(TASK, {
    accuracy: Location.Accuracy.Balanced,
    timeInterval: intervaloSeg * 1000,
    distanceInterval: 0,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: "SGS — Ubicación activa",
      notificationBody: "Compartiendo tu ubicación con central durante el turno.",
      notificationColor: "#0b3d66",
    },
  });
}
async function detenerServicioBg(): Promise<void> {
  const ya = await Location.hasStartedLocationUpdatesAsync(TASK).catch(() => false);
  if (ya) await Location.stopLocationUpdatesAsync(TASK).catch(() => {});
}

// La app pasó a segundo plano: cambia al servicio (aparece la notificación).
export async function pasarASegundoPlano(): Promise<void> {
  if (!rastreando) return;
  detenerWatcherFg();
  try { await iniciarServicioBg(); } catch { /* ignore */ }
}
// La app volvió a primer plano: detiene el servicio (desaparece la notificación)
// y vuelve al watcher sin notificación. Si hay transmisión activa, se conserva
// el servicio (no se apaga) para que la cámara sobreviva a la pantalla bloqueada.
export async function pasarAPrimerPlano(): Promise<void> {
  if (txActiva) { try { await iniciarServicioBg(); } catch { /* ignore */ } return; }
  if (!rastreando) return;
  try { await detenerServicioBg(); } catch { /* ignore */ }
  try { await iniciarWatcherFg(); } catch { /* ignore */ }
}

// La pantalla de Transmisión activa/desactiva este modo. Con transmisión activa
// se fuerza el foreground-service (proceso vivo con pantalla bloqueada); al
// terminar, se restaura el modo normal.
export async function setTransmisionActiva(activa: boolean): Promise<void> {
  txActiva = activa;
  if (activa) {
    detenerWatcherFg();
    try { await iniciarServicioBg(); } catch { /* ignore */ }
  } else if (rastreando) {
    try { await detenerServicioBg(); } catch { /* ignore */ }
    try { await iniciarWatcherFg(); } catch { /* ignore */ }
  } else {
    try { await detenerServicioBg(); } catch { /* ignore */ }
  }
}

// Arranca el rastreo si hay "Mi elemento", sesión activa y el parámetro global
// gps_activo está encendido. Reinicia con los valores actuales (identidad e
// intervalo). Idempotente: se puede llamar en cada login o al cambiar elemento.
export async function iniciarRastreo(): Promise<void> {
  try {
    const guardia = await getMiOficial();
    if (!guardia) return; // sin elemento seleccionado no se rastrea

    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;

    // Parámetros desde la web (leídos al iniciar sesión).
    const { data: cfg } = await supabase
      .from("config_sistema")
      .select("gps_activo, gps_intervalo_seg")
      .eq("id", true)
      .maybeSingle();
    if (cfg && cfg.gps_activo === false) {
      await detenerRastreo();
      return;
    }
    intervaloSeg = Math.max(10, Number(cfg?.gps_intervalo_seg ?? 60));

    // Permisos: primero en uso; luego segundo plano (para pantalla bloqueada).
    const fg = await Location.requestForegroundPermissionsAsync();
    if (fg.status !== "granted") return;
    await Location.requestBackgroundPermissionsAsync().catch(() => null);

    // Guarda la identidad para la tarea de fondo.
    const unidad = await getMiCrp().catch(() => null);
    const ident: Ident = {
      personalId: guardia.personalId,
      userId: u.user.id,
      etiqueta: guardia.etiqueta,
      unidad: unidad ?? null,
    };
    await AsyncStorage.setItem(IDENT_KEY, JSON.stringify(ident));

    // Arranca en PRIMER PLANO con watcher (sin notificación). El servicio con
    // notificación se activa al pasar a segundo plano (pasarASegundoPlano).
    rastreando = true;
    await detenerServicioBg();
    detenerWatcherFg();
    await iniciarWatcherFg();
  } catch {
    /* si algo falla, la app sigue operando normalmente */
  }
}

// Detiene el rastreo y marca la última posición como fuera de línea.
export async function detenerRastreo(): Promise<void> {
  try {
    rastreando = false;
    detenerWatcherFg();
    const corre = await Location.hasStartedLocationUpdatesAsync(TASK).catch(() => false);
    if (corre) await Location.stopLocationUpdatesAsync(TASK).catch(() => {});

    const raw = await AsyncStorage.getItem(IDENT_KEY);
    if (raw) {
      const id = JSON.parse(raw) as Ident;
      await supabase
        .from("ubicaciones_guardias")
        .update({ en_linea: false, actualizado_en: new Date().toISOString() })
        .eq("personal_id", id.personalId);
    }
    await AsyncStorage.removeItem(IDENT_KEY);
  } catch {
    /* ignore */
  }
}
