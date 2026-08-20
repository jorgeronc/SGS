"use client";

import CopilotoPanel from "@/app/components/CopilotoPanel";

// Copiloto IA global: asistente de investigación transversal. Busca en TODOS los
// módulos (incidentes, casos, barandilla, CAD, abordamientos, accidentes,
// órdenes, evidencias) respetando la RLS del usuario. No se acota a un
// expediente; por eso vive al nivel del sistema y no dentro de cada detalle.
export default function CopilotoPage() {
  return (
    <div className="contenedor">
      <div className="sc-exp-head">
        <h2>🔎 Copiloto IA de Investigación</h2>
        <p className="dash-sub" style={{ margin: "4px 0 0" }}>
          Consulta transversal sobre todos los expedientes del sistema. Cada respuesta cita el folio de sus fuentes y se abstiene si no hay evidencia suficiente.
        </p>
      </div>

      <div className="sc-tabbody">
        <CopilotoPanel />
      </div>
    </div>
  );
}
