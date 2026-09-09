"use client";

import { useEffect, useRef } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import { estiloMapaPorId } from "@/lib/mapStyle";
import type { ReporteMapa } from "./MapaReportes";

// Mapa "Calles (Liberty)" (MapLibre) para el DETALLE de una sesión de rondín:
// dibuja la TRAZA GPS (ruta, polilínea) y los CHECKS (reportes, marcadores) y
// encuadra todo. Reusa la forma de datos de MapaReportes para intercambio directo.

const TRAZA = "#2563eb";

function cuandoEstiloListo(map: any, fn: () => void) {
  if (map.isStyleLoaded()) { fn(); return; }
  const h = () => { if (map.isStyleLoaded()) { map.off("styledata", h); fn(); } };
  map.on("styledata", h);
}

export default function MapaTrazaLiberty({
  reportes, ruta, className = "mapbox",
}: {
  reportes: ReporteMapa[];
  ruta: [number, number][]; // [lat, lng] en orden temporal
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const mlRef = useRef<any>(null);
  const marks = useRef<any[]>([]);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const mod = await import("maplibre-gl" as any);
        const maplibre: any = (mod as any).default ?? mod;
        if (cancelado || !ref.current || mapRef.current) return;
        mlRef.current = maplibre;
        const map = new maplibre.Map({
          container: ref.current,
          style: estiloMapaPorId("liberty", false), // Calles (Liberty) siempre
          center: [-100.309, 25.6714],
          zoom: 12,
          attributionControl: { compact: true },
        });
        mapRef.current = map;
        map.on("error", (e: any) => console.error("MapaTrazaLiberty/MapLibre:", e?.error ?? e));
        map.on("load", () => { setTimeout(() => map.resize(), 60); pintar(); });
      } catch (e) {
        console.error("MapaTrazaLiberty: no se pudo iniciar el mapa", e);
      }
    })();
    return () => { cancelado = true; if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; marks.current = []; } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pintar() {
    const map = mapRef.current, maplibre = mlRef.current;
    if (!map || !maplibre) return;
    // Traza (línea) — capa de estilo: espera a que el estilo esté cargado.
    const linea = ruta.map(([la, lo]) => [lo, la]);
    const fc = { type: "FeatureCollection", features: linea.length >= 2 ? [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: linea } }] : [] };
    cuandoEstiloListo(map, () => {
      if (!map.getSource("traza")) {
        map.addSource("traza", { type: "geojson", data: fc as any });
        map.addLayer({ id: "traza-l", type: "line", source: "traza", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": TRAZA, "line-width": 4, "line-opacity": 0.85 } });
      } else { map.getSource("traza").setData(fc as any); }
    });
    // Checks (marcadores).
    marks.current.forEach((m) => m.remove()); marks.current = [];
    reportes.forEach((r) => {
      if (r.latitud == null || r.longitud == null) return;
      const el = document.createElement("div");
      el.style.cssText = `width:16px;height:16px;border-radius:50%;background:${r.color ?? "#1f9d5c"};border:2px solid #fff;box-shadow:0 1px 4px #0006;cursor:pointer`;
      const mk = new maplibre.Marker({ element: el, anchor: "center" }).setLngLat([Number(r.longitud), Number(r.latitud)]);
      mk.setPopup(new maplibre.Popup({ offset: 14, closeButton: false }).setHTML(`<div style="font-size:12px;color:#111">${r.titulo}</div>`));
      mk.addTo(map); marks.current.push(mk);
    });
    // Encuadre a traza + checks.
    const pts: [number, number][] = [...linea as [number, number][], ...reportes.filter((r) => r.latitud != null).map((r) => [Number(r.longitud), Number(r.latitud)] as [number, number])];
    if (pts.length) {
      const b = pts.reduce((bb: any, c) => bb.extend(c), new maplibre.LngLatBounds(pts[0], pts[0]));
      map.fitBounds(b, { padding: 46, maxZoom: 16, duration: 500 });
    }
  }

  useEffect(() => { if (mapRef.current) pintar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [reportes, ruta]);

  return <div ref={ref} className={className} />;
}
