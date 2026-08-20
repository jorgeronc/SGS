"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import CapturaVinculada from "./CapturaVinculada";
import InvestigacionPersona from "./InvestigacionPersona";

// Participaciones del caso. Las de persona incluyen las que hereda del informe
// (ENTREVISTADO, DETENIDO, ASEGURADO) para que lo clonado se muestre, más las
// propias del caso (VÍCTIMA, AFECTADO, TESTIGO).
const PERSONA_PART = ["VÍCTIMA", "AFECTADO", "TESTIGO", "ENTREVISTADO", "DETENIDO", "ASEGURADO"];

interface PersonaCaso { id: string; etiqueta: string; }

// Pestaña Involucrados de un caso: captura por participación (personas, vehículos,
// objetos) + investigación por persona. Se precarga con lo clonado del informe.
export default function InvolucradosCaso({ casoId, editable }: { casoId: string; editable: boolean }) {
  const [personas, setPersonas] = useState<PersonaCaso[]>([]);

  const cargarPersonas = useCallback(async () => {
    const { data: vin } = await supabase.from("vinculos")
      .select("entidad_destino_id")
      .eq("entidad_origen_tipo", "caso").eq("entidad_origen_id", casoId)
      .eq("entidad_destino_tipo", "persona").eq("estatus", "activo");
    const ids = Array.from(new Set(((vin as any[]) ?? []).map((v) => v.entidad_destino_id)));
    if (!ids.length) { setPersonas([]); return; }
    const { data: pers } = await supabase.from("personas")
      .select("id, nombre, apellido_paterno, apellido_materno").in("id", ids);
    setPersonas(((pers as any[]) ?? []).map((p) => ({
      id: p.id,
      etiqueta: `${p.nombre ?? ""} ${p.apellido_paterno ?? ""} ${p.apellido_materno ?? ""}`.trim() || "(sin nombre)",
    })));
  }, [casoId]);

  useEffect(() => { cargarPersonas(); }, [cargarPersonas]);

  return (
    <>
      <p className="dash-sub">
        Personas, vehículos y objetos involucrados en el caso (se precarga con lo del informe de origen).
        Puedes agregar más, igual que en el informe.
      </p>

      {PERSONA_PART.map((part) => (
        <CapturaVinculada key={part} origenTipo="caso" origenId={casoId} tipo="persona" participacion={part}
          titulo={`Personas — ${part.charAt(0) + part.slice(1).toLowerCase()}`} editable={editable} />
      ))}

      <CapturaVinculada origenTipo="caso" origenId={casoId} tipo="vehiculo" participacion="ASEGURADO" titulo="Vehículos involucrados" editable={editable} />
      <CapturaVinculada origenTipo="caso" origenId={casoId} tipo="evidencia" participacion="OBJETO ASEGURADO" titulo="Objetos / evidencias" editable={editable} />

      <div className="dash-eyebrow" style={{ marginTop: 18 }}>Investigación por persona</div>
      {personas.length === 0 ? (
        <p className="dash-sub">Aún no hay personas en el caso. Agrega involucrados arriba y aquí aparecerá su ficha de investigación.</p>
      ) : (
        personas.map((p) => (
          <div key={p.id} className="presunto-form">
            <Link href={`/personas/${p.id}`} style={{ fontWeight: 700 }}>{p.etiqueta}</Link>
            <InvestigacionPersona personaId={p.id} editable={editable} />
          </div>
        ))
      )}
      <div style={{ marginTop: 10 }}>
        <button type="button" className="secundario" onClick={cargarPersonas}>↻ Actualizar lista de personas</button>
      </div>
    </>
  );
}
