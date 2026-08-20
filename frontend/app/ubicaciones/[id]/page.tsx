"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import type { Ubicacion } from "@/lib/types";
import VinculosPanel from "@/app/components/VinculosPanel";
import MapaUbicacion from "@/app/components/MapaUbicacion";

export default function UbicacionDetallePage() {
  const params = useParams<{ id: string }>();
  const [ubicacion, setUbicacion] = useState<Ubicacion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ubicando, setUbicando] = useState(false);

  async function cargarUbicacion() {
    const { data, error } = await supabase
      .from("ubicaciones")
      .select("*")
      .eq("id", params.id)
      .maybeSingle();

    if (error) {
      setError(error.message);
      return;
    }
    setUbicacion(data as Ubicacion);

    await supabase.rpc("rpc_registrar_bitacora", {
      p_tipo_accion: "CONSULTAR",
      p_entidad_tipo: "ubicaciones",
      p_entidad_id: params.id,
      p_modulo: "ubicaciones",
    });
  }

  useEffect(() => {
    cargarUbicacion();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function fijarCoordenadasActuales() {
    if (!navigator.geolocation) {
      setError("Este navegador no soporta geolocalización.");
      return;
    }
    setUbicando(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(6));
        const lng = Number(pos.coords.longitude.toFixed(6));
        const { error } = await supabase
          .from("ubicaciones")
          .update({ latitud: lat, longitud: lng, actualizado_en: new Date().toISOString() })
          .eq("id", params.id);
        setUbicando(false);
        if (error) {
          setError(error.message);
          return;
        }
        setUbicacion((u) => (u ? { ...u, latitud: lat, longitud: lng } : u));
      },
      (err) => {
        setError("No se pudo obtener la ubicación: " + err.message);
        setUbicando(false);
      }
    );
  }

  if (!ubicacion) {
    return <main className="contenedor">{error ? <p>{error}</p> : <p>Cargando...</p>}</main>;
  }

  return (
    <main className="contenedor">
      <h2>
        {ubicacion.calle ?? "—"} {ubicacion.numero_exterior ?? ""}
        {ubicacion.numero_interior ? ` int. ${ubicacion.numero_interior}` : ""}
      </h2>
      <p className={ubicacion.estatus === "activo" ? "badge-activo" : "badge-cancelado"}>
        {ubicacion.estatus}
        {ubicacion.estatus === "cancelado" && ubicacion.motivo_cancelacion
          ? ` — ${ubicacion.motivo_cancelacion}`
          : ""}
      </p>
      <p style={{ fontSize: 13, color: "#555" }}>
        {ubicacion.colonia ?? "—"} · {ubicacion.municipio ?? "—"}
        {ubicacion.estado ? `, ${ubicacion.estado}` : ""} · CP {ubicacion.codigo_postal ?? "—"}
      </p>
      {ubicacion.referencias && <p style={{ fontSize: 13 }}>Referencias: {ubicacion.referencias}</p>}

      <h3>Ubicación geográfica</h3>
      <div className="form-fila" style={{ alignItems: "center" }}>
        <button
          type="button"
          onClick={fijarCoordenadasActuales}
          disabled={ubicacion.estatus !== "activo" || ubicando}
        >
          {ubicando ? "Ubicando..." : "📍 Fijar coordenadas a mi ubicación actual"}
        </button>
      </div>
      <MapaUbicacion latitud={ubicacion.latitud} longitud={ubicacion.longitud} />

      <VinculosPanel entidadTipo="ubicacion" entidadId={params.id} />
    </main>
  );
}
