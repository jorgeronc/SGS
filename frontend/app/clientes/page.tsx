"use client";

import { useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import ListaMaestra from "@/app/components/ListaMaestra";

// Cliente = quien contrata el servicio de seguridad. De un cliente cuelgan sus
// sitios (puestos de servicio). Ver migración 0051_clientes_sitios.
function NuevoCliente({ onCreado }: { onCreado: () => void }) {
  const [f, setF] = useState({
    razon_social: "", rfc: "", contacto_nombre: "", contacto_tel: "",
    contacto_correo: "", domicilio: "", contrato_numero: "", contrato_vigencia: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!f.razon_social.trim()) { setError("La razón social es obligatoria."); return; }
    setCreando(true);
    const { error } = await supabase.from("clientes").insert({
      razon_social: f.razon_social.trim(),
      rfc: f.rfc || null,
      contacto_nombre: f.contacto_nombre || null,
      contacto_tel: f.contacto_tel || null,
      contacto_correo: f.contacto_correo || null,
      domicilio: f.domicilio || null,
      contrato_numero: f.contrato_numero || null,
      contrato_vigencia: f.contrato_vigencia || null,
    });
    setCreando(false);
    if (error) { setError(error.message); return; }
    onCreado();
  }

  return (
    <form onSubmit={crear}>
      <div className="form-fila">
        <input placeholder="Razón social / nombre" value={f.razon_social} onChange={(e) => set("razon_social", e.target.value)} required />
        <input placeholder="RFC" value={f.rfc} onChange={(e) => set("rfc", e.target.value)} />
      </div>
      <div className="form-fila">
        <input placeholder="Contacto" value={f.contacto_nombre} onChange={(e) => set("contacto_nombre", e.target.value)} />
        <input placeholder="Teléfono" value={f.contacto_tel} onChange={(e) => set("contacto_tel", e.target.value)} />
        <input placeholder="Correo" value={f.contacto_correo} onChange={(e) => set("contacto_correo", e.target.value)} />
      </div>
      <div className="form-fila">
        <input placeholder="Domicilio" value={f.domicilio} onChange={(e) => set("domicilio", e.target.value)} style={{ flex: 2 }} />
        <input placeholder="No. de contrato" value={f.contrato_numero} onChange={(e) => set("contrato_numero", e.target.value)} />
        <label className="dash-sub" style={{ display: "flex", flexDirection: "column" }}>Vigencia contrato
          <input type="date" value={f.contrato_vigencia} onChange={(e) => set("contrato_vigencia", e.target.value)} />
        </label>
        <button type="submit" disabled={creando}>{creando ? "Creando…" : "Agregar cliente"}</button>
      </div>
      {error && <p style={{ color: "#b00020" }}>{error}</p>}
    </form>
  );
}

export default function ClientesPage() {
  return (
    <ListaMaestra
      titulo="Clientes"
      subtitulo="Empresas / personas que contratan el servicio de seguridad"
      tabla="clientes"
      modulo="clientes"
      select="id, folio, razon_social, rfc, contacto_nombre, contacto_tel, contacto_correo, domicilio, contrato_numero, contrato_vigencia, estatus, creado_en"
      placeholderBuscar="Buscar razón social, RFC, contacto…"
      columnas={[
        { header: "Folio", celda: (r) => r.folio ?? "—" },
        { header: "Razón social", celda: (r) => r.razon_social },
        { header: "RFC", celda: (r) => r.rfc ?? "—" },
        { header: "Contacto", celda: (r) => r.contacto_nombre ?? "—" },
        { header: "Teléfono", celda: (r) => r.contacto_tel ?? "—" },
        { header: "Estatus", celda: (r) => <span className={r.estatus === "activo" ? "badge-activo" : "badge-cancelado"}>{r.estatus}</span> },
      ]}
      textoBusqueda={(r) => `${r.folio ?? ""} ${r.razon_social} ${r.rfc ?? ""} ${r.contacto_nombre ?? ""}`}
      detalleHref={(r) => `/clientes/${r.id}`}
      quickView={(r) => (
        <>
          <h3 style={{ margin: "0 0 8px" }}>{r.razon_social}</h3>
          <dl className="sc-kv">
            <dt>Folio</dt><dd>{r.folio ?? "—"}</dd>
            <dt>RFC</dt><dd>{r.rfc ?? "—"}</dd>
            <dt>Contacto</dt><dd>{r.contacto_nombre ?? "—"}{r.contacto_tel ? ` · ${r.contacto_tel}` : ""}</dd>
            <dt>Correo</dt><dd>{r.contacto_correo ?? "—"}</dd>
            <dt>Domicilio</dt><dd>{r.domicilio ?? "—"}</dd>
            <dt>Contrato</dt><dd>{r.contrato_numero ?? "—"}{r.contrato_vigencia ? ` · vence ${new Date(r.contrato_vigencia).toLocaleDateString()}` : ""}</dd>
          </dl>
          <p style={{ marginTop: 10 }}><Link href={`/clientes/${r.id}`} className="qbtn2">▤ Ver cliente y sus sitios →</Link></p>
        </>
      )}
      editar={[
        { campo: "razon_social", label: "Razón social" },
        { campo: "rfc", label: "RFC" },
        { campo: "contacto_nombre", label: "Contacto" },
        { campo: "contacto_tel", label: "Teléfono" },
        { campo: "contacto_correo", label: "Correo" },
        { campo: "domicilio", label: "Domicilio" },
        { campo: "contrato_numero", label: "No. de contrato" },
        { campo: "contrato_vigencia", label: "Vigencia del contrato", tipo: "date" },
        { campo: "notas", label: "Notas", tipo: "textarea" },
      ]}
      nuevo={(onCreado) => <NuevoCliente onCreado={onCreado} />}
    />
  );
}
