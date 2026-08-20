"use client";

import { useEffect, useRef } from "react";
import { tileConfig } from "@/lib/geo";

export interface ReporteMapa {
  id: string;
  folio: string | null;
  titulo: string;
  latitud: number;
  longitud: number;
  href: string;
  // Color del pin (p. ej. según estado de despacho). Si se omite, pin azul por defecto.
  color?: string;
}

// Pin de geoubicación (SVG) coloreado; usado cuando el reporte trae `color`.
function pinColor(L: any, color: string): any {
  return L.divIcon({
    className: "pin-color",
    html:
      `<svg width="26" height="36" viewBox="0 0 26 36" xmlns="http://www.w3.org/2000/svg">` +
      `<path d="M13 0C5.8 0 0 5.8 0 13c0 9.1 13 23 13 23s13-13.9 13-23C26 5.8 20.2 0 13 0z" fill="${color}" stroke="#ffffff" stroke-width="1.6"/>` +
      `<circle cx="13" cy="13" r="5" fill="#ffffff"/></svg>`,
    iconSize: [26, 36],
    iconAnchor: [13, 36],
    popupAnchor: [0, -32],
  });
}

export interface PatrullaMapa {
  id: string;
  titulo: string;
  sub?: string;
  latitud: number;
  longitud: number;
}

let leafletPromise: Promise<any> | null = null;
function cargarLeaflet(): Promise<any> {
  if (typeof window === "undefined") return Promise.reject();
  if ((window as any).L) return Promise.resolve((window as any).L);
  if (leafletPromise) return leafletPromise;
  leafletPromise = new Promise((resolve, reject) => {
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(css);
    const s = document.createElement("script");
    s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    s.async = true;
    s.onload = () => resolve((window as any).L);
    s.onerror = reject;
    document.head.appendChild(s);
  });
  return leafletPromise;
}

// Mapa con OpenStreetMap: un marcador por reporte (pin) y por patrulla (punto
// teal). Cada popup de reporte abre su registro; el de patrulla muestra su
// última posición enviada.
export default function MapaReportes({
  reportes,
  patrullas = [],
  className = "mapbox",
}: {
  reportes: ReporteMapa[];
  patrullas?: PatrullaMapa[];
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);

  useEffect(() => {
    let cancelado = false;
    cargarLeaflet()
      .then((L) => {
        if (cancelado || !ref.current) return;
        if (mapRef.current) {
          mapRef.current.remove();
          mapRef.current = null;
        }
        const centro =
          reportes.length > 0
            ? [reportes[0].latitud, reportes[0].longitud]
            : patrullas.length > 0
            ? [patrullas[0].latitud, patrullas[0].longitud]
            : [25.6714, -100.309]; // Monterrey por defecto
        const map = L.map(ref.current).setView(centro, 12);
        mapRef.current = map;
        const t = tileConfig();
        L.tileLayer(t.url, t.opts).addTo(map);

        const bounds: any[] = [];
        reportes.forEach((r) => {
          const m = (r.color
            ? L.marker([r.latitud, r.longitud], { icon: pinColor(L, r.color) })
            : L.marker([r.latitud, r.longitud])
          ).addTo(map);
          m.bindPopup(
            `<b>${r.folio ?? "s/folio"}</b><br>${r.titulo}<br><a href="${r.href}">Abrir registro →</a>`
          );
          bounds.push([r.latitud, r.longitud]);
        });

        // Patrullas: punto teal con anillo, distinto de los pines de reporte.
        patrullas.forEach((p) => {
          const m = L.circleMarker([p.latitud, p.longitud], {
            radius: 8,
            color: "#ffffff",
            weight: 2,
            fillColor: "#0e8f86",
            fillOpacity: 1,
          }).addTo(map);
          m.bindPopup(`🚔 <b>${p.titulo}</b>${p.sub ? `<br>${p.sub}` : ""}`);
          bounds.push([p.latitud, p.longitud]);
        });

        if (bounds.length > 1) map.fitBounds(bounds, { padding: [30, 30] });
        setTimeout(() => map.invalidateSize(), 100);
      })
      .catch(() => {});
    return () => {
      cancelado = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [reportes, patrullas]);

  return <div ref={ref} className={className} />;
}
