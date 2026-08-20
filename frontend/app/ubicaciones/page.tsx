"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import ListaMaestra from "@/app/components/ListaMaestra";

function NuevaUbicacion({ onCreado }: { onCreado: () => void }) {
  const [calle, setCalle] = useState("");
  const [num, setNum] = useState("");
  const [colonia, setColonia] = useState("");
  const [municipio, setMunicipio] = useState("");
  const [estado, setEstado] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [ubicando, setUbicando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function usarMiUbicacion() {
    if (!navigator.geolocation) return;
    setUbicando(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(6));
        setLng(pos.coords.longitude.toFixed(6));
        setUbicando(false);
      },
      () => setUbicando(false)
    );
  }

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const { error } = await supabase.from("ubicaciones").insert({
      calle: calle || null,
      numero_exterior: num || null,
      colonia: colonia || null,
      municipio: municipio || null,
      estado: estado || null,
      latitud: lat ? Number(lat) : null,
      longitud: lng ? Number(lng) : null,
    });
    if (error) {
      setError(error.message);
      return;
    }
    setCalle(""); setNum(""); setColonia(""); setMunicipio(""); setEstado(""); setLat(""); setLng("");
    onCreado();
  }

  return (
    <form onSubmit={crear}>
      <div className="form-fila">
        <input placeholder="Calle" value={calle} onChange={(e) => setCalle(e.target.value)} />
        <input placeholder="Núm. ext." value={num} onChange={(e) => setNum(e.target.value)} />
        <input placeholder="Colonia" value={colonia} onChange={(e) => setColonia(e.target.value)} />
        <input placeholder="Municipio" value={municipio} onChange={(e) => setMunicipio(e.target.value)} />
        <input placeholder="Estado" value={estado} onChange={(e) => setEstado(e.target.value)} />
        <input placeholder="Lat" value={lat} onChange={(e) => setLat(e.target.value)} />
        <input placeholder="Lng" value={lng} onChange={(e) => setLng(e.target.value)} />
        <button type="button" onClick={usarMiUbicacion} disabled={ubicando}>{ubicando ? "Ubicando..." : "📍 Ubicación"}</button>
        <button type="submit">Agregar ubicación</button>
      </div>
      {error && <p style={{ color: "#b00020" }}>{error}</p>}
    </form>
  );
}

export default function UbicacionesPage() {
  return (
    <ListaMaestra
      titulo="Ubicaciones / Domicilios"
      subtitulo="Direcciones normalizadas y georreferenciadas"
      tabla="ubicaciones"
      modulo="ubicaciones"
      select="id, calle, numero_exterior, numero_interior, colonia, municipio, estado, codigo_postal, latitud, longitud, referencias, estatus, creado_en"
      placeholderBuscar="Buscar calle, colonia, municipio…"
      columnas={[
        { header: "Dirección", celda: (r) => `${r.calle ?? "—"} ${r.numero_exterior ?? ""}`.trim() },
        { header: "Colonia", celda: (r) => r.colonia ?? "—" },
        { header: "Municipio / Estado", celda: (r) => `${r.municipio ?? "—"}${r.estado ? `, ${r.estado}` : ""}` },
        { header: "Estatus", celda: (r) => <span className={r.estatus === "activo" ? "badge-activo" : "badge-cancelado"}>{r.estatus}</span> },
        { header: "Registrado", celda: (r) => new Date(r.creado_en).toLocaleDateString() },
      ]}
      textoBusqueda={(r) => `${r.calle ?? ""} ${r.colonia ?? ""} ${r.municipio ?? ""} ${r.estado ?? ""}`}
      detalleHref={(r) => `/ubicaciones/${r.id}`}
      filtros={[
        { k: "todos", label: "Todas" },
        { k: "activos", label: "Activas", test: (r) => r.estatus === "activo" },
        { k: "geo", label: "Con coordenadas", test: (r) => r.latitud != null },
      ]}
      quickView={(r) => (
        <>
          <h3 style={{ margin: "0 0 8px" }}>{`${r.calle ?? "—"} ${r.numero_exterior ?? ""}`.trim()}</h3>
          <dl className="sc-kv">
            <dt>Colonia</dt><dd>{r.colonia ?? "—"}</dd>
            <dt>Municipio</dt><dd>{r.municipio ?? "—"}</dd>
            <dt>Estado</dt><dd>{r.estado ?? "—"}</dd>
            <dt>C.P.</dt><dd>{r.codigo_postal ?? "—"}</dd>
            <dt>Coords</dt><dd>{r.latitud != null ? `${r.latitud}, ${r.longitud}` : "—"}</dd>
            <dt>Referencias</dt><dd>{r.referencias ?? "—"}</dd>
          </dl>
        </>
      )}
      editar={[
        { campo: "calle", label: "Calle" },
        { campo: "numero_exterior", label: "Número exterior" },
        { campo: "numero_interior", label: "Número interior" },
        { campo: "colonia", label: "Colonia" },
        { campo: "municipio", label: "Municipio" },
        { campo: "estado", label: "Estado" },
        { campo: "codigo_postal", label: "Código postal" },
        { campo: "referencias", label: "Referencias", tipo: "textarea" },
      ]}
      nuevo={(onCreado) => <NuevaUbicacion onCreado={onCreado} />}
    />
  );
}
