"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import FotosPanel, { type TablaConFotos } from "@/app/components/FotosPanel";

const ESTADOS = ["operativo", "asignado", "en_reparacion", "baja"] as const;

function asignadoA(p: any): string {
  if (!p) return "—";
  const nom = p.persona ? `${p.persona.nombre ?? ""} ${p.persona.apellido_paterno ?? ""}`.trim() : "";
  const emp = `${p.rango ?? ""}${p.numero_placa ? ` #${p.numero_placa}` : ""}`.trim();
  return [nom, emp].filter(Boolean).join(" — ") || "—";
}

// Detalle genérico para las tablas uniformes de inventario (armamento,
// comunicación, bodycams, otros): estado del equipo + fotografías.
export default function InventarioDetalle({ tabla, etiqueta }: { tabla: TablaConFotos; etiqueta: string }) {
  const params = useParams<{ id: string }>();
  const [item, setItem] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function cargar() {
    const { data, error } = await supabase
      .from(tabla)
      .select("*, personal:personal(numero_placa, rango, persona:personas(nombre, apellido_paterno))")
      .eq("id", params.id)
      .maybeSingle();
    if (error) { setError(error.message); return; }
    setItem(data);
    supabase.rpc("rpc_registrar_bitacora", { p_tipo_accion: "CONSULTAR", p_entidad_tipo: tabla, p_entidad_id: params.id, p_modulo: tabla });
  }

  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, [params.id]);

  async function cambiarEstado(nuevo: string) {
    if (!item) return;
    setGuardando(true);
    setError(null);
    const { error } = await supabase.from(tabla).update({ estado_equipo: nuevo, actualizado_en: new Date().toISOString() }).eq("id", item.id);
    setGuardando(false);
    if (error) { setError(error.message); return; }
    setItem({ ...item, estado_equipo: nuevo });
  }

  if (!item) return <main className="contenedor">{error ? <p style={{ color: "#b00020" }}>{error}</p> : <p>Cargando...</p>}</main>;

  return (
    <main className="contenedor">
      <h2>{item.folio ? `[${item.folio}] ` : ""}{etiqueta} — {item.tipo ?? ""} {item.marca ?? ""} {item.modelo ?? ""}</h2>
      <p className={item.estatus === "activo" ? "badge-activo" : "badge-cancelado"}>
        {item.estatus}{item.estatus === "cancelado" && item.motivo_cancelacion ? ` — ${item.motivo_cancelacion}` : ""}
      </p>
      <p style={{ fontSize: 13, color: "#555" }}>
        Serie: {item.numero_serie ?? "—"} · Descripción: {item.descripcion ?? "—"} · Asignado a: {asignadoA(item.personal)} · Alta: {item.fecha_alta ? new Date(item.fecha_alta).toLocaleDateString() : "—"}
      </p>

      <div className="form-fila" style={{ alignItems: "center" }}>
        <label htmlFor="estado">Estado del equipo:</label>
        <select id="estado" value={item.estado_equipo} disabled={item.estatus !== "activo" || guardando} onChange={(e) => cambiarEstado(e.target.value)}>
          {ESTADOS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        {guardando && <span style={{ fontSize: 13, color: "#555" }}>guardando...</span>}
      </div>

      <FotosPanel tabla={tabla} id={params.id} />
      {error && <p style={{ color: "#b00020" }}>{error}</p>}
    </main>
  );
}
