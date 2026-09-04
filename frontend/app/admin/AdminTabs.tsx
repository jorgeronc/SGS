"use client";

import { useState } from "react";
import UsuariosPanel from "./UsuariosPanel";
import InicialesPanel from "./InicialesPanel";
import ConsecutivosPanel from "./ConsecutivosPanel";
import CatalogosPanel from "./CatalogosPanel";
import TiposTurnoPanel from "./TiposTurnoPanel";

const PESTANAS = [
  { k: "usuarios", label: "Usuarios y roles" },
  { k: "iniciales", label: "Iniciales por módulo" },
  { k: "consecutivos", label: "Consecutivos por año" },
  { k: "tipos_turno", label: "Tipos de turno" },
  { k: "catalogos", label: "Catálogos" },
];

// Módulo de Administración con pestañas horizontales (mismo estilo que el
// detalle de un informe de incidente). Cada pestaña monta su propio panel.
// `embedded`: se usa dentro de la pantalla Configuración (sin <main>/título
// propios, porque los aporta el contenedor de Configuración).
export default function AdminTabs({ initial = "usuarios", embedded = false }: { initial?: string; embedded?: boolean }) {
  const [tab, setTab] = useState(initial);
  const cuerpo = (
    <>
      {!embedded && <h2>Administración</h2>}
      <div className="sc-tabs">
        {PESTANAS.map((p) => (
          <button key={p.k} className={`sc-tab${tab === p.k ? " on" : ""}`} onClick={() => setTab(p.k)}>
            {p.label}
          </button>
        ))}
      </div>
      <div className="sc-tabbody">
        {tab === "usuarios" && <UsuariosPanel />}
        {tab === "iniciales" && <InicialesPanel />}
        {tab === "consecutivos" && <ConsecutivosPanel />}
        {tab === "tipos_turno" && <TiposTurnoPanel />}
        {tab === "catalogos" && <CatalogosPanel />}
      </div>
    </>
  );
  if (embedded) return cuerpo;
  return <main className="contenedor">{cuerpo}</main>;
}
