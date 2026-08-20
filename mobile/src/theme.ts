// Tema oscuro "Consola de Operaciones" (midnight command): base azul
// medianoche, acento eléctrico, oro de placa e indicadores semánticos.
// Alto contraste para uso en campo (una mano, sol directo). Objetivos
// táctiles grandes (mínimo 52-56 px de alto).
export const T = {
  // Fondos
  bg: "#080B14",
  bgAlt: "#0C1120",
  surface: "#121A2E",
  surfaceAlt: "#182238",
  surfaceHi: "#1E2A42",
  border: "#243149",
  borderSoft: "#1B2740",

  // Texto
  text: "#EAF0FB",
  textDim: "#9FB0CC",
  textMute: "#6B7B99",

  // Acento eléctrico (azul) + su degradado
  accent: "#38BDF8",
  accent2: "#2563EB",       // segundo tono del degradado del acento
  accentDim: "#1E4E86",
  accentBg: "rgba(56,189,248,0.14)",

  // Identidad / rango (oro de placa) — usar con moderación
  gold: "#F5C451",
  goldBg: "rgba(245,196,81,0.14)",

  // Semánticos
  danger: "#FF3B5C",
  danger2: "#C81E45",       // segundo tono del degradado de alerta
  dangerBg: "rgba(255,59,92,0.16)",
  warn: "#F5A623",
  warnBg: "rgba(245,166,35,0.16)",
  ok: "#28D17C",
  okBg: "rgba(40,209,124,0.16)",
  busy: "#B98BFF",          // "en el lugar"
  busyBg: "rgba(185,139,255,0.16)",

  white: "#ffffff",
} as const;

// Alturas / radios comunes
export const UI = {
  radius: 16,
  radiusSm: 11,
  radiusLg: 20,
  touch: 56,
  gap: 12,
} as const;
