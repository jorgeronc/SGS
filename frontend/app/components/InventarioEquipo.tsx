"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import ListaMaestra from "@/app/components/ListaMaestra";
import { SelectPersonal } from "@/app/components/Pickers";
import { subirFotoArchivo } from "@/lib/fotos";

function asignadoA(p: any) {
  if (!p) return "—";
  const nom = p.persona ? `${p.persona.nombre ?? ""} ${p.persona.apellido_paterno ?? ""}`.trim() : "";
  const emp = `${p.rango ?? ""}${p.numero_placa ? ` #${p.numero_placa}` : ""}`.trim();
  return [nom, emp].filter(Boolean).join(" — ") || "—";
}

export interface InventarioConfig {
  tabla: string;                 // armamento | comunicacion | bodycams | otros
  modulo: string;
  titulo: string;
  subtitulo: string;
  tipos: { v: string; label: string }[]; // opciones del selector "tipo"
  placeholderBuscar?: string;
}

function NuevoItem({ cfg, onCreado }: { cfg: InventarioConfig; onCreado: () => void }) {
  const [tipo, setTipo] = useState(cfg.tipos[0]?.v ?? "");
  const [marca, setMarca] = useState("");
  const [modelo, setModelo] = useState("");
  const [serie, setSerie] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [asignadoId, setAsignadoId] = useState("");
  const [foto, setFoto] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCreando(true);
    const { data, error } = await supabase.from(cfg.tabla).insert({
      tipo: tipo || null,
      marca: marca || null,
      modelo: modelo || null,
      numero_serie: serie || null,
      descripcion: descripcion || null,
      asignado_personal_id: asignadoId || null,
      estado_equipo: asignadoId ? "asignado" : "operativo",
      fecha_alta: new Date().toISOString().slice(0, 10),
    }).select("id").single();
    if (error) { setError(error.message); setCreando(false); return; }
    if (foto && data) {
      const ruta = await subirFotoArchivo(cfg.tabla, data.id, foto);
      if (ruta) await supabase.from(cfg.tabla).update({ fotografias: [ruta] }).eq("id", data.id);
    }
    setCreando(false);
    onCreado();
  }

  return (
    <form onSubmit={crear}>
      <div className="form-fila">
        <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
          {cfg.tipos.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
        </select>
        <input placeholder="Marca" value={marca} onChange={(e) => setMarca(e.target.value)} />
        <input placeholder="Modelo" value={modelo} onChange={(e) => setModelo(e.target.value)} />
        <input placeholder="Número de serie" value={serie} onChange={(e) => setSerie(e.target.value)} />
      </div>
      <div className="form-fila">
        <input placeholder="Descripción" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} style={{ flex: 1 }} />
        <SelectPersonal value={asignadoId} onChange={setAsignadoId} placeholder="— Asignar a (opcional) —" />
        <label className="dash-sub" style={{ display: "flex", flexDirection: "column" }}>Fotografía
          <input type="file" accept="image/*" onChange={(e) => setFoto(e.target.files?.[0] ?? null)} />
        </label>
      </div>
      <div className="form-fila">
        <button type="submit" disabled={creando}>{creando ? "Registrando…" : "Registrar"}</button>
      </div>
      {error && <p style={{ color: "#b00020" }}>{error}</p>}
    </form>
  );
}

// Módulo genérico de inventario para las tablas uniformes de equipo
// (armamento, comunicación, bodycams, otros). Comparten esquema; sólo cambian
// el título y las opciones de "tipo".
export default function InventarioEquipo({ cfg }: { cfg: InventarioConfig }) {
  return (
    <ListaMaestra
      titulo={cfg.titulo}
      subtitulo={cfg.subtitulo}
      tabla={cfg.tabla}
      modulo={cfg.modulo}
      orderBy="creado_en"
      select="id, folio, tipo, marca, modelo, numero_serie, descripcion, estado_equipo, estatus, creado_en, personal:personal(numero_placa, rango, persona:personas(nombre, apellido_paterno))"
      placeholderBuscar={cfg.placeholderBuscar ?? "Buscar folio, tipo, marca, serie…"}
      columnas={[
        { header: "Folio", campo: "folio", celda: (r) => <span className="sc-folio">{r.folio ?? "s/folio"}</span> },
        { header: "Tipo", campo: "tipo", celda: (r) => r.tipo ?? "—" },
        { header: "Marca / Modelo", campo: "marca", celda: (r) => `${r.marca ?? ""} ${r.modelo ?? ""}`.trim() || "—" },
        { header: "Serie", campo: "numero_serie", celda: (r) => r.numero_serie ?? "—" },
        { header: "Asignado a", celda: (r) => asignadoA(r.personal) },
        { header: "Estado", campo: "estado_equipo", celda: (r) => r.estado_equipo },
        { header: "Estatus", campo: "estatus", celda: (r) => <span className={r.estatus === "activo" ? "badge-activo" : "badge-cancelado"}>{r.estatus}</span> },
      ]}
      textoBusqueda={(r) => `${r.folio ?? ""} ${r.tipo ?? ""} ${r.marca ?? ""} ${r.modelo ?? ""} ${r.numero_serie ?? ""} ${r.descripcion ?? ""}`}
      detalleHref={(r) => `/${cfg.tabla}/${r.id}`}
      filtros={[
        { k: "todos", label: "Todos" },
        { k: "operativo", label: "Operativos", test: (r) => r.estado_equipo === "operativo" },
        { k: "asignado", label: "Asignados", test: (r) => r.estado_equipo === "asignado" },
      ]}
      quickView={(r) => (
        <>
          <div className="sc-folio" style={{ fontSize: 16 }}>{r.folio ?? "s/folio"}</div>
          <h3 style={{ margin: "6px 0 8px" }}>{`${r.tipo ?? ""} ${r.marca ?? ""} ${r.modelo ?? ""}`.trim()}</h3>
          <dl className="sc-kv">
            <dt>Serie</dt><dd>{r.numero_serie ?? "—"}</dd>
            <dt>Descripción</dt><dd>{r.descripcion ?? "—"}</dd>
            <dt>Asignado</dt><dd>{asignadoA(r.personal)}</dd>
            <dt>Estado</dt><dd>{r.estado_equipo}</dd>
          </dl>
        </>
      )}
      editar={[
        { campo: "tipo", label: "Tipo" },
        { campo: "marca", label: "Marca" },
        { campo: "modelo", label: "Modelo" },
        { campo: "numero_serie", label: "Número de serie" },
        { campo: "descripcion", label: "Descripción" },
      ]}
      nuevo={(onCreado) => <NuevoItem cfg={cfg} onCreado={onCreado} />}
    />
  );
}
