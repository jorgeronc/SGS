"use client";

import InventarioEquipo from "@/app/components/InventarioEquipo";

export default function OtrosPage() {
  return (
    <InventarioEquipo
      cfg={{
        tabla: "otros",
        modulo: "otros",
        titulo: "Otros equipos",
        subtitulo: "Drones, robots y equipo especial",
        placeholderBuscar: "Buscar folio, tipo, marca, serie…",
        tipos: [
          { v: "dron", label: "Dron" },
          { v: "robot", label: "Robot" },
          { v: "equipo_tactico", label: "Equipo táctico" },
          { v: "otro", label: "Otro" },
        ],
      }}
    />
  );
}
