// Color estable por usuario para el chat. Misma lógica que el web
// (frontend/lib/chatColor.ts) para que los colores coincidan entre plataformas.
function hue(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % 360;
}

// Color del nombre / acento del usuario.
export function colorUsuario(id: string | null | undefined): string {
  if (!id) return "hsl(215, 15%, 50%)";
  return `hsl(${hue(id)}, 62%, 48%)`;
}

// Fondo tenue de la burbuja del usuario (mismo tono).
export function fondoUsuario(id: string | null | undefined): string {
  if (!id) return "hsl(215, 15%, 92%)";
  return `hsl(${hue(id)}, 68%, 93%)`;
}
