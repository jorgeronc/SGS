"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import type { Persona } from "@/lib/types";
import VinculosPanel from "@/app/components/VinculosPanel";
import FotosPanel from "@/app/components/FotosPanel";

export default function PersonaDetallePage() {
  const params = useParams<{ id: string }>();
  const [persona, setPersona] = useState<Persona | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function cargarPersona() {
    const { data, error } = await supabase
      .from("personas")
      .select("*")
      .eq("id", params.id)
      .maybeSingle();

    if (error) {
      setError(error.message);
      return;
    }
    setPersona(data as Persona);

    await supabase.rpc("rpc_registrar_bitacora", {
      p_tipo_accion: "CONSULTAR",
      p_entidad_tipo: "personas",
      p_entidad_id: params.id,
      p_modulo: "personas",
    });
  }

  useEffect(() => {
    cargarPersona();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  if (!persona) {
    return <main className="contenedor">{error ? <p>{error}</p> : <p>Cargando...</p>}</main>;
  }

  return (
    <main className="contenedor">
      <h2>
        {persona.nombre} {persona.apellido_paterno} {persona.apellido_materno}
      </h2>
      <p className={persona.estatus === "activo" ? "badge-activo" : "badge-cancelado"}>
        {persona.estatus}
        {persona.estatus === "cancelado" && persona.motivo_cancelacion
          ? ` — ${persona.motivo_cancelacion}`
          : ""}
      </p>

      <FotosPanel tabla="personas" id={params.id} />

      <VinculosPanel entidadTipo="persona" entidadId={params.id} />

      {error && <p style={{ color: "#b00020" }}>{error}</p>}
    </main>
  );
}
