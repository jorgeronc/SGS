// Tema de la interfaz: claro / oscuro / automático (según el sistema).
// La preferencia del usuario se guarda en localStorage; el data-theme del
// documento se pone en "light"/"dark" (ya resuelto) para que el CSS y los mapas
// (LocationIQ claro/oscuro) reaccionen.

export type Tema = "light" | "dark" | "system";
const KEY = "sgs-theme";

export function temaGuardado(): Tema {
  try { const v = localStorage.getItem(KEY) as Tema | null; return v === "light" || v === "dark" || v === "system" ? v : "system"; }
  catch { return "system"; }
}

export function resolver(t: Tema): "light" | "dark" {
  if (t === "system") return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  return t;
}

// Aplica el tema al documento y lo guarda; avisa a los mapas para que cambien el
// estilo de tiles sin recargar.
export function aplicarTema(t: Tema): void {
  const eff = resolver(t);
  document.documentElement.setAttribute("data-theme", eff);
  try { localStorage.setItem(KEY, t); } catch { /* */ }
  try { window.dispatchEvent(new CustomEvent("sgs-theme", { detail: eff })); } catch { /* */ }
}
