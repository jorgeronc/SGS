"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import type { Equipo, EstadoEquipo } from "@/lib/types";
import FotosPanel from "@/app/components/FotosPanel";

const ESTADOS: EstadoEquipo[] = ["operativo", "asignado", "en_reparacion", "baja"];

function asignadoA(e: Equipo): string {
  const p = e.personal;
  if (!p) return "—";
  const nombre = p.persona ? `${p.persona.nombre ?? ""} ${p.persona.apellido_paterno ?? ""}`.trim() : "";
  const empleo = `${p.rango ?? ""}${p.numero_placa ? ` #${p.numero_placa}` : ""}`.trim();
  return [nombre, empleo].filter(Boolean).join(" — ") || "—";
}

export default function EquipoDetallePage() {
  const params = useParams<{ id: string }>();
  const [equipo, setEquipo] = useState<Equipo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function cargarEquipo() {
    const { data, error } = await supabase
      .from("equipo")
      .select("*, personal:personal(numero_placa, rango, persona:personas(nombre, apellido_paterno))")
      .eq("id", params.id)
      .maybeSingle();

    if (error) {
      setError(error.message);
      return;
    }
    setEquipo(data as Equipo);

    await supabase.rpc("rpc_registrar_bitacora", {
      p_tipo_accion: "CONSULTAR",
      p_entidad_tipo: "equipo",
      p_entidad_id: params.id,
      p_modulo: "equipo",
    });
  }

  useEffect(() => {
    cargarEquipo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function cambiarEstado(nuevo: EstadoEquipo) {
    if (!equipo) return;
    setGuardando(true);
    setError(null);
    const { error } = await supabase
      .from("equipo")
      .update({ estado_equipo: nuevo, actualizado_en: new Date().toISOString() })
      .eq("id", equipo.id);
    setGuardando(false);
    if (error) {
      setError(error.message);
      return;
    }
    setEquipo({ ...equipo, estado_equipo: nuevo });
  }

  if (!equipo) {
    return <main className="contenedor">{error ? <p>{error}</p> : <p>Cargando...</p>}</main>;
  }

  return (
    <main className="contenedor">
      <h2>
        {equipo.folio ? `[${equipo.folio}] ` : ""}
        {equipo.tipo ?? "equipo"} — {equipo.marca} {equipo.modelo}
      </h2>
      <p className={equipo.estatus === "activo" ? "badge-activo" : "badge-cancelado"}>
        {equipo.estatus}
        {equipo.estatus === "cancelado" && equipo.motivo_cancelacion
          ? ` — ${equipo.motivo_cancelacion}`
          : ""}
      </p>
      <p style={{ fontSize: 13, color: "#555" }}>
        Serie: {equipo.numero_serie ?? "—"} · Asignado a: {asignadoA(equipo)} · Alta:{" "}
        {equipo.fecha_alta ? new Date(equipo.fecha_alta).toLocaleDateString() : "—"}
      </p>

      <div className="form-fila" style={{ alignItems: "center" }}>
        <label htmlFor="estado">Estado del equipo:</label>
        <select
          id="estado"
          value={equipo.estado_equipo}
          disabled={equipo.estatus !== "activo" || guardando}
          onChange={(e) => cambiarEstado(e.target.value as EstadoEquipo)}
        >
          {ESTADOS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        {guardando && <span style={{ fontSize: 13, color: "#555" }}>guardando...</span>}
      </div>

      <FotosPanel tabla="equipo" id={params.id} />

      {error && <p style={{ color: "#b00020" }}>{error}</p>}
    </main>
  );
}
