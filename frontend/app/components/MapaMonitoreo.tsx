"use client";

import { useEffect, useRef } from "react";
import { tileConfig } from "@/lib/geo";

// Colores por tipo (coinciden con la leyenda del módulo de monitoreo).
export const COL = { sitio: "#f4a03f", punto: "#0e8f86", guardia: "#1e88e5", incidente: "#d32f2f" };

export interface MSitio { id: string; nombre: string; cliente?: string | null; latitud: number; longitud: number; href?: string }
export interface MPunto { id: string; nombre: string; sitio?: string | null; codigo?: string | null; latitud: number; longitud: number }
export interface MGuardia { personal_id: string; etiqueta: string | null; unidad?: string | null; latitud: number; longitud: number; actualizado_en?: string | null }
export interface MIncidente { id: string; folio?: string | null; tipo?: string | null; prioridad?: string | null; direccion?: string | null; latitud: number; longitud: number; href?: string }

function hace(iso?: string | null): string {
  if (!iso) return "";
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `hace ${s} s`;
  const m = Math.round(s / 60);
  return m < 60 ? `hace ${m} min` : `hace ${Math.round(m / 60)} h`;
}

// Marcadores con forma distinta por tipo.
function pinSitio(L: any) {
  return L.divIcon({ className: "mm-ic", iconSize: [26, 36], iconAnchor: [13, 36], popupAnchor: [0, -32],
    html: `<svg width="26" height="36" viewBox="0 0 26 36" xmlns="http://www.w3.org/2000/svg"><path d="M13 0C5.8 0 0 5.8 0 13c0 9.1 13 23 13 23s13-13.9 13-23C26 5.8 20.2 0 13 0z" fill="${COL.sitio}" stroke="#fff" stroke-width="1.6"/><circle cx="13" cy="13" r="5" fill="#fff"/></svg>` });
}
function iconPunto(L: any) {
  // Rombo (cuadrado rotado) teal.
  return L.divIcon({ className: "mm-ic", iconSize: [18, 18], iconAnchor: [9, 9], popupAnchor: [0, -10],
    html: `<div style="width:13px;height:13px;background:${COL.punto};border:2px solid #fff;transform:rotate(45deg);box-shadow:0 0 2px rgba(0,0,0,.5)"></div>` });
}
function iconIncidente(L: any) {
  // Triángulo de alerta rojo.
  return L.divIcon({ className: "mm-ic", iconSize: [22, 22], iconAnchor: [11, 20], popupAnchor: [0, -18],
    html: `<svg width="22" height="22" viewBox="0 0 22 22" xmlns="http://www.w3.org/2000/svg"><path d="M11 1 21 20 1 20 Z" fill="${COL.incidente}" stroke="#fff" stroke-width="1.5"/><rect x="10" y="8" width="2" height="6" fill="#fff"/><rect x="10" y="15.5" width="2" height="2" fill="#fff"/></svg>` });
}

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

// Mapa de monitoreo: se construye UNA sola vez y luego solo repinta las capas
// (sitios, puntos, guardias, incidentes) cuando cambian los datos, SIN mover ni
// reencuadrar el mapa — así el operador conserva su foco/zoom durante el refresh.
export default function MapaMonitoreo({
  sitios = [], puntos = [], guardias = [], incidentes = [], className = "cadmapa-map",
}: {
  sitios?: MSitio[]; puntos?: MPunto[]; guardias?: MGuardia[]; incidentes?: MIncidente[]; className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const capas = useRef<{ sitios?: any; puntos?: any; guardias?: any; incidentes?: any }>({});
  const datos = useRef({ sitios, puntos, guardias, incidentes });
  const ajustado = useRef(false);
  datos.current = { sitios, puntos, guardias, incidentes };

  function repintar(L: any) {
    const map = mapRef.current; if (!map) return;
    const { sitios, puntos, guardias, incidentes } = datos.current;
    const c = capas.current;
    // Sitios
    c.sitios.clearLayers();
    sitios.forEach((s) => {
      const m = L.marker([s.latitud, s.longitud], { icon: pinSitio(L) }).addTo(c.sitios);
      m.bindPopup(`🏢 <b>${s.nombre}</b>${s.cliente ? `<br>${s.cliente}` : ""}${s.href ? `<br><a href="${s.href}">Abrir sitio →</a>` : ""}`);
    });
    // Puntos de control
    c.puntos.clearLayers();
    puntos.forEach((p) => {
      const m = L.marker([p.latitud, p.longitud], { icon: iconPunto(L) }).addTo(c.puntos);
      m.bindPopup(`🚩 <b>${p.nombre}</b>${p.sitio ? `<br>${p.sitio}` : ""}${p.codigo ? `<br><code>${p.codigo}</code>` : ""}`);
    });
    // Guardias (GPS en vivo)
    c.guardias.clearLayers();
    guardias.forEach((g) => {
      const m = L.circleMarker([g.latitud, g.longitud], { radius: 7, color: "#fff", weight: 2, fillColor: COL.guardia, fillOpacity: 1 }).addTo(c.guardias);
      const sub = [g.unidad ? `📍 ${g.unidad}` : "", hace(g.actualizado_en)].filter(Boolean).join(" · ");
      m.bindPopup(`👷 <b>${g.etiqueta ?? "Guardia"}</b>${sub ? `<br>${sub}` : ""}`);
    });
    // Incidentes / alertas
    c.incidentes.clearLayers();
    incidentes.forEach((it) => {
      const m = L.marker([it.latitud, it.longitud], { icon: iconIncidente(L) }).addTo(c.incidentes);
      m.bindPopup(`🚨 <b>${it.tipo ?? "Incidencia"}</b> · ${it.prioridad ?? "—"}${it.direccion ? `<br>${it.direccion}` : ""}${it.href ? `<br><a href="${it.href}">Abrir →</a>` : ""}`);
    });
  }

  // Construcción única del mapa.
  useEffect(() => {
    let cancelado = false;
    cargarLeaflet().then((L) => {
      if (cancelado || !ref.current || mapRef.current) return;
      const map = L.map(ref.current).setView([25.6714, -100.309], 12);
      mapRef.current = map;
      const t = tileConfig(); L.tileLayer(t.url, t.opts).addTo(map);
      capas.current = { sitios: L.layerGroup().addTo(map), puntos: L.layerGroup().addTo(map), guardias: L.layerGroup().addTo(map), incidentes: L.layerGroup().addTo(map) };
      repintar(L);
      ajustarUnaVez(L);
      setTimeout(() => map.invalidateSize(), 120);
    }).catch(() => {});
    return () => { cancelado = true; if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; ajustado.current = false; } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Encuadra una sola vez, cuando ya hay datos (no vuelve a moverse en los refresh).
  function ajustarUnaVez(L: any) {
    if (ajustado.current) return;
    const { sitios, puntos, guardias, incidentes } = datos.current;
    const pts: any[] = [];
    [...sitios, ...puntos, ...guardias, ...incidentes].forEach((x: any) => { if (x.latitud != null && x.longitud != null) pts.push([x.latitud, x.longitud]); });
    if (pts.length === 1) { mapRef.current.setView(pts[0], 15); ajustado.current = true; }
    else if (pts.length > 1) { mapRef.current.fitBounds(pts, { padding: [40, 40] }); ajustado.current = true; }
  }

  // Repinta al cambiar los datos, SIN reencuadrar (conserva el foco del operador).
  useEffect(() => {
    const L = (window as any).L;
    if (L && mapRef.current) { repintar(L); ajustarUnaVez(L); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sitios, puntos, guardias, incidentes]);

  return <div ref={ref} className={className} />;
}
