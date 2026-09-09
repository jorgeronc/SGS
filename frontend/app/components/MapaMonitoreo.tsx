"use client";

import { useEffect, useRef } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import { estiloMapaPorId } from "@/lib/mapStyle";

// Colores por tipo (coinciden con la leyenda del módulo de monitoreo).
export const COL = { sitio: "#f4a03f", punto: "#0e8f86", guardia: "#1e88e5", incidente: "#d32f2f", camara: "#6a1b9a" };

export interface MSitio { id: string; nombre: string; cliente?: string | null; latitud: number; longitud: number; href?: string }
export interface MPunto { id: string; nombre: string; sitio?: string | null; codigo?: string | null; latitud: number; longitud: number }
export interface MGuardia { personal_id: string; etiqueta: string | null; unidad?: string | null; latitud: number; longitud: number; actualizado_en?: string | null; estatus_servicio?: string | null; motivo_pausa?: string | null }
export interface MIncidente { id: string; folio?: string | null; tipo?: string | null; prioridad?: string | null; direccion?: string | null; estado?: string | null; latitud: number; longitud: number; href?: string }
export interface MCamara { id: string; nombre: string; sitio?: string | null; estado_operativo?: string | null; latitud: number; longitud: number }

function labelServicio(s?: string | null, motivo?: string | null): string {
  if (s === "en_rondin") return "🔁 En rondín";
  if (s === "en_pausa") return `⏸ En pausa${motivo ? ` (${motivo})` : ""}`;
  return "✓ En posición";
}
const DESP_LABEL: Record<string, string> = { recibida: "Recibida", despachada: "Despachado", en_atencion: "En atención", resuelta: "Resuelta" };

function hace(iso?: string | null): string {
  if (!iso) return "";
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `hace ${s} s`;
  const m = Math.round(s / 60);
  return m < 60 ? `hace ${m} min` : `hace ${Math.round(m / 60)} h`;
}

// Elemento HTML para un Marker de MapLibre a partir de innerHTML.
function el(html: string): HTMLElement { const d = document.createElement("div"); d.style.cursor = "pointer"; d.innerHTML = html; return d; }
const htmlSitio = `<svg width="26" height="36" viewBox="0 0 26 36" xmlns="http://www.w3.org/2000/svg"><path d="M13 0C5.8 0 0 5.8 0 13c0 9.1 13 23 13 23s13-13.9 13-23C26 5.8 20.2 0 13 0z" fill="${COL.sitio}" stroke="#fff" stroke-width="1.6"/><circle cx="13" cy="13" r="5" fill="#fff"/></svg>`;
const htmlPunto = `<div style="width:13px;height:13px;background:${COL.punto};border:2px solid #fff;transform:rotate(45deg);box-shadow:0 0 2px rgba(0,0,0,.5)"></div>`;
const htmlIncidente = `<svg width="22" height="22" viewBox="0 0 22 22" xmlns="http://www.w3.org/2000/svg"><path d="M11 1 21 20 1 20 Z" fill="${COL.incidente}" stroke="#fff" stroke-width="1.5"/><rect x="10" y="8" width="2" height="6" fill="#fff"/><rect x="10" y="15.5" width="2" height="2" fill="#fff"/></svg>`;
const htmlCamara = `<svg width="22" height="22" viewBox="0 0 22 22" xmlns="http://www.w3.org/2000/svg"><circle cx="11" cy="11" r="10" fill="${COL.camara}" stroke="#fff" stroke-width="1.6"/><rect x="5" y="8" width="8" height="6" rx="1" fill="#fff"/><path d="M13 9.5 17 7.5 17 14.5 13 12.5 Z" fill="#fff"/></svg>`;
const htmlGuardia = `<div style="width:14px;height:14px;border-radius:50%;background:${COL.guardia};border:2px solid #fff;box-shadow:0 1px 4px #0006"></div>`;

