"use client";

import { useEffect, useRef } from "react";
import { tileConfig } from "@/lib/geo";

let leafletPromise: Promise<any> | null = null;
function cargarLeaflet(): Promise<any> {
  if (typeof window === "undefined") return Promise.reject();
  if ((window as any).L) return Promise.resolve((window as any).L);
  if (leafletPromise) return leafletPromise;
  leafletPromise = new Promise((resolve, reject) => {
    const css = document.createElement("link"); css.rel = "stylesheet"; css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"; document.head.appendChild(css);
    const s = document.createElement("script"); s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"; s.async = true;
    s.onload = () => resolve((window as any).L); s.onerror = reject; document.head.appendChild(s);
  });
  return leafletPromise;
}

// Mapa para SEÑALAR una ubicación: clic (o arrastre del marcador) fija las
// coordenadas y las devuelve por onPick. Se usa para georreferenciar el punto
// de control colocándolo directamente en el mapa.
export default function MapaPicker({
  lat, lng, onPick, className = "mapbox",
}: {
  lat: number | null; lng: number | null;
  onPick: (lat: number, lng: number) => void;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  useEffect(() => {
    let cancelado = false;
    cargarLeaflet().then((L) => {
      if (cancelado || !ref.current || mapRef.current) return;
      const centro: [number, number] = lat != null && lng != null ? [lat, lng] : [25.6714, -100.309];
      const map = L.map(ref.current).setView(centro, lat != null ? 16 : 12);
      mapRef.current = map;
      const t = tileConfig(); L.tileLayer(t.url, t.opts).addTo(map);

      function poner(la: number, lo: number) {
        if (!markerRef.current) {
          markerRef.current = L.marker([la, lo], { draggable: true }).addTo(map);
          markerRef.current.on("dragend", () => { const p = markerRef.current.getLatLng(); onPickRef.current(Number(p.lat.toFixed(6)), Number(p.lng.toFixed(6))); });
        } else markerRef.current.setLatLng([la, lo]);
      }
      if (lat != null && lng != null) poner(lat, lng);

      map.on("click", (e: any) => {
        poner(e.latlng.lat, e.latlng.lng);
        onPickRef.current(Number(e.latlng.lat.toFixed(6)), Number(e.latlng.lng.toFixed(6)));
      });
      setTimeout(() => map.invalidateSize(), 120);
    }).catch(() => {});
    return () => { cancelado = true; if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; markerRef.current = null; } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Si las coordenadas cambian desde fuera (p. ej. búsqueda por dirección), mover el marcador.
  useEffect(() => {
    const L = (window as any).L;
    if (!L || !mapRef.current || lat == null || lng == null) return;
    if (!markerRef.current) {
      markerRef.current = L.marker([lat, lng], { draggable: true }).addTo(mapRef.current);
      markerRef.current.on("dragend", () => { const p = markerRef.current.getLatLng(); onPickRef.current(Number(p.lat.toFixed(6)), Number(p.lng.toFixed(6))); });
    } else markerRef.current.setLatLng([lat, lng]);
    mapRef.current.setView([lat, lng]);
  }, [lat, lng]);

  return <div ref={ref} className={className} style={{ cursor: "crosshair" }} />;
}
