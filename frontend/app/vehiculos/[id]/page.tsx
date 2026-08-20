"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import type { Vehiculo } from "@/lib/types";
import VinculosPanel from "@/app/components/VinculosPanel";
import FotosPanel from "@/app/components/FotosPanel";

export default function VehiculoDetallePage() {
  const params = useParams<{ id: string }>();
  const [vehiculo, setVehiculo] = useState<Vehiculo | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function cargarVehiculo() {
    const { data, error } = await supabase
      .from("vehiculos")
      .select("*")
      .eq("id", params.id)
      .maybeSingle();

    if (error) {
      setError(error.message);
      return;
    }
    setVehiculo(data as Vehiculo);

    await supabase.rpc("rpc_registrar_bitacora", {
      p_tipo_accion: "CONSULTAR",
      p_entidad_tipo: "vehiculos",
      p_entidad_id: params.id,
      p_modulo: "vehiculos",
    });
  }

  useEffect(() => {
    cargarVehiculo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  if (!vehiculo) {
    return <main className="contenedor">{error ? <p>{error}</p> : <p>Cargando...</p>}</main>;
  }

  return (
    <main className="contenedor">
      <h2>
        {vehiculo.marca} {vehiculo.modelo} {vehiculo.anio ?? ""} —{" "}
        {vehiculo.placas ?? "sin placas"}
      </h2>
      <p className={vehiculo.estatus === "activo" ? "badge-activo" : "badge-cancelado"}>
        {vehiculo.estatus}
        {vehiculo.estatus === "cancelado" && vehiculo.motivo_cancelacion
          ? ` — ${vehiculo.motivo_cancelacion}`
          : ""}
      </p>
      <p style={{ fontSize: 13, color: "#555" }}>
        Color: {vehiculo.color ?? "—"} · VIN: {vehiculo.vin ?? "—"} · Tipo: {vehiculo.tipo ?? "—"}
      </p>

      <FotosPanel tabla="vehiculos" id={params.id} />

      <VinculosPanel entidadTipo="vehiculo" entidadId={params.id} />
    </main>
  );
}
