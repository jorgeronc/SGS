import AsyncStorage from "@react-native-async-storage/async-storage";

// Registro local de las alertas de pánico que el oficial ha ENVIADO desde este
// dispositivo (no hay tabla de notificaciones). Se muestran en Perfil →
// "Mis alertas". El envío real lo hace lib/panico.ts, que llama aquí al final.
const KEY = "scp_mis_alertas";

export interface AlertaEnviada {
  id: string;
  tipo: "emergencia" | "incidente";
  titulo: string;
  detalle: string;
  fecha: string; // ISO
}

export async function listarAlertasEnviadas(): Promise<AlertaEnviada[]> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return [];
  try {
    return (JSON.parse(raw) as AlertaEnviada[]).sort((a, b) => b.fecha.localeCompare(a.fecha));
  } catch {
    return [];
  }
}

export async function registrarAlertaEnviada(a: Omit<AlertaEnviada, "id" | "fecha">): Promise<void> {
  const previas = await listarAlertasEnviadas();
  const nueva: AlertaEnviada = { ...a, id: `${Date.now()}`, fecha: new Date().toISOString() };
  const arr = [nueva, ...previas].slice(0, 200);
  await AsyncStorage.setItem(KEY, JSON.stringify(arr));
}
