"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { subirFotoArchivo, primeraFoto } from "@/lib/fotos";

// Personas y vehículos involucrados en un incidente. Se capturan aquí y quedan en
// los REGISTROS MAESTROS (personas / vehiculos), vinculados al incidente vía
// `vinculos` (origen 'cad' -> destino 'persona'/'vehiculo'). Ver mig. 0068.
type Tab = "persona" | "vehiculo";
const SEXO = ["Masculino", "Femenino", "Otro"];
const CIVIL = ["Soltero(a)", "Casado(a)", "Unión libre", "Divorciado(a)", "Viudo(a)"];
const ESCOL = ["Ninguna", "Primaria", "Secundaria", "Preparatoria", "Técnica", "Licenciatura", "Posgrado"];

const inp: React.CSSProperties = { width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--sc-card-line)", background: "var(--sc-content)", color: "var(--sc-text)", fontSize: 13.5 };
const lbl: React.CSSProperties = { fontSize: 12, color: "var(--sc-text-soft)", marginBottom: 4, display: "block" };

export default function PersonasVehiculosIncidente({ llamadaId }: { llamadaId: string }) {
  const [tab, setTab] = useState<Tab>("persona");
  const [personas, setPersonas] = useState<any[]>([]);
  const [vehiculos, setVehiculos] = useState<any[]>([]);
  const [abrir, setAbrir] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [foto, setFoto] = useState<File | null>(null);
  const [p, setP] = useState({ nombre: "", apellido_paterno: "", apellido_materno: "", sexo: "", fecha_nacimiento: "", originario_de: "", ocupacion: "", estado_civil: "", escolaridad: "" });
  const [v, setV] = useState({ placas: "", marca: "", color: "", vin: "", tarjeta_circulacion: "", descripcion: "" });

  const cargar = useCallback(async () => {
    const { data: vin } = await supabase.from("vinculos")
      .select("entidad_destino_tipo, entidad_destino_id")
      .eq("entidad_origen_tipo", "cad").eq("entidad_origen_id", llamadaId).eq("estatus", "activo");
    const perIds = ((vin as any[]) ?? []).filter((x) => x.entidad_destino_tipo === "persona").map((x) => x.entidad_destino_id);
    const vehIds = ((vin as any[]) ?? []).filter((x) => x.entidad_destino_tipo === "vehiculo").map((x) => x.entidad_destino_id);
    setPersonas(perIds.length ? (((await supabase.from("personas").select("id, folio, nombre, apellido_paterno, apellido_materno, sexo, ocupacion, fotografias").in("id", perIds)).data as any[]) ?? []) : []);
    setVehiculos(vehIds.length ? (((await supabase.from("vehiculos").select("id, folio, placas, marca, color, vin, descripcion, fotografias").in("id", vehIds)).data as any[]) ?? []) : []);
  }, [llamadaId]);
  useEffect(() => { cargar(); }, [cargar]);

  async function vincular(tipo: string, id: string) {
    await supabase.from("vinculos").insert({ entidad_origen_tipo: "cad", entidad_origen_id: llamadaId, entidad_destino_tipo: tipo, entidad_destino_id: id, tipo_relacion: tipo === "persona" ? "persona_involucrada" : "vehiculo_involucrado" });
  }

  async function guardarPersona() {
    if (!p.nombre.trim()) { setMsg("El nombre es obligatorio."); return; }
    setBusy(true); setMsg(null);
    const { data, error } = await supabase.from("personas").insert({
      nombre: p.nombre.trim(), apellido_paterno: p.apellido_paterno.trim() || null, apellido_materno: p.apellido_materno.trim() || null,
      sexo: p.sexo || null, fecha_nacimiento: p.fecha_nacimiento || null, originario_de: p.originario_de.trim() || null,
      ocupacion: p.ocupacion.trim() || null, estado_civil: p.estado_civil || null, escolaridad: p.escolaridad || null,
    }).select("id").single();
    if (error) { setBusy(false); setMsg(error.message); return; }
    const id = (data as any).id;
    if (foto) { const path = await subirFotoArchivo("personas", id, foto); if (path) await supabase.from("personas").update({ fotografias: [path] }).eq("id", id); }
    await vincular("persona", id);
    setBusy(false); setAbrir(false); setFoto(null);
    setP({ nombre: "", apellido_paterno: "", apellido_materno: "", sexo: "", fecha_nacimiento: "", originario_de: "", ocupacion: "", estado_civil: "", escolaridad: "" });
    cargar();
  }

  async function guardarVehiculo() {
    if (!v.placas.trim() && !v.vin.trim()) { setMsg("Captura al menos placas o VIN."); return; }
    setBusy(true); setMsg(null);
    const { data, error } = await supabase.from("vehiculos").insert({
      placas: v.placas.trim() || null, marca: v.marca.trim() || null, color: v.color.trim() || null,
      vin: v.vin.trim() || null, tarjeta_circulacion: v.tarjeta_circulacion.trim() || null, descripcion: v.descripcion.trim() || null,
    }).select("id").single();
    if (error) { setBusy(false); setMsg(error.message); return; }
    const id = (data as any).id;
    if (foto) { const path = await subirFotoArchivo("vehiculos", id, foto); if (path) await supabase.from("vehiculos").update({ fotografias: [path] }).eq("id", id); }
    await vincular("vehiculo", id);
    setBusy(false); setAbrir(false); setFoto(null);
    setV({ placas: "", marca: "", color: "", vin: "", tarjeta_circulacion: "", descripcion: "" });
    cargar();
  }

  const card: React.CSSProperties = { border: "1px solid var(--sc-card-line)", borderRadius: 10, padding: "10px 12px", display: "flex", gap: 12, alignItems: "center" };
  const thumb = (fot: unknown) => { const u = primeraFoto(fot); return <div style={{ width: 52, height: 52, borderRadius: 8, background: u ? `center/cover url(${u})` : "#dfe7f0", flex: "0 0 auto" }} />; };

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
        <button onClick={() => { setTab("persona"); setAbrir(false); }} style={{ padding: "7px 14px", borderRadius: 9, border: "1px solid " + (tab === "persona" ? "var(--sc-btn,#f4a03f)" : "var(--sc-card-line)"), background: tab === "persona" ? "var(--sc-btn,#f4a03f)" : "transparent", color: tab === "persona" ? "#fff" : "var(--sc-text)", fontWeight: 700, cursor: "pointer" }}>Personas ({personas.length})</button>
        <button onClick={() => { setTab("vehiculo"); setAbrir(false); }} style={{ padding: "7px 14px", borderRadius: 9, border: "1px solid " + (tab === "vehiculo" ? "var(--sc-btn,#f4a03f)" : "var(--sc-card-line)"), background: tab === "vehiculo" ? "var(--sc-btn,#f4a03f)" : "transparent", color: tab === "vehiculo" ? "#fff" : "var(--sc-text)", fontWeight: 700, cursor: "pointer" }}>Vehículos ({vehiculos.length})</button>
        <button onClick={() => { setAbrir((x) => !x); setMsg(null); }} style={{ marginLeft: "auto", padding: "7px 14px", borderRadius: 9, border: "none", background: "#2f6bff", color: "#fff", fontWeight: 700, cursor: "pointer" }}>＋ Agregar {tab === "persona" ? "persona" : "vehículo"}</button>
      </div>

      {abrir && tab === "persona" && (
        <div style={{ border: "1px solid var(--sc-card-line)", borderRadius: 10, padding: 14, marginBottom: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12 }}>
            <div><label style={lbl}>Nombre(s) *</label><input style={inp} value={p.nombre} onChange={(e) => setP({ ...p, nombre: e.target.value })} /></div>
            <div><label style={lbl}>Apellido paterno</label><input style={inp} value={p.apellido_paterno} onChange={(e) => setP({ ...p, apellido_paterno: e.target.value })} /></div>
            <div><label style={lbl}>Apellido materno</label><input style={inp} value={p.apellido_materno} onChange={(e) => setP({ ...p, apellido_materno: e.target.value })} /></div>
            <div><label style={lbl}>Sexo</label><select style={inp} value={p.sexo} onChange={(e) => setP({ ...p, sexo: e.target.value })}><option value="">—</option>{SEXO.map((s) => <option key={s}>{s}</option>)}</select></div>
            <div><label style={lbl}>Fecha de nacimiento</label><input type="date" style={inp} value={p.fecha_nacimiento} onChange={(e) => setP({ ...p, fecha_nacimiento: e.target.value })} /></div>
            <div><label style={lbl}>Originario de</label><input style={inp} value={p.originario_de} onChange={(e) => setP({ ...p, originario_de: e.target.value })} /></div>
            <div><label style={lbl}>Ocupación</label><input style={inp} value={p.ocupacion} onChange={(e) => setP({ ...p, ocupacion: e.target.value })} /></div>
            <div><label style={lbl}>Estado civil</label><select style={inp} value={p.estado_civil} onChange={(e) => setP({ ...p, estado_civil: e.target.value })}><option value="">—</option>{CIVIL.map((s) => <option key={s}>{s}</option>)}</select></div>
            <div><label style={lbl}>Escolaridad</label><select style={inp} value={p.escolaridad} onChange={(e) => setP({ ...p, escolaridad: e.target.value })}><option value="">—</option>{ESCOL.map((s) => <option key={s}>{s}</option>)}</select></div>
            <div><label style={lbl}>Foto</label><input type="file" accept="image/*" onChange={(e) => setFoto(e.target.files?.[0] ?? null)} /></div>
          </div>
          {msg && <p style={{ color: "#e23b53", fontSize: 13 }}>{msg}</p>}
          <button onClick={guardarPersona} disabled={busy} style={{ marginTop: 10, background: "var(--sc-btn,#f4a03f)", color: "#fff", border: "none", borderRadius: 9, padding: "9px 18px", fontWeight: 700, cursor: "pointer" }}>{busy ? "Guardando…" : "Guardar persona → registros maestros"}</button>
        </div>
      )}
      {abrir && tab === "vehiculo" && (
        <div style={{ border: "1px solid var(--sc-card-line)", borderRadius: 10, padding: 14, marginBottom: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12 }}>
            <div><label style={lbl}>Placas</label><input style={inp} value={v.placas} onChange={(e) => setV({ ...v, placas: e.target.value })} /></div>
            <div><label style={lbl}>Marca</label><input style={inp} value={v.marca} onChange={(e) => setV({ ...v, marca: e.target.value })} /></div>
            <div><label style={lbl}>Color</label><input style={inp} value={v.color} onChange={(e) => setV({ ...v, color: e.target.value })} /></div>
            <div><label style={lbl}>VIN (Serie)</label><input style={inp} value={v.vin} onChange={(e) => setV({ ...v, vin: e.target.value })} /></div>
            <div><label style={lbl}>Tarjeta de circulación</label><input style={inp} value={v.tarjeta_circulacion} onChange={(e) => setV({ ...v, tarjeta_circulacion: e.target.value })} /></div>
            <div style={{ gridColumn: "1 / -1" }}><label style={lbl}>Descripción</label><input style={inp} value={v.descripcion} onChange={(e) => setV({ ...v, descripcion: e.target.value })} /></div>
            <div><label style={lbl}>Foto</label><input type="file" accept="image/*" onChange={(e) => setFoto(e.target.files?.[0] ?? null)} /></div>
          </div>
          {msg && <p style={{ color: "#e23b53", fontSize: 13 }}>{msg}</p>}
          <button onClick={guardarVehiculo} disabled={busy} style={{ marginTop: 10, background: "var(--sc-btn,#f4a03f)", color: "#fff", border: "none", borderRadius: 9, padding: "9px 18px", fontWeight: 700, cursor: "pointer" }}>{busy ? "Guardando…" : "Guardar vehículo → registros maestros"}</button>
        </div>
      )}

      {tab === "persona" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {personas.map((r) => (
            <div key={r.id} style={card}>{thumb(r.fotografias)}<div style={{ flex: 1 }}><b>{[r.nombre, r.apellido_paterno, r.apellido_materno].filter(Boolean).join(" ")}</b><div style={{ fontSize: 12, color: "var(--sc-text-soft)" }}>{r.folio ?? ""}{r.sexo ? ` · ${r.sexo}` : ""}{r.ocupacion ? ` · ${r.ocupacion}` : ""}</div></div><a href={`/personas/${r.id}`} style={{ fontSize: 12.5, color: "var(--sc-btn,#f4a03f)", textDecoration: "none" }}>Ver ficha →</a></div>
          ))}
          {personas.length === 0 && <div style={{ color: "var(--sc-text-soft)", fontSize: 13, padding: 8 }}>Sin personas capturadas en el incidente.</div>}
        </div>
      )}
      {tab === "vehiculo" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {vehiculos.map((r) => (
            <div key={r.id} style={card}>{thumb(r.fotografias)}<div style={{ flex: 1 }}><b>{r.placas || r.vin || "Vehículo"}</b><div style={{ fontSize: 12, color: "var(--sc-text-soft)" }}>{r.folio ?? ""}{r.marca ? ` · ${r.marca}` : ""}{r.color ? ` · ${r.color}` : ""}{r.descripcion ? ` · ${r.descripcion}` : ""}</div></div><a href={`/vehiculos/${r.id}`} style={{ fontSize: 12.5, color: "var(--sc-btn,#f4a03f)", textDecoration: "none" }}>Ver ficha →</a></div>
          ))}
          {vehiculos.length === 0 && <div style={{ color: "var(--sc-text-soft)", fontSize: 13, padding: 8 }}>Sin vehículos capturados en el incidente.</div>}
        </div>
      )}
    </div>
  );
}
