"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import ListaMaestra from "@/app/components/ListaMaestra";
import { CatalogoSelect } from "@/app/components/CatalogoSelect";

const hoyISO = () => new Date().toISOString().slice(0, 10);
const personaNombre = (r: any) => (r.persona
  ? `${r.persona.nombre ?? ""} ${r.persona.apellido_paterno ?? ""} ${r.persona.apellido_materno ?? ""}`.trim()
  : (r.visitante_nombre ?? "—"));
const RES: Record<string, { t: string; c: string }> = {
  autorizado: { t: "Autorizado", c: "#0a7c2f" },
  rechazado: { t: "Rechazado", c: "#b00020" },
  pendiente: { t: "Pendiente", c: "#b8860b" },
};

// Alta manual de un acceso desde central (el guardia lo hace desde la app de
// caseta). El lugar es un sitio + su caseta (punto de control tipo 'caseta').
function NuevoAcceso({ onCreado }: { onCreado: () => void }) {
  const [sitios, setSitios] = useState<any[]>([]);
  const [casetas, setCasetas] = useState<any[]>([]);
  const [personas, setPersonas] = useState<any[]>([]);
  const [vehiculos, setVehiculos] = useState<any[]>([]);
  const [citas, setCitas] = useState<any[]>([]);
  const [modo, setModo] = useState<"persona" | "vehiculo">("persona");
  const [f, setF] = useState({ tipo: "entrada", sitio_id: "", punto_id: "", persona_id: "", visitante_nombre: "", tipo_persona: "", motivo: "", resultado: "autorizado", vehiculo_id: "", placa: "", cita_id: "", anden: "", remolque_placa: "" });
  const [error, setError] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    supabase.from("sitios").select("id, nombre, cliente:clientes(razon_social)").eq("estatus", "activo").order("nombre")
      .then(({ data }) => setSitios((data as any[]) ?? []));
    supabase.from("personas").select("id, nombre, apellido_paterno, apellido_materno").order("nombre").limit(500)
      .then(({ data }) => setPersonas((data as any[]) ?? []));
    supabase.from("vehiculos").select("id, placas, marca, modelo").eq("estatus", "activo").order("placas").limit(500)
      .then(({ data }) => setVehiculos((data as any[]) ?? []));
  }, []);

  // Casetas + citas activas del sitio elegido.
  useEffect(() => {
    if (!f.sitio_id) { setCasetas([]); setCitas([]); return; }
    supabase.from("puntos_control").select("id, nombre").eq("estatus", "activo").eq("sitio_id", f.sitio_id).eq("tipo_punto", "caseta").order("nombre")
      .then(({ data }) => setCasetas((data as any[]) ?? []));
    supabase.from("citas").select("id, folio, placa, anden, vehiculo:vehiculos(placas)").eq("estatus", "activo").eq("sitio_id", f.sitio_id)
      .not("estado", "in", "(finalizada,salida,cancelada)").order("programada_en", { ascending: true }).limit(100)
      .then(({ data }) => setCitas((data as any[]) ?? []));
  }, [f.sitio_id]);

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!f.sitio_id) { setError("Elige el sitio."); return; }
    if (modo === "persona" && !f.persona_id && !f.visitante_nombre.trim()) { setError("Elige la persona o escribe el nombre del visitante."); return; }
    if (modo === "vehiculo" && !f.vehiculo_id && !f.placa.trim()) { setError("Elige el vehículo o escribe la placa."); return; }
    setCreando(true);
    const v = vehiculos.find((x) => x.id === f.vehiculo_id);
    const { error } = await supabase.from("accesos").insert({
      tipo: f.tipo,
      persona_id: modo === "persona" ? (f.persona_id || null) : null,
      visitante_nombre: modo === "persona" ? (f.persona_id ? null : (f.visitante_nombre.trim() || null)) : (f.visitante_nombre.trim() || null),
      tipo_persona: f.tipo_persona || (modo === "vehiculo" ? "Transportista" : null),
      sitio_id: f.sitio_id,
      punto_id: f.punto_id || null,
      motivo: f.motivo || null,
      resultado: f.resultado,
      vehiculo_id: modo === "vehiculo" ? (f.vehiculo_id || null) : null,
      placa: modo === "vehiculo" ? (f.placa.trim() || v?.placas || null) : null,
      cita_id: modo === "vehiculo" ? (f.cita_id || null) : null,
      anden: modo === "vehiculo" ? (f.anden.trim() || null) : null,
      remolque_placa: modo === "vehiculo" ? (f.remolque_placa.trim() || null) : null,
      datos_adicionales: { origen: "central" },
    });
    setCreando(false);
    if (error) { setError(error.message); return; }
    onCreado();
  }

  return (
    <form onSubmit={crear}>
      <div className="form-fila">
        <label className="dash-sub" style={{ display: "flex", flexDirection: "column" }}>Movimiento
          <select value={f.tipo} onChange={(e) => set("tipo", e.target.value)}>
            <option value="entrada">Entrada</option>
            <option value="salida">Salida</option>
          </select>
        </label>
        <label className="dash-sub" style={{ display: "flex", flexDirection: "column" }}>Resultado
          <select value={f.resultado} onChange={(e) => set("resultado", e.target.value)}>
            <option value="autorizado">Autorizado</option>
            <option value="rechazado">Rechazado</option>
            <option value="pendiente">Pendiente</option>
          </select>
        </label>
        <select value={f.sitio_id} onChange={(e) => set("sitio_id", e.target.value)} required style={{ flex: 2 }}>
          <option value="">— Sitio —</option>
          {sitios.map((s) => <option key={s.id} value={s.id}>{s.nombre}{s.cliente?.razon_social ? ` · ${s.cliente.razon_social}` : ""}</option>)}
        </select>
        <select value={f.punto_id} onChange={(e) => set("punto_id", e.target.value)} style={{ flex: 1 }}>
          <option value="">— Caseta —</option>
          {casetas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
      </div>
      <div className="form-fila">
        <label className="dash-sub" style={{ display: "flex", flexDirection: "column" }}>Tipo de acceso
          <select value={modo} onChange={(e) => setModo(e.target.value as "persona" | "vehiculo")}>
            <option value="persona">Persona</option>
            <option value="vehiculo">Vehículo</option>
          </select>
        </label>
      </div>
      {modo === "persona" ? (
        <div className="form-fila">
          <select value={f.persona_id} onChange={(e) => set("persona_id", e.target.value)} style={{ flex: 2 }}>
            <option value="">— Persona (registro maestro) —</option>
            {personas.map((p) => <option key={p.id} value={p.id}>{`${p.nombre ?? ""} ${p.apellido_paterno ?? ""} ${p.apellido_materno ?? ""}`.trim()}</option>)}
          </select>
          <input placeholder="…o nombre del visitante" value={f.visitante_nombre} onChange={(e) => set("visitante_nombre", e.target.value)} style={{ flex: 2 }} disabled={!!f.persona_id} />
        </div>
      ) : (
        <>
          <div className="form-fila">
            <select value={f.vehiculo_id} onChange={(e) => set("vehiculo_id", e.target.value)} style={{ flex: 2 }}>
              <option value="">— Vehículo (registro maestro) —</option>
              {vehiculos.map((v) => <option key={v.id} value={v.id}>{v.placas ?? "s/placa"}{v.marca ? ` · ${v.marca} ${v.modelo ?? ""}` : ""}</option>)}
            </select>
            <input placeholder="…o placa" value={f.placa} onChange={(e) => set("placa", e.target.value)} style={{ maxWidth: 140 }} />
            <input placeholder="Remolque" value={f.remolque_placa} onChange={(e) => set("remolque_placa", e.target.value)} style={{ maxWidth: 140 }} />
          </div>
          <div className="form-fila">
            <select value={f.cita_id} onChange={(e) => set("cita_id", e.target.value)} style={{ flex: 2 }}>
              <option value="">— Cita (opcional) —</option>
              {citas.map((c) => <option key={c.id} value={c.id}>{c.folio ?? "cita"}{(c.placa ?? c.vehiculo?.placas) ? ` · ${c.placa ?? c.vehiculo?.placas}` : ""}{c.anden ? ` · andén ${c.anden}` : ""}</option>)}
            </select>
            <input placeholder="Andén" value={f.anden} onChange={(e) => set("anden", e.target.value)} style={{ maxWidth: 120 }} />
            <input placeholder="Operador (nombre)" value={f.visitante_nombre} onChange={(e) => set("visitante_nombre", e.target.value)} style={{ flex: 1 }} />
          </div>
        </>
      )}
      <div className="form-fila">
        <CatalogoSelect categoria="tipo_persona_acceso" value={f.tipo_persona} onChange={(v) => set("tipo_persona", v)} placeholder="— Tipo de persona —" />
        <CatalogoSelect categoria="motivo_acceso" value={f.motivo} onChange={(v) => set("motivo", v)} placeholder="— Motivo —" />
        <button type="submit" disabled={creando}>{creando ? "Registrando…" : "Registrar acceso"}</button>
      </div>
      {sitios.length === 0 && <p className="dash-sub">Primero registra un sitio y su caseta (punto de control tipo “caseta”).</p>}
      {error && <p style={{ color: "#b00020" }}>{error}</p>}
    </form>
  );
}

