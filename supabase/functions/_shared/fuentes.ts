// Fuentes de texto que alimentan el índice semántico del copiloto (RAG).
// Cada fuente define qué columnas leer y cómo construir el texto indexable,
// el folio (para citar) y un título corto. Los registros SENSIBLES
// (asuntos_internos) NO se incluyen: quedan fuera del alcance de la IA.

export interface Fuente {
  tabla: string;
  select: string;
  filtroActivo: boolean;               // aplica estatus = 'activo'
  nivelAcceso: "general" | "sensible";
  folio: (r: any) => string | null;
  titulo: (r: any) => string;
  texto: (r: any) => string;
  metadatos?: (r: any) => Record<string, unknown>;
}

const limpio = (...xs: (string | null | undefined)[]) =>
  xs.map((x) => (x ?? "").toString().trim()).filter(Boolean).join(". ");

export const FUENTES: Fuente[] = [
  {
    tabla: "incidentes",
    select: "id, folio, tipo, delito, narrativa, acciones, nombre_lugar, detalle_objetos, direccion, estatus",
    filtroActivo: true,
    nivelAcceso: "general",
    folio: (r) => r.folio ?? null,
    titulo: (r) => r.delito || r.tipo || "Incidente",
    texto: (r) => limpio(r.delito, r.tipo, r.narrativa, r.acciones, r.nombre_lugar, r.detalle_objetos, r.direccion),
  },
  {
    tabla: "novedades",
    select: "id, incidente_id, texto",
    filtroActivo: false,
    nivelAcceso: "general",
    folio: () => null,
    titulo: () => "Novedad de incidente",
    texto: (r) => limpio(r.texto),
    metadatos: (r) => ({ incidente_id: r.incidente_id }),
  },
  {
    tabla: "narrativas_cad",
    select: "id, llamada_id, texto",
    filtroActivo: false,
    nivelAcceso: "general",
    folio: () => null,
    titulo: () => "Narrativa CAD",
    texto: (r) => limpio(r.texto),
    metadatos: (r) => ({ llamada_id: r.llamada_id }),
  },
  {
    tabla: "casos",
    select: "id, folio, titulo, tipo, delito, direccion, estatus",
    filtroActivo: true,
    nivelAcceso: "general",
    folio: (r) => r.folio ?? null,
    titulo: (r) => r.titulo || r.delito || "Caso",
    texto: (r) => limpio(r.titulo, r.delito, r.tipo, r.direccion),
  },
  {
    tabla: "llamadas_cad",
    select: "id, folio, tipo, descripcion, direccion, estatus",
    filtroActivo: true,
    nivelAcceso: "general",
    folio: (r) => r.folio ?? null,
    titulo: (r) => r.tipo || "Reporte CAD",
    texto: (r) => limpio(r.tipo, r.descripcion, r.direccion),
  },
  {
    tabla: "barandilla",
    select: "id, folio, motivo, pertenencias, estatus",
    filtroActivo: true,
    nivelAcceso: "general",
    folio: (r) => r.folio ?? null,
    titulo: () => "Registro de barandilla",
    texto: (r) => limpio(r.motivo, r.pertenencias),
  },
  {
    tabla: "evidencias",
    select: "id, folio, tipo, descripcion, estatus",
    filtroActivo: true,
    nivelAcceso: "general",
    folio: (r) => r.folio ?? null,
    titulo: (r) => r.tipo || "Evidencia",
    texto: (r) => limpio(r.tipo, r.descripcion),
  },
  {
    tabla: "ordenes",
    select: "id, folio, tipo, asunto, estatus",
    filtroActivo: true,
    nivelAcceso: "general",
    folio: (r) => r.folio ?? null,
    titulo: (r) => r.tipo || "Orden/Citatorio",
    texto: (r) => limpio(r.tipo, r.asunto),
  },
];

// Trocea el texto en fragmentos de ~1200 caracteres respetando límites de frase.
export function trocear(texto: string, max = 1200): string[] {
  const t = texto.trim();
  if (t.length <= max) return t ? [t] : [];
  const partes: string[] = [];
  const frases = t.split(/(?<=[.!?])\s+/);
  let buf = "";
  for (const f of frases) {
    if ((buf + " " + f).length > max && buf) { partes.push(buf.trim()); buf = ""; }
    buf += (buf ? " " : "") + f;
  }
  if (buf.trim()) partes.push(buf.trim());
  return partes;
}
