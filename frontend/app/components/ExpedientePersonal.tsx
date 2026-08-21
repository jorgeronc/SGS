"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { primeraFoto } from "@/lib/fotos";
import VinculosPanel from "@/app/components/VinculosPanel";
import type { BitacoraEntry } from "@/lib/types";

// Expediente del elemento = datos de empleo (Personal) + Kardex.
// Fusiona el módulo Personal con la vista de Kardex: una sola pantalla por elemento.

const PESTANAS = [
  { k: "resumen", label: "Resumen" },
  { k: "formacion", label: "Formación" },
  { k: "trayectoria", label: "Trayectoria" },
  { k: "confianza", label: "Control y confianza" },
  { k: "documental", label: "Expediente documental" },
  { k: "relaciones", label: "Relaciones" },
  { k: "auditoria", label: "Auditoría" },
];
const ESTADOS_LAB = ["activo", "licencia", "suspendido", "baja"];

type TipoCampo = "text" | "date" | "number" | "check" | "select";
interface Campo { k: string; label: string; tipo?: TipoCampo; opciones?: string[] }

function nombrePersona(p: any): string {
  if (!p) return "(elemento)";
  return `${p.nombre ?? ""} ${p.apellido_paterno ?? ""} ${p.apellido_materno ?? ""}`.trim();
}
function anios(desde: string | null): string {
  if (!desde) return "—";
  const a = Math.floor((Date.now() - new Date(desde).getTime()) / (365.25 * 24 * 3600 * 1000));
  return isFinite(a) ? `${a} años` : "—";
}
function aFecha(iso: string | null | undefined): string { return iso ? String(iso).slice(0, 10) : ""; }

