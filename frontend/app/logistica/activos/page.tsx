"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import ListaMaestra from "@/app/components/ListaMaestra";
import { CatalogoSelect } from "@/app/components/CatalogoSelect";

function NuevoActivo({ onCreado }: { onCreado: () => void }) {
  const [empresas, setEmpresas] = useState<any[]>([]);
  const [tipo, setTipo] = useState("");
  const [ident, setIdent] = useState("");
  const [placas, setPlacas] = useState("");
  const [eco, setEco] = useState("");
  const [empresa, setEmpresa] = useState("");
  const [gps, setGps] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => { supabase.from("transportistas").select("id, razon_social").eq("estatus", "activo").order("razon_social").then(({ data }) => setEmpresas((data as any[]) ?? [])); }, []);

  async function crear() {
    if (!ident.trim() && !placas.trim()) { setMsg("Captura identificador o placas."); return; }
    const { error } = await supabase.from("transporte_activos").insert({
      tipo_activo: tipo || null, identificador: ident.trim() || null, placas: placas.trim().toUpperCase() || null,
      economico: eco.trim() || null, empresa_id: empresa || null, gps_device_id: gps.trim() || null,
    });
    if (error) { setMsg(error.message); return; }
    setMsg(null); setIdent(""); setPlacas(""); setEco(""); setGps(""); onCreado();
  }

  return (
    <div className="form-grid">
      <label>Tipo de activo<CatalogoSelect categoria="tipo_activo_transporte" value={tipo} onChange={setTipo} /></label>
      <label>Identificador<input value={ident} maxLength={40} onChange={(e) => setIdent(e.target.value)} /></label>
      <label>Placas<input value={placas} maxLength={20} onChange={(e) => setPlacas(e.target.value)} autoCapitalize="characters" /></label>
      <label>Económico<input value={eco} maxLength={20} onChange={(e) => setEco(e.target.value)} /></label>
      <label>Empresa (transportista)<select value={empresa} onChange={(e) => setEmpresa(e.target.value)}><option value="">—</option>{empresas.map((x) => <option key={x.id} value={x.id}>{x.razon_social}</option>)}</select></label>
      <label>GPS device id<input value={gps} maxLength={60} onChange={(e) => setGps(e.target.value)} /></label>
      <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 12 }}>
        <button className="sc-btn" onClick={crear}>Crear activo</button>
        {msg && <span style={{ color: "#e23b53", fontSize: 13 }}>{msg}</span>}
      </div>
    </div>
  );
}

export default function ActivosPage() {
  return (
    <ListaMaestra
      titulo="Activos de transporte"
      subtitulo="Tractos, camiones, locomotoras y unidades de seguridad"
      tabla="transporte_activos"
      modulo="transporte_activos"
      select="id, folio, tipo_activo, identificador, placas, economico, estado_activo, gps_device_id, empresa:transportistas(razon_social), estatus, creado_en"
      placeholderBuscar="Identificador, placas…"
      textoBusqueda={(r) => `${r.folio ?? ""} ${r.identificador ?? ""} ${r.placas ?? ""} ${r.economico ?? ""}`}
      detalleHref={(r) => `/logistica/activos/${r.id}`}
      columnas={[
        { header: "Folio", celda: (r) => r.folio ?? "—", campo: "folio" },
        { header: "Tipo", celda: (r) => r.tipo_activo ?? "—" },
        { header: "Identificador", celda: (r) => r.identificador ?? "—" },
        { header: "Placas", celda: (r) => r.placas ?? "—" },
        { header: "Empresa", celda: (r) => r.empresa?.razon_social ?? "—" },
        { header: "Estado", celda: (r) => r.estado_activo ?? "—", campo: "estado_activo" },
      ]}
      quickView={(r) => (
        <div style={{ fontSize: 13, lineHeight: 1.7 }}>
          <div><b>{r.folio ?? "Activo"}</b> · {r.tipo_activo ?? "—"}</div>
          <div>Identificador: {r.identificador ?? "—"} · Placas: {r.placas ?? "—"}</div>
          <div>Económico: {r.economico ?? "—"}</div>
          <div>Empresa: {r.empresa?.razon_social ?? "—"}</div>
          <div>GPS: {r.gps_device_id ?? "—"}</div>
        </div>
      )}
      editar={[
        { campo: "estado_activo", label: "Estado", tipo: "select", opciones: ["operativo", "inactivo", "mantenimiento"] },
        { campo: "identificador", label: "Identificador" },
        { campo: "placas", label: "Placas" },
        { campo: "gps_device_id", label: "GPS device id" },
      ]}
      nuevo={(onCreado) => <NuevoActivo onCreado={onCreado} />}
    />
  );
}
