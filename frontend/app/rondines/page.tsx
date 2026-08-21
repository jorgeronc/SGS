"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import ListaMaestra from "@/app/components/ListaMaestra";

const hoyISO = () => new Date().toISOString().slice(0, 10);
function guardiaNombre(g: any) {
  const p = g?.persona;
  return p ? `${p.nombre ?? ""} ${p.apellido_paterno ?? ""} ${p.apellido_materno ?? ""}`.trim() : "—";
}
const conNovedad = (n: string | null) => !!n && n.trim() !== "" && n.trim().toLowerCase() !== "sin novedad";

// Registro MANUAL de un paso (para pruebas / uso de escritorio). En campo, el
// móvil registra el paso al escanear el código del punto (rpc_rondin_marcar).
function NuevoRondin({ onCreado }: { onCreado: () => void }) {
  const [puntos, setPuntos] = useState<any[]>([]);
  const [guardias, setGuardias] = useState<any[]>([]);
  const [f, setF] = useState({ punto_id: "", personal_id: "", novedad: "" });
  const [error, setError] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    supabase.from("puntos_control").select("id, nombre, codigo, sitio:sitios(nombre)").eq("estatus", "activo").order("nombre")
      .then(({ data }) => setPuntos((data as any[]) ?? []));
    supabase.from("personal").select("id, persona:personas(nombre, apellido_paterno, apellido_materno)")
      .eq("estatus", "activo").eq("estado_laboral", "activo")
      .then(({ data }) => setGuardias((data as any[]) ?? []));
  }, []);

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!f.punto_id) { setError("Elige el punto de control."); return; }
    setCreando(true);
    const { error } = await supabase.from("rondines").insert({
      punto_id: f.punto_id, personal_id: f.personal_id || null, novedad: f.novedad.trim() || null,
    });
    setCreando(false);
    if (error) { setError(error.message); return; }
    onCreado();
  }

  return (
    <form onSubmit={crear}>
      <div className="form-fila">
        <select value={f.punto_id} onChange={(e) => set("punto_id", e.target.value)} required style={{ flex: 2 }}>
          <option value="">— Punto de control —</option>
          {puntos.map((p) => <option key={p.id} value={p.id}>{p.nombre}{p.sitio?.nombre ? ` · ${p.sitio.nombre}` : ""} ({p.codigo})</option>)}
        </select>
        <select value={f.personal_id} onChange={(e) => set("personal_id", e.target.value)} style={{ flex: 2 }}>
          <option value="">— Guardia (opcional) —</option>
          {guardias.map((g) => <option key={g.id} value={g.id}>{guardiaNombre(g)}</option>)}
        </select>
      </div>
      <div className="form-fila">
        <input placeholder="Novedad (o vacío = sin novedad)" value={f.novedad} onChange={(e) => set("novedad", e.target.value)} style={{ flex: 3 }} />
        <button type="submit" disabled={creando}>{creando ? "Registrando…" : "Registrar paso"}</button>
      </div>
      {puntos.length === 0 && <p className="dash-sub">Primero define puntos de control.</p>}
      {error && <p style={{ color: "#b00020" }}>{error}</p>}
    </form>
  );
}

export default function RondinesPage() {
  return (
    <ListaMaestra
      titulo="Rondines"
      subtitulo="Pasos de los guardias por los puntos de control (guard tour)"
      tabla="rondines"
      modulo="rondines"
      orderBy="fecha_hora"
      select="id, fecha_hora, novedad, latitud, longitud, estatus, creado_en, punto_id, personal_id, punto:puntos_control(nombre, codigo, sitio:sitios(nombre, cliente_id, cliente:clientes(razon_social))), guardia:personal(persona:personas(nombre, apellido_paterno, apellido_materno))"
      placeholderBuscar="Buscar punto, sitio, guardia…"
      columnas={[
        { header: "Fecha / hora", celda: (r) => (r.fecha_hora ? new Date(r.fecha_hora).toLocaleString() : "—") },
        { header: "Sitio", celda: (r) => r.punto?.sitio?.nombre ?? "—" },
        { header: "Punto", celda: (r) => r.punto?.nombre ?? "—" },
        { header: "Guardia", celda: (r) => guardiaNombre(r.guardia) },
        { header: "Novedad", celda: (r) => (conNovedad(r.novedad) ? <span style={{ color: "#b00020", fontWeight: 600 }}>{r.novedad}</span> : <span style={{ color: "#0a7c2f" }}>sin novedad</span>) },
        { header: "GPS", celda: (r) => (r.latitud != null ? "📍" : "—") },
      ]}
      textoBusqueda={(r) => `${r.punto?.nombre ?? ""} ${r.punto?.sitio?.nombre ?? ""} ${guardiaNombre(r.guardia)} ${r.novedad ?? ""}`}
      detalleHref={(r) => `/clientes/${r.punto?.sitio?.cliente_id ?? ""}`}
      filtros={[
        { k: "todos", label: "Todos" },
        { k: "hoy", label: "Hoy", test: (r) => !!r.fecha_hora && String(r.fecha_hora).slice(0, 10) === hoyISO() },
        { k: "novedad", label: "Con novedad", test: (r) => conNovedad(r.novedad) },
      ]}
      quickView={(r) => (
        <>
          <h3 style={{ margin: "0 0 8px" }}>{r.punto?.nombre ?? "Rondín"}</h3>
          <dl className="sc-kv">
            <dt>Fecha / hora</dt><dd>{r.fecha_hora ? new Date(r.fecha_hora).toLocaleString() : "—"}</dd>
            <dt>Sitio</dt><dd>{r.punto?.sitio?.nombre ?? "—"}</dd>
            <dt>Cliente</dt><dd>{r.punto?.sitio?.cliente?.razon_social ?? "—"}</dd>
            <dt>Código</dt><dd><code>{r.punto?.codigo ?? "—"}</code></dd>
            <dt>Guardia</dt><dd>{guardiaNombre(r.guardia)}</dd>
            <dt>Novedad</dt><dd>{conNovedad(r.novedad) ? r.novedad : "sin novedad"}</dd>
            <dt>GPS</dt><dd>{r.latitud != null ? `${r.latitud}, ${r.longitud}` : "—"}</dd>
          </dl>
          {r.punto?.sitio?.cliente_id && <p style={{ marginTop: 10 }}><Link href={`/clientes/${r.punto.sitio.cliente_id}`} className="qbtn2">▤ Ver cliente →</Link></p>}
        </>
      )}
      editar={[{ campo: "novedad", label: "Novedad", tipo: "textarea" }]}
      nuevo={(onCreado) => <NuevoRondin onCreado={onCreado} />}
    />
  );
}
