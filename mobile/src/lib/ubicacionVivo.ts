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
    const intervalo = Math.max(10, Number(cfg?.gps_intervalo_seg ?? 60));

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

    const yaCorre = await Location.hasStartedLocationUpdatesAsync(TASK).catch(() => false);
    if (yaCorre) await Location.stopLocationUpdatesAsync(TASK).catch(() => {});

    await Location.startLocationUpdatesAsync(TASK, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: intervalo * 1000,
      distanceInterval: 0,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: "SGS — Ubicación activa",
        notificationBody: "Compartiendo tu ubicación con central durante el turno.",
        notificationColor: "#0b3d66",
      },
    });
  } catch {
    /* si algo falla, la app sigue operando normalmente */
  }
}

// Detiene el rastreo y marca la última posición como fuera de línea.
export async function detenerRastreo(): Promise<void> {
  try {
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
