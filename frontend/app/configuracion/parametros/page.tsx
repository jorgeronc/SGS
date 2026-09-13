"use client";

import ParametrosPanel from "../ParametrosPanel";
import PersonalizarMenu from "../../components/PersonalizarMenu";

// Configuración → Parámetros: rastreo GPS (y a futuro, APIs externas) +
// personalización del menú lateral por cuenta.
export default function ParametrosPage() {
  return (
    <main className="contenedor">
      <h2>Parámetros</h2>
      <ParametrosPanel seccion="gps" />
      <h3 style={{ marginTop: 24 }}>Personalizar menú lateral</h3>
      <PersonalizarMenu />
    </main>
  );
}
