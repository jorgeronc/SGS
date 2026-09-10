"use client";

import { useEffect, useRef } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import { estiloMapaPorId, registrarPmtiles } from "@/lib/mapStyle";

// Base de mapa MapLibre (migración de Leaflet → MapLibre). Reutilizable: el
// consumidor recibe el `map` en `onReady` para agregar sus capas/markers.
// `onReady` se llama al cargar y tras cada cambio de estilo (tema) — por eso el
// consumidor debe re-agregar sus capas de forma idempotente (checar getLayer/
// getSource antes de crear). Theme-aware vía el evento `sgs-theme`.
export interface MapaBaseProps {
  center?: [number, number];
  zoom?: number;
  pitch?: number;   // inclinación inicial (0 = plano); útil para vista en perspectiva
  bearing?: number; // rotación inicial
  className?: string;
  onReady?: (map: any) => void;
}

export default function MapaBase({ center = [-100.309, 25.6714], zoom = 12, pitch = 0, bearing = 0, className = "mapbox", onReady }: MapaBaseProps) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        // Usar el DEFAULT export (el objeto maplibregl) — el namespace no expone
        // Map/addProtocol de forma fiable bajo el bundler.
        const mod = await import("maplibre-gl" as any);
        const maplibre: any = (mod as any).default ?? mod;
        await registrarPmtiles(maplibre);
        if (cancelado || !ref.current || mapRef.current) return;
        const map = new maplibre.Map({
          container: ref.current,
          style: estiloMapaPorId("liberty", false), // Calles (Liberty) siempre
          center, zoom, pitch, bearing,
          attributionControl: { compact: true },
        });
        mapRef.current = map;
        map.on("error", (e: any) => console.error("MapaBase/MapLibre:", e?.error ?? e));
        map.on("load", () => onReadyRef.current?.(map));
        // Al cambiar de estilo (tema) MapLibre limpia las capas de datos; el
        // consumidor las vuelve a agregar (idempotente) en cada styledata.
        map.on("styledata", () => { if (map.isStyleLoaded()) onReadyRef.current?.(map); });
        setTimeout(() => map.resize(), 120);
      } catch (e) {
        console.error("MapaBase: no se pudo iniciar el mapa", e);
      }
    })();

    return () => {
      cancelado = true;
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={ref} className={className} />;
}
