"use client";

import { useState } from "react";
import AdminTabs from "../admin/AdminTabs";
import ParametrosPanel from "./ParametrosPanel";
import AcercaDe from "./AcercaDe";

// Pantalla Configuración: agrupa Administración, Parámetros del sistema y
// Acerca de en una sola pantalla con pestañas.
const TABS = [
  { k: "admin", label: "Administración" },
  { k: "parametros", label: "Parámetros del sistema" },
  { k: "acerca", label: "Acerca de" },
];

export default function ConfiguracionPage() {
  const [tab, setTab] = useState("admin");
  return (
    <main className="contenedor">
      <h2>Configuración</h2>
      <div className="sc-tabs">
        {TABS.map((t) => (
          <button key={t.k} className={`sc-tab${tab === t.k ? " on" : ""}`} onClick={() => setTab(t.k)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="sc-tabbody">
        {tab === "admin" && <AdminTabs embedded />}
        {tab === "parametros" && <ParametrosPanel />}
        {tab === "acerca" && <AcercaDe />}
      </div>
    </main>
  );
}