// Mapa de monitoreo (Calles/Liberty): se construye UNA vez y luego solo repinta
// las capas cuando cambian los datos, SIN mover ni reencuadrar (conserva el foco).
export default function MapaMonitoreo({
  sitios = [], puntos = [], guardias = [], incidentes = [], camaras = [], className = "cadmapa-map",
}: {
  sitios?: MSitio[]; puntos?: MPunto[]; guardias?: MGuardia[]; incidentes?: MIncidente[]; camaras?: MCamara[]; className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const mlRef = useRef<any>(null);
  const marks = useRef<Record<string, any[]>>({ sitios: [], puntos: [], guardias: [], incidentes: [], camaras: [] });
  const listo = useRef(false);
  const ajustado = useRef(false);
  const datos = useRef({ sitios, puntos, guardias, incidentes, camaras });
  datos.current = { sitios, puntos, guardias, incidentes, camaras };

  function marcador(html: string, anchor: "bottom" | "center", lng: number, lat: number, popupHtml: string) {
    const maplibre = mlRef.current, map = mapRef.current;
    const mk = new maplibre.Marker({ element: el(html), anchor }).setLngLat([lng, lat])
      .setPopup(new maplibre.Popup({ offset: anchor === "bottom" ? 30 : 12, closeButton: false }).setHTML(`<div style="font-size:12px;color:#111">${popupHtml}</div>`))
      .addTo(map);
    return mk;
  }

  function repintar() {
    const map = mapRef.current, maplibre = mlRef.current;
    if (!map || !maplibre || !listo.current) return;
    const { sitios, puntos, guardias, incidentes, camaras } = datos.current;
    Object.values(marks.current).forEach((arr) => arr.forEach((m) => m.remove()));
    marks.current = { sitios: [], puntos: [], guardias: [], incidentes: [], camaras: [] };
    sitios.forEach((s) => { if (s.latitud != null) marks.current.sitios.push(marcador(htmlSitio, "bottom", Number(s.longitud), Number(s.latitud), `🏢 <b>${s.nombre}</b>${s.cliente ? `<br>${s.cliente}` : ""}${s.href ? `<br><a href="${s.href}">Abrir sitio →</a>` : ""}`)); });
    puntos.forEach((p) => { if (p.latitud != null) marks.current.puntos.push(marcador(htmlPunto, "center", Number(p.longitud), Number(p.latitud), `🚩 <b>${p.nombre}</b>${p.sitio ? `<br>${p.sitio}` : ""}${p.codigo ? `<br><code>${p.codigo}</code>` : ""}`)); });
    guardias.forEach((g) => { if (g.latitud != null) { const sub = [g.unidad ? `📍 ${g.unidad}` : "", hace(g.actualizado_en)].filter(Boolean).join(" · "); marks.current.guardias.push(marcador(htmlGuardia, "center", Number(g.longitud), Number(g.latitud), `👷 <b>${g.etiqueta ?? "Guardia"}</b><br>${labelServicio(g.estatus_servicio, g.motivo_pausa)}${sub ? `<br>${sub}` : ""}`)); } });
    incidentes.forEach((it) => { if (it.latitud != null) { const est = it.estado ? `<br>Estado: <b>${DESP_LABEL[it.estado] ?? it.estado}</b>` : ""; marks.current.incidentes.push(marcador(htmlIncidente, "bottom", Number(it.longitud), Number(it.latitud), `🚨 <b>${it.tipo ?? "Incidencia"}</b> · prioridad ${it.prioridad ?? "—"}${est}${it.direccion ? `<br>${it.direccion}` : ""}${it.href ? `<br><a href="${it.href}">Abrir →</a>` : ""}`)); } });
    camaras.forEach((cam) => { if (cam.latitud != null) { const est = cam.estado_operativo && cam.estado_operativo !== "activa" ? ` (${cam.estado_operativo})` : ""; marks.current.camaras.push(marcador(htmlCamara, "center", Number(cam.longitud), Number(cam.latitud), `📹 <b>${cam.nombre}</b>${est}${cam.sitio ? `<br>${cam.sitio}` : ""}<br><a href="/videovigilancia/muro?cam=${cam.id}">Abrir en muro →</a>`)); } });
  }

  function ajustarUnaVez() {
    if (ajustado.current) return;
    const map = mapRef.current, maplibre = mlRef.current; if (!map || !maplibre) return;
    const { sitios, puntos, guardias, incidentes, camaras } = datos.current;
    const pts: [number, number][] = [];
    [...sitios, ...puntos, ...guardias, ...incidentes, ...camaras].forEach((x: any) => { if (x.latitud != null && x.longitud != null) pts.push([Number(x.longitud), Number(x.latitud)]); });
    if (pts.length === 1) { map.easeTo({ center: pts[0], zoom: 15, duration: 300 }); ajustado.current = true; }
    else if (pts.length > 1) { const b = pts.reduce((bb: any, c) => bb.extend(c), new maplibre.LngLatBounds(pts[0], pts[0])); map.fitBounds(b, { padding: 40, duration: 400 }); ajustado.current = true; }
  }

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const mod = await import("maplibre-gl" as any);
        const maplibre: any = (mod as any).default ?? mod;
        if (cancelado || !ref.current || mapRef.current) return;
        mlRef.current = maplibre;
        const map = new maplibre.Map({ container: ref.current, style: estiloMapaPorId("liberty", false), center: [-100.309, 25.6714], zoom: 12, attributionControl: { compact: true } });
        mapRef.current = map;
        map.on("error", (e: any) => console.error("MapaMonitoreo/MapLibre:", e?.error ?? e));
        map.on("load", () => { listo.current = true; setTimeout(() => map.resize(), 80); repintar(); ajustarUnaVez(); });
      } catch (e) { console.error("MapaMonitoreo: no se pudo iniciar el mapa", e); }
    })();
    return () => { cancelado = true; if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } listo.current = false; ajustado.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { repintar(); ajustarUnaVez(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [sitios, puntos, guardias, incidentes, camaras]);

  return <div ref={ref} className={className} />;
}
