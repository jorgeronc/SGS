import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";
import { getMiOficial } from "./oficial";

// Geofencing de sitios (Capa 2): registra regiones circulares por sitio y, en
// segundo plano, detecta ENTRADA/SALIDA del perímetro → geocerca_eventos.
// Reutiliza los permisos de ubicación "always" del rastreo GPS.
const TASK = "sgs-geocercas";
const IDENT_KEY = "sgs_geocerca_ident";

interface Ident { personalId: string; userId: string }

TaskManager.defineTask(TASK, async ({ data, error }: any) => {
  if (error) return;
  const eventType = data?.eventType;
  const region = data?.region;
  if (!region) return;
  try {
    const raw = await AsyncStorage.getItem(IDENT_KEY);
    if (!raw) return;
    const id = JSON.parse(raw) as Ident;
    const tipo = eventType === Location.GeofencingEventType.Enter ? "entrada" : "salida";
    await supabase.from("geocerca_eventos").insert({
      personal_id: id.personalId,
      user_id: id.userId,
      sitio_id: region.identifier,
      tipo,
      latitud: region.latitude ?? null,
      longitud: region.longitude ?? null,
    });
  } catch {
    /* sin conexión: se pierde el evento (telemetría best-effort) */
  }
});

// Arranca el geofencing con los sitios activos georreferenciados (máx. ~90 por
// límites del SO). Idempotente.
export async function iniciarGeocercas(): Promise<void> {
  try {
    const guardia = await getMiOficial();
    if (!guardia) return;
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;

    const fg = await Location.getForegroundPermissionsAsync();
    if (!fg.granted) return;
    await Location.requestBackgroundPermissionsAsync().catch(() => null);

    const { data: sitios } = await supabase.from("sitios")
      .select("id, latitud, longitud, radio_geofence_m")
      .eq("estatus", "activo").not("latitud", "is", null).not("longitud", "is", null).limit(90);
    const regiones = ((sitios as any[]) ?? []).map((s) => ({
      identifier: s.id, latitude: Number(s.latitud), longitude: Number(s.longitud),
      radius: Math.max(50, Number(s.radio_geofence_m ?? 150)), notifyOnEnter: true, notifyOnExit: true,
    }));

    await AsyncStorage.setItem(IDENT_KEY, JSON.stringify({ personalId: guardia.personalId, userId: u.user.id } as Ident));

    const corre = await Location.hasStartedGeofencingAsync(TASK).catch(() => false);
    if (corre) await Location.stopGeofencingAsync(TASK).catch(() => {});
    if (regiones.length) await Location.startGeofencingAsync(TASK, regiones);
  } catch {
    /* si algo falla, la app sigue operando normalmente */
  }
}

export async function detenerGeocercas(): Promise<void> {
  try {
    const corre = await Location.hasStartedGeofencingAsync(TASK).catch(() => false);
    if (corre) await Location.stopGeofencingAsync(TASK).catch(() => {});
    await AsyncStorage.removeItem(IDENT_KEY);
  } catch {
    /* ignore */
  }
}
