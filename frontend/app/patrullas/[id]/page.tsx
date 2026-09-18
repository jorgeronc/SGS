"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import FotosPanel from "@/app/components/FotosPanel";
import { ESTATUS_LISTA as ESTATUS, ESTATUS_UNIDAD, PillUnidad } from "../estatus";

const nombrePersona = (p: any) => (p?.persona ? `${p.persona.nombre ?? ""} ${p.persona.apellido_paterno ?? ""} ${p.persona.apellido_materno ?? ""}`.trim() : "—");

export default function PatrullaDetallePage() {
  const params = useParams<{ id: string }>();
  const [p, setP] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [supervisores, setSupervisores] = useState<any[]>([]); // personal con cuenta de rol supervisor/coordinador

  async function cargar() {
    const { data, error } = await supabase.from("patrullas").select("*").eq("id", params.id).maybeSingle();
    if (error) { setError(error.message); return; }
    setP(data);
    supabase.rpc("rpc_registrar_bitacora", { p_tipo_accion: "CONSULTAR", p_entidad_tipo: "patrullas", p_entidad_id: params.id, p_modulo: "patrullas" });
  }
  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, [params.id]);

  // Personal asignable: con cuenta ligada de rol supervisor o coordinador.
  useEffect(() => {
    (async () => {
      const [{ data: per }, { data: perf }] = await Promise.all([
        supabase.from("personal").select("id, usuario_id, persona:personas(nombre, apellido_paterno, apellido_materno)").eq("estatus", "activo").eq("estado_laboral", "activo"),
        supabase.from("usuarios_perfil").select("id, rol"),
      ]);
      const rol = new Map(((perf as any[]) ?? []).map((x) => [x.id, x.rol]));
      setSupervisores(((per as any[]) ?? []).filter((x) => x.usuario_id && ["supervisor", "coordinador"].includes(rol.get(x.usuario_id))));
    })();
  }, []);

  async function asignar(personalId: string) {
    if (!p) return;
    setGuardando(true); setError(null);
    const { error } = await supabase.from("patrullas").update({ asignado_personal_id: personalId || null, actualizado_en: new Date().toISOString() }).eq("id", p.id);
    setGuardando(false);
    if (error) { setError(error.message); return; }
    setP({ ...p, asignado_personal_id: personalId || null });
  }

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

      <h3>Supervisor asignado</h3>
      <div className="form-fila">
        <select value={p.asignado_personal_id ?? ""} disabled={p.estatus !== "activo" || guardando} onChange={(e) => asignar(e.target.value)} style={{ flex: 2 }}>
          <option value="">— Sin asignar —</option>
          {supervisores.map((s) => <option key={s.id} value={s.id}>{nombrePersona(s)}</option>)}
        </select>
      </div>
      <p className="dash-sub">La unidad queda ligada a este supervisor/coordinador; el dato llega al móvil como su unidad y permite seguir su recorrido. {supervisores.length === 0 ? "No hay personal con cuenta de rol supervisor/coordinador." : ""}</p>

      <FotosPanel tabla="patrullas" id={params.id} />
      {error && <p style={{ color: "#b00020" }}>{error}</p>}
    </main>
  );
}
