"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import ListaMaestra from "@/app/components/ListaMaestra";
import { ESTADO_CONTRATO } from "@/lib/contratos";

// Gestión de Contratos (Fase 1): el contrato vincula la relación comercial con la
// operación. El sitio pertenece al cliente; el contrato lo referencia vía sus
// servicios. Ver migración 0127_contratos_fase1.sql.
function EstadoBadge({ e }: { e: string }) {
  const c = ESTADO_CONTRATO[e] ?? { lbl: e, bg: "#607d8b", fg: "#fff" };
  return <span style={{ background: c.bg, color: c.fg, fontWeight: 700, fontSize: 12, borderRadius: 8, padding: "2px 9px" }}>{c.lbl}</span>;
}

const nSitios = (r: any) => new Set(((r.contrato_servicios ?? []) as any[]).filter((s) => s.estatus === "activo" && s.sitio_id).map((s) => s.sitio_id)).size;
const nServicios = (r: any) => ((r.contrato_servicios ?? []) as any[]).filter((s) => s.estatus === "activo").length;
const fmtVig = (r: any) => `${r.fecha_inicio ? new Date(r.fecha_inicio + "T00:00:00").toLocaleDateString() : "—"} → ${r.fecha_fin ? new Date(r.fecha_fin + "T00:00:00").toLocaleDateString() : "—"}`;

function NuevoContrato({ onCreado }: { onCreado: () => void }) {
  const [clientes, setClientes] = useState<any[]>([]);
  const [f, setF] = useState({ cliente_id: "", nombre: "", numero: "", fecha_inicio: "", fecha_fin: "", referencia_comercial: "" });
  const [error, setError] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    supabase.from("clientes").select("id, razon_social").eq("estatus", "activo").order("razon_social")
      .then(({ data }) => setClientes((data as any[]) ?? []));
  }, []);

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!f.cliente_id) { setError("Elige el cliente."); return; }
    if (!f.nombre.trim()) { setError("Indica el nombre del contrato."); return; }
    if (f.fecha_inicio && f.fecha_fin && f.fecha_fin < f.fecha_inicio) { setError("La fecha fin no puede ser anterior al inicio."); return; }
    setCreando(true);
    const { error } = await supabase.from("contratos").insert({
      cliente_id: f.cliente_id, nombre: f.nombre.trim(), numero: f.numero || null,
      fecha_inicio: f.fecha_inicio || null, fecha_fin: f.fecha_fin || null,
      referencia_comercial: f.referencia_comercial || null, estado: "borrador",
    });
    setCreando(false);
    if (error) { setError(error.message); return; }
    onCreado();
  }

  return (
    <form onSubmit={crear}>
      <div className="form-fila">
        <select value={f.cliente_id} onChange={(e) => set("cliente_id", e.target.value)} required style={{ flex: 2 }}>
          <option value="">— Cliente —</option>
          {clientes.map((c) => <option key={c.id} value={c.id}>{c.razon_social}</option>)}
        </select>
        <input placeholder="Nombre del contrato" value={f.nombre} onChange={(e) => set("nombre", e.target.value)} required style={{ flex: 2 }} />
        <input placeholder="No. de contrato" value={f.numero} onChange={(e) => set("numero", e.target.value)} />
      </div>
      <div className="form-fila">
        <label className="dash-sub" style={{ display: "flex", flexDirection: "column" }}>Inicio
          <input type="date" value={f.fecha_inicio} onChange={(e) => set("fecha_inicio", e.target.value)} />
        </label>
        <label className="dash-sub" style={{ display: "flex", flexDirection: "column" }}>Fin
          <input type="date" value={f.fecha_fin} onChange={(e) => set("fecha_fin", e.target.value)} />
        </label>
        <input placeholder="Referencia comercial" value={f.referencia_comercial} onChange={(e) => set("referencia_comercial", e.target.value)} style={{ flex: 2 }} />
        <button type="submit" disabled={creando}>{creando ? "Creando…" : "Crear contrato"}</button>
      </div>
      <p className="dash-sub" style={{ fontSize: 12 }}>El contrato se crea en <b>borrador</b>; ábrelo para agregar servicios, sitios y requerimientos.</p>
      {error && <p style={{ color: "#b00020" }}>{error}</p>}
    </form>
  );
}

export default function ContratosPage() {
  return (
    <ListaMaestra
      titulo="Contratos"
      subtitulo="Contrato → Servicios → Operación → SLA. El contrato determina qué operación debe existir para cada cliente."
      tabla="contratos"
      modulo="contratos"
      select="id, folio, nombre, numero, fecha_inicio, fecha_fin, estado, estatus, creado_en, cliente:clientes(razon_social), contrato_servicios(sitio_id, estado, estatus)"
      placeholderBuscar="Buscar folio, nombre, cliente…"
      columnas={[
        { header: "Folio", celda: (r) => r.folio ?? "—" },
        { header: "Cliente", celda: (r) => r.cliente?.razon_social ?? "—" },
        { header: "Contrato", celda: (r) => r.nombre },
        { header: "Vigencia", celda: (r) => fmtVig(r) },
        { header: "Sitios", celda: (r) => nSitios(r) },
        { header: "Servicios", celda: (r) => nServicios(r) },
        { header: "Estado", celda: (r) => <EstadoBadge e={r.estado} /> },
      ]}
      textoBusqueda={(r) => `${r.folio ?? ""} ${r.nombre} ${r.numero ?? ""} ${r.cliente?.razon_social ?? ""}`}
      detalleHref={(r) => `/contratos/${r.id}`}
      quickView={(r) => (
        <>
          <h3 style={{ margin: "0 0 8px" }}>{r.folio ? `[${r.folio}] ` : ""}{r.nombre}</h3>
          <dl className="sc-kv">
            <dt>Cliente</dt><dd>{r.cliente?.razon_social ?? "—"}</dd>
            <dt>No. de contrato</dt><dd>{r.numero ?? "—"}</dd>
            <dt>Vigencia</dt><dd>{fmtVig(r)}</dd>
            <dt>Estado</dt><dd><EstadoBadge e={r.estado} /></dd>
            <dt>Sitios / Servicios</dt><dd>{nSitios(r)} · {nServicios(r)}</dd>
          </dl>
          <p style={{ marginTop: 10 }}><Link href={`/contratos/${r.id}`} className="qbtn2">📑 Abrir contrato →</Link></p>
        </>
      )}
      nuevo={(onCreado) => <NuevoContrato onCreado={onCreado} />}
    />
  );
}
