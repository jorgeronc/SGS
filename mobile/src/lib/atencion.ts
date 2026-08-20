import AsyncStorage from "@react-native-async-storage/async-storage";

// "Atención actual": el incidente que el elemento está atendiendo en este
// momento (se fija al abrir el Informe de un despacho y se limpia al cerrarlo).
// Lo usa el botón de pánico para relacionar la alerta con ese incidente.
const KEY = "scp_atencion_actual";

export interface Atencion {
  incidenteId: string;
  folio: string | null;
}

export async function setAtencion(a: Atencion): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(a));
}

export async function getAtencion(): Promise<Atencion | null> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Atencion;
  } catch {
    return null;
  }
}

export async function clearAtencion(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}
