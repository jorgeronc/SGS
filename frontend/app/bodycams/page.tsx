"use client";

import InventarioEquipo from "@/app/components/InventarioEquipo";

export default function BodycamsPage() {
  return (
    <InventarioEquipo
      cfg={{
        tabla: "bodycams",
        modulo: "bodycams",
        titulo: "Bodycams",
        subtitulo: "Cámaras corporales asignadas a elementos",
        placeholderBuscar: "Buscar folio, marca, serie…",
        tipos: [
          { v: "bodycam", label: "Bodycam" },
          { v: "camara_vehicular", label: "Cámara vehicular" },
          { v: "otro", label: "Otro" },
        ],
      }}
    />
  );
}
