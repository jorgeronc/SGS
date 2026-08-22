"use client";

import InventarioEquipo from "@/app/components/InventarioEquipo";

export default function ArmamentoPage() {
  return (
    <InventarioEquipo
      cfg={{
        tabla: "armamento",
        modulo: "armamento",
        titulo: "Armamento",
        subtitulo: "Armas cortas, largas y equipo menos letal",
        placeholderBuscar: "Buscar folio, tipo, marca, serie…",
        categoria: "tipo_armamento",
        tipos: [
          { v: "arma_corta", label: "Arma corta" },
          { v: "arma_larga", label: "Arma larga" },
          { v: "menos_letal", label: "Menos letal" },
          { v: "municion", label: "Munición" },
          { v: "otro", label: "Otro" },
        ],
      }}
    />
  );
}
