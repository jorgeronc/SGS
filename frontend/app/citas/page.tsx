"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import ListaMaestra from "@/app/components/ListaMaestra";
import { CatalogoSelect } from "@/app/components/CatalogoSelect";

const ESTADOS = ["programada", "en_camino", "llego", "en_caseta", "autorizada", "en_anden", "carga_descarga", "finalizada", "salida", "cancelada"];
const ESTADO_LBL: Record<string, string> = {
  programada: "Programada", en_camino: "En camino", llego: "Llegó", en_caseta: "En caseta",
  autorizada: "Autorizada", en_anden: "En andén", carga_descarga: "Carga/Descarga",
  finalizada: "Finalizada", salida: "Salida", cancelada: "Cancelada",
};
const CERRADAS = ["finalizada", "salida", "cancelada"];
const hoyISO = () => new Date().toISOString().slice(0, 10);
const operadorNombre = (r: any) => (r.operador ? `${r.operador.nombre ?? ""} ${r.operador.apellido_paterno ?? ""}`.trim() : (r.operador_nombre ?? "—"));

// Citas de CEDIS: agenda de camiones (transportista/operador/vehículo/operación/
// andén) con máquina de estados programada→salida. Ver migración 0064.
function NuevaCita({ onCreado }: { onCreado: () => void }) {
  const [sitios, setSitios] = useState<any[]>([]);
  const [transportistas, setTransportistas] = useState<any[]>([]);
  const [vehiculos, setVehiculos] = useState<any[]>([]);
  const [f, setF] = useState({ sitio_id: "", transportista_id: "", operador_nombre: "", vehiculo_id: "", placa: "", remolque_placa: "", tipo_operacion: "", referencia: "", origen: "", destino: "", anden: "", programada_en: "" });
  const [error, setError] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    supabase.from("sitios").select("id, nombre").eq("estatus", "activo").order("nombre").then(({ data }) => setSitios((data as any[]) ?? []));
    supabase.from("transportistas").select("id, razon_social").eq("estatus", "activo").order("razon_social").then(({ data }) => setTransportistas((data as any[]) ?? []));
    supabase.from("vehiculos").select("id, placas, marca, modelo").eq("estatus", "activo").order("placas").limit(500).then(({ data }) => setVehiculos((data as any[]) ?? []));
  }, []);

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!f.sitio_id) { setError("Elige el sitio (CEDIS)."); return; }
    setCreando(true);
    const v = vehiculos.find((x) => x.id === f.vehiculo_id);
    const { error } = await supabase.from("citas").insert({
      sitio_id: f.sitio_id, transportista_id: f.transportista_id || null,
      operador_nombre: f.operador_nombre.trim() || null,
      vehiculo_id: f.vehiculo_id || null, placa: (f.placa.trim() || v?.placas || null),
      remolque_placa: f.remolque_placa.trim() || null, tipo_operacion: f.tipo_operacion || null,
      referencia: f.referencia.trim() || null, origen: f.origen.trim() || null, destino: f.destino.trim() || null,
      anden: f.anden.trim() || null, programada_en: f.programada_en ? new Date(f.programada_en).toISOString() : null,
    });
    setCreando(false);
    if (error) { setError(error.message); return; }
    onCreado();
  }

  return (
    <form onSubmit={crear}>
      <div className="form-fila">
        <select value={f.sitio_id} onChange={(e) => set("sitio_id", e.target.value)} required style={{ flex: 2 }}>
          <option value="">— Sitio (CEDIS) —</option>
          {sitios.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
        </select>
        <select value={f.transportista_id} onChange={(e) => set("transportista_id", e.target.value)} style={{ flex: 2 }}>
          <option value="">— Transportista —</option>
          {transportistas.map((t) => <option key={t.id} value={t.id}>{t.razon_social}</option>)}
        </select>
        <label className="dash-sub" style={{ display: "flex", flexDirection: "column" }}>Programada
          <input type="datetime-local" value={f.programada_en} onChange={(e) => set("programada_en", e.target.value)} />
        </label>
      </div>
      <div className="form-fila">
        <input placeholder="Operador (nombre)" value={f.operador_nombre} onChange={(e) => set("operador_nombre", e.target.value)} style={{ flex: 2 }} />
        <select value={f.vehiculo_id} onChange={(e) => set("vehiculo_id", e.target.value)} style={{ flex: 2 }}>
          <option value="">— Vehículo (registro maestro) —</option>
          {vehiculos.map((v) => <option key={v.id} value={v.id}>{v.placas ?? "s/placa"}{v.marca ? ` · ${v.marca} ${v.modelo ?? ""}` : ""}</option>)}
        </select>
        <input placeholder="…o placa" value={f.placa} onChange={(e) => set("placa", e.target.value)} style={{ maxWidth: 140 }} />
      </div>
      <div className="form-fila">
        <input placeholder="Placa de remolque" value={f.remolque_placa} onChange={(e) => set("remolque_placa", e.target.value)} style={{ maxWidth: 160 }} />
        <CatalogoSelect categoria="tipo_operacion_cedis" value={f.tipo_operacion} onChange={(v) => set("tipo_operacion", v)} placeholder="— Operación —" />
        <input placeholder="Andén" value={f.anden} onChange={(e) => set("anden", e.target.value)} style={{ maxWidth: 120 }} />
        <input placeholder="OC / embarque" value={f.referencia} onChange={(e) => set("referencia", e.target.value)} style={{ flex: 1 }} />
      </div>
      <div className="form-fila">
        <input placeholder="Origen" value={f.origen} onChange={(e) => set("origen", e.target.value)} style={{ flex: 1 }} />
        <input placeholder="Destino" value={f.destino} onChange={(e) => set("destino", e.target.value)} style={{ flex: 1 }} />
        <button type="submit" disabled={creando}>{creando ? "Creando…" : "Agendar cita"}</button>
      </div>
      {sitios.length === 0 && <p className="dash-sub">Primero registra un sitio.</p>}
      {error && <p style={{ color: "#b00020" }}>{error}</p>}
    </form>
  );
}

