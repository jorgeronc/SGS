import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { supabase } from "./supabase";
import { getMiOficialValido } from "./oficial";

// Project ID de EAS (app.json → extra.eas.projectId). Necesario para obtener
// el token de Expo Push en builds de desarrollo/producción.
const PROJECT_ID = "beff23c4-a822-44ea-a08b-e21e75059658";

// Muestra las notificaciones aunque la app esté en primer plano.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

let tokenActual: string | null = null;

// Registra el dispositivo para push: pide permiso, obtiene el token de Expo y
// lo guarda en `dispositivos_push` ligado al usuario y a su elemento (personal).
export async function registrarPush(): Promise<void> {
  try {
    if (!Device.isDevice) return; // los emuladores no reciben push remoto

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "Incidentes",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#0b3d66",
      });
    }

    const { status: existente } = await Notifications.getPermissionsAsync();
    let status = existente;
    if (status !== "granted") {
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    if (status !== "granted") return;

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: PROJECT_ID });
    tokenActual = token;

    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const oficial = await getMiOficialValido();

    await supabase.from("dispositivos_push").upsert(
      {
        expo_push_token: token,
        user_id: u.user.id,
        personal_id: oficial?.personalId ?? null,
        plataforma: Platform.OS,
        actualizado_en: new Date().toISOString(),
      },
      { onConflict: "expo_push_token" }
    );
  } catch {
    // Sin push: la app sigue funcionando normalmente.
  }
}

// Actualiza el elemento (personal) ligado a este dispositivo, para que las
// notificaciones de asignación lleguen al oficial correcto. Se llama al
// cambiar "Mi elemento" en Perfil.
export async function actualizarPersonalPush(personalId: string | null): Promise<void> {
  try {
    if (!tokenActual) return;
    await supabase
      .from("dispositivos_push")
      .update({ personal_id: personalId, actualizado_en: new Date().toISOString() })
      .eq("expo_push_token", tokenActual);
  } catch {
    /* ignore */
  }
}
