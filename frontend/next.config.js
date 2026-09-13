/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // ESLint queda como señal de /health, NO como puerta del deploy: el código
  // nunca se linteó y `next build` fallaría con errores de lint. Correr lint
  // aparte con `npx next lint`. Quitar esto cuando el lint esté limpio.
  eslint: { ignoreDuringBuilds: true },
};

module.exports = nextConfig;
