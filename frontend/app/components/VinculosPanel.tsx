"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import type { Vinculo } from "@/lib/types";

export type EntidadTipo =
  | "persona"
  | "vehiculo"
  | "ubicacion"
  | "caso"
  | "personal"
  | "orden"
  | "evidencia"
  | "cad"
  | "incidente"
  | "accidente"
  | "barandilla"
  | "abordamiento"
  | "movimiento"
  | "unidad_carga"
  | "sello"
  | "inspeccion";

interface VinculoConEtiqueta extends Vinculo {
  etiqueta_relacionada?: string;
  otro_tipo?: string;
  otro_id?: string;
}

// Ruta del detalle por tipo de entidad (para abrir el registro relacionado).
const RUTA_POR_TIPO: Record<string, string> = {
  persona: "personas", vehiculo: "vehiculos", ubicacion: "ubicaciones", caso: "casos",
  personal: "personal", orden: "ordenes", evidencia: "evidencias", cad: "cad",
  incidente: "incidentes", accidente: "accidentes", barandilla: "barandilla", abordamiento: "abordamientos",
  movimiento: "logistica/movimientos", unidad_carga: "logistica/unidades-carga", sello: "logistica/sellos", inspeccion: "logistica/inspecciones",
};

interface OpcionEntidad {
  id: string;
  etiqueta: string;
}

// Construye una etiqueta legible a partir de una fila de cualquiera de las
// tres entidades núcleo. Se usa tanto para el selector como para la tabla.
function etiquetarFila(tipo: EntidadTipo, row: any): string {
  if (tipo === "vehiculo") {
    return `${row.marca ?? ""} ${row.modelo ?? ""} (${row.placas ?? "sin placas"})`.trim();
  }
  if (tipo === "ubicacion") {
    return `${row.calle ?? ""} ${row.numero_exterior ?? ""}, ${row.colonia ?? ""}`.trim();
  }
  if (tipo === "caso") {
    return `${row.folio ? `[${row.folio}] ` : ""}${row.titulo ?? ""}`.trim();
  }
  if (tipo === "personal") {
    const p = row.persona;
    const nombre = p ? `${p.nombre ?? ""} ${p.apellido_paterno ?? ""}`.trim() : "";
    const empleo = `${row.rango ?? ""}${row.numero_placa ? ` #${row.numero_placa}` : ""}`.trim();
    return [nombre, empleo].filter(Boolean).join(" — ") || "(personal)";
  }
  if (tipo === "orden") {
    return `${row.folio ? `[${row.folio}] ` : ""}${row.tipo ?? "orden"}${row.asunto ? ` — ${row.asunto}` : ""}`.trim();
  }
  if (tipo === "evidencia") {
    return `${row.folio ? `[${row.folio}] ` : ""}${row.tipo ?? "evidencia"}${row.descripcion ? ` — ${row.descripcion}` : ""}`.trim();
  }
  if (tipo === "cad") {
    return `${row.folio ? `[${row.folio}] ` : ""}${row.tipo ?? "llamada"}${row.direccion ? ` — ${row.direccion}` : ""}`.trim();
  }
  if (tipo === "incidente") {
    return `${row.folio ? `[${row.folio}] ` : ""}${row.tipo ?? "incidente"}`.trim();
  }
  if (tipo === "accidente") {
    return `${row.folio ? `[${row.folio}] ` : ""}${row.tipo_hecho ?? "accidente"}${row.direccion ? ` — ${row.direccion}` : ""}`.trim();
  }
  if (tipo === "barandilla") {
    return `${row.folio ? `[${row.folio}] ` : ""}custodia`.trim();
  }
  if (tipo === "abordamiento") {
    return `${row.folio ? `[${row.folio}] ` : ""}${row.motivo ?? "abordamiento"}`.trim();
  }
  if (tipo === "movimiento") {
    return `${row.folio ? `[${row.folio}] ` : ""}${row.tipo_movimiento ?? "movimiento"}${row.estado ? ` — ${row.estado}` : ""}`.trim();
  }
  if (tipo === "unidad_carga") {
    return `${row.folio ? `[${row.folio}] ` : ""}${row.identificador ?? row.tipo_unidad ?? "unidad"}`.trim();
  }
  if (tipo === "sello") {
    return `${row.folio ? `[${row.folio}] ` : ""}${row.codigo_sello ?? "sello"}${row.estado ? ` — ${row.estado}` : ""}`.trim();
  }
  if (tipo === "inspeccion") {
    return `${row.folio ? `[${row.folio}] ` : ""}${row.tipo_inspeccion ?? "inspección"}${row.resultado ? ` — ${row.resultado}` : ""}`.trim();
  }
  return `${row.nombre ?? ""} ${row.apellido_paterno ?? ""}`.trim();
}

