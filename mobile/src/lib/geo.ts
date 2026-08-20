// Proveedor de geodatos para la app móvil: LocationIQ cuando hay llave; si no,
// cae a OpenStreetMap/Nominatim para no romper nada durante la transición.
export const LOCATIONIQ_KEY = process.env.EXPO_PUBLIC_LOCATIONIQ_KEY ?? "";

// URL de tiles para Leaflet dentro de un WebView (mapas de captura/consulta).
export function tileUrl(): string {
  return LOCATIONIQ_KEY
    ? `https://{s}-tiles.locationiq.com/v3/streets/r/{z}/{x}/{y}.png?key=${LOCATIONIQ_KEY}`
    : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
}

// Geocodificación inversa (coordenadas -> dirección textual).
export async function reverseGeocode(lat: number, lon: number): Promise<string | null> {
  try {
    const url = LOCATIONIQ_KEY
      ? `https://us1.locationiq.com/v1/reverse?key=${LOCATIONIQ_KEY}&format=json&accept-language=es&lat=${lat}&lon=${lon}`
      : `https://nominatim.openstreetmap.org/reverse?format=json&accept-language=es&lat=${lat}&lon=${lon}`;
    const r = await fetch(url);
    const j = await r.json();
    return j?.display_name ?? null;
  } catch {
    return null;
  }
}

// Dirección desglosada del reverse-geocode: calle, número, colonia, municipio,
// estado, país + una dirección compuesta lista para el campo "Dirección".
export interface DireccionGeo {
  direccion: string;   // "calle número, colonia, municipio, estado"
  calle: string;
  numero: string;
  colonia: string;
  municipio: string;
  estado: string;
  pais: string;
}

export async function reverseGeocodeDetallado(lat: number, lon: number): Promise<DireccionGeo | null> {
  try {
    const url = LOCATIONIQ_KEY
      ? `https://us1.locationiq.com/v1/reverse?key=${LOCATIONIQ_KEY}&format=json&addressdetails=1&normalizeaddress=1&accept-language=es&lat=${lat}&lon=${lon}`
      : `https://nominatim.openstreetmap.org/reverse?format=json&addressdetails=1&accept-language=es&lat=${lat}&lon=${lon}`;
    const r = await fetch(url);
    const j = await r.json();
    const a = j?.address ?? {};
    const calle = a.road ?? a.pedestrian ?? a.footway ?? "";
    const numero = a.house_number ?? "";
    const colonia = a.neighbourhood ?? a.suburb ?? a.quarter ?? a.residential ?? a.colony ?? "";
    const municipio = a.city ?? a.town ?? a.village ?? a.municipality ?? a.county ?? "";
    const estado = a.state ?? "";
    const pais = a.country ?? "";
    const calleNum = [calle, numero].filter(Boolean).join(" ").trim();
    const direccion = [calleNum, colonia, municipio, estado].filter(Boolean).join(", ") || (j?.display_name ?? "");
    return { direccion, calle, numero, colonia, municipio, estado, pais };
  } catch {
    return null;
  }
}
