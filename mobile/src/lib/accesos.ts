import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";

// Accesos rápidos configurables del Inicio. El oficial elige, desde Perfil,
// cuáles funciones aparecen (máx. 8) de entre las disponibles. Se guarda por
// dispositivo. Al habilitar nuevas funciones, basta con agregarlas a la lista.
export type IconName = keyof typeof Ionicons.glyphMap;

export interface AccesoDef {
  key: string;
  label: string;
  icon: IconName;
  ruta: string; // nombre de ruta (tab o pantalla del stack)
}

export const ACCESOS_DISPONIBLES: AccesoDef[] = [
  { key: "rondin", label: "Registrar rondín", icon: "qr-code", ruta: "Rondin" },
  { key: "evidencia", label: "Nueva evidencia", icon: "camera", ruta: "Evidencia" },
  { key: "tareas", label: "Mis tareas", icon: "clipboard-outline", ruta: "Tareas" },
  { key: "chat", label: "Chat", icon: "chatbubbles", ruta: "Chat" },
  { key: "consultar", label: "Consultar", icon: "search", ruta: "Buscar" },
];

export const MAX_ACCESOS = 8;
const DEFAULT_KEYS = ["rondin", "evidencia", "tareas", "chat", "consultar"];
const KEY = "scp_accesos_rapidos";

export function accesoPorKey(key: string): AccesoDef | undefined {
  return ACCESOS_DISPONIBLES.find((a) => a.key === key);
}

export async function getAccesos(): Promise<string[]> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return DEFAULT_KEYS;
  try {
    const arr = (JSON.parse(raw) as string[]).filter((k) => accesoPorKey(k)).slice(0, MAX_ACCESOS);
    return arr.length ? arr : DEFAULT_KEYS;
  } catch {
    return DEFAULT_KEYS;
  }
}

export async function setAccesos(keys: string[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(keys.slice(0, MAX_ACCESOS)));
}
