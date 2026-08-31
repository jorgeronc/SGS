import { useEffect, useState } from "react";
import NetInfo, { type NetInfoState } from "@react-native-community/netinfo";

// Estado de red del dispositivo. `conectado` es true con cualquier red que
// tenga internet (WiFi incluida) — la app NO requiere datos móviles: envía por
// WiFi aunque el teléfono no tenga SIM.
export type EstadoRed = { conectado: boolean; tipo: string | null; wifi: boolean };

export function estadoDesde(s: NetInfoState): EstadoRed {
  // Se basa en isConnected (estar en una red): isInternetReachable es poco
  // fiable en algunos equipos (WiFi sin SIM) y daba falsos "sin conexión".
  // El envío real igual se intenta y sube si hay internet.
  const conectado = !!s.isConnected;
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
