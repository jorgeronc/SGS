"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { historialCad, type HistItem } from "@/lib/despachos";

// Línea de tiempo de cambios de estado del reporte y sus despachos, con fecha,
// hora y usuario. Se actualiza en tiempo real conforme cambian los estados.
export default function HistorialCad({ llamadaId }: { llamadaId: string }) {
  const [items, setItems] = useState<HistItem[]>([]);

  useEffect(() => {
    const cargar = () => historialCad(llamadaId).then(setItems);
    cargar();
    const canal = supabase
      .channel(`cad-hist:${llamadaId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "cad_estado_historial", filter: `llamada_id=eq.${llamadaId}` }, cargar)
      .subscribe();
    return () => { supabase.removeChannel(canal); };
  }, [llamadaId]);

  return (
    <section>
      {items.length === 0 ? (
        <p className="dash-sub">Sin cambios de estado registrados aún.</p>
      ) : (
        <ol className="cad-timeline">
          {items.map((h, i) => (
            <li key={i} className={`cad-tl-item amb-${h.ambito}`}>
              <span className="cad-tl-dot" />
              <div className="cad-tl-body">
                <span className="cad-tl-estado">{h.etiqueta}</span>
                <span className="cad-tl-meta">
                  {new Date(h.cambiado_en).toLocaleString()}
                  {h.usuario ? ` · ${h.usuario}` : ""}
                </span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
