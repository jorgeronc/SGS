"use client";

import { urlStaticMap } from "@/lib/geo";

// Mapa ligero con marcador. Con LocationIQ usa su mapa estático; si aún no hay
// llave, cae al embed de OpenStreetMap. Muestra un enlace para abrir el punto.
export default function MapaUbicacion({
  latitud,
  longitud,
}: {
  latitud: number | null;
  longitud: number | null;
}) {
  if (latitud == null || longitud == null) {
    return (
      <p style={{ color: "#555" }}>
        Sin coordenadas registradas. Captúralas con el botón de ubicación.
      </p>
    );
  }

  const staticUrl = urlStaticMap(latitud, longitud, 700, 320);
  const d = 0.004; // margen del recuadro (~400 m) para el fallback OSM
  const bbox = [longitud - d, latitud - d, longitud + d, latitud + d].join(",");
  const srcOsm = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${latitud},${longitud}`;
  const enlace = `https://www.google.com/maps/search/?api=1&query=${latitud},${longitud}`;

  return (
    <div>
      {staticUrl ? (
        <img className="mapa" src={staticUrl} alt="Mapa de la ubicación" loading="lazy" style={{ width: "100%", borderRadius: 8, border: "1px solid var(--sc-card-line)" }} />
      ) : (
        <iframe className="mapa" src={srcOsm} title="Mapa de la ubicación" loading="lazy" />
      )}
      <p style={{ fontSize: 13 }}>
        Lat {latitud.toFixed(6)}, Lng {longitud.toFixed(6)} —{" "}
        <a href={enlace} target="_blank" rel="noreferrer">
          abrir en el mapa
        </a>
      </p>
    </div>
  );
}
