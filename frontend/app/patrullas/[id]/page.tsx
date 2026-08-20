"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import FotosPanel from "@/app/components/FotosPanel";
import { ESTATUS_LISTA as ESTATUS, ESTATUS_UNIDAD, PillUnidad } from "../estatus";

export default function PatrullaDetallePage() {
  const params = useParams<{ id: string }>();
  const [p, setP] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function cargar() {
    const { data, error } = await supabase.from("patrullas").select("*").eq("id", params.id).maybeSingle();
    if (error) { setError(error.message); return; }
    setP(data);
    supabase.rpc("rpc_registrar_bitacora", { p_tipo_accion: "CONSULTAR", p_entidad_tipo: "patrullas", p_entidad_id: params.id, p_modulo: "patrullas" });
  }
  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, [params.id]);

  async function fijar(nuevo: string) {
    if (!p) return;
    setGuardando(true);
    setError(null);
    const { error } = await supabase.from("patrullas").update({ estatus_unidad: nuevo, actualizado_en: new Date().toISOString() }).eq("id", p.id);
    setGuardando(false);
    if (error) { setError(error.message); return; }
    setP({ ...p, estatus_unidad: nuevo });
  }

  if (!p) return <main className="contenedor">{error ? <p style={{ color: "#b00020" }}>{error}</p> : <p>Cargando...</p>}</main>;

  return (
    <main className="contenedor">
      <h2>{p.folio ? `[${p.folio}] ` : ""}Patrulla #{p.numero ?? "—"} — {p.tipo ?? ""} {p.marca ?? ""} {p.modelo ?? ""}</h2>
      <p className={p.estatus === "activo" ? "badge-activo" : "badge-cancelado"}>
        {p.estatus}{p.estatus === "cancelado" && p.motivo_cancelacion ? ` — ${p.motivo_cancelacion}` : ""}
      </p>
      <p style={{ fontSize: 13, color: "#555" }}>
        Placas: {p.placas ?? "—"} · Año: {p.anio ?? "—"} · Color: {p.color ?? "—"} · Serie: {p.numero_serie ?? "—"}
      </p>

      <h3>Estatus operativo</h3>
      <div style={{ marginBottom: 8 }}><PillUnidad v={p.estatus_unidad} /></div>
      <div className="form-fila">
        {ESTATUS.map((s) => (
          <button
            key={s}
            type="button"
            disabled={p.estatus !== "activo" || guardando || p.estatus_unidad === s}
            onClick={() => fijar(s)}
            style={{ background: p.estatus_unidad === s ? ESTATUS_UNIDAD[s]?.bg : undefined, color: p.estatus_unidad === s ? "#fff" : undefined }}
          >
            {ESTATUS_UNIDAD[s]?.label ?? s}
          </button>
        ))}
      </div>
      <p className="dash-sub">El despacho cambia este estatus automáticamente (en rutina al despachar, disponible al cerrar). Aquí puedes ajustarlo manualmente.</p>

      <FotosPanel tabla="patrullas" id={params.id} />
      {error && <p style={{ color: "#b00020" }}>{error}</p>}
    </main>
  );
}
