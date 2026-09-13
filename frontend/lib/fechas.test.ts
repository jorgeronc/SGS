import { describe, test, expect } from "vitest";
import { hoyLocal, rangoDiaLocal } from "./fechas";

const dentro = (r: { desde: string; hasta: string }, ts: number) =>
  ts >= new Date(r.desde).getTime() && ts <= new Date(r.hasta).getTime();

describe("rangoDiaLocal", () => {
  test("límites del día con offset -06:00", () => {
    const { desde, hasta } = rangoDiaLocal("2026-09-09");
    expect(desde).toBe("2026-09-09T00:00:00-06:00");
    expect(hasta).toBe("2026-09-09T23:59:59.999-06:00");
  });

  test("regresión bug de fechas: rondín 21:00 local del 09 cae en el 09, NO en el 10", () => {
    // 21:00 en Monterrey (−06:00) = 03:00Z del día 10.
    const ts = new Date("2026-09-09T21:00:00-06:00").getTime();
    expect(dentro(rangoDiaLocal("2026-09-09"), ts)).toBe(true);
    expect(dentro(rangoDiaLocal("2026-09-10"), ts)).toBe(false);
  });

  test("el bug viejo (límites en UTC) lo habría metido en el día 10", () => {
    const ts = new Date("2026-09-09T21:00:00-06:00").getTime(); // 2026-09-10T03:00Z
    const desdeUTC10 = new Date("2026-09-10T00:00:00Z").getTime();
    const hastaUTC10 = new Date("2026-09-10T23:59:59Z").getTime();
    expect(ts >= desdeUTC10 && ts <= hastaUTC10).toBe(true);
  });

  test("un rondín diurno (10:00 local) cae en su propio día", () => {
    const ts = new Date("2026-09-09T10:00:00-06:00").getTime();
    expect(dentro(rangoDiaLocal("2026-09-09"), ts)).toBe(true);
    expect(dentro(rangoDiaLocal("2026-09-08"), ts)).toBe(false);
  });
});

describe("hoyLocal", () => {
  test("formato YYYY-MM-DD", () => {
    expect(hoyLocal()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
