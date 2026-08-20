"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

const BUCKET = "fotos";

function nombreArchivoSeguro(nombre: string): string {
  return nombre.replace(/[^a-zA-Z0-9._-]/g, "_");
}

// Fotografías mostradas JUNTO a los datos de una entidad (persona, vehículo,
// lugar) — nunca en una sección aparte. Muestra las fotos del registro y, si es
// editable, permite agregar (cámara en móvil) o quitar. Guarda las rutas en la
// columna `fotografias` del propio registro maestro.
export default function FotoEntidad({
  tabla,
  id,
  editable = true,
  label = "Fotografía",
}: {
  tabla: string;
  id: string | null | undefined;
  editable?: boolean;
  label?: string;
}) {
  const [rutas, setRutas] = useState<string[]>([]);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function cargar() {
    if (!id) return;
    const { data, error } = await supabase.from(tabla).select("fotografias").eq("id", id).maybeSingle();
    if (error) { setError(error.message); return; }
    setRutas(((data?.fotografias as string[]) ?? []).filter(Boolean));
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabla, id]);

  function url(ruta: string): string {
    return supabase.storage.from(BUCKET).getPublicUrl(ruta).data.publicUrl;
  }

  async function subir(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !id) return;
    setError(null);
    setSubiendo(true);
    const ruta = `${tabla}/${id}/${Date.now()}_${nombreArchivoSeguro(file.name)}`;
    const { error: eUp } = await supabase.storage.from(BUCKET).upload(ruta, file, { contentType: file.type || undefined });
    if (eUp) { setError(eUp.message); setSubiendo(false); return; }
    const nuevas = [...rutas, ruta];
    const { error: eUpd } = await supabase.from(tabla).update({ fotografias: nuevas, actualizado_en: new Date().toISOString() }).eq("id", id);
    setSubiendo(false);
    if (inputRef.current) inputRef.current.value = "";
    if (eUpd) { setError(eUpd.message); return; }
    setRutas(nuevas);
  }

  async function quitar(ruta: string) {
    if (!id || !window.confirm("¿Quitar esta foto?")) return;
    const nuevas = rutas.filter((r) => r !== ruta);
    const { error: eUpd } = await supabase.from(tabla).update({ fotografias: nuevas, actualizado_en: new Date().toISOString() }).eq("id", id);
    if (eUpd) { setError(eUpd.message); return; }
    await supabase.storage.from(BUCKET).remove([ruta]);
    setRutas(nuevas);
  }

  if (!id) return null;

  return (
    <div className="foto-entidad">
      <div className="foto-entidad-head">{label}</div>
      <div className="foto-entidad-thumbs">
        {rutas.length === 0 && <div className="foto-entidad-vacia">Sin foto</div>}
        {rutas.map((ruta) => (
          <figure key={ruta} className="foto-entidad-item">
            <a href={url(ruta)} target="_blank" rel="noreferrer">
              <img src={url(ruta)} alt={label} />
            </a>
            {editable && (
              <button type="button" className="secundario" onClick={() => quitar(ruta)}>
                Quitar
              </button>
            )}
          </figure>
        ))}
      </div>
      {editable && (
        <div className="form-fila" style={{ alignItems: "center", marginTop: 6 }}>
          <input ref={inputRef} type="file" accept="image/*" capture="environment" onChange={subir} disabled={subiendo} />
          {subiendo && <span style={{ fontSize: 13, color: "#555" }}>subiendo…</span>}
        </div>
      )}
      {error && <p style={{ color: "#b00020" }}>{error}</p>}
    </div>
  );
}
