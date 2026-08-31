import { useEffect, useState } from "react";
import NetInfo, { type NetInfoState } from "@react-native-community/netinfo";

// Estado de red del dispositivo. `conectado` es true con cualquier red que
// tenga internet (WiFi incluida) — la app NO requiere datos móviles: envía por
// WiFi aunque el teléfono no tenga SIM.
export type EstadoRed = { conectado: boolean; tipo: string | null; wifi: boolean };

export function estadoDesde(s: NetInfoState): EstadoRed {
  // isInternetReachable puede ser null mientras se determina; solo se toma como
  // "sin conexión" cuando es explícitamente false.
  const conectado = !!s.isConnected && s.isInternetReachable !== false;
  return { conectado, tipo: s.type ?? null, wifi: s.type === "wifi" };
}

// Suscripción cruda (para lógica fuera de componentes, p. ej. App.tsx).
export function alCambiarRed(cb: (e: EstadoRed) => void): () => void {
  const unsub = NetInfo.addEventListener((s) => cb(estadoDesde(s)));
  NetInfo.fetch().then((s) => cb(estadoDesde(s)));
  return unsub;
}

// Hook reactivo para la UI.
export function useConectividad(): EstadoRed {
  const [estado, setEstado] = useState<EstadoRed>({ conectado: true, tipo: null, wifi: false });
  useEffect(() => alCambiarRed(setEstado), []);
  return estado;
}
