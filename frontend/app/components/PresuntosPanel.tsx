"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { Presunto } from "@/lib/types";
import { CatalogoSelect } from "./CatalogoSelect";
import CapturaVinculada from "./CapturaVinculada";
import FotosPanel from "./FotosPanel";

const VACIO = {
  nombre: "", apellido_paterno: "", apellido_materno: "",
  alias: "", sexo: "", complexion: "", estatura: "", color_piel: "",
  tatuajes: "", senas_particulares: "", producto_robo: "", notas: "",
};

function nombrePresunto(p: Presunto): string {
  const n = `${p.nombre ?? ""} ${p.apellido_paterno ?? ""} ${p.apellido_materno ?? ""}`.trim();
  return n || (p.alias ? `Alias: ${p.alias}` : "");
}

// Pestaña Presuntos de un caso: PERSONAS presuntas (media filiación + identificación
// + fotos) y, por separado, VEHÍCULOS presuntos (vinculados al caso vía CapturaVinculada).
export default function PresuntosPanel({ casoId, editable = true }: { casoId: string; editable?: boolean }) {
  const [presuntos, setPresuntos] = useState<Presunto[]>([]);
  const [vestOpts, setVestOpts] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [nuevo, setNuevo] = useState<any>({ ...VACIO });
  const [nuevoVest, setNuevoVest] = useState<string[]>([]);
  const [mostrarAlta, setMostrarAlta] = useState(false);

  async function cargar() {
    const { data, error } = await supabase.from("presuntos").select("*").eq("caso_id", casoId).order("creado_en", { ascending: true });
    if (error) { setError(error.message); return; }
    setPresuntos(data as Presunto[]);
  }

  useEffect(() => {
    cargar();
    supabase.from("cat_opciones").select("valor").eq("categoria", "vestimenta").eq("activo", true).order("orden")
      .then(({ data }) => setVestOpts(((data as any[]) ?? []).map((o) => o.valor)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [casoId]);

  const num = (v: any) => (v === "" || v == null ? null : Number(v));

  async function agregar() {
    setError(null);
    const { error } = await supabase.from("presuntos").insert({
      caso_id: casoId,
      nombre: nuevo.nombre || null, apellido_paterno: nuevo.apellido_paterno || null, apellido_materno: nuevo.apellido_materno || null,
      alias: nuevo.alias || null, sexo: nuevo.sexo || null, complexion: nuevo.complexion || null,
      estatura: num(nuevo.estatura), color_piel: nuevo.color_piel || null, vestimenta: nuevoVest.join(", ") || null,
      tatuajes: nuevo.tatuajes || null, senas_particulares: nuevo.senas_particulares || null,
      producto_robo: nuevo.producto_robo || null, notas: nuevo.notas || null,
    });
    if (error) { setError(error.message); return; }
    setNuevo({ ...VACIO }); setNuevoVest([]); setMostrarAlta(false);
    cargar();
  }

  async function guardar(p: Presunto, vest: string[]) {
    setError(null);
    const { error } = await supabase.from("presuntos").update({
      nombre: p.nombre || null, apellido_paterno: p.apellido_paterno || null, apellido_materno: p.apellido_materno || null,
      alias: p.alias || null, sexo: p.sexo || null, complexion: p.complexion || null,
      estatura: num(p.estatura), color_piel: p.color_piel || null, vestimenta: vest.join(", ") || null,
      tatuajes: p.tatuajes || null, senas_particulares: p.senas_particulares || null,
      producto_robo: p.producto_robo || null, notas: p.notas || null, actualizado_en: new Date().toISOString(),
    }).eq("id", p.id);
    if (error) { setError(error.message); return; }
    setAbierto(null); cargar();
  }

  async function cancelar(id: string) {
    const motivo = window.prompt("Motivo de la baja del presunto:");
    if (motivo === null) return;
    const { error } = await supabase.rpc("rpc_cancelar_registro", { p_tabla: "presuntos", p_id: id, p_motivo: motivo });
    if (error) { setError(error.message); return; }
    cargar();
  }

  return (
    <>
      <h3>Personas presuntas</h3>
      {error && <p style={{ color: "#b00020" }}>{error}</p>}

      {presuntos.map((p, i) => (
        <PresuntoCard key={p.id} p={p} indice={i + 1} vestOpts={vestOpts} editable={editable}
          abierto={abierto === p.id} onAbrir={() => setAbierto(abierto === p.id ? null : p.id)}
          onGuardar={guardar} onCancelar={() => cancelar(p.id)} />
      ))}
      {presuntos.length === 0 && <p style={{ color: "#555" }}>Sin personas presuntas registradas.</p>}

      {editable && (mostrarAlta ? (
        <div className="presunto-form">
          <h4>Nueva persona presunta</h4>
          <CamposPresunto valor={nuevo} setValor={setNuevo} vest={nuevoVest} setVest={setNuevoVest} vestOpts={vestOpts} />
          <button onClick={agregar}>Guardar persona presunta</button>{" "}
          <button className="secundario" onClick={() => setMostrarAlta(false)}>Cancelar</button>
        </div>
      ) : (
        <button onClick={() => setMostrarAlta(true)}>+ Agregar persona presunta</button>
      ))}

      <h3 style={{ marginTop: 22 }}>Vehículos presuntos</h3>
      <CapturaVinculada origenTipo="caso" origenId={casoId} tipo="vehiculo" participacion="VEHÍCULO PRESUNTO" titulo="Vehículos presuntos" editable={editable} />
    </>
  );
}

function PresuntoCard({ p, indice, vestOpts, editable, abierto, onAbrir, onGuardar, onCancelar }: {
  p: Presunto; indice: number; vestOpts: string[]; editable: boolean;
  abierto: boolean; onAbrir: () => void; onGuardar: (p: Presunto, vest: string[]) => void; onCancelar: () => void;
}) {
  const [edit, setEdit] = useState<Presunto>(p);
  const [vest, setVest] = useState<string[]>((p.vestimenta ?? "").split(",").map((s) => s.trim()).filter(Boolean));
  useEffect(() => {
    setEdit(p);
    setVest((p.vestimenta ?? "").split(",").map((s) => s.trim()).filter(Boolean));
  }, [p]);

  const titulo = nombrePresunto(p);
  return (
    <div className="presunto-form">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <strong>
          Presunto {indice}{titulo ? ` — ${titulo}` : ""}{" "}
          <span className={p.estatus === "activo" ? "badge-activo" : "badge-cancelado"}>{p.estatus}</span>
        </strong>
        <span>
          <button onClick={onAbrir}>{abierto ? "Cerrar" : "Editar"}</button>{" "}
          {editable && p.estatus === "activo" && <button className="secundario" onClick={onCancelar}>Baja</button>}
        </span>
      </div>
      {!abierto && (
        <p style={{ fontSize: 13, color: "#555", margin: "6px 0 0" }}>
          {[p.sexo, p.complexion, p.color_piel].filter(Boolean).join(" · ") || "Sin media filiación"}
        </p>
      )}
      {abierto && (
        <>
          <CamposPresunto valor={edit} setValor={setEdit as any} vest={vest} setVest={setVest} vestOpts={vestOpts} />
          <button onClick={() => onGuardar(edit, vest)} disabled={!editable || p.estatus !== "activo"}>Guardar</button>
          <div style={{ marginTop: 8 }}>
            <FotosPanel tabla="presuntos" id={p.id} />
          </div>
        </>
      )}
    </div>
  );
}

function CamposPresunto({ valor, setValor, vest, setVest, vestOpts }: {
  valor: any; setValor: (v: any) => void; vest: string[]; setVest: (v: string[]) => void; vestOpts: string[];
}) {
  const s = (k: string, v: any) => setValor({ ...valor, [k]: v });
  const toggle = (o: string) => setVest(vest.includes(o) ? vest.filter((x) => x !== o) : [...vest, o]);

  return (
    <>
      <p style={{ fontSize: 13, margin: "0 0 4px", fontWeight: 600 }}>Identificación (si se conoce)</p>
      <div className="form-grid">
        <label>Nombre(s)<input value={valor.nombre ?? ""} onChange={(e) => s("nombre", e.target.value)} /></label>
        <label>Apellido paterno<input value={valor.apellido_paterno ?? ""} onChange={(e) => s("apellido_paterno", e.target.value)} /></label>
        <label>Apellido materno<input value={valor.apellido_materno ?? ""} onChange={(e) => s("apellido_materno", e.target.value)} /></label>
        <label>Alias<input value={valor.alias ?? ""} onChange={(e) => s("alias", e.target.value)} /></label>
      </div>
      <p style={{ fontSize: 13, margin: "8px 0 4px", fontWeight: 600 }}>Media filiación</p>
      <div className="form-grid">
        <label>Sexo<CatalogoSelect categoria="sexo" value={valor.sexo ?? ""} onChange={(v) => s("sexo", v)} /></label>
        <label>Complexión<CatalogoSelect categoria="complexion" value={valor.complexion ?? ""} onChange={(v) => s("complexion", v)} /></label>
        <label>Estatura (cm)<input value={valor.estatura ?? ""} onChange={(e) => s("estatura", e.target.value)} /></label>
        <label>Color de piel<CatalogoSelect categoria="color_piel" value={valor.color_piel ?? ""} onChange={(v) => s("color_piel", v)} /></label>
      </div>
      <p style={{ fontSize: 13, margin: "4px 0" }}>Vestimenta:</p>
      <div>
        {vestOpts.map((o) => (
          <label key={o} className="check"><input type="checkbox" checked={vest.includes(o)} onChange={() => toggle(o)} /> {o}</label>
        ))}
      </div>
      <div className="form-grid">
        <label>Tatuajes<input value={valor.tatuajes ?? ""} onChange={(e) => s("tatuajes", e.target.value)} /></label>
        <label>Señas particulares<input value={valor.senas_particulares ?? ""} onChange={(e) => s("senas_particulares", e.target.value)} /></label>
        <label>Producto del robo<input value={valor.producto_robo ?? ""} onChange={(e) => s("producto_robo", e.target.value)} /></label>
      </div>
      <textarea style={{ width: "100%", minHeight: 40 }} placeholder="Notas" value={valor.notas ?? ""} onChange={(e) => s("notas", e.target.value)} />
    </>
  );
}
