// Proveedor de geodatos: LocationIQ cuando hay llave; si no, cae a
// OpenStreetMap/Nominatim para no romper nada durante la transición.
export const LOCATIONIQ_KEY = process.env.NEXT_PUBLIC_LOCATIONIQ_KEY ?? "";

// Tiles para Leaflet (mapas del dashboard, CAD, incidentes).
export function tileConfig(): { url: string; opts: Record<string, unknown> } {
  if (LOCATIONIQ_KEY) {
    return {
      url: `https://{s}-tiles.locationiq.com/v3/streets/r/{z}/{x}/{y}.png?key=${LOCATIONIQ_KEY}`,
      opts: { maxZoom: 19, subdomains: ["a", "b", "c"], attribution: "© LocationIQ · © OpenStreetMap" },
    };
  }
  return {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    opts: { maxZoom: 19, attribution: "© OpenStreetMap" },
  };
}

// URL de búsqueda de direcciones (forward geocoding).
export function urlGeocode(consulta: string, countrycodes = ""): string {
  const cc = countrycodes ? `&countrycodes=${countrycodes}` : "";
  const q = encodeURIComponent(consulta);
  return LOCATIONIQ_KEY
    ? `https://us1.locationiq.com/v1/search?key=${LOCATIONIQ_KEY}&format=json&limit=5&accept-language=es${cc}&q=${q}`
    : `https://nominatim.openstreetmap.org/search?format=json&limit=5&accept-language=es${cc}&q=${q}`;
}

// URL de geocodificación inversa (coordenadas → domicilio).
export function urlReverse(lat: number, lng: number): string {
  return LOCATIONIQ_KEY
    ? `https://us1.locationiq.com/v1/reverse?key=${LOCATIONIQ_KEY}&format=json&accept-language=es&lat=${lat}&lon=${lng}`
    : `https://nominatim.openstreetmap.org/reverse?format=json&accept-language=es&lat=${lat}&lon=${lng}`;
}

// Imagen de mapa estático con un marcador (para el detalle de una ubicación).
export function urlStaticMap(lat: number, lng: number, w = 600, h = 300, zoom = 16): string | null {
  if (!LOCATIONIQ_KEY) return null;
  return `https://maps.locationiq.com/v3/staticmap?key=${LOCATIONIQ_KEY}&center=${lat},${lng}&zoom=${zoom}&size=${w}x${h}&format=png&markers=icon:large-red-cutout|${lat},${lng}`;
}
