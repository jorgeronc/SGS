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
  { key: "consultar", label: "Consultar", icon: "search", ruta: "Buscar" },
  { key: "evidencia", label: "Evidencia", icon: "camera", ruta: "Evidencia" },
  { key: "incidentes_asignados", label: "Incidentes asignados", icon: "clipboard", ruta: "Despachos" },
  { key: "mis_incidentes", label: "Mis incidentes", icon: "list", ruta: "MisIncidentes" },
  { key: "tareas", label: "Mis tareas", icon: "clipboard-outline", ruta: "Tareas" },
  { key: "alertas", label: "Alertas", icon: "notifications", ruta: "Alertas" },
  { key: "informe_policial", label: "Nuevo Informe Policial", icon: "document-text", ruta: "NuevoIncidente" },
  { key: "informe_accidente", label: "Nuevo Informe Accidente", icon: "car", ruta: "Accidente" },
  { key: "abordamiento", label: "Abordamiento", icon: "hand-left", ruta: "Abordamiento" },
  { key: "incidentes_abiertos", label: "Incidentes abiertos", icon: "location", ruta: "Ubicacion" },
  { key: "nuevo", label: "Nuevo registro", icon: "add-circle", ruta: "Nuevo" },
];

export const MAX_ACCESOS = 8;
const DEFAULT_KEYS = ["nuevo", "consultar", "tareas", "evidencia", "incidentes_abiertos"];
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
