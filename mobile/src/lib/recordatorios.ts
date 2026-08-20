import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";

// Recordatorios del oficial durante el turno activo. Son locales al dispositivo
// y EXPIRAN al terminar el turno (diurno 06–18, nocturno 18–06). Pueden llevar
// una hora de alarma (dentro del turno) que dispara una notificación local.
export interface Recordatorio {
  id: string;
  texto: string;
  creado: string;
  expira: number;       // timestamp de fin de turno
  hora?: string;        // ISO de la alarma (opcional)
  notifId?: string;     // id de la notificación local programada
}

const KEY = "scp_recordatorios";

// Ventana del turno en curso [inicio, fin] según la hora actual.
export function ventanaTurno(): { inicio: Date; fin: Date } {
  const now = new Date();
  const h = now.getHours();
  const inicio = new Date(now);
  const fin = new Date(now);
  if (h >= 6 && h < 18) {                 // diurno 06:00–18:00 de hoy
    inicio.setHours(6, 0, 0, 0);
    fin.setHours(18, 0, 0, 0);
  } else if (h >= 18) {                    // nocturno (tarde) 18:00 hoy → 06:00 mañana
    inicio.setHours(18, 0, 0, 0);
    fin.setDate(fin.getDate() + 1); fin.setHours(6, 0, 0, 0);
  } else {                                 // nocturno (madrugada) 18:00 ayer → 06:00 hoy
    inicio.setDate(inicio.getDate() - 1); inicio.setHours(18, 0, 0, 0);
    fin.setHours(6, 0, 0, 0);
  }
  return { inicio, fin };
}

function finTurno(): number { return ventanaTurno().fin.getTime(); }

async function leer(): Promise<Recordatorio[]> {
  try { return JSON.parse((await AsyncStorage.getItem(KEY)) ?? "[]"); } catch { return []; }
}
async function guardar(arr: Recordatorio[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(arr));
}

// Recordatorios aún vigentes (no expirados); de paso limpia los vencidos
// (cancelando su notificación programada si tenían).
export async function recordatoriosVigentes(): Promise<Recordatorio[]> {
  const now = Date.now();
  const todos = await leer();
  const vigentes = todos.filter((r) => r.expira > now);
  const vencidos = todos.filter((r) => r.expira <= now);
  for (const v of vencidos) { if (v.notifId) { try { await Notifications.cancelScheduledNotificationAsync(v.notifId); } catch { /* ignore */ } } }
  if (vencidos.length) await guardar(vigentes);
  return vigentes;
}

// Agrega un recordatorio. Si se pasa una hora de alarma, programa una
// notificación local a esa hora (debe caer dentro del turno).
export async function agregarRecordatorio(texto: string, alarma?: Date): Promise<void> {
  const t = texto.trim();
  if (!t) return;
  const arr = await leer();
  let notifId: string | undefined;
  let hora: string | undefined;
  if (alarma && alarma.getTime() > Date.now()) {
    try {
      notifId = await Notifications.scheduleNotificationAsync({
        content: { title: "⏰ Recordatorio de turno", body: t, sound: true },
        trigger: { date: alarma } as any,
      });
      hora = alarma.toISOString();
    } catch { /* si falla, se guarda sin alarma */ }
  }
  arr.push({ id: `${Date.now()}`, texto: t, creado: new Date().toISOString(), expira: finTurno(), hora, notifId });
  await guardar(arr);
}

export async function quitarRecordatorio(id: string): Promise<void> {
  const arr = await leer();
  const r = arr.find((x) => x.id === id);
  if (r?.notifId) { try { await Notifications.cancelScheduledNotificationAsync(r.notifId); } catch { /* ignore */ } }
  await guardar(arr.filter((x) => x.id !== id));
}
