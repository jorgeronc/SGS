"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

const BUCKET = "fotos";

// Entidades que admiten fotografías (tienen columna `fotografias jsonb`).
export type TablaConFotos =
  | "personas"
  | "vehiculos"
  | "evidencias"
  | "equipo"
  | "incidentes"
  | "barandilla"
  | "casos"
  | "presuntos"
  | "patrullas"
  | "armamento"
  | "comunicacion"
  | "bodycams"
  | "otros"
  | "abordamientos"
  | "tareas";

function nombreArchivoSeguro(nombre: string): string {
  return nombre.replace(/[^a-zA-Z0-9._-]/g, "_");
}

// Panel reutilizable de fotografías. Sube imágenes al bucket de Storage,
// permite capturarlas desde la cámara del dispositivo (atributo capture) y
// guarda las rutas en la columna `fotografias` del registro.
export default function FotosPanel({ tabla, id }: { tabla: TablaConFotos; id: string }) {
  const [rutas, setRutas] = useState<string[]>([]);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function cargarFotos() {
    const { data, error } = await supabase
      .from(tabla)
      .select("fotografias")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      setError(error.message);
      return;
    }
    setRutas(((data?.fotografias as string[]) ?? []).filter(Boolean));
  }

  useEffect(() => {
    cargarFotos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabla, id]);

  function urlPublica(ruta: string): string {
    // Si ya es una URL absoluta (p. ej. snapshots antiguos), úsala tal cual: pasarla
    // por getPublicUrl la prefijaría y daría 404 (NoSuchKey).
    if (/^https?:\/\//i.test(ruta)) return ruta;
    return supabase.storage.from(BUCKET).getPublicUrl(ruta).data.publicUrl;
  }

  async function subir(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setSubiendo(true);

    const ruta = `${tabla}/${id}/${Date.now()}_${nombreArchivoSeguro(file.name)}`;

    const { error: errUp } = await supabase.storage
      .from(BUCKET)
      .upload(ruta, file, { upsert: false, contentType: file.type || undefined });

    if (errUp) {
      setError(errUp.message);
      setSubiendo(false);
      return;
    }

    const nuevas = [...rutas, ruta];
    const { error: errUpd } = await supabase
      .from(tabla)
      .update({ fotografias: nuevas, actualizado_en: new Date().toISOString() })
      .eq("id", id);

    setSubiendo(false);
    if (inputRef.current) inputRef.current.value = "";

    if (errUpd) {
      setError(errUpd.message);
      return;
    }
    setRutas(nuevas);
  }

  async function quitar(ruta: string) {
    if (!window.confirm("¿Quitar esta foto del registro?")) return;
    setError(null);

    const nuevas = rutas.filter((r) => r !== ruta);
    const { error: errUpd } = await supabase
      .from(tabla)
      .update({ fotografias: nuevas, actualizado_en: new Date().toISOString() })
      .eq("id", id);

    if (errUpd) {
      setError(errUpd.message);
      return;
    }
    // Se quita la referencia del registro; el objeto queda en Storage.
    await supabase.storage.from(BUCKET).remove([ruta]);
    setRutas(nuevas);
  }

  return (
    <>
      <h3>Fotografías</h3>

      <div className="form-fila" style={{ alignItems: "center" }}>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={subir}
          disabled={subiendo}
        />
        {subiendo && <span style={{ fontSize: 13, color: "#555" }}>subiendo...</span>}
      </div>
      <p style={{ fontSize: 12, color: "#888" }}>
        En dispositivos móviles el botón permite tomar la foto directamente con la cámara.
      </p>

      {rutas.length === 0 ? (
        <p style={{ color: "#555" }}>Sin fotografías todavía.</p>
      ) : (
        <div className="galeria">
          {rutas.map((ruta) => (
            <figure key={ruta} className="galeria-item">
              <a href={urlPublica(ruta)} target="_blank" rel="noreferrer">
                <img src={urlPublica(ruta)} alt="Fotografía del registro" />
              </a>
              <button className="secundario" onClick={() => quitar(ruta)}>
                Quitar
              </button>
            </figure>
          ))}
        </div>
      )}

      {error && <p style={{ color: "#b00020" }}>{error}</p>}
    </>
  );
}
