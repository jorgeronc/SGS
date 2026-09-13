import { defineConfig } from "vitest/config";

// Tests de lógica pura (sin red ni BD). Entorno node; solo archivos lib/**/*.test.ts.
// Para tests de componentes React más adelante: environment "jsdom" + @testing-library.
export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "app/**/*.test.ts"],
  },
});
