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
        categoria: "tipo_bodycam",
        tipos: [
          { v: "Smartphone", label: "Smartphone" },
          { v: "Bodycam portátil", label: "Bodycam portátil" },
          { v: "Bodycam fija", label: "Bodycam fija" },
        ],
      }}
    />
  );
}
