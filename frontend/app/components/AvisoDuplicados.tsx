"use client";

import Link from "next/link";
import type { RegistroSimilar } from "@/lib/duplicados";

// Alerta de PREEXISTENCIA de registros: avisa al usuario que captura que la
// persona/vehículo ya está en el sistema (posibles antecedentes). No bloquea.
export default function AvisoDuplicados({ titulo, registros }: { titulo: string; registros: RegistroSimilar[] }) {
  if (!registros.length) return null;
  return (
    <div className="aviso-dup">
      <b>⚠ {titulo} — {registros.length} coincidencia{registros.length > 1 ? "s" : ""} en el sistema</b>
      <ul>
        {registros.map((r) => (
          <li key={r.id}>
            <Link href={r.href}>{r.etiqueta}</Link>
            {r.antecedentes && r.antecedentes.length > 0 && (
              <span className="aviso-ant">
                {r.antecedentes.map((a, i) => <span key={i} className="aviso-tag">{a}</span>)}
              </span>
            )}
          </li>
        ))}
      </ul>
      <span className="dash-sub">Ya hay registro(s) en el sistema. Revisa sus antecedentes antes de continuar. El alta no se bloquea.</span>
    </div>
  );
}
