"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import ListaMaestra from "@/app/components/ListaMaestra";

const TIPOS = [
  "Corporativo / oficinas", "Residencial", "Industrial / planta", "Comercial / retail",
  "Bodega / almacén", "Escolar", "Hospitalario", "Evento",
];

// Sitio (puesto de servicio) = lugar donde se presta la seguridad; pertenece a un
// cliente. Aquí se asignan guardias y turnos (módulos siguientes).
function NuevoSitio({ onCreado }: { onCreado: () => void }) {
  const [clientes, setClientes] = useState<{ id: string; razon_social: string }[]>([]);
  const [f, setF] = useState({ cliente_id: "", nombre: "", tipo: "", direccion: "", num_guardias: "", horario: "" });
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
    if (!f.nombre.trim()) { setError("El nombre del sitio es obligatorio."); return; }
    setCreando(true);
    const { error } = await supabase.from("sitios").insert({
      cliente_id: f.cliente_id,
      nombre: f.nombre.trim(),
      tipo: f.tipo || null,
      direccion: f.direccion || null,
      num_guardias: f.num_guardias ? Number(f.num_guardias) : null,
      horario: f.horario || null,
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
        <input placeholder="Nombre del sitio" value={f.nombre} onChange={(e) => set("nombre", e.target.value)} required />
        <select value={f.tipo} onChange={(e) => set("tipo", e.target.value)}>
          <option value="">— Tipo —</option>
          {TIPOS.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      <div className="form-fila">
        <input placeholder="Dirección" value={f.direccion} onChange={(e) => set("direccion", e.target.value)} style={{ flex: 2 }} />
        <input placeholder="No. de guardias" type="number" min={0} value={f.num_guardias} onChange={(e) => set("num_guardias", e.target.value)} />
        <input placeholder="Horario (ej. 24/7)" value={f.horario} onChange={(e) => set("horario", e.target.value)} />
        <button type="submit" disabled={creando}>{creando ? "Creando…" : "Agregar sitio"}</button>
      </div>
      {clientes.length === 0 && <p className="dash-sub">Primero registra un cliente en el módulo Clientes.</p>}
      {error && <p style={{ color: "#b00020" }}>{error}</p>}
    </form>
  );
}

export default function SitiosPage() {
  return (
    <ListaMaestra
      titulo="Sitios"
      subtitulo="Puestos de servicio (por cliente); ahí se asignan guardias y turnos"
      tabla="sitios"
      modulo="sitios"
      select="id, folio, cliente_id, nombre, tipo, direccion, referencia, num_guardias, horario, estatus, creado_en, cliente:clientes(razon_social)"
      placeholderBuscar="Buscar sitio, cliente, dirección…"
      columnas={[
        { header: "Folio", celda: (r) => r.folio ?? "—" },
        { header: "Cliente", celda: (r) => r.cliente?.razon_social ?? "—" },
        { header: "Sitio", celda: (r) => r.nombre },
        { header: "Tipo", celda: (r) => r.tipo ?? "—" },
        { header: "Dirección", celda: (r) => r.direccion ?? "—" },
        { header: "Guardias", celda: (r) => (r.num_guardias ?? "—") },
        { header: "Estatus", celda: (r) => <span className={r.estatus === "activo" ? "badge-activo" : "badge-cancelado"}>{r.estatus}</span> },
      ]}
      textoBusqueda={(r) => `${r.folio ?? ""} ${r.nombre} ${r.cliente?.razon_social ?? ""} ${r.direccion ?? ""}`}
      detalleHref={(r) => `/clientes/${r.cliente_id}`}
      quickView={(r) => (
        <>
          <h3 style={{ margin: "0 0 8px" }}>{r.nombre}</h3>
          <dl className="sc-kv">
            <dt>Folio</dt><dd>{r.folio ?? "—"}</dd>
            <dt>Cliente</dt><dd>{r.cliente?.razon_social ?? "—"}</dd>
            <dt>Tipo</dt><dd>{r.tipo ?? "—"}</dd>
            <dt>Dirección</dt><dd>{r.direccion ?? "—"}</dd>
            <dt>Guardias requeridos</dt><dd>{r.num_guardias ?? "—"}</dd>
            <dt>Horario</dt><dd>{r.horario ?? "—"}</dd>
          </dl>
          <p style={{ marginTop: 10 }}><Link href={`/clientes/${r.cliente_id}`} className="qbtn2">▤ Ver cliente →</Link></p>
        </>
      )}
      editar={[
        { campo: "nombre", label: "Nombre del sitio" },
        { campo: "tipo", label: "Tipo", tipo: "select", opciones: TIPOS },
        { campo: "direccion", label: "Dirección" },
        { campo: "referencia", label: "Referencia" },
        { campo: "num_guardias", label: "No. de guardias", tipo: "number" },
        { campo: "horario", label: "Horario" },
        { campo: "notas", label: "Notas", tipo: "textarea" },
      ]}
      nuevo={(onCreado) => <NuevoSitio onCreado={onCreado} />}
    />
  );
}
