// Estados del contrato (ciclo de vida) con su etiqueta y colores, consistentes en
// la lista y el detalle. Ver migración 0127_contratos_fase1.sql.
export const ESTADO_CONTRATO: Record<string, { lbl: string; bg: string; fg: string }> = {
  borrador:    { lbl: "Borrador", bg: "#eef1f4", fg: "#556070" },
  por_aprobar: { lbl: "Por aprobar", bg: "#fff4e0", fg: "#8a5a00" },
  programado:  { lbl: "Programado", bg: "#e7effe", fg: "#2f6bff" },
  activo:      { lbl: "Activo", bg: "#e6f6ec", fg: "#0a7c2f" },
  suspendido:  { lbl: "Suspendido", bg: "#fde7e7", fg: "#b00020" },
  por_vencer:  { lbl: "Por vencer", bg: "#fff4e0", fg: "#8a5a00" },
  vencido:     { lbl: "Vencido", bg: "#f1e6e6", fg: "#8a1220" },
  terminado:   { lbl: "Terminado", bg: "#ececec", fg: "#555" },
  cerrado:     { lbl: "Cerrado", bg: "#ececec", fg: "#555" },
};