function CampoInput({ campo, value, onChange }: { campo: Campo; value: any; onChange: (v: any) => void }) {
  if (campo.tipo === "check")
    return <label className="check" style={{ minWidth: 120 }}><input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} /> {campo.label}</label>;
  if (campo.tipo === "select")
    return (
      <select value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
        <option value="">{campo.label}</option>
        {(campo.opciones ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  return <input type={campo.tipo === "date" ? "date" : campo.tipo === "number" ? "number" : "text"} placeholder={campo.label} value={value ?? ""} onChange={(e) => onChange(e.target.value)} />;
}

function SeccionLista({ titulo, campos, items, onItems, editable }: { titulo: string; campos: Campo[]; items: any[]; onItems: (v: any[]) => void; editable: boolean }) {
  const [nuevo, setNuevo] = useState<Record<string, any>>({});
  const lista = Array.isArray(items) ? items : [];
  function agregar() {
    if (!campos.some((c) => { const v = nuevo[c.k]; return v !== "" && v != null && v !== false; })) return;
    onItems([...lista, nuevo]); setNuevo({});
  }
  const fmt = (v: any, c: Campo): ReactNode => (c.tipo === "check" ? (v ? "Sí" : "No") : (v ?? "—"));
  return (
    <div style={{ marginBottom: 20 }}>
      <div className="dash-eyebrow">{titulo}</div>
      {lista.length > 0 ? (
        <table className="sc-table">
          <thead><tr>{campos.map((c) => <th key={c.k}>{c.label}</th>)}{editable && <th></th>}</tr></thead>
          <tbody>
            {lista.map((it, i) => (
              <tr key={i}>
                {campos.map((c) => <td key={c.k}>{fmt(it[c.k], c)}</td>)}
                {editable && <td><button type="button" className="qbtn2" onClick={() => onItems(lista.filter((_, idx) => idx !== i))}>✕</button></td>}
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="dash-sub">Sin registros.</p>}
      {editable && (
        <div className="form-fila" style={{ marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
          {campos.map((c) => <CampoInput key={c.k} campo={c} value={nuevo[c.k]} onChange={(v) => setNuevo((p) => ({ ...p, [c.k]: v }))} />)}
          <button type="button" onClick={agregar}>+ Agregar</button>
        </div>
      )}
    </div>
  );
}

export default function ExpedientePersonal({ personalId }: { personalId: string }) {
  const [per, setPer] = useState<any | null>(null);       // registro de personal (+ persona)
  const [pe, setPe] = useState<any>({});                  // campos de empleo editables
  const [k, setK] = useState<any | null>(null);           // registro kardex
  const [f, setF] = useState<any>({});                    // kardex editable
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [tab, setTab] = useState("resumen");
  const [auditoria, setAuditoria] = useState<BitacoraEntry[]>([]);

  async function cargar() {
    const { data: p, error: e1 } = await supabase
      .from("personal")
      .select("*, persona:personas(nombre, apellido_paterno, apellido_materno, fecha_nacimiento, sexo, curp, rfc, fotografias)")
      .eq("id", personalId).maybeSingle();
    if (e1) { setError(e1.message); return; }
    if (!p) { setError("No se encontró el elemento."); return; }
    setPer(p);
    setPe({ numero_placa: p.numero_placa, rango: p.rango, adscripcion: p.adscripcion, estado_laboral: p.estado_laboral, fecha_ingreso: p.fecha_ingreso });

    // Kardex 1:1: buscar o crear.
    let { data: kx } = await supabase.from("kardex").select("*").eq("personal_id", personalId).eq("estatus", "activo").maybeSingle();
    if (!kx) {
      const { data: creado, error: e2 } = await supabase.from("kardex").insert({ personal_id: personalId }).select("*").single();
      if (e2) {
        // Posible carrera: reintenta la lectura.
        const r = await supabase.from("kardex").select("*").eq("personal_id", personalId).eq("estatus", "activo").maybeSingle();
        kx = r.data;
      } else kx = creado;
    }
    setK(kx); setF(kx ?? {});

    if (kx) {
      supabase.from("bitacora").select("*").eq("entidad_tipo", "kardex").eq("entidad_id", kx.id).order("creado_en", { ascending: false }).limit(50).then(({ data }) => setAuditoria((data as BitacoraEntry[]) ?? []));
      supabase.rpc("rpc_registrar_bitacora", { p_tipo_accion: "CONSULTAR", p_entidad_tipo: "kardex", p_entidad_id: kx.id, p_modulo: "personal" });
    }
  }
  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, [personalId]);

  const setK2 = (c: string, v: any) => setF((p: any) => ({ ...p, [c]: v }));
  const setPe2 = (c: string, v: any) => setPe((p: any) => ({ ...p, [c]: v }));

  async function guardar() {
    setGuardando(true); setError(null); setMensaje(null);
    const num = (v: any) => (v === "" || v == null ? null : Number(v));

    const { error: ep } = await supabase.from("personal").update({
      numero_placa: pe.numero_placa || null, rango: pe.rango || null, adscripcion: pe.adscripcion || null,
      estado_laboral: pe.estado_laboral || "activo", fecha_ingreso: pe.fecha_ingreso || null, actualizado_en: new Date().toISOString(),
    }).eq("id", personalId);
    if (ep) { setError(ep.message); setGuardando(false); return; }

    if (k) {
      const { error: ek } = await supabase.from("kardex").update({
        direccion: f.direccion || null, telefono: f.telefono || null, email: f.email || null,
        altura_cm: num(f.altura_cm), peso_kg: num(f.peso_kg), tipo_sangre: f.tipo_sangre || null,
        moscova: f.moscova || null, talla_camisa: f.talla_camisa || null, talla_pantalon: f.talla_pantalon || null, talla_zapato: f.talla_zapato || null,
        cup: f.cup || null, cup_requisitos: f.cup_requisitos || null, cup_fin_vigencia: f.cup_fin_vigencia || null,
        desempeno_puntaje: num(f.desempeno_puntaje), desempeno_productividad: f.desempeno_productividad || null, desempeno_fin_vigencia: f.desempeno_fin_vigencia || null,
        formacion: f.formacion ?? [], reconocimientos: f.reconocimientos ?? [], sanciones: f.sanciones ?? [],
        ascensos: f.ascensos ?? [], control_confianza: f.control_confianza ?? [], armas: f.armas ?? [], documentos: f.documentos ?? [],
        actualizado_en: new Date().toISOString(),
      }).eq("id", k.id);
      if (ek) { setError(ek.message); setGuardando(false); return; }
    }
    setGuardando(false); setMensaje("Expediente guardado."); cargar();
  }

  if (!per) return <div className="contenedor">{error ? <p style={{ color: "#b00020" }}>{error}</p> : <p>Cargando...</p>}</div>;
  const persona = per.persona;
  const editable = per.estatus === "activo";

  return (
    <div className="contenedor">
      <div className="sc-exp-head">
        <div className="f">{k?.folio ?? per.numero_placa ?? "s/folio"}</div>
        <h2>Expediente — {nombrePersona(persona)}</h2>
        <div className="sc-exp-meta">
          <div className="m"><div className="l">Grado</div><div className="v">{per.rango ?? "—"}</div></div>
          <div className="m"><div className="l">Matrícula</div><div className="v">{per.numero_placa ?? "—"}</div></div>
          <div className="m"><div className="l">Antigüedad</div><div className="v">{anios(per.fecha_ingreso)}</div></div>
          <div className="m"><div className="l">Estado</div><div className="v">{per.estado_laboral}</div></div>
          <div className="m"><div className="l">Estatus</div><div className="v"><span className={per.estatus === "activo" ? "badge-activo" : "badge-cancelado"}>{per.estatus}</span></div></div>
        </div>
      </div>

      <div className="sc-tabs">
        {PESTANAS.map((p) => (<button key={p.k} className={`sc-tab${tab === p.k ? " on" : ""}`} onClick={() => setTab(p.k)}>{p.label}</button>))}
      </div>

      <div className="sc-tabbody">
        {tab === "resumen" && (
          <>
            <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "flex-start" }}>
              {primeraFoto(persona?.fotografias) && <img src={primeraFoto(persona?.fotografias)!} alt="Foto" style={{ width: 150, height: 180, objectFit: "cover", objectPosition: "top", borderRadius: 8 }} />}
              <div style={{ flex: 1, minWidth: 260 }}>
                <div className="dash-eyebrow">Datos generales</div>
                <dl className="sc-kv">
                  <dt>Nombre</dt><dd>{nombrePersona(persona)}</dd>
                  <dt>Nacimiento</dt><dd>{persona?.fecha_nacimiento ? new Date(persona.fecha_nacimiento).toLocaleDateString() : "—"}</dd>
                  <dt>Género</dt><dd>{persona?.sexo ?? "—"}</dd>
                  <dt>CURP</dt><dd>{persona?.curp ?? "—"}</dd>
                  <dt>RFC</dt><dd>{persona?.rfc ?? "—"}</dd>
                </dl>
                <p className="dash-sub">Datos biográficos del <Link href="/personas">índice de personas</Link>.</p>
              </div>
            </div>

            <div className="dash-eyebrow">Datos de empleo</div>
            <div className="form-grid">
              <label>Grado<input value={pe.rango ?? ""} disabled={!editable} onChange={(e) => setPe2("rango", e.target.value)} /></label>
              <label>Matrícula<input value={pe.numero_placa ?? ""} disabled={!editable} onChange={(e) => setPe2("numero_placa", e.target.value)} /></label>
              <label>Adscripción<input value={pe.adscripcion ?? ""} disabled={!editable} onChange={(e) => setPe2("adscripcion", e.target.value)} /></label>
              <label>Fecha de ingreso<input type="date" value={aFecha(pe.fecha_ingreso)} disabled={!editable} onChange={(e) => setPe2("fecha_ingreso", e.target.value || null)} /></label>
              <label>Estado laboral
                <select value={pe.estado_laboral ?? "activo"} disabled={!editable} onChange={(e) => setPe2("estado_laboral", e.target.value)}>
                  {ESTADOS_LAB.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
            </div>

            <div className="dash-eyebrow">Contacto</div>
            <div className="form-grid">
              <label>Dirección<input value={f.direccion ?? ""} disabled={!editable} onChange={(e) => setK2("direccion", e.target.value)} /></label>
              <label>Teléfono<input value={f.telefono ?? ""} disabled={!editable} onChange={(e) => setK2("telefono", e.target.value)} /></label>
              <label>Email<input value={f.email ?? ""} disabled={!editable} onChange={(e) => setK2("email", e.target.value)} /></label>
            </div>

            <div className="dash-eyebrow">Datos fisiológicos</div>
            <div className="form-grid">
              <label>Altura (cm)<input value={f.altura_cm ?? ""} disabled={!editable} onChange={(e) => setK2("altura_cm", e.target.value)} /></label>
              <label>Peso (kg)<input value={f.peso_kg ?? ""} disabled={!editable} onChange={(e) => setK2("peso_kg", e.target.value)} /></label>
              <label>Tipo de sangre<input value={f.tipo_sangre ?? ""} disabled={!editable} onChange={(e) => setK2("tipo_sangre", e.target.value)} /></label>
              <label>Moscova<input value={f.moscova ?? ""} disabled={!editable} onChange={(e) => setK2("moscova", e.target.value)} /></label>
              <label>Camisa<input value={f.talla_camisa ?? ""} disabled={!editable} onChange={(e) => setK2("talla_camisa", e.target.value)} /></label>
              <label>Pantalón<input value={f.talla_pantalon ?? ""} disabled={!editable} onChange={(e) => setK2("talla_pantalon", e.target.value)} /></label>
              <label>Zapato<input value={f.talla_zapato ?? ""} disabled={!editable} onChange={(e) => setK2("talla_zapato", e.target.value)} /></label>
            </div>

            <div className="dash-eyebrow">CUP — Certificado Único Policial</div>
            <div className="form-grid">
              <label>CUP<input value={f.cup ?? ""} disabled={!editable} onChange={(e) => setK2("cup", e.target.value)} /></label>
              <label>Fin de vigencia<input type="date" value={aFecha(f.cup_fin_vigencia)} disabled={!editable} onChange={(e) => setK2("cup_fin_vigencia", e.target.value || null)} /></label>
            </div>
            <label>Requisitos cumplidos<textarea style={{ width: "100%", minHeight: 60 }} value={f.cup_requisitos ?? ""} disabled={!editable} onChange={(e) => setK2("cup_requisitos", e.target.value)} /></label>

            <div className="dash-eyebrow">Evaluación del desempeño</div>
            <div className="form-grid">
              <label>Puntaje<input type="number" value={f.desempeno_puntaje ?? ""} disabled={!editable} onChange={(e) => setK2("desempeno_puntaje", e.target.value)} /></label>
              <label>Productividad<input value={f.desempeno_productividad ?? ""} disabled={!editable} onChange={(e) => setK2("desempeno_productividad", e.target.value)} /></label>
              <label>Fin de vigencia<input type="date" value={aFecha(f.desempeno_fin_vigencia)} disabled={!editable} onChange={(e) => setK2("desempeno_fin_vigencia", e.target.value || null)} /></label>
            </div>
          </>
        )}

        {tab === "formacion" && (
          <SeccionLista titulo="Formación policial, académica y cursos" editable={editable}
            campos={[
              { k: "tipo", label: "Tipo", tipo: "select", opciones: ["Policial", "Académica", "Curso"] },
              { k: "institucion", label: "Institución" }, { k: "formacion", label: "Formación / Curso" },
              { k: "horas", label: "Horas" }, { k: "fecha_fin", label: "Fecha fin", tipo: "date" },
            ]}
            items={f.formacion} onItems={(v) => setK2("formacion", v)} />
        )}

        {tab === "trayectoria" && (
          <>
            <SeccionLista titulo="Reconocimientos y méritos" editable={editable}
              campos={[{ k: "reconocimiento", label: "Reconocimiento o mérito" }, { k: "fecha", label: "Fecha", tipo: "date" }]}
              items={f.reconocimientos} onItems={(v) => setK2("reconocimientos", v)} />
            <SeccionLista titulo="Sanciones disciplinarias" editable={editable}
              campos={[{ k: "sancion", label: "Sanción" }, { k: "tipo", label: "Tipo de sanción" }, { k: "fecha", label: "Fecha", tipo: "date" }]}
              items={f.sanciones} onItems={(v) => setK2("sanciones", v)} />
            <SeccionLista titulo="Ascensos y promociones" editable={editable}
              campos={[{ k: "ascenso", label: "Ascenso o promoción" }, { k: "resultado", label: "Resultado" }, { k: "grado", label: "Grado obtenido" }]}
              items={f.ascensos} onItems={(v) => setK2("ascensos", v)} />
          </>
        )}

        {tab === "confianza" && (
          <>
            <SeccionLista titulo="Control y confianza" editable={editable}
              campos={[{ k: "examen", label: "Examen o prueba" }, { k: "fecha", label: "Fecha de evaluación", tipo: "date" }, { k: "resultado", label: "Resultado" }]}
              items={f.control_confianza} onItems={(v) => setK2("control_confianza", v)} />
            <SeccionLista titulo="Porte de arma" editable={editable}
              campos={[{ k: "arma", label: "Arma" }, { k: "calibre", label: "Calibre" }, { k: "serie", label: "Serie" }]}
              items={f.armas} onItems={(v) => setK2("armas", v)} />
          </>
        )}

        {tab === "documental" && (
          <SeccionLista titulo="Expediente documental" editable={editable}
            campos={[{ k: "documento", label: "Documento" }, { k: "completo", label: "Completo", tipo: "check" }, { k: "fin_vigencia", label: "Fin de vigencia", tipo: "date" }]}
            items={f.documentos} onItems={(v) => setK2("documentos", v)} />
        )}

        {tab === "relaciones" && <VinculosPanel entidadTipo="personal" entidadId={personalId} />}

        {tab === "auditoria" && (
          auditoria.length === 0 ? <p className="dash-sub">Sin registros de auditoría visibles.</p> : (
            <table className="sc-table"><thead><tr><th>Fecha</th><th>Acción</th><th>Módulo</th></tr></thead>
              <tbody>{auditoria.map((a) => (<tr key={a.id}><td>{new Date(a.creado_en).toLocaleString()}</td><td>{a.tipo_accion}</td><td>{a.modulo ?? "—"}</td></tr>))}</tbody>
            </table>
          )
        )}

        {tab !== "auditoria" && tab !== "relaciones" && (
          <div style={{ marginTop: 14 }}>
            <button onClick={guardar} disabled={!editable || guardando}>{guardando ? "Guardando..." : "Guardar expediente"}</button>
            {mensaje && <span style={{ color: "#0a7c2f", marginLeft: 12 }}>{mensaje}</span>}
            {error && <span style={{ color: "#b00020", marginLeft: 12 }}>{error}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