export default function CitasPage() {
  return (
    <ListaMaestra
      titulo="Citas"
      subtitulo="Agenda logística de CEDIS: camiones, operación y andén"
      tabla="citas"
      modulo="citas"
      orderBy="programada_en"
      select="id, folio, estado, placa, remolque_placa, tipo_operacion, anden, referencia, origen, destino, programada_en, operador_nombre, estatus, creado_en, sitio:sitios(nombre), transportista:transportistas(razon_social), vehiculo:vehiculos(placas), operador:personas(nombre, apellido_paterno)"
      placeholderBuscar="Buscar placa, transportista, operador, OC…"
      columnas={[
        { header: "Folio", celda: (r) => r.folio ?? "—" },
        { header: "Programada", celda: (r) => (r.programada_en ? new Date(r.programada_en).toLocaleString() : "—") },
        { header: "Transportista", celda: (r) => r.transportista?.razon_social ?? "—" },
        { header: "Placa", celda: (r) => r.placa ?? r.vehiculo?.placas ?? "—" },
        { header: "Operación", celda: (r) => r.tipo_operacion ?? "—" },
        { header: "Andén", celda: (r) => r.anden ?? "—" },
        { header: "Estado", celda: (r) => <span style={{ fontWeight: 700, color: CERRADAS.includes(r.estado) ? "#5a6470" : "#1e73be" }}>{ESTADO_LBL[r.estado] ?? r.estado}</span> },
      ]}
      textoBusqueda={(r) => `${r.placa ?? r.vehiculo?.placas ?? ""} ${r.transportista?.razon_social ?? ""} ${operadorNombre(r)} ${r.referencia ?? ""} ${r.folio ?? ""}`}
      detalleHref={() => "/citas"}
      filtros={[
        { k: "todas", label: "Todas" },
        { k: "hoy", label: "Hoy", test: (r) => !!r.programada_en && String(r.programada_en).slice(0, 10) === hoyISO() },
        { k: "activas", label: "Activas", test: (r) => !CERRADAS.includes(r.estado) },
        { k: "anden", label: "En andén", test: (r) => r.estado === "en_anden" || r.estado === "carga_descarga" },
      ]}
      quickView={(r) => (
        <>
          <h3 style={{ margin: "0 0 8px" }}>{r.folio ?? "Cita"} · {ESTADO_LBL[r.estado] ?? r.estado}</h3>
          <dl className="sc-kv">
            <dt>Programada</dt><dd>{r.programada_en ? new Date(r.programada_en).toLocaleString() : "—"}</dd>
            <dt>Sitio</dt><dd>{r.sitio?.nombre ?? "—"}</dd>
            <dt>Transportista</dt><dd>{r.transportista?.razon_social ?? "—"}</dd>
            <dt>Operador</dt><dd>{operadorNombre(r)}</dd>
            <dt>Vehículo / placa</dt><dd>{r.placa ?? r.vehiculo?.placas ?? "—"}{r.remolque_placa ? ` · rem. ${r.remolque_placa}` : ""}</dd>
            <dt>Operación</dt><dd>{r.tipo_operacion ?? "—"}</dd>
            <dt>Andén</dt><dd>{r.anden ?? "—"}</dd>
            <dt>OC / embarque</dt><dd>{r.referencia ?? "—"}</dd>
            <dt>Origen → destino</dt><dd>{`${r.origen ?? "—"} → ${r.destino ?? "—"}`}</dd>
          </dl>
        </>
      )}
      editar={[
        { campo: "estado", label: "Estado", tipo: "select", opciones: ESTADOS },
        { campo: "anden", label: "Andén" },
        { campo: "tipo_operacion", label: "Operación" },
        { campo: "programada_en", label: "Programada", tipo: "date" },
        { campo: "referencia", label: "OC / embarque" },
      ]}
      nuevo={(onCreado) => <NuevaCita onCreado={onCreado} />}
    />
  );
}
