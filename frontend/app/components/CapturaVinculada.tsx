"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { CatalogoSelect } from "@/app/components/CatalogoSelect";
import { subirFotoArchivo, primeraFoto } from "@/lib/fotos";

type Tipo = "persona" | "vehiculo" | "evidencia";

const TABLA: Record<Tipo, string> = { persona: "personas", vehiculo: "vehiculos", evidencia: "evidencias" };
const RUTA: Record<Tipo, string> = { persona: "personas", vehiculo: "vehiculos", evidencia: "evidencias" };
const COLS: Record<Tipo, string> = {
  persona: "id, nombre, apellido_paterno, apellido_materno, fotografias",
  vehiculo: "id, placas, marca, modelo, fotografias",
  evidencia: "id, tipo, descripcion, fotografias",
};
const ICONO: Record<Tipo, string> = { persona: "☷", vehiculo: "▣", evidencia: "◧" };

function etiqueta(tipo: Tipo, r: any): string {
  if (tipo === "vehiculo") return `${r.placas ?? "s/placas"} · ${r.marca ?? ""} ${r.modelo ?? ""}`.trim();
  if (tipo === "evidencia") return `${r.tipo ?? "evidencia"}${r.descripcion ? ` · ${r.descripcion}` : ""}`.trim();
  return `${r.nombre ?? ""} ${r.apellido_paterno ?? ""} ${r.apellido_materno ?? ""}`.trim();
}

interface Fila { vinculoId: string; entidadId: string; etiqueta: string; foto: string | null; href: string; }

