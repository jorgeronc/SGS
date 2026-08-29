import { supabase } from "./supabase";
import { getRolActual } from "./rol";
import { getMiOficial } from "./oficial";

// Control de sesión por ROL DE SERVICIO. Guardia y supervisor solo pueden tener
// sesión mientras un turno activo cubra la hora actual; los demás roles siempre.
// El mismo chequeo sirve para GATEAR el login y para EXPIRAR la sesión cuando el
// turno termina (se corre al login, al volver a primer plano y cada minuto). Si
// el siguiente turno ya cubre la hora, el chequeo lo detecta y la sesión sigue.

export interface EstadoSesion {
  rol: string | null;
  personalId: string | null;
  gateada: boolean;          // el rol requiere turno (guardia/supervisor)
  vigente: boolean;          // puede continuar/iniciar la sesión
  turnoDesconocido: boolean; // aún no se puede resolver el elemento (sin bloquear)
}

function esGateado(rol: string | null): boolean {
  return rol === "guardia" || rol === "supervisor";
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const masDias = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);

// Date local a partir de 'YYYY-MM-DD' + 'HH:MM[:SS]'.
function combinar(fecha: string, hora: string): Date {
  const [y, m, d] = fecha.split("-").map(Number);
  const [hh = 0, mm = 0, ss = 0] = (hora || "00:00:00").split(":").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, hh, mm, ss, 0);
}

function ventanaCubre(t: any, now: Date): boolean {
  if (!t?.fecha) return false;
  const inicio = combinar(t.fecha, t.hora_inicio ?? "00:00:00");
  let fin = combinar(t.fecha, t.hora_fin ?? "23:59:59");
  if (fin <= inicio) fin = new Date(fin.getTime() + 86400000); // turno que cruza medianoche
  return now >= inicio && now <= fin;
}

// Elemento (personal) de la cuenta: por el vínculo cuenta↔personal, o el elemento
// seleccionado en el dispositivo si aún no hay vínculo.
async function personalDeCuenta(): Promise<string | null> {
  const { data: u } = await supabase.auth.getUser();
  if (u.user) {
    const { data } = await supabase.from("personal").select("id").eq("usuario_id", u.user.id).eq("estatus", "activo").maybeSingle();
    if ((data as any)?.id) return (data as any).id as string;
  }
  const mio = await getMiOficial();
  return mio?.personalId ?? null;
}

// ¿Algún turno activo cubre AHORA para este personal (como guardia o supervisor)?
async function turnoCubreAhora(personalId: string): Promise<boolean> {
  const now = new Date();
  const fechas = [ymd(masDias(now, -1)), ymd(now)]; // incluye ayer por turnos nocturnos
  const [{ data: tg }, { data: ts }] = await Promise.all([
    supabase.from("turno_guardias")
      .select("turno:turnos(fecha, hora_inicio, hora_fin, estado)")
      .eq("personal_id", personalId).eq("estatus", "activo"),
    supabase.from("turnos")
      .select("fecha, hora_inicio, hora_fin, estado")
      .eq("supervisor_id", personalId).eq("estado", "activo").in("fecha", fechas),
  ]);
  const turnos: any[] = [
    ...(((tg as any[]) ?? []).map((r) => r.turno).filter(Boolean)),
    ...(((ts as any[]) ?? [])),
  ].filter((t) => t?.estado === "activo" && fechas.includes(t.fecha));
  return turnos.some((t) => ventanaCubre(t, now));
}

export async function estadoSesion(): Promise<EstadoSesion> {
  const rol = await getRolActual();
  if (!esGateado(rol)) return { rol, personalId: null, gateada: false, vigente: true, turnoDesconocido: false };
  const personalId = await personalDeCuenta();
  if (!personalId) return { rol, personalId: null, gateada: true, vigente: true, turnoDesconocido: true };
  const cubre = await turnoCubreAhora(personalId);
  return { rol, personalId, gateada: true, vigente: cubre, turnoDesconocido: false };
}
