// Color estable por usuario para el chat. La misma lógica vive en el móvil
// (mobile/src/lib/chatColor.ts) para que los colores coincidan entre plataformas.
// Deriva un tono (hue) del id del usuario; en canales con varios participantes
// cada quien queda con un color distinto y consistente.

function hue(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % 360;
}

// Color del nombre / acento del usuario (buen contraste sobre claro y oscuro).
export function colorUsuario(id: string | null | undefined): string {
  if (!id) return "hsl(215, 15%, 45%)";
  return `hsl(${hue(id)}, 62%, 45%)`;
}

// Fondo tenue de la burbuja del usuario (mismo tono, muy desaturado).
export function fondoUsuario(id: string | null | undefined): string {
  if (!id) return "hsl(215, 15%, 95%)";
  return `hsl(${hue(id)}, 70%, 95%)`;
}
