"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import ListaMaestra from "@/app/components/ListaMaestra";

// Empresas de transporte (transportistas) que operan citas y accesos de
// vehículos en el CEDIS. Ver migración 0064.
function NuevoTransportista({ onCreado }: { onCreado: () => void }) {
  const [f, setF] = useState({ razon_social: "", rfc: "", contacto_nombre: "", contacto_tel: "" });
  const [error, setError] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!f.razon_social.trim()) { setError("La razón social es obligatoria."); return; }
    setCreando(true);
    const { error } = await supabase.from("transportistas").insert({
      razon_social: f.razon_social.trim(), rfc: f.rfc.trim() || null,
      contacto_nombre: f.contacto_nombre.trim() || null, contacto_tel: f.contacto_tel.trim() || null,
    });
    setCreando(false);
    if (error) { setError(error.message); return; }
    onCreado();
  }

  return (
    <form onSubmit={crear}>
      <div className="form-fila">
        <input placeholder="Razón social" value={f.razon_social} onChange={(e) => set("razon_social", e.target.value)} required style={{ flex: 2 }} />
        <input placeholder="RFC" value={f.rfc} onChange={(e) => set("rfc", e.target.value)} />
      </div>
      <div className="form-fila">
        <input placeholder="Contacto (nombre)" value={f.contacto_nombre} onChange={(e) => set("contacto_nombre", e.target.value)} style={{ flex: 2 }} />
        <input placeholder="Teléfono" value={f.contacto_tel} onChange={(e) => set("contacto_tel", e.target.value.replace(/\D/g, "").slice(0, 10))} inputMode="numeric" maxLength={10} />
        <button type="submit" disabled={creando}>{creando ? "Creando…" : "Agregar"}</button>
      </div>
      {error && <p style={{ color: "#b00020" }}>{error}</p>}
    </form>
  );
}

export default function TransportistasPage() {
  return (
    <ListaMaestra
      titulo="Transportistas"
      subtitulo="Empresas de transporte que operan citas y accesos de vehículos"
      tabla="transportistas"
      modulo="transportistas"
      orderBy="razon_social"
      select="id, folio, razon_social, rfc, contacto_nombre, contacto_tel, estatus, creado_en"
      placeholderBuscar="Buscar razón social, RFC…"
      columnas={[
        { header: "Folio", celda: (r) => r.folio ?? "—" },
        { header: "Razón social", celda: (r) => r.razon_social },
        { header: "RFC", celda: (r) => r.rfc ?? "—" },
        { header: "Contacto", celda: (r) => (r.contacto_nombre ? `${r.contacto_nombre}${r.contacto_tel ? ` · ${r.contacto_tel}` : ""}` : "—") },
        { header: "Estatus", celda: (r) => <span className={r.estatus === "activo" ? "badge-activo" : "badge-cancelado"}>{r.estatus}</span> },
      ]}
      textoBusqueda={(r) => `${r.razon_social} ${r.rfc ?? ""} ${r.contacto_nombre ?? ""}`}
      detalleHref={() => "/transportistas"}
      quickView={(r) => (
        <>
          <h3 style={{ margin: "0 0 8px" }}>{r.razon_social}</h3>
          <dl className="sc-kv">
            <dt>Folio</dt><dd>{r.folio ?? "—"}</dd>
            <dt>RFC</dt><dd>{r.rfc ?? "—"}</dd>
            <dt>Contacto</dt><dd>{r.contacto_nombre ?? "—"}</dd>
            <dt>Teléfono</dt><dd>{r.contacto_tel ?? "—"}</dd>
          </dl>
        </>
      )}
      editar={[
        { campo: "razon_social", label: "Razón social" },
        { campo: "rfc", label: "RFC" },
        { campo: "contacto_nombre", label: "Contacto" },
        { campo: "contacto_tel", label: "Teléfono" },
      ]}
      nuevo={(onCreado) => <NuevoTransportista onCreado={onCreado} />}
    />
  );
}
