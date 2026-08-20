"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import type { Evidencia, EstadoEvidencia } from "@/lib/types";
import Link from "next/link";
import VinculosPanel from "@/app/components/VinculosPanel";
import FotosPanel from "@/app/components/FotosPanel";
import CadenaCustodiaPanel from "@/app/components/CadenaCustodiaPanel";
import VideoEvidencia from "@/app/components/VideoEvidencia";

// Ruta del registro donde se originó una grabación de bodycam.
const RUTA_ORIGEN: Record<string, string> = {
  incidente: "incidentes", accidente: "accidentes", abordamiento: "abordamientos",
  cad: "cad", caso: "casos", tarea: "tareas",
};

const ESTADOS: EstadoEvidencia[] = [
  "recolectada",
  "en_almacen",
  "en_analisis",
  "entregada",
  "devuelta",
  "destruida",
];

export default function EvidenciaDetallePage() {
  const params = useParams<{ id: string }>();
  const [evidencia, setEvidencia] = useState<Evidencia | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function cargarEvidencia() {
    const { data, error } = await supabase
      .from("evidencias")
      .select("*")
      .eq("id", params.id)
      .maybeSingle();

    if (error) {
      setError(error.message);
      return;
    }
    setEvidencia(data as Evidencia);

    await supabase.rpc("rpc_registrar_bitacora", {
      p_tipo_accion: "CONSULTAR",
      p_entidad_tipo: "evidencias",
      p_entidad_id: params.id,
      p_modulo: "evidencias",
    });
  }

  useEffect(() => {
    cargarEvidencia();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function cambiarEstado(nuevo: EstadoEvidencia) {
    if (!evidencia) return;
    setGuardando(true);
    setError(null);

    const { error } = await supabase
      .from("evidencias")
      .update({ estado_evidencia: nuevo, actualizado_en: new Date().toISOString() })
      .eq("id", evidencia.id);

    setGuardando(false);
    if (error) {
      setError(error.message);
      return;
    }
    setEvidencia({ ...evidencia, estado_evidencia: nuevo });
  }

  if (!evidencia) {
    return <main className="contenedor">{error ? <p>{error}</p> : <p>Cargando...</p>}</main>;
  }

  return (
    <main className="contenedor">
      <h2>
        {evidencia.folio ? `[${evidencia.folio}] ` : ""}
        {evidencia.tipo ?? "evidencia"}
        {evidencia.descripcion ? ` — ${evidencia.descripcion}` : ""}
      </h2>
      <p className={evidencia.estatus === "activo" ? "badge-activo" : "badge-cancelado"}>
        {evidencia.estatus}
        {evidencia.estatus === "cancelado" && evidencia.motivo_cancelacion
          ? ` — ${evidencia.motivo_cancelacion}`
          : ""}
      </p>
      <p style={{ fontSize: 13, color: "#555" }}>
        Cantidad: {evidencia.cantidad ?? "—"} · Almacén: {evidencia.ubicacion_almacen ?? "—"} ·
        Recolección:{" "}
        {evidencia.fecha_recoleccion
          ? new Date(evidencia.fecha_recoleccion).toLocaleString()
          : "—"}
      </p>

      {(evidencia as any).datos_adicionales?.origen_folio && (
        <p style={{ fontSize: 13, color: "#555" }}>
          Origen:{" "}
          {(() => {
            const d = (evidencia as any).datos_adicionales;
            const ruta = RUTA_ORIGEN[d.origen_tipo as string];
            return ruta && d.origen_id ? (
              <Link href={`/${ruta}/${d.origen_id}`}><strong>{d.origen_folio}</strong></Link>
            ) : (
              <strong>{d.origen_folio}</strong>
            );
          })()}
        </p>
      )}

      <div className="form-fila" style={{ alignItems: "center" }}>
        <label htmlFor="estado">Estado de la evidencia:</label>
        <select
          id="estado"
          value={evidencia.estado_evidencia}
          disabled={evidencia.estatus !== "activo" || guardando}
          onChange={(e) => cambiarEstado(e.target.value as EstadoEvidencia)}
        >
          {ESTADOS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        {guardando && <span style={{ fontSize: 13, color: "#555" }}>guardando...</span>}
      </div>

      {(evidencia as any).datos_adicionales?.video_ruta && (
        <VideoEvidencia
          ruta={(evidencia as any).datos_adicionales.video_ruta}
          duracion={(evidencia as any).datos_adicionales.duracion_seg}
          evidenciaId={evidencia.id}
          yaTienePoster={Array.isArray(evidencia.fotografias) && !!evidencia.fotografias[0]}
          poster={
            Array.isArray(evidencia.fotografias) && evidencia.fotografias[0]
              ? supabase.storage.from("fotos").getPublicUrl(evidencia.fotografias[0] as string).data.publicUrl
              : null
          }
        />
      )}

      <CadenaCustodiaPanel evidenciaId={params.id} />

      <FotosPanel tabla="evidencias" id={params.id} />

      <VinculosPanel entidadTipo="evidencia" entidadId={params.id} />

      {error && <p style={{ color: "#b00020" }}>{error}</p>}
    </main>
  );
}
