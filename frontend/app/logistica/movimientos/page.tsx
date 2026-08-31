"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import ListaMaestra from "@/app/components/ListaMaestra";

const TIPOS = ["CARRETERO", "FERROVIARIO", "INTERMODAL", "INTERNO"];
const ESTADOS = ["PROGRAMADO", "EN_PREPARACION", "EN_TRANSITO", "DETENIDO", "EN_PATIO", "FINALIZADO", "CANCELADO"];
const EST_COLOR: Record<string, string> = {
  PROGRAMADO: "#607d8b", EN_PREPARACION: "#b8860b", EN_TRANSITO: "#1e73be", DETENIDO: "#e23b53",
  EN_PATIO: "#7a3fbf", FINALIZADO: "#0a7c2f", CANCELADO: "#8a1220",
};
const fFecha = (s: any) => (s ? new Date(s).toLocaleString() : "—");

function NuevoMovimiento({ onCreado }: { onCreado: () => void }) {
  const [sitios, setSitios] = useState<any[]>([]);
  const [activos, setActivos] = useState<any[]>([]);
  const [tipo, setTipo] = useState("CARRETERO");
  const [origen, setOrigen] = useState("");
  const [destino, setDestino] = useState("");
  const [activo, setActivo] = useState("");
  const [prog, setProg] = useState("");
  const [ref, setRef] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    supabase.from("sitios").select("id, nombre").eq("estatus", "activo").order("nombre").then(({ data }) => setSitios((data as any[]) ?? []));
    supabase.from("transporte_activos").select("id, identificador, placas, tipo_activo").eq("estatus", "activo").order("creado_en", { ascending: false }).then(({ data }) => setActivos((data as any[]) ?? []));
  }, []);

  async function crear() {
    const { error } = await supabase.from("movimientos").insert({
      tipo_movimiento: tipo,
      sitio_origen_id: origen || null,
      sitio_destino_id: destino || null,
      transporte_activo_id: activo || null,
      programado_inicio: prog ? new Date(prog).toISOString() : null,
      referencia_externa: ref.trim() || null,
      estado: "PROGRAMADO",
    });
    if (error) { setMsg(error.message); return; }
    setMsg(null); setOrigen(""); setDestino(""); setActivo(""); setProg(""); setRef("");
    onCreado();
  }

  return (
    <div className="form-grid">
      <label>Tipo de movimiento<select value={tipo} onChange={(e) => setTipo(e.target.value)}>{TIPOS.map((t) => <option key={t} value={t}>{t}</option>)}</select></label>
      <label>Sitio origen<select value={origen} onChange={(e) => setOrigen(e.target.value)}><option value="">—</option>{sitios.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}</select></label>
      <label>Sitio destino<select value={destino} onChange={(e) => setDestino(e.target.value)}><option value="">—</option>{sitios.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}</select></label>
      <label>Activo de transporte<select value={activo} onChange={(e) => setActivo(e.target.value)}><option value="">—</option>{activos.map((a) => <option key={a.id} value={a.id}>{[a.identificador, a.placas, a.tipo_activo].filter(Boolean).join(" · ")}</option>)}</select></label>
      <label>Programado inicio<input type="datetime-local" value={prog} onChange={(e) => setProg(e.target.value)} /></label>
      <label>Referencia externa<input value={ref} maxLength={60} onChange={(e) => setRef(e.target.value)} placeholder="OC / embarque / pedido" /></label>
      <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 12 }}>
        <button className="sc-btn" onClick={crear}>Crear movimiento</button>
        {msg && <span style={{ color: "#e23b53", fontSize: 13 }}>{msg}</span>}
      </div>
    </div>
  );
}

export default function MovimientosPage() {
  return (
    <ListaMaestra
      titulo="Movimientos"
      subtitulo="Seguridad Logística — movimientos de carga (carretero / ferroviario / intermodal)"
      tabla="movimientos"
      modulo="movimientos"
      select="id, folio, tipo_movimiento, estado, nivel_riesgo, referencia_externa, programado_inicio, origen:sitios!sitio_origen_id(nombre), destino:sitios!sitio_destino_id(nombre), activo:transporte_activos(identificador, placas, tipo_activo), estatus, creado_en"
      placeholderBuscar="Folio, referencia…"
      textoBusqueda={(r) => `${r.folio ?? ""} ${r.referencia_externa ?? ""} ${r.tipo_movimiento ?? ""}`}
      detalleHref={(r) => `/logistica/movimientos/${r.id}`}
      columnas={[
        { header: "Folio", celda: (r) => r.folio ?? "—", campo: "folio" },
        { header: "Tipo", celda: (r) => r.tipo_movimiento, campo: "tipo_movimiento" },
        { header: "Ruta", celda: (r) => `${r.origen?.nombre ?? "—"} → ${r.destino?.nombre ?? "—"}` },
        { header: "Activo", celda: (r) => (r.activo ? [r.activo.identificador, r.activo.placas].filter(Boolean).join(" ") || r.activo.tipo_activo : "—") },
        { header: "Estado", celda: (r) => <span style={{ background: EST_COLOR[r.estado] ?? "#607d8b", color: "#fff", borderRadius: 999, padding: "2px 9px", fontSize: 11, fontWeight: 800 }}>{r.estado}</span>, campo: "estado" },
        { header: "Riesgo", celda: (r) => r.nivel_riesgo ?? "—" },
        { header: "Programado", celda: (r) => fFecha(r.programado_inicio), campo: "programado_inicio" },
      ]}
      filtros={[
        { k: "todos", label: "Todos" },
        { k: "transito", label: "En tránsito", test: (r) => r.estado === "EN_TRANSITO" },
        { k: "detenido", label: "Detenidos", test: (r) => r.estado === "DETENIDO" },
        { k: "abiertos", label: "No finalizados", test: (r) => !["FINALIZADO", "CANCELADO"].includes(r.estado) },
      ]}
      quickView={(r) => (
        <div style={{ fontSize: 13, lineHeight: 1.7 }}>
          <div><b>{r.folio ?? "Movimiento"}</b> · {r.tipo_movimiento}</div>
          <div>Estado: <b>{r.estado}</b>{r.nivel_riesgo ? ` · Riesgo: ${r.nivel_riesgo}` : ""}</div>
          <div>Ruta: {r.origen?.nombre ?? "—"} → {r.destino?.nombre ?? "—"}</div>
          <div>Activo: {r.activo ? [r.activo.identificador, r.activo.placas].filter(Boolean).join(" ") : "—"}</div>
          <div>Programado: {fFecha(r.programado_inicio)}</div>
          {r.referencia_externa && <div>Ref: {r.referencia_externa}</div>}
        </div>
      )}
      editar={[
        { campo: "estado", label: "Estado", tipo: "select", opciones: ESTADOS },
        { campo: "nivel_riesgo", label: "Nivel de riesgo", tipo: "select", opciones: ["Normal", "Controlada", "Alto valor", "Sensible", "Crítica"] },
        { campo: "referencia_externa", label: "Referencia externa" },
      ]}
      nuevo={(onCreado) => <NuevoMovimiento onCreado={onCreado} />}
    />
  );
}
