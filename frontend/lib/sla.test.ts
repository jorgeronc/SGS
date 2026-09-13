import { describe, test, expect, vi } from "vitest";

// sla.ts importa el cliente de Supabase al cargar (createClient truena sin envs en
// test). Lo mockeamos para probar SOLO la lógica pura de puntaje.
vi.mock("@/lib/supabaseClient", () => ({ supabase: {} }));

import { puntajeMetrica, type MetricaSla } from "@/lib/sla";

const m = (over: Partial<MetricaSla>): MetricaSla => ({
  clave: "x", nombre: "x", unidad: "%", dir: ">=", valor: null, meta: null,
  activa: true, cumple: null, modulo: "x", ...over,
});

describe("puntajeMetrica", () => {
  test(">=: valor por encima de la meta = 100", () => {
    expect(puntajeMetrica(m({ dir: ">=", valor: 95, meta: 90 }))).toBe(100);
  });
  test(">=: valor a la mitad de la meta = 50", () => {
    expect(puntajeMetrica(m({ dir: ">=", valor: 45, meta: 90 }))).toBe(50);
  });
  test("<=: valor por debajo de la meta = 100", () => {
    expect(puntajeMetrica(m({ dir: "<=", valor: 5, meta: 10 }))).toBe(100);
  });
  test("<=: valor al doble de la meta = 0", () => {
    expect(puntajeMetrica(m({ dir: "<=", valor: 20, meta: 10 }))).toBe(0);
  });
  test("sin valor o sin meta = 0 (no rompe)", () => {
    expect(puntajeMetrica(m({ valor: null, meta: 90 }))).toBe(0);
    expect(puntajeMetrica(m({ valor: 90, meta: null }))).toBe(0);
  });
});
