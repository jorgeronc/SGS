"use client";

import { useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import ListaMaestra from "@/app/components/ListaMaestra";

// Ruta del registro donde se originó una grabación de bodycam (para el enlace del folio).
const RUTA_ORIGEN: Record<string, string> = {
  incidente: "incidentes", accidente: "accidentes", abordamiento: "abordamientos",
  cad: "cad", caso: "casos", tarea: "tareas",
};

function celdaOrigen(r: any) {
  const d = r.datos_adicionales || {};
  if (!d.origen_folio) return "—";
  const ruta = RUTA_ORIGEN[d.origen_tipo as string];
  return ruta && d.origen_id ? (
    <Link href={`/${ruta}/${d.origen_id}`} className="lm-folio-link" onClick={(e) => e.stopPropagation()}>
      {d.origen_folio}
    </Link>
  ) : (
    d.origen_folio
  );
}

function NuevaEvidencia({ onCreado }: { onCreado: () => void }) {
  const [tipo, setTipo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [cantidad, setCantidad] = useState("");
  const [almacen, setAlmacen] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const { error } = await supabase.from("evidencias").insert({
      tipo: tipo || null,
      descripcion: descripcion || null,
      cantidad: cantidad || null,
      ubicacion_almacen: almacen || null,
      fecha_recoleccion: new Date().toISOString(),
    });
    if (error) { setError(error.message); return; }
    setTipo(""); setDescripcion(""); setCantidad(""); setAlmacen("");
    onCreado();
  }

  return (
    <form onSubmit={crear}>
      <div className="form-fila">
        <input placeholder="Tipo (arma, droga, documento...)" value={tipo} onChange={(e) => setTipo(e.target.value)} />
        <input placeholder="Descripción" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
        <input placeholder="Cantidad" value={cantidad} onChange={(e) => setCantidad(e.target.value)} />
        <input placeholder="Almacén / anaquel" value={almacen} onChange={(e) => setAlmacen(e.target.value)} />
        <button type="submit">Registrar evidencia</button>
      </div>
      {error && <p style={{ color: "#b00020" }}>{error}</p>}
    </form>
  );
}

export default function EvidenciasPage() {
  return (
    <ListaMaestra
      titulo="Bienes y Evidencias"
      subtitulo="Inventario con cadena de custodia"
      tabla="evidencias"
      modulo="evidencias"
      select="id, folio, tipo, descripcion, cantidad, ubicacion_almacen, estado_evidencia, fotografias, datos_adicionales, estatus, creado_en"
      miniatura={(r) => r.fotografias}
      placeholderBuscar="Buscar folio, tipo, descripción…"
      columnas={[
        { header: "Folio", campo: "folio", celda: (r) => <span className="sc-folio">{r.folio ?? "s/folio"}</span> },
        { header: "Tipo", celda: (r) => r.tipo ?? "—" },
        { header: "Origen", celda: celdaOrigen },
        { header: "Descripción", celda: (r) => r.descripcion ?? "—" },
        { header: "Estado", celda: (r) => r.estado_evidencia },
        { header: "Estatus", celda: (r) => <span className={r.estatus === "activo" ? "badge-activo" : "badge-cancelado"}>{r.estatus}</span> },
      ]}
      textoBusqueda={(r) => `${r.folio ?? ""} ${r.tipo ?? ""} ${r.descripcion ?? ""}`}
      detalleHref={(r) => `/evidencias/${r.id}`}
      filtros={[
        { k: "todos", label: "Todas" },
        { k: "activos", label: "Activas", test: (r) => r.estatus === "activo" },
      ]}
      quickView={(r) => (
        <>
          <div className="sc-folio" style={{ fontSize: 16 }}>{r.folio ?? "s/folio"}</div>
          <h3 style={{ margin: "6px 0 8px" }}>{r.tipo ?? "Evidencia"}</h3>
          <dl className="sc-kv">
            <dt>Descripción</dt><dd>{r.descripcion ?? "—"}</dd>
            <dt>Cantidad</dt><dd>{r.cantidad ?? "—"}</dd>
            <dt>Almacén</dt><dd>{r.ubicacion_almacen ?? "—"}</dd>
            <dt>Origen</dt><dd>{r.datos_adicionales?.origen_folio ?? "—"}</dd>
            <dt>Estado</dt><dd>{r.estado_evidencia}</dd>
          </dl>
        </>
      )}
      editar={[
        { campo: "tipo", label: "Tipo" },
        { campo: "descripcion", label: "Descripción", tipo: "textarea" },
        { campo: "cantidad", label: "Cantidad" },
        { campo: "ubicacion_almacen", label: "Ubicación en almacén" },
        { campo: "estado_evidencia", label: "Estado", tipo: "select", opciones: ["recolectada", "en_almacen", "en_analisis", "entregada", "devuelta", "destruida"] },
      ]}
      nuevo={(onCreado) => <NuevaEvidencia onCreado={onCreado} />}
    />
  );
}
