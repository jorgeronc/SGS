"use client";

import ParametrosPanel from "../ParametrosPanel";

// Configuración → Mi empresa: datos de la corporación, jurisdicción y contacto.
export default function MiEmpresaPage() {
  return (
    <main className="contenedor">
      <h2>Mi empresa</h2>
      <ParametrosPanel seccion="empresa" />
    </main>
  );
}
