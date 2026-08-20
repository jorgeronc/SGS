"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import ListaMaestra from "@/app/components/ListaMaestra";
import { vehiculosSimilares, type RegistroSimilar } from "@/lib/duplicados";
import AvisoDuplicados from "@/app/components/AvisoDuplicados";

function NuevoVehiculo({ onCreado }: { onCreado: () => void }) {
  const [placas, setPlacas] = useState("");
  const [marca, setMarca] = useState("");
  const [modelo, setModelo] = useState("");
  const [anio, setAnio] = useState("");
  const [color, setColor] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [coincidencias, setCoincidencias] = useState<RegistroSimilar[]>([]);

  useEffect(() => {
    if (placas.trim().length < 3) { setCoincidencias([]); return; }
    const t = setTimeout(async () => setCoincidencias(await vehiculosSimilares({ placas })), 450);
    return () => clearTimeout(t);
  }, [placas]);

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const { error } = await supabase.from("vehiculos").insert({
      placas: placas || null,
      marca: marca || null,
      modelo: modelo || null,
      anio: anio ? Number(anio) : null,
      color: color || null,
    });
    if (error) {
      setError(error.message);
      return;
    }
    setPlacas(""); setMarca(""); setModelo(""); setAnio(""); setColor("");
    onCreado();
  }

  return (
    <form onSubmit={crear}>
      <div className="form-fila">
        <input placeholder="Placas" value={placas} onChange={(e) => setPlacas(e.target.value)} />
        <input placeholder="Marca" value={marca} onChange={(e) => setMarca(e.target.value)} />
        <input placeholder="Modelo" value={modelo} onChange={(e) => setModelo(e.target.value)} />
        <input placeholder="Año" type="number" value={anio} onChange={(e) => setAnio(e.target.value)} />
        <input placeholder="Color" value={color} onChange={(e) => setColor(e.target.value)} />
        <button type="submit">Agregar vehículo</button>
      </div>
      <AvisoDuplicados titulo="Este vehículo ya está registrado en el sistema" registros={coincidencias} />
      {error && <p style={{ color: "#b00020" }}>{error}</p>}
    </form>
  );
}

export default function VehiculosPage() {
  return (
    <ListaMaestra
      titulo="Vehículos"
      subtitulo="Flota propia y vehículos de terceros"
      tabla="vehiculos"
      modulo="vehiculos"
      select="id, placas, vin, marca, modelo, anio, color, tipo, fotografias, estatus, creado_en"
      miniatura={(r) => r.fotografias}
      placeholderBuscar="Buscar placas, marca, modelo, VIN…"
      columnas={[
        { header: "Placas", celda: (r) => r.placas ?? "sin placas" },
        { header: "Vehículo", celda: (r) => `${r.marca ?? ""} ${r.modelo ?? ""} ${r.anio ?? ""}`.trim() },
        { header: "Color", celda: (r) => r.color ?? "—" },
        { header: "Estatus", campo: "estatus", celda: (r) => <span className={r.estatus === "activo" ? "badge-activo" : "badge-cancelado"}>{r.estatus}</span> },
        { header: "Registrado", campo: "creado_en", celda: (r) => new Date(r.creado_en).toLocaleDateString() },
      ]}
      textoBusqueda={(r) => `${r.placas ?? ""} ${r.marca ?? ""} ${r.modelo ?? ""} ${r.vin ?? ""}`}
      detalleHref={(r) => `/vehiculos/${r.id}`}
      filtros={[
        { k: "todos", label: "Todos" },
        { k: "activos", label: "Activos", test: (r) => r.estatus === "activo" },
      ]}
      quickView={(r) => (
        <>
          <h3 style={{ margin: "0 0 8px" }}>{`${r.marca ?? ""} ${r.modelo ?? ""}`.trim() || "Vehículo"}</h3>
          <dl className="sc-kv">
            <dt>Placas</dt><dd>{r.placas ?? "—"}</dd>
            <dt>VIN</dt><dd>{r.vin ?? "—"}</dd>
            <dt>Año</dt><dd>{r.anio ?? "—"}</dd>
            <dt>Color</dt><dd>{r.color ?? "—"}</dd>
            <dt>Tipo</dt><dd>{r.tipo ?? "—"}</dd>
            <dt>Estatus</dt><dd>{r.estatus}</dd>
          </dl>
        </>
      )}
      editar={[
        { campo: "placas", label: "Placas" },
        { campo: "vin", label: "VIN" },
        { campo: "marca", label: "Marca" },
        { campo: "modelo", label: "Modelo" },
        { campo: "anio", label: "Año", tipo: "number" },
        { campo: "color", label: "Color" },
        { campo: "tipo", label: "Tipo" },
      ]}
      nuevo={(onCreado) => <NuevoVehiculo onCreado={onCreado} />}
    />
  );
}
