import AsyncStorage from "@react-native-async-storage/async-storage";

// "Mi unidad": la patrulla que el elemento está operando en el turno actual.
// El oficial la elige en Perfil (a partir del rol de servicio vigente) y desde
// ahí puede fijar su estatus operativo. Los Despachos se filtran a esta patrulla.
const KEY = "scp_mi_unidad";

export interface MiUnidad {
  patrullaId: string;
  etiqueta: string;
}

export async function setMiUnidad(u: MiUnidad): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(u));
}

export async function getMiUnidad(): Promise<MiUnidad | null> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as MiUnidad;
  } catch {
    return null;
  }
}

export async function clearMiUnidad(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}
