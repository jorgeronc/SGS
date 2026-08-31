"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import ListaMaestra from "@/app/components/ListaMaestra";
import { CatalogoSelect } from "@/app/components/CatalogoSelect";

function NuevaUnidad({ onCreado }: { onCreado: () => void }) {
  const [empresas, setEmpresas] = useState<any[]>([]);
  const [tipo, setTipo] = useState("");
  const [ident, setIdent] = useState("");
  const [empresa, setEmpresa] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => { supabase.from("transportistas").select("id, razon_social").eq("estatus", "activo").order("razon_social").then(({ data }) => setEmpresas((data as any[]) ?? [])); }, []);

  async function crear() {
    if (!ident.trim()) { setMsg("Captura el identificador."); return; }
    const { error } = await supabase.from("unidades_carga").insert({ tipo_unidad: tipo || null, identificador: ident.trim(), empresa_id: empresa || null });
    if (error) { setMsg(error.message); return; }
    setMsg(null); setIdent(""); onCreado();
  }

  return (
    <div className="form-grid">
      <label>Tipo de unidad<CatalogoSelect categoria="tipo_unidad_carga" value={tipo} onChange={setTipo} /></label>
      <label>Identificador<input value={ident} maxLength={40} onChange={(e) => setIdent(e.target.value)} placeholder="Económico / número de caja / contenedor" /></label>
      <label>Empresa (transportista)<select value={empresa} onChange={(e) => setEmpresa(e.target.value)}><option value="">—</option>{empresas.map((x) => <option key={x.id} value={x.id}>{x.razon_social}</option>)}</select></label>
      <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 12 }}>
        <button className="sc-btn" onClick={crear}>Crear unidad</button>
        {msg && <span style={{ color: "#e23b53", fontSize: 13 }}>{msg}</span>}
      </div>
    </div>
  );
}

export default function UnidadesCargaPage() {
  return (
    <ListaMaestra
      titulo="Unidades de carga"
      subtitulo="Remolques, cajas, contenedores, vagones, tolvas…"
      tabla="unidades_carga"
      modulo="unidades_carga"
      select="id, folio, tipo_unidad, identificador, estado_unidad, empresa:transportistas(razon_social), estatus, creado_en"
      placeholderBuscar="Identificador…"
      textoBusqueda={(r) => `${r.folio ?? ""} ${r.identificador ?? ""} ${r.tipo_unidad ?? ""}`}
      detalleHref={(r) => `/logistica/unidades-carga/${r.id}`}
      columnas={[
        { header: "Folio", celda: (r) => r.folio ?? "—", campo: "folio" },
        { header: "Tipo", celda: (r) => r.tipo_unidad ?? "—" },
        { header: "Identificador", celda: (r) => r.identificador ?? "—" },
        { header: "Empresa", celda: (r) => r.empresa?.razon_social ?? "—" },
        { header: "Estado", celda: (r) => r.estado_unidad ?? "—", campo: "estado_unidad" },
      ]}
      quickView={(r) => (
        <div style={{ fontSize: 13, lineHeight: 1.7 }}>
          <div><b>{r.folio ?? "Unidad"}</b> · {r.tipo_unidad ?? "—"}</div>
          <div>Identificador: {r.identificador ?? "—"}</div>
          <div>Empresa: {r.empresa?.razon_social ?? "—"}</div>
          <div>Estado: {r.estado_unidad ?? "—"}</div>
        </div>
      )}
      editar={[{ campo: "identificador", label: "Identificador" }, { campo: "estado_unidad", label: "Estado" }]}
      nuevo={(onCreado) => <NuevaUnidad onCreado={onCreado} />}
    />
  );
}