// Captura en línea de una persona / vehículo / evidencia dentro de una acción
// del informe: crea el registro en su TABLA MAESTRA (con su fotografía) y lo
// vincula al incidente con una participación (ENTREVISTADO, DETENIDO, ASEGURADO,
// OBJETO ENCONTRADO/FALTANTE…). Así queda cruzado y visible para búsquedas y IA.
export default function CapturaVinculada({
  incidenteId, origenTipo = "incidente", origenId, tipo, participacion, titulo, editable,
}: {
  incidenteId?: string;      // compatibilidad: equivale a origenTipo="incidente", origenId=incidenteId
  origenTipo?: string;       // "incidente" | "caso" | …
  origenId?: string;
  tipo: Tipo;
  participacion: string;
  titulo: string;
  editable: boolean;
}) {
  const oId = (origenId ?? incidenteId) as string;
  const [lista, setLista] = useState<Fila[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const [foto, setFoto] = useState<File | null>(null);
  const [p, setP] = useState<Record<string, string>>({});

  async function cargar() {
    const { data, error } = await supabase
      .from("vinculos")
      .select("id, entidad_destino_id")
      .eq("entidad_origen_tipo", origenTipo).eq("entidad_origen_id", oId)
      .eq("entidad_destino_tipo", tipo).eq("tipo_relacion", participacion).eq("estatus", "activo");
    if (error) { setError(error.message); return; }
    const filas = (data as any[]) ?? [];
    const res = await Promise.all(filas.map(async (v) => {
      const { data: e } = await supabase.from(TABLA[tipo]).select(COLS[tipo]).eq("id", v.entidad_destino_id).maybeSingle();
      return {
        vinculoId: v.id as string,
        entidadId: v.entidad_destino_id as string,
        etiqueta: e ? etiqueta(tipo, e) : (v.entidad_destino_id as string),
        foto: e ? primeraFoto((e as any).fotografias) : null,
        href: `/${RUTA[tipo]}/${v.entidad_destino_id}`,
      } as Fila;
    }));
    setLista(res);
  }

  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, [oId, origenTipo, tipo, participacion]);

  function campo(k: string) { return p[k] ?? ""; }
  function set(k: string, v: string) { setP((prev) => ({ ...prev, [k]: v })); }

  async function agregar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    let payload: any = {};
    if (tipo === "persona") {
      if (!campo("nombre").trim()) { setError("Nombre requerido."); return; }
      payload = {
        nombre: campo("nombre").trim(), apellido_paterno: campo("apellido_paterno").trim() || null,
        apellido_materno: campo("apellido_materno").trim() || null, curp: campo("curp").trim() || null,
        sexo: campo("sexo") || null, fecha_nacimiento: campo("fecha_nacimiento") || null,
      };
    } else if (tipo === "vehiculo") {
      if (!campo("placas").trim() && !campo("marca").trim()) { setError("Indica placas o marca."); return; }
      payload = {
        placas: campo("placas").trim() || null, marca: campo("marca").trim() || null,
        modelo: campo("modelo").trim() || null, color: campo("color").trim() || null,
        anio: campo("anio").trim() ? Number(campo("anio")) : null, tipo: campo("tipo").trim() || null,
      };
    } else {
      if (!campo("descripcion").trim() && !campo("tipo").trim()) { setError("Indica tipo o descripción."); return; }
      payload = { tipo: campo("tipo").trim() || null, descripcion: campo("descripcion").trim() || null };
    }

    setGuardando(true);
    try {
      const { data, error: eIns } = await supabase.from(TABLA[tipo]).insert(payload).select("id").single();
      if (eIns || !data) { setError(eIns?.message ?? "No se pudo crear el registro."); return; }
      const entId = data.id as string;

      if (foto) {
        const ruta = await subirFotoArchivo(TABLA[tipo], entId, foto);
        if (ruta) {
          const { data: cur } = await supabase.from(TABLA[tipo]).select("fotografias").eq("id", entId).maybeSingle();
          const prev = Array.isArray((cur as any)?.fotografias) ? (cur as any).fotografias : [];
          await supabase.from(TABLA[tipo]).update({ fotografias: [...prev, ruta], actualizado_en: new Date().toISOString() }).eq("id", entId);
        }
      }

      const { error: eVin } = await supabase.from("vinculos").insert({
        entidad_origen_tipo: origenTipo, entidad_origen_id: oId,
        entidad_destino_tipo: tipo, entidad_destino_id: entId, tipo_relacion: participacion,
      });
      if (eVin) { setError(eVin.message); return; }

      setP({}); setFoto(null); setAbierto(false);
      await cargar();
    } finally {
      setGuardando(false);
    }
  }

  async function quitar(vinculoId: string) {
    if (!window.confirm("¿Quitar este registro del informe? (no borra el registro maestro)")) return;
    const { error } = await supabase.rpc("rpc_cancelar_registro", { p_tabla: "vinculos", p_id: vinculoId, p_motivo: "Retirado del informe de incidente" });
    if (error) { setError(error.message); return; }
    cargar();
  }

  return (
    <div className="cap-vinc">
      <div className="cap-head">
        <b>{titulo}</b>
        {editable && <button type="button" className="qbtn2" onClick={() => setAbierto((a) => !a)}>{abierto ? "Cancelar" : "+ Agregar"}</button>}
      </div>

      {lista.length > 0 && (
        <div className="inv-grid">
          {lista.map((i) => (
            <div key={i.vinculoId} className="inv-card">
              {i.foto ? <img className="inv-foto" src={i.foto} alt={i.etiqueta} /> : <div className="inv-foto inv-noimg">{ICONO[tipo]}</div>}
              <div className="inv-body">
                <span className="inv-part">{participacion}</span>
                <Link href={i.href} className="inv-nombre">{i.etiqueta || "(sin datos)"}</Link>
              </div>
              {editable && <button className="secundario inv-quitar" onClick={() => quitar(i.vinculoId)}>Quitar</button>}
            </div>
          ))}
        </div>
      )}
      {lista.length === 0 && <p className="dash-sub">Sin registros.</p>}

      {abierto && editable && (
        <form onSubmit={agregar} className="inv-form" style={{ marginTop: 8 }}>
          {tipo === "persona" && (
            <div className="form-grid">
              <label>Nombre(s)<input value={campo("nombre")} onChange={(e) => set("nombre", e.target.value)} /></label>
              <label>Apellido paterno<input value={campo("apellido_paterno")} onChange={(e) => set("apellido_paterno", e.target.value)} /></label>
              <label>Apellido materno<input value={campo("apellido_materno")} onChange={(e) => set("apellido_materno", e.target.value)} /></label>
              <label>CURP<input value={campo("curp")} onChange={(e) => set("curp", e.target.value)} /></label>
              <label>Sexo<CatalogoSelect categoria="sexo" value={campo("sexo")} onChange={(v) => set("sexo", v)} /></label>
              <label>Fecha de nacimiento<input type="date" value={campo("fecha_nacimiento")} onChange={(e) => set("fecha_nacimiento", e.target.value)} /></label>
            </div>
          )}
          {tipo === "vehiculo" && (
            <div className="form-grid">
              <label>Placas<input value={campo("placas")} onChange={(e) => set("placas", e.target.value)} /></label>
              <label>Marca<input value={campo("marca")} onChange={(e) => set("marca", e.target.value)} /></label>
              <label>Modelo<input value={campo("modelo")} onChange={(e) => set("modelo", e.target.value)} /></label>
              <label>Color<input value={campo("color")} onChange={(e) => set("color", e.target.value)} /></label>
              <label>Año<input type="number" value={campo("anio")} onChange={(e) => set("anio", e.target.value)} /></label>
              <label>Tipo<input value={campo("tipo")} onChange={(e) => set("tipo", e.target.value)} /></label>
            </div>
          )}
          {tipo === "evidencia" && (
            <div className="form-grid">
              <label>Tipo de objeto<input value={campo("tipo")} onChange={(e) => set("tipo", e.target.value)} /></label>
              <label>Descripción<input value={campo("descripcion")} onChange={(e) => set("descripcion", e.target.value)} /></label>
            </div>
          )}
          <div className="form-fila" style={{ alignItems: "center" }}>
            <label className="dash-sub" style={{ display: "flex", flexDirection: "column" }}>Fotografía (cámara o galería)
              <input type="file" accept="image/*" capture="environment" onChange={(e) => setFoto(e.target.files?.[0] ?? null)} />
            </label>
            <button type="submit" disabled={guardando}>{guardando ? "Guardando…" : "Guardar y vincular"}</button>
          </div>
        </form>
      )}

      {error && <p style={{ color: "#b00020" }}>{error}</p>}
    </div>
  );
}
