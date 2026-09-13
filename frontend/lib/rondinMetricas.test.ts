import { describe, test, expect } from "vitest";
import { distM, detectarParadas, distARutaM, muestrearRuta, metricasRuta, type PtoGps } from "./rondinMetricas";

// Punto base (Monterrey) para construir escenarios reproducibles.
const LAT = 25.6714, LNG = -100.309;
// A esta latitud, 0.001° de longitud ≈ 100 m; 0.001° de latitud ≈ 111 m.
const t = (min: number) => new Date(2026, 8, 9, 8, min, 0).toISOString();

describe("distM (Haversine)", () => {
  test("mismo punto = 0 m", () => {
    expect(distM(LAT, LNG, LAT, LNG)).toBe(0);
  });
  test("1° de latitud ≈ 111 km", () => {
    const d = distM(0, 0, 1, 0);
    expect(d).toBeGreaterThan(110000);
    expect(d).toBeLessThan(112000);
  });
  test("es simétrica", () => {
    expect(distM(LAT, LNG, LAT + 0.01, LNG + 0.01)).toBeCloseTo(distM(LAT + 0.01, LNG + 0.01, LAT, LNG), 6);
  });
  test("0.001° de latitud ≈ 111 m (rango checkpoint)", () => {
    const d = distM(LAT, LNG, LAT + 0.001, LNG);
    expect(d).toBeGreaterThan(105);
    expect(d).toBeLessThan(120);
  });
});

describe("detectarParadas", () => {
  test("permanencia > 5 min en el mismo lugar = 1 parada", () => {
    // 7 puntos, uno por minuto, todos dentro de ~5 m.
    const pts: PtoGps[] = Array.from({ length: 7 }, (_, i) => ({ lat: LAT + i * 0.00001, lng: LNG, t: t(i) }));
    const par = detectarParadas(pts, 25, 5);
    expect(par).toHaveLength(1);
    expect(par[0].durMin).toBeGreaterThanOrEqual(5);
  });
  test("movimiento continuo (fuera del radio) = 0 paradas", () => {
    // Cada punto ~111 m del anterior → nunca permanece.
    const pts: PtoGps[] = Array.from({ length: 6 }, (_, i) => ({ lat: LAT + i * 0.001, lng: LNG, t: t(i) }));
    expect(detectarParadas(pts, 25, 5)).toHaveLength(0);
  });
  test("cluster corto (< minMin) no cuenta", () => {
    const pts: PtoGps[] = [
      { lat: LAT, lng: LNG, t: t(0) },
      { lat: LAT, lng: LNG, t: t(2) }, // solo 2 min
    ];
    expect(detectarParadas(pts, 25, 5)).toHaveLength(0);
  });
});

describe("distARutaM", () => {
  const ruta: [number, number][] = [[LAT, LNG], [LAT, LNG + 0.001]]; // segmento este-oeste ~100 m
  test("punto sobre la ruta ≈ 0 m", () => {
    expect(distARutaM(LAT, LNG + 0.0005, ruta, LAT)).toBeLessThan(5);
  });
  test("punto desviado ~111 m de la ruta", () => {
    const d = distARutaM(LAT + 0.001, LNG + 0.0005, ruta, LAT);
    expect(d).toBeGreaterThan(90);
    expect(d).toBeLessThan(130);
  });
  test("ruta vacía = Infinity", () => {
    expect(distARutaM(LAT, LNG, [], LAT)).toBe(Infinity);
  });
});

describe("muestrearRuta", () => {
  test("densifica el segmento e incluye el punto final", () => {
    const ruta: [number, number][] = [[LAT, LNG], [LAT, LNG + 0.001]]; // ~100 m
    const m = muestrearRuta(ruta, 20); // paso 20 m → ~5 muestras + final
    expect(m.length).toBeGreaterThanOrEqual(5);
    expect(m[m.length - 1]).toEqual([LAT, LNG + 0.001]);
  });
});

describe("metricasRuta", () => {
  const ruta: [number, number][] = [[LAT, LNG], [LAT, LNG + 0.002]]; // ~200 m E-O
  test("recorrido que sigue la ruta → cobertura alta, sin desvío", () => {
    const rec: PtoGps[] = Array.from({ length: 11 }, (_, i) => ({ lat: LAT, lng: LNG + i * 0.0002, t: t(i) }));
    const r = metricasRuta(rec, ruta, 30);
    expect(r).not.toBeNull();
    expect(r!.cobertura).toBeGreaterThanOrEqual(90);
    expect(r!.tFueraMin).toBe(0);
    expect(r!.desvMax).toBeLessThan(30);
  });
  test("recorrido fuera del corredor → desviación y tiempo fuera > 0", () => {
    // Recorrido paralelo, ~111 m al norte de la ruta (fuera del corredor de 30 m).
    const rec: PtoGps[] = Array.from({ length: 11 }, (_, i) => ({ lat: LAT + 0.001, lng: LNG + i * 0.0002, t: t(i) }));
    const r = metricasRuta(rec, ruta, 30);
    expect(r).not.toBeNull();
    expect(r!.desvMax).toBeGreaterThan(30);
    expect(r!.tFueraMin).toBeGreaterThan(0);
  });
  test("ruta con < 2 puntos = null", () => {
    expect(metricasRuta([{ lat: LAT, lng: LNG, t: t(0) }], [[LAT, LNG]], 30)).toBeNull();
  });
});
