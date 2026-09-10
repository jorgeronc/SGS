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

export interface PuntoMapa { latitud: number; longitud: number; titulo: string }

export default function MapaTrazaLiberty({
  reportes, ruta, rutaEsperada = [], paradas = [], guardia = null, playback = null, className = "mapbox",
}: {
  reportes: ReporteMapa[];
  ruta: [number, number][];          // recorrido real [lat, lng] en orden temporal
  rutaEsperada?: [number, number][]; // ruta programada (puntos de control) [lat, lng]
  paradas?: PuntoMapa[];    // permanencias prolongadas (LONG_STOP)
  guardia?: PuntoMapa | null; // posición actual del guardia (sesión en curso)
  playback?: { latitud: number; longitud: number } | null; // marcador de reproducción histórica
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const mlRef = useRef<any>(null);
  const marks = useRef<any[]>([]);
  const pbMark = useRef<any>(null);

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
    // Ruta esperada (programada) — línea punteada violeta debajo de la traza real.
    const lineaEsp = rutaEsperada.map(([la, lo]) => [lo, la]);
    const fcEsp = { type: "FeatureCollection", features: lineaEsp.length >= 2 ? [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: lineaEsp } }] : [] };
    cuandoEstiloListo(map, () => {
      if (!map.getSource("ruta-esp")) {
        map.addSource("ruta-esp", { type: "geojson", data: fcEsp as any });
        map.addLayer({ id: "ruta-esp-l", type: "line", source: "ruta-esp", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#7c5cff", "line-width": 3, "line-opacity": 0.9, "line-dasharray": [2, 2] } });
      } else { map.getSource("ruta-esp").setData(fcEsp as any); }
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
    // Paradas (LONG_STOP): rombo ámbar.
    paradas.forEach((p) => {
      if (p.latitud == null || p.longitud == null) return;
      const el = document.createElement("div");
      el.style.cssText = "width:14px;height:14px;background:#d98a2b;border:2px solid #fff;transform:rotate(45deg);box-shadow:0 1px 4px #0006;cursor:pointer";
      const mk = new maplibre.Marker({ element: el, anchor: "center" }).setLngLat([Number(p.longitud), Number(p.latitud)])
        .setPopup(new maplibre.Popup({ offset: 12, closeButton: false }).setHTML(`<div style="font-size:12px;color:#111">${p.titulo}</div>`)).addTo(map);
      marks.current.push(mk);
    });
    // Guardia en vivo (sesión en curso): punto azul con anillo, tamaño mayor.
    if (guardia && guardia.latitud != null && guardia.longitud != null) {
      const el = document.createElement("div");
      el.style.cssText = "width:20px;height:20px;border-radius:50%;background:#1e88e5;border:3px solid #fff;box-shadow:0 0 0 4px #1e88e555,0 1px 4px #0006;cursor:pointer";
      const mk = new maplibre.Marker({ element: el, anchor: "center" }).setLngLat([Number(guardia.longitud), Number(guardia.latitud)])
        .setPopup(new maplibre.Popup({ offset: 14, closeButton: false }).setHTML(`<div style="font-size:12px;color:#111">${guardia.titulo}</div>`)).addTo(map);
      marks.current.push(mk);
    }
    // Encuadre a traza + checks + paradas + guardia.
    const pts: [number, number][] = [
      ...linea as [number, number][],
      ...lineaEsp as [number, number][],
      ...reportes.filter((r) => r.latitud != null).map((r) => [Number(r.longitud), Number(r.latitud)] as [number, number]),
      ...paradas.filter((p) => p.latitud != null).map((p) => [Number(p.longitud), Number(p.latitud)] as [number, number]),
      ...(guardia && guardia.latitud != null ? [[Number(guardia.longitud), Number(guardia.latitud)] as [number, number]] : []),
    ];
    if (pts.length) {
      const b = pts.reduce((bb: any, c) => bb.extend(c), new maplibre.LngLatBounds(pts[0], pts[0]));
      map.fitBounds(b, { padding: 46, maxZoom: 16, duration: 500 });
    }
  }

  useEffect(() => { if (mapRef.current) pintar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [reportes, ruta, rutaEsperada, paradas, guardia]);

  // Marcador de reproducción: persistente, se mueve sin repintar el resto.
  useEffect(() => {
    const map = mapRef.current, maplibre = mlRef.current;
    if (!map || !maplibre) return;
    if (!playback || playback.latitud == null) { if (pbMark.current) { pbMark.current.remove(); pbMark.current = null; } return; }
    if (!pbMark.current) {
      const el = document.createElement("div");
      el.style.cssText = "width:18px;height:18px;border-radius:50%;background:#111;border:3px solid #fff;box-shadow:0 0 0 3px #1119,0 1px 5px #0008";
      pbMark.current = new maplibre.Marker({ element: el, anchor: "center" }).setLngLat([Number(playback.longitud), Number(playback.latitud)]).addTo(map);
    } else pbMark.current.setLngLat([Number(playback.longitud), Number(playback.latitud)]);
  }, [playback]);

  return <div ref={ref} className={className} />;
}
