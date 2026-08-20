"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import ExpedientePersonal from "@/app/components/ExpedientePersonal";

// El detalle del Kardex es el mismo expediente fusionado del elemento (por
// personal_id). Resolvemos el elemento del kardex y mostramos el expediente.
export default function KardexDetallePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [personalId, setPersonalId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.from("kardex").select("personal_id").eq("id", params.id).maybeSingle().then(({ data, error }) => {
      if (error) { setError(error.message); return; }
      if (!data) { setError("Kardex no encontrado."); return; }
      // Unifica la URL en el expediente del elemento.
      router.replace(`/personal/${(data as any).personal_id}`);
      setPersonalId((data as any).personal_id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  if (error) return <div className="contenedor"><p style={{ color: "#b00020" }}>{error}</p></div>;
  if (!personalId) return <div className="contenedor"><p>Cargando expediente…</p></div>;
  return <ExpedientePersonal personalId={personalId} />;
}
