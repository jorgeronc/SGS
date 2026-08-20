"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { CatalogoSelect } from "./CatalogoSelect";

// Campos de investigación que se guardan en el registro MAESTRO de la persona
// (personas.datos_adicionales). Son globales a la persona: si aparece en otro
// caso, ya vienen cargados.
const CLAVES = ["estado_civil", "originario_municipio", "originario_estado", "originario_pais", "telefono", "redes_sociales"] as const;

export default function InvestigacionPersona({ personaId, editable = true }: { personaId: string; editable?: boolean }) {
  const [d, setD] = useState<Record<string, string>>({});
  const [otros, setOtros] = useState<Record<string, any>>({}); // preserva otras claves del jsonb
  const [abierto, setAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    supabase.from("personas").select("datos_adicionales").eq("id", personaId).maybeSingle().then(({ data }) => {
      const da = ((data as any)?.datos_adicionales ?? {}) as Record<string, any>;
      const inv: Record<string, string> = {};
      CLAVES.forEach((k) => { inv[k] = da[k] ?? ""; });
      setD(inv);
      setOtros(da);
    });
  }, [personaId]);

  function set(k: string, v: string) { setD((prev) => ({ ...prev, [k]: v })); }

  async function guardar() {
    setGuardando(true); setMsg(null);
    const merged = { ...otros, ...d };
    const { error } = await supabase.from("personas")
      .update({ datos_adicionales: merged, actualizado_en: new Date().toISOString() }).eq("id", personaId);
    setGuardando(false);
    if (error) { setMsg(error.message); return; }
    setOtros(merged);
    setMsg("Investigación guardada.");
    setTimeout(() => setMsg(null), 2000);
  }

  return (
    <div style={{ marginTop: 8, borderTop: "1px dashed var(--sc-border,#d5dae2)", paddingTop: 8 }}>
      <button type="button" className="secundario" onClick={() => setAbierto((a) => !a)}>
        {abierto ? "Ocultar investigación" : "🔎 Datos de investigación"}
      </button>
      {abierto && (
        <>
          <div className="form-grid" style={{ marginTop: 8 }}>
            <label>Estado civil<CatalogoSelect categoria="estado_civil" value={d.estado_civil ?? ""} onChange={(v) => set("estado_civil", v)} /></label>
            <label>Originario — Municipio<input value={d.originario_municipio ?? ""} disabled={!editable} onChange={(e) => set("originario_municipio", e.target.value)} /></label>
            <label>Originario — Estado<input value={d.originario_estado ?? ""} disabled={!editable} onChange={(e) => set("originario_estado", e.target.value)} /></label>
            <label>Originario — País<input value={d.originario_pais ?? ""} disabled={!editable} onChange={(e) => set("originario_pais", e.target.value)} /></label>
            <label>Teléfono de contacto<input value={d.telefono ?? ""} disabled={!editable} onChange={(e) => set("telefono", e.target.value)} /></label>
            <label>Redes sociales<input value={d.redes_sociales ?? ""} disabled={!editable} onChange={(e) => set("redes_sociales", e.target.value)} placeholder="@usuario, perfiles…" /></label>
          </div>
          {editable && (
            <div style={{ marginTop: 8 }}>
              <button type="button" onClick={guardar} disabled={guardando}>{guardando ? "Guardando…" : "Guardar investigación"}</button>
              {msg && <span style={{ color: "#0a7c2f", marginLeft: 10 }}>{msg}</span>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
