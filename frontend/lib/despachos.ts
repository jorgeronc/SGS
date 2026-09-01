import { supabase } from "@/lib/supabaseClient";

export interface UnidadDespacho {
  numero: string | null;   // número de patrulla
  oficial: string;         // nombre + rango/placa del oficial
  estado: string;          // estado del despacho (asignada, en_ruta, en_lugar, cerrado…)
}

// Etiquetas y colores de los estados del DESPACHO (unidad), consistentes en
// lista, detalle y mapa.
export const DESPACHO_LABEL: Record<string, string> = {
  asignada: "Asignada",
  enterado: "Enterado",
  en_ruta: "En ruta",
  en_lugar: "En el lugar",
  cerrado: "Cerrado",
};
export const DESPACHO_COLOR: Record<string, string> = {
  asignada: "#8a6d00",
  enterado: "#0b62c4",
  en_ruta: "#e65100",
  en_lugar: "#7a3fbf",
  cerrado: "#2e7d32",
};

export const REPORTE_DESP_LABEL: Record<string, string> = {
  recibida: "Recibida", despachada: "Despachado", en_atencion: "En atención", resuelta: "Resuelta",
};
export const ESTATUS_LABEL: Record<string, string> = { activo: "Activo", cerrado: "Cerrado", cancelado: "Cancelado" };

export interface HistItem {
  ambito: string; campo: string; estado: string | null;
  patrulla_numero: string | null; recurso_desc: string | null; es_contacto: boolean;
  usuario: string | null; cambiado_en: string;
  etiqueta: string;
}

// Etiqueta legible de un cambio de estado del historial.
export function etiquetaHistorial(r: any): string {
  if (r.ambito === "despacho") {
    const nombre = r.recurso_desc ?? (r.patrulla_numero ? `#${r.patrulla_numero}` : "");
    if (r.es_contacto) return `Autoridad — Enterada${nombre ? `: ${nombre}` : ""}`;
    return `Recurso ${nombre} → ${DESPACHO_LABEL[r.estado] ?? r.estado}`.replace(/\s+/g, " ").trim();
  }
  if (r.campo === "estatus") return `Reporte → ${ESTATUS_LABEL[r.estado] ?? r.estado}`;
  return `Despacho → ${REPORTE_DESP_LABEL[r.estado] ?? r.estado}`;
}

// Línea de tiempo de cambios de estado de un reporte (y sus despachos).
export async function historialCad(llamadaId: string): Promise<HistItem[]> {
  const { data } = await supabase
    .from("cad_estado_historial")
    .select("ambito, campo, estado, patrulla_numero, recurso_desc, es_contacto, usuario, cambiado_en")
    .eq("llamada_id", llamadaId)
    .order("cambiado_en", { ascending: true });
  return ((data as any[]) ?? []).map((r) => ({ ...r, etiqueta: etiquetaHistorial(r) }));
}

// Unidad que atiende (o atendió) cada llamada: el despacho más reciente. Si se
// pasan ids, se acota a esas llamadas.
export async function unidadesPorLlamada(llamadaIds?: string[]): Promise<Record<string, UnidadDespacho>> {
  let q = supabase
    .from("despachos")
    .select("llamada_id, estado, fecha_asignacion, patrulla:patrullas(numero), personal:personal(numero_placa, rango, persona:personas(nombre, apellido_paterno))")
    .eq("estatus", "activo")
    .order("fecha_asignacion", { ascending: true });
  if (llamadaIds && llamadaIds.length) q = q.in("llamada_id", llamadaIds);
  const { data } = await q;

  const map: Record<string, UnidadDespacho> = {};
  for (const d of ((data as any[]) ?? [])) {
    if (map[d.llamada_id]) continue; // conservamos el PRIMER recurso asignado
    const p = d.personal;
    const nombre = p?.persona ? `${p.persona.nombre ?? ""} ${p.persona.apellido_paterno ?? ""}`.trim() : "";
    const empleo = `${p?.rango ?? ""}${p?.numero_placa ? ` #${p.numero_placa}` : ""}`.trim();
    map[d.llamada_id] = {
      numero: d.patrulla?.numero ?? null,
      oficial: [nombre, empleo].filter(Boolean).join(" — "),
      estado: d.estado,
    };
  }
  return map;
}
