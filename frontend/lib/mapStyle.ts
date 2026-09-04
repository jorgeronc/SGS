// Estilo de mapa para MapLibre (migración a mapas vectoriales).
//
// Cuando existe NEXT_PUBLIC_PMTILES_URL (un .pmtiles de OSM — local con
// `pmtiles serve` o hosteado), se usa el estilo VECTORIAL propio "Security Dark"
// (paleta del cliente) sobre Protomaps. Si no hay pmtiles, cae a una base raster
// (CARTO dark/light) para no romper nada. Theme-aware (ver lib/theme.ts).

import type { Map as MapLibreMap } from "maplibre-gl";
import { DARK, LIGHT, layers, type Flavor } from "@protomaps/basemaps";

export const PMTILES_URL = process.env.NEXT_PUBLIC_PMTILES_URL ?? "";

// Assets públicos de Protomaps (fuentes/sprites). Para on-prem se auto-hostean.
const GLYPHS = "https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf";
const SPRITE = "https://protomaps.github.io/basemaps-assets/sprites/v4/light";

// Paleta "Security Dark" del cliente.
const P = { fondo: "#0B1118", edificios: "#151E29", callesPrin: "#283442", callesSec: "#1C2732", nombres: "#8796A8", agua: "#071522" };

// Flavor "Security Dark": parte del DARK de Protomaps y sobreescribe los colores clave.
const SECURITY_DARK: Flavor = {
  ...DARK,
  background: P.fondo, earth: P.fondo, water: P.agua, buildings: P.edificios,
  highway: P.callesPrin, major: P.callesPrin, link: P.callesPrin, other: P.callesSec,
  minor_a: P.callesSec, minor_b: P.callesSec, minor_service: P.callesSec,
  highway_casing_early: P.fondo, highway_casing_late: P.fondo, major_casing_early: P.fondo, major_casing_late: P.fondo,
  minor_casing: P.fondo, minor_service_casing: P.fondo, link_casing: P.fondo,
  city_label: P.nombres, state_label: P.nombres, country_label: P.nombres, subplace_label: P.nombres,
  roads_label_major: P.nombres, roads_label_minor: P.nombres, address_label: P.nombres, ocean_label: P.nombres,
};

// Estilos gratuitos de OpenFreeMap (vector, sin API key, sin límites de uso,
// datos OSM => uso comercial OK, CORS habilitado). Se usan como base cuando aún
// no hay un .pmtiles propio (Protomaps) hosteado. 'dark' nativo / Positron claro.
const OPENFREEMAP_DARK = "https://tiles.openfreemap.org/styles/dark";
const OPENFREEMAP_LIGHT = "https://tiles.openfreemap.org/styles/positron";

let protoListo = false;
// Registra el protocolo pmtiles:// en MapLibre (solo si hay URL configurada).
export async function registrarPmtiles(maplibre: any): Promise<void> {
  if (protoListo || !PMTILES_URL) return;
  const { Protocol } = await import("pmtiles");
  const p = new Protocol();
  maplibre.addProtocol("pmtiles", p.tile);
  protoListo = true;
}

// Estilo MapLibre según el tema. Vectorial "Security Dark"/claro sobre Protomaps
// cuando hay pmtiles; si no, base raster.
export function estiloMapa(dark: boolean): any {
  if (PMTILES_URL) {
    const src = PMTILES_URL.startsWith("pmtiles://") ? PMTILES_URL : `pmtiles://${PMTILES_URL}`;
    return {
      version: 8,
      glyphs: GLYPHS,
      sprite: SPRITE,
      sources: { protomaps: { type: "vector", url: src, attribution: "© OpenStreetMap" } },
      layers: layers("protomaps", dark ? SECURITY_DARK : LIGHT, { lang: "es" }),
    };
  }
  return dark ? OPENFREEMAP_DARK : OPENFREEMAP_LIGHT;
}

// Cambia el estilo base cuando el usuario cambia el tema, conservando las capas
// de datos que haya agregado el componente (se re-agregan en 'styledata').
export function aplicarEstilo(map: MapLibreMap, dark: boolean): void {
  map.setStyle(estiloMapa(dark), { diff: false });
}

// --- Tipos de mapa adicionales del proveedor (OpenFreeMap) ---
// "auto" = el estilo según el tema (el comportamiento por defecto). Los demás son
// estilos del proveedor que el usuario puede elegir manualmente en el mapa.
export type EstiloMapaId = "auto" | "liberty" | "bright" | "positron" | "dark";

export const ESTILOS_MAPA: { id: EstiloMapaId; label: string }[] = [
  { id: "auto", label: "Automático (según tema)" },
  { id: "liberty", label: "Calles (Liberty)" },
  { id: "bright", label: "Brillante" },
  { id: "positron", label: "Claro (Positron)" },
  { id: "dark", label: "Oscuro" },
];

const OFM = (s: string) => `https://tiles.openfreemap.org/styles/${s}`;

// Estilo MapLibre por id elegido. "auto" respeta el tema (usa `estiloMapa`).
export function estiloMapaPorId(id: EstiloMapaId, dark: boolean): any {
  switch (id) {
    case "liberty": return OFM("liberty");
    case "bright": return OFM("bright");
    case "positron": return OFM("positron");
    case "dark": return OFM("dark");
    default: return estiloMapa(dark);
  }
}
