"use client";

import InventarioEquipo from "@/app/components/InventarioEquipo";

export default function ComunicacionPage() {
  return (
    <InventarioEquipo
      cfg={{
        tabla: "comunicacion",
        modulo: "comunicacion",
        titulo: "Equipo de comunicación",
        subtitulo: "Radios, celulares y equipo de enlace",
        placeholderBuscar: "Buscar folio, tipo, marca, serie…",
        tipos: [
          { v: "radio", label: "Radio" },
          { v: "celular", label: "Celular" },
          { v: "repetidor", label: "Repetidor" },
          { v: "otro", label: "Otro" },
        ],
      }}
    />
  );
}
