"use client";

import { useEffect, useRef } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import { estiloMapaPorId } from "@/lib/mapStyle";

// Mapa "Calles (Liberty)" (MapLibre): un pin por reporte (popup abre su registro),
// un punto teal por patrulla, la traza (polilínea) y los guardias en vivo (punto
// azul en capa aparte que se repinta en cada ping sin mover el mapa).

export interface ReporteMapa {
  id: string;
  folio: string | null;
  titulo: string;
  latitud: number;
  longitud: number;
  href: string;
  color?: string; // color del pin (p. ej. según estado); azul por defecto
}
export interface PatrullaMapa {
  id: string; titulo: string; sub?: string; latitud: number; longitud: number;
}
export interface GuardiaMapa {
  personal_id: string; etiqueta: string | null; unidad?: string | null;
  latitud: number; longitud: number; actualizado_en?: string | null;
  estatus_servicio?: string | null; motivo_pausa?: string | null;
}

function hace(iso?: string | null): string {
  if (!iso) return "";
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `hace ${s} s`;
  const m = Math.round(s / 60);
  return m < 60 ? `hace ${m} min` : `hace ${Math.round(m / 60)} h`;
}

function cuandoEstiloListo(map: any, fn: () => void) {
  if (map.isStyleLoaded()) { fn(); return; }
  const h = () => { if (map.isStyleLoaded()) { map.off("styledata", h); fn(); } };
  map.on("styledata", h);
}

// Punto (círculo) como elemento HTML para un Marker de MapLibre.
function punto(color: string, r = 8): HTMLElement {
  const el = document.createElement("div");
  el.style.cssText = `width:${r * 2}px;height:${r * 2}px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 1px 4px #0006;cursor:pointer`;
  return el;
}

export default function MapaReportes({
  reportes, patrullas = [], guardias = [], ruta = [], className = "mapbox",
}: {
  reportes: ReporteMapa[];
  patrullas?: PatrullaMapa[];
  guardias?: GuardiaMapa[];
  ruta?: [number, number][]; // [lat, lng] en orden cronológico
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const mlRef = useRef<any>(null);
  const marks = useRef<any[]>([]);          // reportes + patrullas
  const guardiaMarks = useRef<any[]>([]);   // guardias en vivo
  const listo = useRef(false);
  const datos = useRef({ reportes, patrullas, guardias, ruta });
  datos.current = { reportes, patrullas, guardias, ruta };

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
          center: [-100.309, 25.6714], zoom: 12,
          attributionControl: { compact: true },
        });
        mapRef.current = map;
        map.on("error", (e: any) => console.error("MapaReportes/MapLibre:", e?.error ?? e));
        map.on("load", () => { listo.current = true; setTimeout(() => map.resize(), 60); pintar(); pintarGuardias(); });
      } catch (e) { console.error("MapaReportes: no se pudo iniciar el mapa", e); }
    })();
    return () => { cancelado = true; if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } marks.current = []; guardiaMarks.current = []; listo.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pintar() {
    const map = mapRef.current, maplibre = mlRef.current;
    if (!map || !maplibre || !listo.current) return;
    const { reportes, patrullas, ruta } = datos.current;
    marks.current.forEach((m) => m.remove()); marks.current = [];
    const pts: [number, number][] = [];
    // Reportes: pin coloreado con popup (abre el registro).
    reportes.forEach((r) => {
      if (r.latitud == null || r.longitud == null) return;
      const enlace = r.href && r.href !== "#" ? `<br><a href="${r.href}">Abrir registro →</a>` : "";
      const mk = new maplibre.Marker({ color: r.color ?? "#2563eb" }).setLngLat([Number(r.longitud), Number(r.latitud)])
        .setPopup(new maplibre.Popup({ offset: 24, closeButton: false }).setHTML(`<div style="font-size:12px;color:#111"><b>${r.folio ?? "s/folio"}</b><br>${r.titulo}${enlace}</div>`))
        .addTo(map);
      marks.current.push(mk); pts.push([Number(r.longitud), Number(r.latitud)]);
    });
    // Patrullas: punto teal.
    patrullas.forEach((p) => {
      if (p.latitud == null || p.longitud == null) return;
      const mk = new maplibre.Marker({ element: punto("#0e8f86"), anchor: "center" }).setLngLat([Number(p.longitud), Number(p.latitud)])
        .setPopup(new maplibre.Popup({ offset: 12, closeButton: false }).setHTML(`<div style="font-size:12px;color:#111">🚔 <b>${p.titulo}</b>${p.sub ? `<br>${p.sub}` : ""}</div>`))
        .addTo(map);
      marks.current.push(mk); pts.push([Number(p.longitud), Number(p.latitud)]);
    });
    // Traza (polilínea) del recorrido GPS.
    const linea = ruta.map(([la, lo]) => [lo, la]);
    const fc = { type: "FeatureCollection", features: linea.length >= 2 ? [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: linea } }] : [] };
    cuandoEstiloListo(map, () => {
      if (!map.getSource("ruta-mr")) {
        map.addSource("ruta-mr", { type: "geojson", data: fc as any });
        map.addLayer({ id: "ruta-mr-l", type: "line", source: "ruta-mr", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#2563eb", "line-width": 4, "line-opacity": 0.8 } });
      } else { map.getSource("ruta-mr").setData(fc as any); }
    });
    linea.forEach((c) => pts.push(c as [number, number]));
    // Encuadre.
    if (pts.length === 1) map.easeTo({ center: pts[0], zoom: 15, duration: 400 });
    else if (pts.length > 1) {
      const b = pts.reduce((bb: any, c) => bb.extend(c), new maplibre.LngLatBounds(pts[0], pts[0]));
      map.fitBounds(b, { padding: 40, maxZoom: 16, duration: 500 });
    }
  }

  function pintarGuardias() {
    const map = mapRef.current, maplibre = mlRef.current;
    if (!map || !maplibre || !listo.current) return;
    guardiaMarks.current.forEach((m) => m.remove()); guardiaMarks.current = [];
    datos.current.guardias.forEach((g) => {
      if (g.latitud == null || g.longitud == null) return;
      const sub = [g.unidad ? `📍 ${g.unidad}` : "", hace(g.actualizado_en)].filter(Boolean).join(" · ");
      const mk = new maplibre.Marker({ element: punto("#1e88e5", 7), anchor: "center" }).setLngLat([Number(g.longitud), Number(g.latitud)])
        .setPopup(new maplibre.Popup({ offset: 12, closeButton: false }).setHTML(`<div style="font-size:12px;color:#111">👷 <b>${g.etiqueta ?? "Guardia"}</b>${sub ? `<br>${sub}` : ""}</div>`))
        .addTo(map);
      guardiaMarks.current.push(mk);
    });
  }

  // Reportes/patrullas/ruta → re-encuadra. Guardias → solo repinta su capa.
  useEffect(() => { pintar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [reportes, patrullas, ruta]);
  useEffect(() => { pintarGuardias(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [guardias]);

  return <div ref={ref} className={className} />;
}
