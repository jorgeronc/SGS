// Estilo de mapa para MapLibre (migración a mapas vectoriales).
//
// FASE 0: la base es raster (CARTO dark/light) para no depender de nada aún.
// Cuando exista NEXT_PUBLIC_PMTILES_URL (un archivo .pmtiles de OSM auto-hosteado,
// p. ej. en Supabase Storage/CDN), se sustituye por el estilo VECTORIAL propio
// "Security Dark" (+ variante clara) sobre Protomaps. Ver lib/theme.ts para el tema.

import type { Map as MapLibreMap } from "maplibre-gl";

export const PMTILES_URL = process.env.NEXT_PUBLIC_PMTILES_URL ?? "";

// Paleta "Security Dark" (para cuando se autore el estilo vectorial).
export const SECURITY_DARK = {
  fondo: "#0B1118", edificios: "#151E29", callesPrin: "#283442",
  callesSec: "#1C2732", nombres: "#8796A8", agua: "#071522",
};

let protoListo = false;
// Registra el protocolo pmtiles:// en MapLibre (solo si hay URL configurada).
export async function registrarPmtiles(maplibre: typeof import("maplibre-gl")): Promise<void> {
  if (protoListo || !PMTILES_URL) return;
  const { Protocol } = await import("pmtiles");
  const p = new Protocol();
  maplibre.addProtocol("pmtiles", p.tile);
  protoListo = true;
}

function raster(style: string) {
  return {
    type: "raster" as const,
    tiles: [
      `https://a.basemaps.cartocdn.com/${style}/{z}/{x}/{y}@2x.png`,
      `https://b.basemaps.cartocdn.com/${style}/{z}/{x}/{y}@2x.png`,
    ],
    tileSize: 256,
    attribution: "© OpenStreetMap · © CARTO",
  };
}

// Estilo MapLibre según el tema. Hoy raster; el vectorial "Security Dark" entra
// aquí en cuanto haya PMTILES_URL (sin tocar los componentes que lo consumen).
export function estiloMapa(dark: boolean): any {
  return {
    version: 8,
    sources: { base: raster(dark ? "dark_all" : "light_all") },
    layers: [
      { id: "fondo", type: "background", paint: { "background-color": dark ? SECURITY_DARK.fondo : "#e7edf4" } },
      { id: "base", type: "raster", source: "base" },
    ],
  };
}

// Cambia el estilo base cuando el usuario cambia el tema, conservando las capas
// de datos (fuentes/markers) que haya agregado el componente.
export function aplicarEstilo(map: MapLibreMap, dark: boolean): void {
  map.setStyle(estiloMapa(dark), { diff: false });
}
