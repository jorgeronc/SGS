/**
 * Identificador de "computadora" (computadora_id) que se adjunta a cada
 * llamada a Supabase para la bitácora de auditoría.
 *
 * ESTADO ACTUAL: PROVISIONAL. Genera y guarda un UUID en localStorage la
 * primera vez que se usa el navegador. Esto es fácil de falsificar o de
 * perder (se borra si el usuario limpia el navegador), así que NO debe
 * considerarse una identificación de dispositivo confiable para fines
 * legales/judiciales.
 *
 * PENDIENTE (ver sección 7 del documento de arquitectura): sustituir esto
 * por un catálogo de dispositivos registrados por TI — cada estación de
 * trabajo de la agencia se da de alta una sola vez con un identificador
 * asignado, y ese identificador (no uno generado por el navegador) es el
 * que se debe leer aquí.
 */

const DEVICE_ID_KEY = "scp_device_id_provisional";

export function getDeviceId(): string {
  if (typeof window === "undefined") {
    return "server";
  }

  let deviceId = window.localStorage.getItem(DEVICE_ID_KEY);

  if (!deviceId) {
    deviceId = `prov-${crypto.randomUUID()}`;
    window.localStorage.setItem(DEVICE_ID_KEY, deviceId);
  }

  return deviceId;
}
