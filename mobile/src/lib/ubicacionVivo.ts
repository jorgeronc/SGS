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
const COLA_KEY = "sgs_gps_cola";   // buffer offline de puntos de recorrido_gps
const MAX_COLA = 5000;             // tope del buffer (se descartan los más viejos)

// UUID v4 (id de cliente para deduplicar al reintentar/sincronizar).
function uuidv4(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

type PuntoRecorrido = {
  id: string; personal_id: string; user_id: string;
  latitud: number; longitud: number;
  precision_m: number | null; rumbo: number | null; velocidad: number | null; fecha_hora: string; mock: boolean;
};

// Guarda un punto en el buffer local (para sincronizar cuando vuelva la red).
async function encolarRecorrido(row: PuntoRecorrido): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(COLA_KEY);
    const cola: PuntoRecorrido[] = raw ? JSON.parse(raw) : [];
    cola.push(row);
    await AsyncStorage.setItem(COLA_KEY, JSON.stringify(cola.slice(-MAX_COLA)));
  } catch { /* ignore */ }
}

// Sincroniza el buffer local. upsert con onConflict=id (idempotente: reenviar un
// punto ya insertado no duplica). Si falla, se conserva para el próximo intento.
async function vaciarColaRecorrido(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(COLA_KEY);
    const cola: PuntoRecorrido[] = raw ? JSON.parse(raw) : [];
    if (cola.length === 0) return;
    // RPC (definer) inserta con user_id = auth.uid(); evita rechazo por RLS.
    const { error } = await supabase.rpc("rpc_reportar_recorrido", { p_puntos: cola });
    if (!error) await AsyncStorage.removeItem(COLA_KEY);
  } catch { /* sin red: se reintenta luego */ }
}

// Inserta un punto de recorrido (vía RPC); si no hay red, lo encola.
async function insertarRecorrido(row: PuntoRecorrido): Promise<void> {
  try {
    const { error } = await supabase.rpc("rpc_reportar_recorrido", { p_puntos: [row] });
    if (error) await encolarRecorrido(row);
  } catch { await encolarRecorrido(row); }
}

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
  const mock = (loc as any).mocked ?? false; // ubicación simulada (Android) — antifraude
  // Última posición viva para el mapa de monitoreo. El servidor deriva user_id de
  // auth.uid() y sella actualizado_en (RPC 0098), así ni el reloj ni una identidad
  // desincronizada del teléfono impiden que el guardia aparezca.
  const { error: eUp } = await supabase.rpc("rpc_reportar_ubicacion", {
    p_personal: id.personalId,
    p_lat: loc.coords.latitude,
    p_lng: loc.coords.longitude,
    p_etiqueta: id.etiqueta,
    p_unidad: id.unidad,
    p_precision: loc.coords.accuracy ?? null,
    p_rumbo: loc.coords.heading ?? null,
    p_velocidad: loc.coords.speed ?? null,
    p_estatus: est.estatus,
    p_motivo: est.motivo,
    p_mock: mock,
  });
  if (eUp) { ultimoError = eUp.message; } else { ultimoReporte = Date.now(); ultimoError = null; }
  // Historial acumulado (trayecto) para supervisar el recorrido del rondín.
  // Con buffer offline: id de cliente + fecha del dispositivo; se sincroniza al
  // volver la red (así no se pierden puntos sin conexión). La sesión se sella en
  // el servidor por la fecha_hora del punto (trigger fn_recorrido_sesion).
  await vaciarColaRecorrido();
  await insertarRecorrido({
    id: uuidv4(),
    personal_id: id.personalId,
    user_id: id.userId,
    latitud: loc.coords.latitude,
    longitud: loc.coords.longitude,
    precision_m: loc.coords.accuracy ?? null,
    rumbo: loc.coords.heading ?? null,
    velocidad: loc.coords.speed ?? null,
    fecha_hora: new Date(loc.timestamp || Date.now()).toISOString(),
    mock,
  });
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
let ultimoReporte = 0;                    // ms del último reporte exitoso
let ultimoError: string | null = null;    // último error al enviar la posición (RLS/red)
let permisoFg: boolean | null = null;     // último estado conocido del permiso en uso
let permisoBg: boolean | null = null;     // último estado conocido del permiso "siempre"
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
    permisoFg = fg.status === "granted";
    if (!permisoFg) return;
    const bg = await Location.requestBackgroundPermissionsAsync().catch(() => null);
    permisoBg = bg?.status === "granted";

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
    // Reporte inmediato: el guardia aparece al instante en el mapa y confirma que
    // el permiso y la ubicación del teléfono funcionan (sin esperar al intervalo).
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      .then((l) => reportar(l)).catch(() => {});
  } catch {
    /* si algo falla, la app sigue operando normalmente */
  }
}

// Estado de la ubicación para mostrarlo en Perfil (diagnóstico por teléfono):
// permiso en uso, permiso "siempre", rastreo activo y hace cuánto se envió la
// última posición. Lee los permisos sin volver a pedirlos.
export async function estadoUbicacion(): Promise<{ fg: boolean; bg: boolean; activo: boolean; ultimoReporteSeg: number | null; error: string | null }> {
  let fg = permisoFg ?? false, bg = permisoBg ?? false, activo = rastreando;
  try { fg = (await Location.getForegroundPermissionsAsync()).status === "granted"; } catch { /* usa el último conocido */ }
  try { bg = (await Location.getBackgroundPermissionsAsync()).status === "granted"; } catch { /* usa el último conocido */ }
  try { activo = rastreando || (await Location.hasStartedLocationUpdatesAsync(TASK).catch(() => false)); } catch { /* */ }
  return { fg, bg, activo, ultimoReporteSeg: ultimoReporte ? Math.round((Date.now() - ultimoReporte) / 1000) : null, error: ultimoError };
}

// Pide (o re-pide) los permisos de ubicación y arranca el rastreo. Devuelve el
// resultado para que la UI guíe al usuario a "Permitir todo el tiempo" si falta.
export async function pedirPermisoUbicacion(): Promise<{ fg: boolean; bg: boolean }> {
  const fgp = await Location.requestForegroundPermissionsAsync().catch(() => null);
  const fg = fgp?.status === "granted";
  let bg = false;
  if (fg) { const bgp = await Location.requestBackgroundPermissionsAsync().catch(() => null); bg = bgp?.status === "granted"; }
  permisoFg = fg; permisoBg = bg;
  if (fg) await iniciarRastreo();
  return { fg, bg };
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
