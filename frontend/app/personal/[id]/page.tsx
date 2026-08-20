"use client";

import { useParams } from "next/navigation";
import ExpedientePersonal from "@/app/components/ExpedientePersonal";

// El detalle de Personal es el expediente fusionado (datos de empleo + Kardex).
export default function PersonalDetallePage() {
  const params = useParams<{ id: string }>();
  return <ExpedientePersonal personalId={params.id} />;
}
