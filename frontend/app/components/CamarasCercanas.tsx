"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import VisorCamara from "@/app/components/VisorCamara";

// Cámaras de videovigilancia cercanas a un punto (alerta/incidencia). Usa
// rpc_camaras_cercanas (Haversine) para ofrecer las del entorno por distancia,
// no todas. Al elegir una, se muestra su señal en vivo (VisorCamara).
const RADIOS = [200, 500, 800, 1500, 3000, 5000]; // metros a la redonda

export default function CamarasCercanas({
  latitud, longitud, radioM = 800,
}: {
  latitud: number | null; longitud: number | null; radioM?: number;
}) {
  const [camaras, setCamaras] = useState<any[]>([]);
  const [cargando, setCargando] = useState(false);
  const [verId, setVerId] = useState<string | null>(null);
  const [radio, setRadio] = useState(radioM);

  useEffect(() => {
    if (latitud == null || longitud == null) { setCamaras([]); return; }
    setCargando(true);
    supabase.rpc("rpc_camaras_cercanas", { p_lat: latitud, p_lng: longitud, p_radio_m: radio, p_limite: 50 })
      .then(({ data }) => { setCamaras((data as any[]) ?? []); setCargando(false); });
  }, [latitud, longitud, radio]);

  if (latitud == null || longitud == null) return null;

  return (
    <section>
      <h3 style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 16, margin: "0 0 10px" }}>
        📹 Cámaras cercanas
        <label className="dash-sub" style={{ fontWeight: 400, fontSize: 13, display: "inline-flex", alignItems: "center", gap: 6 }}>
          <select value={radio} onChange={(e) => setRadio(Number(e.target.value))} style={{ padding: "2px 6px" }}>
            {RADIOS.map((m) => <option key={m} value={m}>{m >= 1000 ? `${m / 1000} km` : `${m} m`}</option>)}
          </select>
          a la redonda
        </label>
      </h3>
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
