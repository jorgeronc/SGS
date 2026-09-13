import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Tests de lógica pura (sin red ni BD). Entorno node; solo archivos *.test.ts.
// Alias "@" → raíz de frontend (igual que tsconfig) para poder importar/mockear
// módulos por su ruta "@/lib/...". Para tests de componentes React más adelante:
// environment "jsdom" + @testing-library.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "app/**/*.test.ts"],
  },
});
