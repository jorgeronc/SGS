"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import ListaMaestra from "@/app/components/ListaMaestra";

// Directorio de autoridades / servicios de emergencia (Protección Civil, Bomberos,
// Ambulancias, Policía…). Contactables desde el detalle de incidente. Ver mig. 0068.
const TIPOS = ["Protección Civil", "Bomberos", "Ambulancia / Cruz Roja", "Policía", "Tránsito", "Guardia Nacional", "Hospital", "CFE / Servicios", "Otro"];

function NuevaAutoridad({ onCreado }: { onCreado: () => void }) {
  const [f, setF] = useState({ tipo: "Protección Civil", nombre: "", telefono: "", telefono_alt: "", contacto: "", correo: "", zona: "", direccion: "", notas: "" });
  const [error, setError] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  async function crear(e: React.FormEvent) {
    e.preventDefault(); setError(null);
    if (!f.nombre.trim()) { setError("El nombre es obligatorio."); return; }
    setCreando(true);
    const { error } = await supabase.from("directorio_autoridades").insert({
      tipo: f.tipo, nombre: f.nombre.trim(), telefono: f.telefono.trim() || null, telefono_alt: f.telefono_alt.trim() || null,
      contacto: f.contacto.trim() || null, correo: f.correo.trim() || null, zona: f.zona.trim() || null,
      direccion: f.direccion.trim() || null, notas: f.notas.trim() || null,
    });
    setCreando(false);
    if (error) { setError(error.message); return; }
    setF({ tipo: "Protección Civil", nombre: "", telefono: "", telefono_alt: "", contacto: "", correo: "", zona: "", direccion: "", notas: "" });
    onCreado();
  }

  return (
    <form onSubmit={crear}>
      <div className="form-fila">
        <label className="dash-sub" style={{ display: "flex", flexDirection: "column" }}>Tipo
          <select value={f.tipo} onChange={(e) => set("tipo", e.target.value)}>{TIPOS.map((t) => <option key={t}>{t}</option>)}</select>
        </label>
        <input placeholder="Nombre (ej. Bomberos — Estación 4)" value={f.nombre} onChange={(e) => set("nombre", e.target.value)} style={{ flex: 2 }} />
        <input placeholder="Zona / cobertura" value={f.zona} onChange={(e) => set("zona", e.target.value)} style={{ flex: 1 }} />
      </div>
      <div className="form-fila">
        <input placeholder="Teléfono" value={f.telefono} onChange={(e) => set("telefono", e.target.value)} />
        <input placeholder="Teléfono alterno" value={f.telefono_alt} onChange={(e) => set("telefono_alt", e.target.value)} />
        <input placeholder="Persona de contacto" value={f.contacto} onChange={(e) => set("contacto", e.target.value)} />
        <input placeholder="Correo" value={f.correo} onChange={(e) => set("correo", e.target.value)} />
      </div>
      <div className="form-fila">
        <input placeholder="Dirección" value={f.direccion} onChange={(e) => set("direccion", e.target.value)} style={{ flex: 2 }} />
        <input placeholder="Notas" value={f.notas} onChange={(e) => set("notas", e.target.value)} style={{ flex: 2 }} />
        <button type="submit" disabled={creando}>{creando ? "Creando…" : "Agregar"}</button>
      </div>
      {error && <p style={{ color: "#b00020" }}>{error}</p>}
    </form>
  );
}

export default function DirectorioPage() {
  return (
    <ListaMaestra
      titulo="Directorio de autoridades"
      subtitulo="Servicios de emergencia contactables (Protección Civil, Bomberos, ambulancias, policía…) para despachar desde un incidente."
      tabla="directorio_autoridades"
      modulo="directorio_autoridades"
      detalleHref={() => "/directorio"}
      orderBy="tipo"
      select="id, folio, tipo, nombre, telefono, telefono_alt, contacto, correo, zona, direccion, notas, estatus, creado_en"
      placeholderBuscar="Buscar autoridad, tipo, zona, teléfono…"
      columnas={[
        { header: "Folio", celda: (r) => r.folio ?? "—" },
        { header: "Tipo", celda: (r) => r.tipo ?? "—" },
        { header: "Nombre", celda: (r) => r.nombre },
        { header: "Teléfono", celda: (r) => r.telefono ?? "—" },
        { header: "Zona", celda: (r) => r.zona ?? "—" },
        { header: "Estatus", celda: (r) => <span className={r.estatus === "activo" ? "badge-activo" : "badge-cancelado"}>{r.estatus}</span> },
      ]}
      textoBusqueda={(r) => `${r.nombre} ${r.tipo ?? ""} ${r.zona ?? ""} ${r.telefono ?? ""} ${r.folio ?? ""}`}
      filtros={[{ k: "todos", label: "Todas" }, ...TIPOS.map((t) => ({ k: t, label: t, test: (r: any) => r.tipo === t }))]}
      quickView={(r) => (
        <>
          <h3 style={{ margin: "0 0 8px" }}>{r.nombre}</h3>
          <dl className="sc-kv">
            <dt>Tipo</dt><dd>{r.tipo ?? "—"}</dd>
            <dt>Zona</dt><dd>{r.zona ?? "—"}</dd>
            <dt>Contacto</dt><dd>{r.contacto ?? "—"}</dd>
            <dt>Dirección</dt><dd>{r.direccion ?? "—"}</dd>
            <dt>Notas</dt><dd>{r.notas ?? "—"}</dd>
          </dl>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
            {r.telefono && <a href={`tel:${r.telefono}`} className="qbtn2 primary">📞 Llamar {r.telefono}</a>}
            {r.telefono_alt && <a href={`tel:${r.telefono_alt}`} className="qbtn2">📞 {r.telefono_alt}</a>}
            {r.correo && <a href={`mailto:${r.correo}`} className="qbtn2">✉ {r.correo}</a>}
          </div>
        </>
      )}
      editar={[
        { campo: "tipo", label: "Tipo", tipo: "select", opciones: TIPOS },
        { campo: "nombre", label: "Nombre" },
        { campo: "telefono", label: "Teléfono" },
        { campo: "telefono_alt", label: "Teléfono alterno" },
        { campo: "contacto", label: "Persona de contacto" },
        { campo: "correo", label: "Correo" },
        { campo: "zona", label: "Zona / cobertura" },
        { campo: "direccion", label: "Dirección" },
        { campo: "notas", label: "Notas" },
      ]}
      nuevo={(onCreado) => <NuevaAutoridad onCreado={onCreado} />}
    />
  );
}
