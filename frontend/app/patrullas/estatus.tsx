// Estatus operativo de la unidad (para el despacho) y su presentación.
export const ESTATUS_LISTA = ["disponible", "en_rutina", "en_pausa", "fuera_servicio"];

export const ESTATUS_UNIDAD: Record<string, { label: string; bg: string }> = {
  disponible: { label: "Disponible", bg: "#2e7d32" },
  en_rutina: { label: "En rutina", bg: "#1565c0" },
  en_pausa: { label: "En pausa", bg: "#e65100" },
  fuera_servicio: { label: "Fuera de servicio", bg: "#616161" },
};

export function PillUnidad({ v }: { v: string | null }) {
  const c = ESTATUS_UNIDAD[v ?? ""] ?? { label: v ?? "—", bg: "#616161" };
  return (
    <span style={{ display: "inline-block", minWidth: 120, textAlign: "center", padding: "3px 10px", borderRadius: 12, background: c.bg, color: "#fff", fontSize: 12, fontWeight: 600, textTransform: "uppercase" }}>
      {c.label}
    </span>
  );
}
