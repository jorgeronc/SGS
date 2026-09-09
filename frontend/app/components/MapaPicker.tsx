"use client";

import { useEffect, useRef } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import { estiloMapaPorId } from "@/lib/mapStyle";

// Mapa para SEÑALAR una ubicación: clic (o arrastre del marcador) fija las
// coordenadas y las devuelve por onPick. Se usa para georreferenciar puntos de
// control / sitios colocándolos directamente en el mapa.
//
// Base SIEMPRE "Calles (Liberty)" (MapLibre), sin opción a cambiar. Si se pasa
// `centro` + `radioGeocerca` (p. ej. al elegir el sitio), el mapa VUELA a esa
// ubicación con el zoom necesario para ver la geocerca (círculo) del sitio.

const NARANJA = "#f4820a";

// Anillo (polígono) de un círculo en coordenadas [lng, lat].
function circulo(lng: number, lat: number, radioM: number, n = 64): [number, number][] {
  const dLat = radioM / 111320;
  const dLng = radioM / (111320 * Math.cos((lat * Math.PI) / 180));
  const ring: [number, number][] = [];
  for (let i = 0; i <= n; i++) { const a = (i / n) * 2 * Math.PI; ring.push([lng + dLng * Math.cos(a), lat + dLat * Math.sin(a)]); }
  return ring;
}

function cuandoEstiloListo(map: any, fn: () => void) {
  if (map.isStyleLoaded()) { fn(); return; }
  const h = () => { if (map.isStyleLoaded()) { map.off("styledata", h); fn(); } };
  map.on("styledata", h);
}

export default function MapaPicker({
  lat, lng, onPick, centro, radioGeocerca, className = "mapbox",
}: {
  lat: number | null; lng: number | null;
  onPick: (lat: number, lng: number) => void;
  centro?: { lat: number; lng: number } | null; // centro del sitio (para volar + geocerca)
  radioGeocerca?: number | null;                // radio de la geocerca del sitio (m)
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const mlRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const mod = await import("maplibre-gl" as any);
        const maplibre: any = (mod as any).default ?? mod;
        if (cancelado || !ref.current || mapRef.current) return;
        mlRef.current = maplibre;
        const c0: [number, number] = lat != null && lng != null
          ? [lng, lat]
          : centro ? [centro.lng, centro.lat] : [-100.309, 25.6714];
        const map = new maplibre.Map({
          container: ref.current,
          style: estiloMapaPorId("liberty", false), // Calles (Liberty) siempre
          center: c0,
          zoom: lat != null || centro ? 16 : 12,
          attributionControl: { compact: true },
        });
        mapRef.current = map;
        map.on("error", (e: any) => console.error("MapaPicker/MapLibre:", e?.error ?? e));

        const poner = (la: number, lo: number) => {
          if (!markerRef.current) {
            markerRef.current = new maplibre.Marker({ draggable: true, color: "#e23b53" }).setLngLat([lo, la]).addTo(map);
            markerRef.current.on("dragend", () => {
              const p = markerRef.current.getLngLat();
              onPickRef.current(Number(p.lat.toFixed(6)), Number(p.lng.toFixed(6)));
            });
          } else markerRef.current.setLngLat([lo, la]);
        };

        map.on("load", () => {
          if (lat != null && lng != null) poner(lat, lng);
          dibujarGeocerca();
        });
        map.on("click", (e: any) => {
          poner(e.lngLat.lat, e.lngLat.lng);
          onPickRef.current(Number(e.lngLat.lat.toFixed(6)), Number(e.lngLat.lng.toFixed(6)));
        });
        setTimeout(() => map.resize(), 120);
      } catch (e) {
        console.error("MapaPicker: no se pudo iniciar el mapa", e);
      }
    })();
    return () => { cancelado = true; if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; markerRef.current = null; } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Marcador desde fuera (búsqueda por dirección o coordenadas escritas).
  useEffect(() => {
    const map = mapRef.current, maplibre = mlRef.current;
    if (!map || !maplibre || lat == null || lng == null) return;
    if (!markerRef.current) {
      markerRef.current = new maplibre.Marker({ draggable: true, color: "#e23b53" }).setLngLat([lng, lat]).addTo(map);
      markerRef.current.on("dragend", () => {
        const p = markerRef.current.getLngLat();
        onPickRef.current(Number(p.lat.toFixed(6)), Number(p.lng.toFixed(6)));
      });
    } else markerRef.current.setLngLat([lng, lat]);
  }, [lat, lng]);

  // Geocerca del sitio: al elegir sitio, vuela a su ubicación con zoom para verla.
  function dibujarGeocerca() {
    const map = mapRef.current;
    if (!map || !centro) return;
    const radio = radioGeocerca && radioGeocerca > 0 ? radioGeocerca : 150;
    const ring = circulo(centro.lng, centro.lat, radio);
    const fc = { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } }] };
    cuandoEstiloListo(map, () => {
      if (!map.getSource("geocerca-sitio")) {
        map.addSource("geocerca-sitio", { type: "geojson", data: fc as any });
        map.addLayer({ id: "geoc-sitio-f", type: "fill", source: "geocerca-sitio", paint: { "fill-color": NARANJA, "fill-opacity": 0.12 } });
        map.addLayer({ id: "geoc-sitio-l", type: "line", source: "geocerca-sitio", paint: { "line-color": NARANJA, "line-width": 2 } });
      } else { map.getSource("geocerca-sitio").setData(fc as any); }
    });
    const ml = mlRef.current;
    const b = ring.reduce((bb: any, c: [number, number]) => bb.extend(c), new ml.LngLatBounds(ring[0], ring[0]));
    map.fitBounds(b, { padding: 40, maxZoom: 18, duration: 700 });
  }

  useEffect(() => {
    dibujarGeocerca();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centro?.lat, centro?.lng, radioGeocerca]);

  return <div ref={ref} className={className} style={{ cursor: "crosshair" }} />;
}
