import "react-native-url-polyfill/auto";
import { Platform } from "react-native";
import * as Application from "expo-application";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

// Id estable del dispositivo, enviado como cabecera x-device-id en TODA petición
// para que la bitácora atribuya cada acción del móvil al aparato (computadora_id),
// igual que la web. En Android es síncrono; en iOS se resuelve luego (best-effort).
let deviceId = "";
try {
  if (Platform.OS === "android") deviceId = Application.getAndroidId() ?? "";
} catch {
  /* sin id: la bitácora igual guarda usuario e IP */
}

// Mismo backend que la web. La sesión (token JWT de Supabase Auth) se guarda
// en el dispositivo con AsyncStorage y se auto-refresca; así el acceso a la
// app es por token. Para producción se puede endurecer con expo-secure-store.
//
// Los valores de respaldo permiten que la app SIEMPRE se conecte al backend en
// la nube (desde cualquier red, sin depender de un .env local ni del servidor
// de desarrollo). La "publishable/anon key" es pública por diseño: viaja en el
// bundle del cliente igual que en la web. Para apuntar a otro proyecto, define
// EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY (en .env o eas.json).
const supabaseUrl =
  process.env.EXPO_PUBLIC_SUPABASE_URL ?? "https://rdyjjfbehjfggpldmmur.supabase.co";
const supabaseAnonKey =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJkeWpqZmJlaGpmZ2dwbGRtbXVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcyNTM5MTYsImV4cCI6MjEwMjgyOTkxNn0.KfTuJC7Ju3UtaqdmOvE8_DUot6xpmCpGIgHV6Ydn1-4";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
  global: { headers: deviceId ? { "x-device-id": deviceId } : {} },
});

export const BUCKET_FOTOS = "fotos";
