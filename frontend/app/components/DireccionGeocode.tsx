"use client";

import { useState } from "react";
import { urlGeocode } from "@/lib/geo";

interface Resultado { display_name: string; lat: string; lon: string; }

// Campo de dirección con búsqueda en OpenStreetMap (Nominatim). El usuario
// escribe un domicilio/dirección, busca, elige un resultado y al aceptarlo se
// fijan la dirección normalizada y las coordenadas (lat/lng) automáticamente.
export default function DireccionGeocode({
  direccion,
  lat,
  lng,
  onDireccion,
  onCoords,
  disabled,
  jurisdiccion,
  pais,
  size,
  sinBoton = false,
  sinCoords = false,
}: {
  direccion: string;
  lat: string;
  lng: string;
  onDireccion: (v: string) => void;
  onCoords: (lat: string, lng: string) => void;
  disabled?: boolean;
  // Jurisdicción (estado) y país que sesgan la búsqueda de domicilios.
  jurisdiccion?: string;
  pais?: string;
  size?: number;      // ancho en caracteres del campo de dirección
  sinBoton?: boolean; // oculta el botón "Buscar" (Enter sigue buscando)
  sinCoords?: boolean; // oculta la línea de coordenadas (para no duplicarla)
}) {
  const [resultados, setResultados] = useState<Resultado[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function buscar() {
    const q = direccion.trim();
    if (!q) return;
    setBuscando(true); setError(null); setResultados([]);
    try {
      // Se añade la jurisdicción y el país para acotar la búsqueda a la
      // corporación (p. ej. domicilios de Nuevo León, México).
      const consulta = [q, jurisdiccion, pais].filter((p) => p && p.trim()).join(", ");
      const cc = /m[eé]xico/i.test(pais ?? "") ? "mx" : "";
      const r = await fetch(urlGeocode(consulta, cc));
      const j = (await r.json()) as Resultado[];
      setResultados(j);
      if (!j.length) setError("Sin resultados. Ajusta la dirección e intenta de nuevo.");
    } catch {
      setError("No se pudo consultar el mapa. Revisa tu conexión.");
    } finally {
      setBuscando(false);
    }
  }

  function aceptar(res: Resultado) {
    onDireccion(res.display_name);
    onCoords(Number(res.lat).toFixed(6), Number(res.lon).toFixed(6));
    setResultados([]);
  }

  return (
    <div className="geo-wrap">
      <div className="form-fila" style={{ alignItems: "center" }}>
        <input
          placeholder={sinBoton ? "Domicilio o dirección — Enter para buscar" : "Domicilio o dirección del incidente"}
          value={direccion}
          disabled={disabled}
          onChange={(e) => onDireccion(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); buscar(); } }}
          style={size ? { width: `${size}ch`, maxWidth: "100%" } : { flex: 1, minWidth: 220 }}
        />
        {!sinBoton && (
          <button type="button" onClick={buscar} disabled={disabled || buscando}>
            {buscando ? "Buscando…" : "🔎 Buscar en mapa"}
          </button>
        )}
        {sinBoton && buscando && <span className="dash-sub">Buscando…</span>}
      </div>

      {!sinCoords && (lat && lng) && (
        <p className="dash-sub" style={{ marginTop: 4 }}>
          📍 Coordenadas: <b>{lat}, {lng}</b>
        </p>
      )}
      {error && <p style={{ color: "#b00020", fontSize: 13 }}>{error}</p>}

      {resultados.length > 0 && (
        <ul className="geo-list">
          {resultados.map((r, i) => (
            <li key={i}>
              <span>{r.display_name}</span>
              <button type="button" className="qbtn2 primary" onClick={() => aceptar(r)}>Aceptar</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
