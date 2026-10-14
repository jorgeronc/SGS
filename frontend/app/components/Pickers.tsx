"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

interface Opcion {
  id: string;
  etiqueta: string;
}

// Selector de persona (índice maestro) con filtro.
export function SelectPersona({
  value,
  onChange,
  required,
}: {
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  const [opts, setOpts] = useState<Opcion[]>([]);
  const [filtro, setFiltro] = useState("");

  useEffect(() => {
    supabase
      .from("personas")
      .select("id, nombre, apellido_paterno")
      .eq("estatus", "activo")
      .order("creado_en", { ascending: false })
      .limit(200)
      .then(({ data }) =>
        setOpts(
          ((data as any[]) ?? []).map((p) => ({
            id: p.id,
            etiqueta: `${p.nombre ?? ""} ${p.apellido_paterno ?? ""}`.trim(),
          }))
        )
      );
  }, []);

  const filtrados = opts.filter((o) => o.etiqueta.toLowerCase().includes(filtro.toLowerCase()));

  return (
    <>
      <input placeholder="Buscar persona..." value={filtro} onChange={(e) => setFiltro(e.target.value)} />
      <select value={value} onChange={(e) => onChange(e.target.value)} required={required}>
        <option value="">{filtrados.length ? "— Persona —" : "Sin personas activas"}</option>
        {filtrados.map((o) => (
          <option key={o.id} value={o.id}>
            {o.etiqueta || "(sin nombre)"}
          </option>
        ))}
      </select>
    </>
  );
}

// Selector de patrulla (unidad) con etiqueta legible.
export function SelectPatrulla({
  value,
  onChange,
  placeholder = "— CRP (patrulla) —",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [opts, setOpts] = useState<Opcion[]>([]);
  const [filtro, setFiltro] = useState("");

  useEffect(() => {
    supabase
      .from("patrullas")
      .select("id, numero, tipo, placas, marca, modelo")
      .eq("estatus", "activo")
      .order("numero")
      .limit(300)
      .then(({ data }) =>
        setOpts(
          ((data as any[]) ?? []).map((p) => ({
            id: p.id,
            etiqueta: `${p.numero ? `#${p.numero} · ` : ""}${p.tipo ?? ""} ${p.marca ?? ""} ${p.modelo ?? ""}${p.placas ? ` · ${p.placas}` : ""}`.trim(),
          }))
        )
      );
  }, []);

  const filtrados = opts.filter((o) => o.etiqueta.toLowerCase().includes(filtro.toLowerCase()));

  return (
    <>
      <input placeholder="Buscar CRP…" value={filtro} onChange={(e) => setFiltro(e.target.value)} />
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{placeholder}</option>
        {filtrados.map((o) => (
          <option key={o.id} value={o.id}>{o.etiqueta}</option>
        ))}
      </select>
    </>
  );
}

// Selector de personal (oficial) con etiqueta legible.
export function SelectPersonal({
  value,
  onChange,
  placeholder = "— Oficial —",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [opts, setOpts] = useState<Opcion[]>([]);
  const [filtro, setFiltro] = useState("");

  useEffect(() => {
    supabase
      .from("personal")
      .select("id, numero_placa, rango, persona:personas(nombre, apellido_paterno)")
      .eq("estatus", "activo")
      .limit(200)
      .then(({ data }) =>
        setOpts(
          ((data as any[]) ?? []).map((p) => {
            const nom = p.persona ? `${p.persona.nombre ?? ""} ${p.persona.apellido_paterno ?? ""}`.trim() : "";
            const emp = `${p.rango ?? ""}${p.numero_placa ? ` #${p.numero_placa}` : ""}`.trim();
            return { id: p.id, etiqueta: [nom, emp].filter(Boolean).join(" — ") || p.id };
          })
        )
      );
  }, []);

  const filtrados = opts.filter((o) => o.etiqueta.toLowerCase().includes(filtro.toLowerCase()));

  return (
    <>
      <input placeholder="Buscar oficial..." value={filtro} onChange={(e) => setFiltro(e.target.value)} />
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{placeholder}</option>
        {filtrados.map((o) => (
          <option key={o.id} value={o.id}>
            {o.etiqueta}
          </option>
        ))}
      </select>
    </>
  );
}

// Control de EDICIÓN de la asignación a personal, para usar como campo `custom`
// de ListaMaestra (`render`). Escribe `asignado_personal_id` en el borrador y, para
// las tablas de inventario, mantiene `estado_equipo` en sincronía con la asignación
// (asignado ↔ operativo) sin pisar estados manuales como en_reparacion/baja.
// Declarar en el campo: persistCampos: ["asignado_personal_id", "estado_equipo"].
export function AsignarPersonalEdit({
  borrador,
  setBorrador,
  sincronizarEstado = true,
}: {
  borrador: any;
  setBorrador: (u: any) => void;
  sincronizarEstado?: boolean;
}) {
  return (
    <label className="sc-edit-l" style={{ gridColumn: "1 / -1" }}>
      <span>Asignado a</span>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <SelectPersonal
          value={borrador?.asignado_personal_id ?? ""}
          placeholder="— Sin asignar —"
          onChange={(v) =>
            setBorrador((p: any) => {
              const next = { ...p, asignado_personal_id: v || null };
              if (sincronizarEstado) {
                const e = p?.estado_equipo;
                if (v && (e === "operativo" || e == null)) next.estado_equipo = "asignado";
                else if (!v && e === "asignado") next.estado_equipo = "operativo";
              }
              return next;
            })
          }
        />
      </div>
    </label>
  );
}
