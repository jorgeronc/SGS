"use client";

import { useEffect, useRef } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import { estiloMapaPorId } from "@/lib/mapStyle";

// Mapa "Calles (Liberty)" (MapLibre) con un marcador en el punto. Muestra las
// coordenadas y (opcional) un enlace para abrir el punto en Google Maps.
export default function MapaUbicacion({
  latitud,
  longitud,
  sinEnlace = false,   // oculta el enlace "abrir en el mapa" (para no duplicarlo)
  sinCoords = false,   // oculta el renglón "Lat …, Lng …" bajo el mapa
}: {
  latitud: number | null;
  longitud: number | null;
  sinEnlace?: boolean;
  sinCoords?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);

  useEffect(() => {
    let cancelado = false;
    if (latitud == null || longitud == null) return;
    (async () => {
      try {
        const mod = await import("maplibre-gl" as any);
        const maplibre: any = (mod as any).default ?? mod;
        if (cancelado || !ref.current) return;
        if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
        const map = new maplibre.Map({
          container: ref.current,
          style: estiloMapaPorId("liberty", false), // Calles (Liberty) siempre
          center: [longitud, latitud], zoom: 15,
          attributionControl: { compact: true },
        });
        mapRef.current = map;
        map.on("error", (e: any) => console.error("MapaUbicacion/MapLibre:", e?.error ?? e));
        new maplibre.Marker({ color: "#e23b53" }).setLngLat([longitud, latitud]).addTo(map);
        setTimeout(() => map.resize(), 60);
      } catch (e) { console.error("MapaUbicacion: no se pudo iniciar el mapa", e); }
    })();
    return () => { cancelado = true; if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } };
  }, [latitud, longitud]);

  if (latitud == null || longitud == null) {
    return (
      <p style={{ color: "#555" }}>
        Sin coordenadas registradas. Captúralas con el botón de ubicación.
      </p>
    );
  }

  const enlace = `https://www.google.com/maps/search/?api=1&query=${latitud},${longitud}`;
  return (
    <div>
      <div ref={ref} className="mapa" style={{ width: "100%", height: 320, borderRadius: 8, border: "1px solid var(--sc-card-line)", overflow: "hidden" }} />
      {!sinCoords && (
        <p style={{ fontSize: 13 }}>
          Lat {latitud.toFixed(6)}, Lng {longitud.toFixed(6)}
          {!sinEnlace && <>{" — "}<a href={enlace} target="_blank" rel="noreferrer">abrir en el mapa</a></>}
        </p>
      )}
    </div>
  );
}