const TABLA_POR_TIPO: Record<EntidadTipo, string> = {
  persona: "personas",
  vehiculo: "vehiculos",
  ubicacion: "ubicaciones",
  caso: "casos",
  personal: "personal",
  orden: "ordenes",
  evidencia: "evidencias",
  cad: "llamadas_cad",
  incidente: "incidentes",
  accidente: "accidentes",
  barandilla: "barandilla",
  abordamiento: "abordamientos",
  movimiento: "movimientos",
  unidad_carga: "unidades_carga",
  sello: "sellos",
  inspeccion: "inspecciones",
};

const COLUMNAS_POR_TIPO: Record<EntidadTipo, string> = {
  persona: "id, nombre, apellido_paterno",
  vehiculo: "id, marca, modelo, placas",
  ubicacion: "id, calle, numero_exterior, colonia",
  caso: "id, folio, titulo",
  personal: "id, numero_placa, rango, persona:personas(nombre, apellido_paterno)",
  orden: "id, folio, tipo, asunto",
  evidencia: "id, folio, tipo, descripcion",
  cad: "id, folio, tipo, direccion",
  incidente: "id, folio, tipo",
  accidente: "id, folio, tipo_hecho, direccion",
  barandilla: "id, folio",
  abordamiento: "id, folio, motivo",
  movimiento: "id, folio, tipo_movimiento, estado",
  unidad_carga: "id, folio, identificador, tipo_unidad",
  sello: "id, folio, codigo_sello, estado",
  inspeccion: "id, folio, tipo_inspeccion, resultado",
};

// Resuelve una etiqueta legible para una entidad relacionada individual (por
// tipo e id), para no mostrar UUIDs crudos en la tabla de vínculos existentes.
async function resolverEtiqueta(tipo: string, id: string): Promise<string> {
  const t = tipo as EntidadTipo;
  if (!TABLA_POR_TIPO[t]) return id;
  const { data } = await supabase
    .from(TABLA_POR_TIPO[t])
    .select(COLUMNAS_POR_TIPO[t])
    .eq("id", id)
    .maybeSingle();
  return data ? etiquetarFila(t, data) : id;
}

