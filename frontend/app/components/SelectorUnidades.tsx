"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export interface UnidadServicio {
  patrulla_id: string;
  etiqueta: string;
  estatus_unidad: string | null;
}

// Unidades a las que se puede asignar una tarea: en servicio y que NO estén
// fuera de servicio (mismo criterio que la función rpc_asignar_tarea).
export async function unidadesAsignables(): Promise<UnidadServicio[]> {
  const { data } = await supabase
    .from("patrullas_en_servicio")
    .select("patrulla_id, numero, tipo, marca, modelo, estatus_unidad")
    .order("numero");
  return ((data as any[]) ?? [])
    .filter((r) => (r.estatus_unidad ?? "") !== "fuera_servicio")
    .map((r) => ({
      patrulla_id: r.patrulla_id,
      estatus_unidad: r.estatus_unidad,
      etiqueta: `${r.numero ? `#${r.numero} · ` : ""}${r.tipo ?? ""} ${r.marca ?? ""} ${r.modelo ?? ""}`.trim(),
    }));
}

// Selector de unidades: todas las que están en servicio, o algunas en concreto.
export default function SelectorUnidades({
  todas,
  setTodas,
  seleccion,
  setSeleccion,
}: {
  todas: boolean;
  setTodas: (v: boolean) => void;
  seleccion: string[];
  setSeleccion: (v: string[]) => void;
}) {
  const [unidades, setUnidades] = useState<UnidadServicio[]>([]);

  useEffect(() => { unidadesAsignables().then(setUnidades); }, []);

  function toggle(id: string) {
    setSeleccion(seleccion.includes(id) ? seleccion.filter((x) => x !== id) : [...seleccion, id]);
  }

  return (
    <div className="tarea-unidades">
      <label className="dash-sub" style={{ display: "block", marginBottom: 6 }}>
        Asignar a ({unidades.length} unidad(es) disponible(s) — no se incluyen las fuera de servicio)
      </label>
      <label style={{ display: "block", marginBottom: 4 }}>
        <input type="radio" checked={todas} onChange={() => setTodas(true)} />{" "}
        Todas las unidades en servicio
      </label>
      <label style={{ display: "block", marginBottom: 6 }}>
        <input type="radio" checked={!todas} onChange={() => setTodas(false)} />{" "}
        Unidades específicas
      </label>
      {!todas && (
        <div className="tarea-unidades-lista">
          {unidades.length === 0 && <p className="dash-sub">No hay unidades en servicio disponibles.</p>}
          {unidades.map((u) => (
            <label key={u.patrulla_id} style={{ display: "block" }}>
              <input
                type="checkbox"
                checked={seleccion.includes(u.patrulla_id)}
                onChange={() => toggle(u.patrulla_id)}
              />{" "}
              {u.etiqueta}
              <span className="dash-sub"> — {u.estatus_unidad ?? "—"}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
