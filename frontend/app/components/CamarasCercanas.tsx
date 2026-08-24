"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import VisorCamara from "@/app/components/VisorCamara";

// Cámaras de videovigilancia cercanas a un punto (alerta/incidencia). Usa
// rpc_camaras_cercanas (Haversine) para ofrecer las del entorno por distancia,
// no todas. Al elegir una, se muestra su señal en vivo (VisorCamara).
export default function CamarasCercanas({
  latitud, longitud, radioM = 800,
}: {
  latitud: number | null; longitud: number | null; radioM?: number;
}) {
  const [camaras, setCamaras] = useState<any[]>([]);
  const [cargando, setCargando] = useState(false);
  const [verId, setVerId] = useState<string | null>(null);

  useEffect(() => {
    if (latitud == null || longitud == null) { setCamaras([]); return; }
    setCargando(true);
    supabase.rpc("rpc_camaras_cercanas", { p_lat: latitud, p_lng: longitud, p_radio_m: radioM, p_limite: 20 })
      .then(({ data }) => { setCamaras((data as any[]) ?? []); setCargando(false); });
  }, [latitud, longitud, radioM]);

  if (latitud == null || longitud == null) return null;

  return (
    <section style={{ marginTop: 16 }}>
      <h3>📹 Cámaras cercanas <span className="dash-sub" style={{ fontWeight: 400 }}>(radio {radioM} m)</span></h3>
      {cargando && <p className="dash-sub">Buscando cámaras…</p>}
      {!cargando && camaras.length === 0 && <p className="dash-sub">No hay cámaras de videovigilancia en el entorno.</p>}
      {camaras.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {camaras.map((c) => (
            <button key={c.id} className="qbtn2" onClick={() => setVerId(verId === c.id ? null : c.id)}
              style={verId === c.id ? { borderColor: "#6a1b9a", fontWeight: 700 } : undefined}>
              📹 {c.nombre} <span className="dash-sub">· {c.sitio_nombre ?? ""} · {Math.round(c.distancia_m)} m</span>
            </button>
          ))}
        </div>
      )}
      {verId && (
        <div style={{ marginTop: 10, maxWidth: 520 }}>
          <VisorCamara camaraId={verId} alto={280} />
        </div>
      )}
    </section>
  );
}
