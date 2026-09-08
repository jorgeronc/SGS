// Estado del Mapa Operacional que sobrevive la navegación entre módulos (SPA):
// centro/zoom del mapa + ventanas abiertas (incidente/cámara/chat). Vive en
// memoria a nivel de módulo, así que persiste mientras la app siga cargada y se
// LIMPIA al cerrar sesión (onAuthStateChange 'SIGNED_OUT'), porque el logout de
// esta app es navegación cliente (router.replace) sin recarga.
//
// La preferencia de TIPO de mapa NO vive aquí: esa es una preferencia duradera
// del usuario y se guarda en localStorage (ver la página del mapa).

import { supabase } from "@/lib/supabaseClient";

export interface EstadoMapaOperacional {
  view: { center: [number, number]; zoom: number } | null;
  selInc: any | null;
  selCam: any | null;
  selChat: { canalId: string; folio: string } | null;
}

const estado: EstadoMapaOperacional = { view: null, selInc: null, selCam: null, selChat: null };

export function getEstadoMapa(): EstadoMapaOperacional { return estado; }

export function setVistaMapa(center: [number, number], zoom: number) { estado.view = { center, zoom }; }

export function setVentanasMapa(w: Partial<Pick<EstadoMapaOperacional, "selInc" | "selCam" | "selChat">>) {
  Object.assign(estado, w);
}

export function limpiarEstadoMapa() {
  estado.view = null; estado.selInc = null; estado.selCam = null; estado.selChat = null;
}

// Limpia el estado al cerrar sesión. Idempotente (una sola suscripción).
let cableado = false;
export function limpiarAlCerrarSesion() {
  if (cableado) return;
  cableado = true;
  supabase.auth.onAuthStateChange((ev) => { if (ev === "SIGNED_OUT") limpiarEstadoMapa(); });
}
