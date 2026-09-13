// Cortes de día en hora LOCAL de Monterrey (UTC−6, sin horario de verano).
// `fecha_hora` / `iniciada_en` son timestamptz: si se filtran con límites SIN
// offset (p. ej. `2026-09-09T00:00:00`), PostgREST los interpreta en UTC y un
// registro nocturno local cae en el día siguiente (el bug de fechas de Supervisión).
// Estos helpers devuelven el "hoy" y los límites del día ya con el offset correcto.
export const TZ_MTY = "-06:00";

// "Hoy" en hora local (YYYY-MM-DD), no en UTC (toISOString daría el día UTC).
export function hoyLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Límites [desde, hasta] de un día local (Monterrey) para filtrar timestamptz.
export function rangoDiaLocal(fecha: string): { desde: string; hasta: string } {
  return { desde: `${fecha}T00:00:00${TZ_MTY}`, hasta: `${fecha}T23:59:59.999${TZ_MTY}` };
}