export default function AccesosPage() {
  return (
    <ListaMaestra
      titulo="Accesos"
      subtitulo="Bitácora de entradas y salidas de personas por caseta"
      tabla="accesos"
      modulo="accesos"
      orderBy="fecha_evento"
      select="id, folio, tipo, persona_id, visitante_nombre, tipo_persona, motivo, resultado, placa, anden, fecha_evento, estatus, creado_en, sitio:sitios(nombre), punto:puntos_control(nombre), persona:personas(nombre, apellido_paterno, apellido_materno), vehiculo:vehiculos(placas)"
      placeholderBuscar="Buscar persona, visitante, motivo…"
      columnas={[
        { header: "Folio", celda: (r) => r.folio ?? "—" },
        { header: "Fecha / hora", celda: (r) => (r.fecha_evento ? new Date(r.fecha_evento).toLocaleString() : "—") },
        { header: "Mov.", celda: (r) => (r.tipo === "salida" ? "Salida" : "Entrada") },
        { header: "Persona / Vehículo", celda: (r) => (r.placa || r.vehiculo?.placas) ? `🚚 ${r.placa ?? r.vehiculo?.placas}` : personaNombre(r) },
        { header: "Tipo", celda: (r) => r.tipo_persona ?? "—" },
        { header: "Sitio", celda: (r) => r.sitio?.nombre ?? "—" },
        { header: "Resultado", celda: (r) => { const x = RES[r.resultado] ?? { t: r.resultado, c: "#555" }; return <span style={{ color: x.c, fontWeight: 700 }}>{x.t}</span>; } },
      ]}
      textoBusqueda={(r) => `${personaNombre(r)} ${r.tipo_persona ?? ""} ${r.motivo ?? ""} ${r.sitio?.nombre ?? ""} ${r.folio ?? ""}`}
      detalleHref={(r) => (r.persona_id ? `/personas/${r.persona_id}` : "/accesos")}
      filtros={[
        { k: "todos", label: "Todos" },
        { k: "hoy", label: "Hoy", test: (r) => !!r.fecha_evento && String(r.fecha_evento).slice(0, 10) === hoyISO() },
        { k: "entradas", label: "Entradas", test: (r) => r.tipo === "entrada" },
        { k: "salidas", label: "Salidas", test: (r) => r.tipo === "salida" },
        { k: "rechazados", label: "Rechazados", test: (r) => r.resultado === "rechazado" },
      ]}
      quickView={(r) => (
        <>
          <h3 style={{ margin: "0 0 8px" }}>{personaNombre(r)}</h3>
          <dl className="sc-kv">
            <dt>Folio</dt><dd>{r.folio ?? "—"}</dd>
            <dt>Movimiento</dt><dd>{r.tipo === "salida" ? "Salida" : "Entrada"}</dd>
            <dt>Fecha / hora</dt><dd>{r.fecha_evento ? new Date(r.fecha_evento).toLocaleString() : "—"}</dd>
            <dt>Tipo de persona</dt><dd>{r.tipo_persona ?? "—"}</dd>
            <dt>Motivo</dt><dd>{r.motivo ?? "—"}</dd>
            <dt>Sitio</dt><dd>{r.sitio?.nombre ?? "—"}</dd>
            <dt>Caseta</dt><dd>{r.punto?.nombre ?? "—"}</dd>
            <dt>Resultado</dt><dd>{(RES[r.resultado] ?? { t: r.resultado }).t}</dd>
          </dl>
        </>
      )}
      nuevo={(onCreado) => <NuevoAcceso onCreado={onCreado} />}
    />
  );
}
