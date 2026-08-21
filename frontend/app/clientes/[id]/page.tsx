"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

// Ficha del cliente: datos + lista de sus sitios (puestos de servicio).
export default function ClienteDetalle() {
  const { id } = useParams<{ id: string }>();
  const [cliente, setCliente] = useState<any>(null);
  const [sitios, setSitios] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    supabase.from("clientes").select("*").eq("id", id).maybeSingle()
      .then(({ data, error }) => { if (error) setError(error.message); setCliente(data); });
    supabase.from("sitios")
      .select("id, folio, nombre, tipo, direccion, num_guardias, horario, estatus")
      .eq("cliente_id", id).order("creado_en", { ascending: false })
      .then(({ data }) => setSitios((data as any[]) ?? []));
  }, [id]);

  if (error) return <div style={{ padding: 16, color: "#b00020" }}>{error}</div>;
  if (!cliente) return <div style={{ padding: 16 }}>Cargando…</div>;

  return (
    <div style={{ padding: 16 }}>
      <p style={{ marginTop: 0 }}><Link href="/clientes" className="qbtn2">← Clientes</Link></p>
      <h2 style={{ marginBottom: 4 }}>
        {cliente.razon_social} <span style={{ fontWeight: 400, color: "#777", fontSize: 15 }}>{cliente.folio}</span>
      </h2>

      <dl className="sc-kv" style={{ maxWidth: 560 }}>
        <dt>RFC</dt><dd>{cliente.rfc ?? "—"}</dd>
        <dt>Contacto</dt><dd>{cliente.contacto_nombre ?? "—"}{cliente.contacto_tel ? ` · ${cliente.contacto_tel}` : ""}</dd>
        <dt>Correo</dt><dd>{cliente.contacto_correo ?? "—"}</dd>
        <dt>Domicilio</dt><dd>{cliente.domicilio ?? "—"}</dd>
        <dt>Contrato</dt><dd>{cliente.contrato_numero ?? "—"}{cliente.contrato_vigencia ? ` · vence ${new Date(cliente.contrato_vigencia).toLocaleDateString()}` : ""}</dd>
        {cliente.notas && (<><dt>Notas</dt><dd>{cliente.notas}</dd></>)}
      </dl>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 18 }}>
        <h3 style={{ margin: 0 }}>Sitios / puestos ({sitios.length})</h3>
        <Link href="/sitios" className="qbtn2 primary">+ Nuevo sitio</Link>
      </div>
      {sitios.length === 0 ? (
        <p className="dash-sub">Este cliente aún no tiene sitios. Agrégalos en el módulo Sitios.</p>
      ) : (
        <table style={{ marginTop: 8 }}>
          <thead>
            <tr><th>Folio</th><th>Sitio</th><th>Tipo</th><th>Dirección</th><th>Guardias</th><th>Horario</th><th>Estatus</th></tr>
          </thead>
          <tbody>
            {sitios.map((s) => (
              <tr key={s.id}>
                <td>{s.folio ?? "—"}</td>
                <td>{s.nombre}</td>
                <td>{s.tipo ?? "—"}</td>
                <td>{s.direccion ?? "—"}</td>
                <td>{s.num_guardias ?? "—"}</td>
                <td>{s.horario ?? "—"}</td>
                <td><span className={s.estatus === "activo" ? "badge-activo" : "badge-cancelado"}>{s.estatus}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
