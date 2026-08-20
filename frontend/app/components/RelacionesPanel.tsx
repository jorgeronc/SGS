"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { CatalogoSelect } from "./CatalogoSelect";
import InvestigacionPersona from "./InvestigacionPersona";

interface Rel {
  id: string;
  persona_id: string;
  con_tipo: "victima" | "presunto";
  con_persona_id: string | null;
  con_presunto_id: string | null;
  parentesco: string | null;
  notas: string | null;
  estatus: string;
  persona?: { nombre: string | null; apellido_paterno: string | null; apellido_materno: string | null } | null;
}
interface Opc { id: string; etiqueta: string; }

function nombrePersona(p: any): string {
  return `${p?.nombre ?? ""} ${p?.apellido_paterno ?? ""} ${p?.apellido_materno ?? ""}`.trim() || "(sin nombre)";
}

// Pestaña Relaciones de un caso: personas con parentesco/tipo de relación con la
// VÍCTIMA o con el PRESUNTO (ya identificado). Cada persona relacionada se crea en
// el índice maestro y trae su bloque de investigación.
export default function RelacionesPanel({ casoId, editable }: { casoId: string; editable: boolean }) {
  const [rels, setRels] = useState<Rel[]>([]);
  const [victimas, setVictimas] = useState<Opc[]>([]);
  const [presuntos, setPresuntos] = useState<Opc[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [abierto, setAbierto] = useState(false);

  // Alta
  const [nom, setNom] = useState(""); const [apP, setApP] = useState(""); const [apM, setApM] = useState("");
  const [parentesco, setParentesco] = useState("");
  const [conTipo, setConTipo] = useState<"victima" | "presunto">("victima");
  const [conId, setConId] = useState("");
  const [notas, setNotas] = useState("");
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    const { data, error } = await supabase
      .from("caso_relaciones")
      // caso_relaciones tiene 2 FK a personas (persona_id y con_persona_id): se
      // desambigua el embed indicando la columna persona_id.
      .select("*, persona:personas!persona_id(nombre, apellido_paterno, apellido_materno)")
      .eq("caso_id", casoId).eq("estatus", "activo")
      .order("creado_en", { ascending: true });
    if (error) { setError(error.message); return; }
    setRels((data as Rel[]) ?? []);
  }, [casoId]);

  const cargarObjetivos = useCallback(async () => {
    // Víctimas / personas del caso (vinculos caso -> persona).
    const { data: vin } = await supabase.from("vinculos")
      .select("entidad_destino_id")
      .eq("entidad_origen_tipo", "caso").eq("entidad_origen_id", casoId)
      .eq("entidad_destino_tipo", "persona").eq("estatus", "activo");
    const ids = Array.from(new Set(((vin as any[]) ?? []).map((v) => v.entidad_destino_id)));
    let vic: Opc[] = [];
    if (ids.length) {
      const { data: pers } = await supabase.from("personas").select("id, nombre, apellido_paterno, apellido_materno").in("id", ids);
      vic = ((pers as any[]) ?? []).map((p) => ({ id: p.id, etiqueta: nombrePersona(p) }));
    }
    setVictimas(vic);
    // Presuntos identificados del caso (con nombre).
    const { data: pre } = await supabase.from("presuntos")
      .select("id, nombre, apellido_paterno, apellido_materno, alias")
      .eq("caso_id", casoId).eq("estatus", "activo");
    setPresuntos(((pre as any[]) ?? [])
      .filter((p) => (p.nombre ?? "").trim() || (p.alias ?? "").trim())
      .map((p) => ({ id: p.id, etiqueta: nombrePersona(p) !== "(sin nombre)" ? nombrePersona(p) : `Alias: ${p.alias}` })));
  }, [casoId]);

  useEffect(() => { cargar(); cargarObjetivos(); }, [cargar, cargarObjetivos]);

  const objetivos = conTipo === "victima" ? victimas : presuntos;

  async function agregar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!nom.trim()) { setError("Nombre de la persona requerido."); return; }
    setGuardando(true);
    try {
      const { data: per, error: eP } = await supabase.from("personas")
        .insert({ nombre: nom.trim(), apellido_paterno: apP.trim() || null, apellido_materno: apM.trim() || null })
        .select("id").single();
      if (eP || !per) { setError(eP?.message ?? "No se pudo crear la persona."); return; }
      const { error: eR } = await supabase.from("caso_relaciones").insert({
        caso_id: casoId, persona_id: per.id, con_tipo: conTipo,
        con_persona_id: conTipo === "victima" ? (conId || null) : null,
        con_presunto_id: conTipo === "presunto" ? (conId || null) : null,
        parentesco: parentesco || null, notas: notas || null,
      });
      if (eR) { setError(eR.message); return; }
      setNom(""); setApP(""); setApM(""); setParentesco(""); setConId(""); setNotas(""); setAbierto(false);
      await cargar();
    } finally { setGuardando(false); }
  }

  async function baja(id: string) {
    const motivo = window.prompt("Motivo de la baja de la relación:");
    if (motivo === null) return;
    const { error } = await supabase.rpc("rpc_cancelar_registro", { p_tabla: "caso_relaciones", p_id: id, p_motivo: motivo });
    if (error) { setError(error.message); return; }
    cargar();
  }

  function etiquetaCon(r: Rel): string {
    if (r.con_tipo === "victima") return victimas.find((v) => v.id === r.con_persona_id)?.etiqueta ?? "víctima";
    return presuntos.find((p) => p.id === r.con_presunto_id)?.etiqueta ?? "presunto";
  }

  return (
    <>
      <p className="dash-sub">
        Personas con parentesco o relación con la <strong>víctima</strong> o con el <strong>presunto</strong> (una vez
        identificado con nombre). Cada persona se registra en el índice y trae su ficha de investigación.
      </p>
      {error && <p style={{ color: "#b00020" }}>{error}</p>}

      {rels.map((r) => (
        <div key={r.id} className="presunto-form">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <strong>
              {nombrePersona(r.persona)}
              {r.parentesco ? ` — ${r.parentesco}` : ""}{" "}
              <span className="dash-sub">({r.con_tipo === "victima" ? "con la víctima" : "con el presunto"}: {etiquetaCon(r)})</span>
            </strong>
            {editable && <button className="secundario" onClick={() => baja(r.id)}>Baja</button>}
          </div>
          {r.notas && <p style={{ fontSize: 13, color: "#555", margin: "4px 0 0" }}>{r.notas}</p>}
          <InvestigacionPersona personaId={r.persona_id} editable={editable} />
        </div>
      ))}
      {rels.length === 0 && <p style={{ color: "#555" }}>Sin relaciones registradas.</p>}

      {editable && (abierto ? (
        <form onSubmit={agregar} className="presunto-form">
          <h4>Nueva relación</h4>
          <div className="form-grid">
            <label>Nombre(s)<input value={nom} onChange={(e) => setNom(e.target.value)} /></label>
            <label>Apellido paterno<input value={apP} onChange={(e) => setApP(e.target.value)} /></label>
            <label>Apellido materno<input value={apM} onChange={(e) => setApM(e.target.value)} /></label>
            <label>Parentesco / relación<CatalogoSelect categoria="parentesco" value={parentesco} onChange={setParentesco} /></label>
            <label>Relación con
              <select value={conTipo} onChange={(e) => { setConTipo(e.target.value as any); setConId(""); }}>
                <option value="victima">La víctima</option>
                <option value="presunto">El presunto</option>
              </select>
            </label>
            <label>{conTipo === "victima" ? "Víctima del caso" : "Presunto del caso"}
              <select value={conId} onChange={(e) => setConId(e.target.value)}>
                <option value="">— Selecciona —</option>
                {objetivos.map((o) => (<option key={o.id} value={o.id}>{o.etiqueta}</option>))}
              </select>
            </label>
          </div>
          <textarea style={{ width: "100%", minHeight: 40, marginTop: 6 }} placeholder="Notas" value={notas} onChange={(e) => setNotas(e.target.value)} />
          <div style={{ marginTop: 8 }}>
            <button type="submit" disabled={guardando}>{guardando ? "Guardando…" : "Guardar relación"}</button>{" "}
            <button type="button" className="secundario" onClick={() => setAbierto(false)}>Cancelar</button>
          </div>
          {objetivos.length === 0 && (
            <p className="dash-sub" style={{ marginTop: 6 }}>
              {conTipo === "victima" ? "Aún no hay personas (víctimas) en el caso — agrégalas en Involucrados." : "Aún no hay presuntos identificados (con nombre) en el caso."}
            </p>
          )}
        </form>
      ) : (
        <button onClick={() => setAbierto(true)}>+ Agregar relación</button>
      ))}
    </>
  );
}