// Panel reutilizable de vínculos para cualquier entidad núcleo (persona,
// vehículo, ubicación). Muestra los vínculos existentes en ambos sentidos
// (origen o destino), permite crear uno nuevo eligiendo la entidad
// relacionada desde un selector con búsqueda, y cancelar los existentes.
export default function VinculosPanel({
  entidadTipo,
  entidadId,
}: {
  entidadTipo: EntidadTipo;
  entidadId: string;
}) {
  const [vinculos, setVinculos] = useState<VinculoConEtiqueta[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [tipoDestino, setTipoDestino] = useState<EntidadTipo>("persona");
  const [idDestino, setIdDestino] = useState("");
  const [tipoRelacion, setTipoRelacion] = useState("");

  const [opciones, setOpciones] = useState<OpcionEntidad[]>([]);
  const [filtro, setFiltro] = useState("");

  async function cargarVinculos() {
    const { data, error } = await supabase
      .from("vinculos")
      .select("*")
      .or(
        `and(entidad_origen_tipo.eq.${entidadTipo},entidad_origen_id.eq.${entidadId}),and(entidad_destino_tipo.eq.${entidadTipo},entidad_destino_id.eq.${entidadId})`
      );

    if (error) {
      setError(error.message);
      return;
    }

    const conEtiquetas = await Promise.all(
      (data as Vinculo[]).map(async (link) => {
        const esOrigen =
          link.entidad_origen_tipo === entidadTipo && link.entidad_origen_id === entidadId;
        const otroTipo = esOrigen ? link.entidad_destino_tipo : link.entidad_origen_tipo;
        const otroId = esOrigen ? link.entidad_destino_id : link.entidad_origen_id;
        const etiqueta = await resolverEtiqueta(otroTipo, otroId);
        return { ...link, etiqueta_relacionada: `${otroTipo}: ${etiqueta}`, otro_tipo: otroTipo, otro_id: otroId };
      })
    );

    setVinculos(conEtiquetas);
  }

  // Carga las entidades activas del tipo elegido para poblar el selector.
  async function cargarOpciones(tipo: EntidadTipo) {
    const { data, error } = await supabase
      .from(TABLA_POR_TIPO[tipo])
      .select(COLUMNAS_POR_TIPO[tipo])
      .eq("estatus", "activo")
      .order("creado_en", { ascending: false })
      .limit(200);

    if (error) {
      setError(error.message);
      setOpciones([]);
      return;
    }

    const opts = (data as any[])
      // No permitir vincular una entidad consigo misma.
      .filter((row) => !(tipo === entidadTipo && row.id === entidadId))
      .map((row) => ({ id: row.id as string, etiqueta: etiquetarFila(tipo, row) }));

    setOpciones(opts);
  }

  useEffect(() => {
    cargarVinculos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entidadTipo, entidadId]);

  // Al cambiar el tipo destino, recargar el selector y limpiar la selección.
  useEffect(() => {
    setIdDestino("");
    setFiltro("");
    cargarOpciones(tipoDestino);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipoDestino, entidadTipo, entidadId]);

  async function agregarVinculo(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!idDestino) {
      setError("Selecciona la entidad a vincular.");
      return;
    }

    const { error } = await supabase.from("vinculos").insert({
      entidad_origen_tipo: entidadTipo,
      entidad_origen_id: entidadId,
      entidad_destino_tipo: tipoDestino,
      entidad_destino_id: idDestino,
      tipo_relacion: tipoRelacion,
    });

    if (error) {
      setError(error.message);
      return;
    }

    setIdDestino("");
    setFiltro("");
    setTipoRelacion("");
    cargarVinculos();
  }

  async function cancelarVinculo(id: string) {
    const motivo = window.prompt("Motivo de la cancelación del vínculo:");
    if (motivo === null) return;

    const { error } = await supabase.rpc("rpc_cancelar_registro", {
      p_tabla: "vinculos",
      p_id: id,
      p_motivo: motivo,
    });

    if (error) {
      setError(error.message);
      return;
    }

    cargarVinculos();
  }

  const opcionesFiltradas = opciones.filter((o) =>
    o.etiqueta.toLowerCase().includes(filtro.toLowerCase())
  );

  return (
    <>
      <h3>Vínculos</h3>
      <table>
        <thead>
          <tr>
            <th>Tipo de relación</th>
            <th>Relacionado con</th>
            <th>Estatus</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {vinculos.map((v) => (
            <tr key={v.id}>
              <td>{v.tipo_relacion}</td>
              <td>
                {v.otro_tipo && v.otro_id && RUTA_POR_TIPO[v.otro_tipo]
                  ? <Link href={`/${RUTA_POR_TIPO[v.otro_tipo]}/${v.otro_id}`}>{v.etiqueta_relacionada}</Link>
                  : v.etiqueta_relacionada}
              </td>
              <td className={v.estatus === "activo" ? "badge-activo" : "badge-cancelado"}>
                {v.estatus}
              </td>
              <td>
                {v.estatus === "activo" && (
                  <button className="secundario" onClick={() => cancelarVinculo(v.id)}>
                    Cancelar
                  </button>
                )}
              </td>
            </tr>
          ))}
          {vinculos.length === 0 && (
            <tr>
              <td colSpan={4} style={{ color: "#555" }}>
                Sin vínculos todavía.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <h4>Agregar vínculo</h4>
      <form onSubmit={agregarVinculo}>
        <div className="form-fila">
          <select
            value={tipoDestino}
            onChange={(e) => setTipoDestino(e.target.value as EntidadTipo)}
          >
            <option value="persona">Persona</option>
            <option value="vehiculo">Vehículo</option>
            <option value="ubicacion">Ubicación</option>
            <option value="caso">Caso</option>
            <option value="personal">Personal</option>
            <option value="orden">Citatorio/Orden</option>
            <option value="evidencia">Evidencia</option>
            <option value="cad">Llamada CAD</option>
            <option value="incidente">Incidente</option>
            <option value="accidente">Accidente</option>
            <option value="barandilla">Barandilla</option>
            <option value="abordamiento">Abordamiento</option>
          </select>
          <input
            placeholder="Buscar..."
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
          />
          <select value={idDestino} onChange={(e) => setIdDestino(e.target.value)} required>
            <option value="">
              {opcionesFiltradas.length ? "— Selecciona una entidad —" : "Sin resultados activos"}
            </option>
            {opcionesFiltradas.map((o) => (
              <option key={o.id} value={o.id}>
                {o.etiqueta || "(sin etiqueta)"}
              </option>
            ))}
          </select>
          <input
            placeholder='Tipo de relación (ej. "domicilio_actual", "propietario")'
            value={tipoRelacion}
            onChange={(e) => setTipoRelacion(e.target.value)}
            required
          />
          <button type="submit">Vincular</button>
        </div>
      </form>

      {error && <p style={{ color: "#b00020" }}>{error}</p>}
    </>
  );
}
