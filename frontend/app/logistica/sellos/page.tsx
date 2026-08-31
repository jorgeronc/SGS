"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import ListaMaestra from "@/app/components/ListaMaestra";
import { CatalogoSelect } from "@/app/components/CatalogoSelect";

const ESTADOS = ["DISPONIBLE", "ASIGNADO", "VALIDADO", "ALTERADO", "REEMPLAZADO", "RETIRADO", "PERDIDO"];

function NuevoSello({ onCreado }: { onCreado: () => void }) {
  const [codigo, setCodigo] = useState("");
  const [tipo, setTipo] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  async function crear() {
    if (!codigo.trim()) { setMsg("Captura el código del sello."); return; }
    const { error } = await supabase.from("sellos").insert({ codigo_sello: codigo.trim().toUpperCase(), tipo_sello: tipo || null, estado: "DISPONIBLE" });
    if (error) { setMsg(error.message); return; }
    setMsg(null); setCodigo(""); onCreado();
  }

  return (
    <div className="form-grid">
      <label>Código del sello<input value={codigo} maxLength={40} onChange={(e) => setCodigo(e.target.value)} autoCapitalize="characters" /></label>
      <label>Tipo de sello<CatalogoSelect categoria="tipo_sello" value={tipo} onChange={setTipo} /></label>
      <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 12 }}>
        <button className="sc-btn" onClick={crear}>Crear sello</button>
        {msg && <span style={{ color: "#e23b53", fontSize: 13 }}>{msg}</span>}
      </div>
    </div>
  );
}

export default function SellosPage() {
  return (
    <ListaMaestra
      titulo="Sellos de seguridad"
      subtitulo="Alta y estado de sellos; las validaciones se hacen en campo"
      tabla="sellos"
      modulo="sellos"
      select="id, folio, codigo_sello, tipo_sello, estado, unidad:unidades_carga(identificador), estatus, creado_en"
      placeholderBuscar="Código de sello…"
      textoBusqueda={(r) => `${r.folio ?? ""} ${r.codigo_sello ?? ""} ${r.tipo_sello ?? ""}`}
      detalleHref={(r) => `/logistica/sellos/${r.id}`}
      columnas={[
        { header: "Folio", celda: (r) => r.folio ?? "—", campo: "folio" },
        { header: "Código", celda: (r) => r.codigo_sello ?? "—" },
        { header: "Tipo", celda: (r) => r.tipo_sello ?? "—" },
        { header: "Estado", celda: (r) => r.estado, campo: "estado" },
        { header: "Unidad", celda: (r) => r.unidad?.identificador ?? "—" },
      ]}
      quickView={(r) => (
        <div style={{ fontSize: 13, lineHeight: 1.7 }}>
          <div><b>{r.codigo_sello ?? "Sello"}</b> · {r.tipo_sello ?? "—"}</div>
          <div>Estado: <b>{r.estado}</b></div>
          <div>Unidad asignada: {r.unidad?.identificador ?? "—"}</div>
          <div>Folio: {r.folio ?? "—"}</div>
        </div>
      )}
      editar={[{ campo: "estado", label: "Estado", tipo: "select", opciones: ESTADOS }]}
      nuevo={(onCreado) => <NuevoSello onCreado={onCreado} />}
    />
  );
}
