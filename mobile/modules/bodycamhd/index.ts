import { requireNativeModule } from "expo-modules-core";

export interface BodycamHdModule {
  // Inicia la grabación HD segmentada (3 min) en un foreground service (sigue con
  // pantalla apagada / app en segundo plano). Cada segmento finalizado emite el
  // evento "onSegment" con { uri, durationMs }. Los archivos quedan en el teléfono.
  start(): Promise<boolean>;
  stop(): Promise<boolean>;
  isRecording(): boolean;
  // Sostén de transmisión: foreground service de tipo cámara (sin abrir la cámara)
  // para que WebRTC capture con la pantalla bloqueada durante una alerta.
  startStreamHold(): Promise<boolean>;
  stopStreamHold(): Promise<boolean>;
  addListener(event: "onSegment" | "onError", listener: (payload: any) => void): { remove: () => void };
}

// El módulo solo existe en Android (dev/EAS build). En Expo Go o iOS, la carga
// falla; el wrapper (src/lib/bodycamHd.ts) maneja ese caso.
export default requireNativeModule<BodycamHdModule>("Bodycamhd");
