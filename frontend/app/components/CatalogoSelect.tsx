"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

// Selector poblado desde cat_opciones por categoría (enums cortos y
// administrables: sexo, complexión, color de piel, etc.).
export function CatalogoSelect({
  categoria,
  value,
  onChange,
  placeholder,
  disabled,
}: {
  categoria: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [opciones, setOpciones] = useState<string[]>([]);

  useEffect(() => {
    supabase
      .from("cat_opciones")
      .select("valor")
      .eq("categoria", categoria)
      .eq("activo", true)
      .order("orden")
      .then(({ data }) => setOpciones(((data as any[]) ?? []).map((o) => o.valor)));
  }, [categoria]);

  // Incluye el valor actual aunque no esté (aún) en el catálogo, para no
  // "perderlo" al mostrar un registro con un valor histórico o externo.
  const lista = value && !opciones.includes(value) ? [value, ...opciones] : opciones;

  return (
    <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder ?? "— Selecciona —"}</option>
      {lista.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

// Selector de municipio (Originario) desde cat_municipios (~2,456 filas).
// Filtra en el servidor por prefijo conforme se escribe y ofrece las
// coincidencias con autocompletado nativo (datalist). Guarda "MUNICIPIO, ESTADO".
export function MunicipioSelect({
  value,
  onChange,
  placeholder = "Originario (municipio)",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [opciones, setOpciones] = useState<string[]>([]);

  useEffect(() => {
    const t = setTimeout(async () => {
      const term = value.trim();
      if (term.length < 2) {
        setOpciones([]);
        return;
      }
      const { data } = await supabase
        .from("cat_municipios")
        .select("municipio, estado")
        .ilike("municipio", `${term}%`)
        .order("municipio")
        .limit(30);
      setOpciones(
        Array.from(new Set(((data as any[]) ?? []).map((m) => `${m.municipio}, ${m.estado}`)))
      );
    }, 180);
    return () => clearTimeout(t);
  }, [value]);

  return (
    <>
      <input
        list="cat-municipios"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <datalist id="cat-municipios">
        {opciones.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
    </>
  );
}

// Selector del delito/incidente desde el catálogo 9-1-1 (280 opciones) con
// autocompletado nativo (datalist).
export function DelitoSelect({
  value,
  onChange,
  placeholder = "Delito (catálogo 911)",
  size,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  size?: number;   // ancho en caracteres
  disabled?: boolean;
}) {
  const [opciones, setOpciones] = useState<string[]>([]);

  useEffect(() => {
    supabase
      .from("cat_incidentes_911")
      .select("incidente")
      .order("incidente")
      .then(({ data }) => setOpciones(((data as any[]) ?? []).map((o) => o.incidente)));
  }, []);

  return (
    <>
      <input
        list="cat-delitos-911"
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        style={size ? { width: `${size}ch`, maxWidth: "100%" } : undefined}
      />
      <datalist id="cat-delitos-911">
        {opciones.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
    </>
  );
}
