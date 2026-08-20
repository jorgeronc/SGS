"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { CatalogoSelect } from "@/app/components/CatalogoSelect";
import { subirFotoArchivo, primeraFoto } from "@/lib/fotos";
import { personasSimilares, vehiculosSimilares, type RegistroSimilar } from "@/lib/duplicados";
import AvisoDuplicados from "@/app/components/AvisoDuplicados";

type TipoInv = "persona" | "vehiculo" | "ubicacion";

interface Involucrado {
  vinculoId: string;
  tipo: TipoInv;
  entidadId: string;
  etiqueta: string;
  participacion: string;
  fotoUrl: string | null;
  href: string;
}

const TABLA: Record<TipoInv, string> = { persona: "personas", vehiculo: "vehiculos", ubicacion: "ubicaciones" };
const CAT: Record<TipoInv, string> = { persona: "participacion_persona", vehiculo: "participacion_vehiculo", ubicacion: "participacion_lugar" };
const RUTA: Record<TipoInv, string> = { persona: "personas", vehiculo: "vehiculos", ubicacion: "ubicaciones" };

function etiqueta(tipo: TipoInv, r: any): string {
  if (tipo === "vehiculo") return `${r.placas ?? "s/placas"} · ${r.marca ?? ""} ${r.modelo ?? ""}`.trim();
  if (tipo === "ubicacion") return `${r.calle ?? ""} ${r.numero_exterior ?? ""}, ${r.colonia ?? ""}`.trim();
  return `${r.nombre ?? ""} ${r.apellido_paterno ?? ""} ${r.apellido_materno ?? ""}`.trim();
}

// Panel de INVOLUCRADOS del incidente: personas, vehículos y ubicaciones con su
// participación. Cada uno se guarda en su catálogo maestro (con su foto) y se
// vincula al incidente. Sustituye la sección de fotos suelta del incidente.
export default function InvolucradosPanel({ entidadTipo = "incidente", entidadId }: { entidadTipo?: string; entidadId: string }) {
  const [lista, setLista] = useState<Involucrado[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  // Formulario de alta
  const [tipo, setTipo] = useState<TipoInv>("persona");
  const [modo, setModo] = useState<"nuevo" | "existente">("nuevo");
  const [participacion, setParticipacion] = useState("");
  const [foto, setFoto] = useState<File | null>(null);
  const [guardando, setGuardando] = useState(false);

  // Campos de creación nueva
  const [pNombre, setPNombre] = useState("");
  const [pPat, setPPat] = useState("");
  const [pMat, setPMat] = useState("");
  const [pCurp, setPCurp] = useState("");
  const [vPlacas, setVPlacas] = useState("");
  const [vMarca, setVMarca] = useState("");
  const [vModelo, setVModelo] = useState("");
  const [vColor, setVColor] = useState("");
  const [uCalle, setUCalle] = useState("");
  const [uNumero, setUNumero] = useState("");
  const [uColonia, setUColonia] = useState("");

  // Vincular existente
  const [opciones, setOpciones] = useState<{ id: string; etiqueta: string }[]>([]);
  const [filtro, setFiltro] = useState("");
  const [existenteId, setExistenteId] = useState("");

  // Alerta de preexistencia (inteligencia)
  const [coincidencias, setCoincidencias] = useState<RegistroSimilar[]>([]);

  async function cargar() {
    setCargando(true);
    const { data, error } = await supabase
      .from("vinculos")
      .select("id, entidad_destino_tipo, entidad_destino_id, tipo_relacion")
      .eq("entidad_origen_tipo", entidadTipo)
      .eq("entidad_origen_id", entidadId)
      .eq("estatus", "activo")
      .in("entidad_destino_tipo", ["persona", "vehiculo", "ubicacion"]);
    if (error) { setError(error.message); setCargando(false); return; }

    const filas = (data as any[]) ?? [];
    const resuelto = await Promise.all(
      filas.map(async (v) => {
        const t = v.entidad_destino_tipo as TipoInv;
        const cols = t === "persona" ? "id, nombre, apellido_paterno, apellido_materno, fotografias"
          : t === "vehiculo" ? "id, placas, marca, modelo, fotografias"
          : "id, calle, numero_exterior, colonia, fotografias";
        const { data: e } = await supabase.from(TABLA[t]).select(cols).eq("id", v.entidad_destino_id).maybeSingle();
        return {
          vinculoId: v.id as string,
          tipo: t,
          entidadId: v.entidad_destino_id as string,
          etiqueta: e ? etiqueta(t, e) : v.entidad_destino_id,
          participacion: v.tipo_relacion as string,
          fotoUrl: e ? primeraFoto((e as any).fotografias) : null,
          href: `/${RUTA[t]}/${v.entidad_destino_id}`,
        } as Involucrado;
      })
    );
    setLista(resuelto);
    setCargando(false);
  }

  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, [entidadTipo, entidadId]);

  // Opciones para "vincular existente".
  useEffect(() => {
    if (modo !== "existente") return;
    const cols = tipo === "persona" ? "id, nombre, apellido_paterno, apellido_materno"
      : tipo === "vehiculo" ? "id, placas, marca, modelo" : "id, calle, numero_exterior, colonia";
    supabase.from(TABLA[tipo]).select(cols).eq("estatus", "activo").order("creado_en", { ascending: false }).limit(200)
      .then(({ data }) => setOpciones(((data as any[]) ?? []).map((r) => ({ id: r.id, etiqueta: etiqueta(tipo, r) }))));
    setExistenteId("");
  }, [modo, tipo]);

  // Alerta de preexistencia en vivo al capturar datos clave (persona/vehículo).
  useEffect(() => {
    if (modo !== "nuevo") { setCoincidencias([]); return; }
    const t = setTimeout(async () => {
      if (tipo === "persona" && (pNombre.trim().length >= 3 || pCurp.trim().length >= 5)) {
        setCoincidencias(await personasSimilares({ nombre: pNombre, apellido_paterno: pPat, curp: pCurp }));
      } else if (tipo === "vehiculo" && vPlacas.trim().length >= 3) {
        setCoincidencias(await vehiculosSimilares({ placas: vPlacas }));
      } else setCoincidencias([]);
    }, 450);
    return () => clearTimeout(t);
  }, [modo, tipo, pNombre, pPat, pCurp, vPlacas]);

  function limpiar() {
    setPNombre(""); setPPat(""); setPMat(""); setPCurp("");
    setVPlacas(""); setVMarca(""); setVModelo(""); setVColor("");
    setUCalle(""); setUNumero(""); setUColonia("");
    setFoto(null); setParticipacion(""); setExistenteId(""); setFiltro(""); setCoincidencias([]);
  }

  // Crea (o toma) la entidad maestra, le sube la foto y la vincula al incidente.
  async function agregar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!participacion) { setError("Indica la participación."); return; }
    setGuardando(true);

    // ojo: no reusar el nombre `entidadId` (prop = id del incidente); el id de
    // la entidad creada/seleccionada va en `destinoId`.
    let destinoId = existenteId;
    try {
      if (modo === "nuevo") {
        let payload: any = {};
        if (tipo === "persona") {
          if (!pNombre.trim()) { setError("Nombre requerido."); setGuardando(false); return; }
          payload = { nombre: pNombre.trim(), apellido_paterno: pPat.trim() || null, apellido_materno: pMat.trim() || null, curp: pCurp.trim() || null };
        } else if (tipo === "vehiculo") {
          if (!vPlacas.trim() && !vMarca.trim()) { setError("Indica placas o marca."); setGuardando(false); return; }
          payload = { placas: vPlacas.trim() || null, marca: vMarca.trim() || null, modelo: vModelo.trim() || null, color: vColor.trim() || null };
        } else {
          if (!uCalle.trim()) { setError("Indica al menos la calle."); setGuardando(false); return; }
          payload = { calle: uCalle.trim(), numero_exterior: uNumero.trim() || null, colonia: uColonia.trim() || null };
        }
        const { data, error: eIns } = await supabase.from(TABLA[tipo]).insert(payload).select("id").single();
        if (eIns || !data) { setError(eIns?.message ?? "No se pudo crear el registro."); setGuardando(false); return; }
        destinoId = data.id;
      }
      if (!destinoId) { setError("Selecciona o crea la entidad."); setGuardando(false); return; }

      // Foto → catálogo maestro de la entidad.
      if (foto) {
        const ruta = await subirFotoArchivo(TABLA[tipo], destinoId, foto);
        if (ruta) {
          const { data: cur } = await supabase.from(TABLA[tipo]).select("fotografias").eq("id", destinoId).maybeSingle();
          const previas = Array.isArray((cur as any)?.fotografias) ? (cur as any).fotografias : [];
          await supabase.from(TABLA[tipo]).update({ fotografias: [...previas, ruta], actualizado_en: new Date().toISOString() }).eq("id", destinoId);
        }
      }

      // Vínculo incidente → entidad con la participación.
      const { error: eVin } = await supabase.from("vinculos").insert({
        entidad_origen_tipo: entidadTipo, entidad_origen_id: entidadId,
        entidad_destino_tipo: tipo, entidad_destino_id: destinoId,
        tipo_relacion: participacion,
      });
      if (eVin) { setError(eVin.message); setGuardando(false); return; }

      limpiar();
      await cargar();
    } finally {
      setGuardando(false);
    }
  }

  async function quitar(vinculoId: string) {
    if (!window.confirm("¿Quitar este involucrado del incidente? (no borra el registro maestro)")) return;
    const { error } = await supabase.rpc("rpc_cancelar_registro", { p_tabla: "vinculos", p_id: vinculoId, p_motivo: "Retirado de involucrados del incidente" });
    if (error) { setError(error.message); return; }
    cargar();
  }

  const opcFiltradas = opciones.filter((o) => o.etiqueta.toLowerCase().includes(filtro.toLowerCase()));

  return (
    <>
      <h3>Involucrados</h3>
      <p className="dash-sub">Personas, vehículos y ubicaciones del incidente. Cada uno se guarda en su catálogo maestro y puedes adjuntarle una fotografía.</p>

      {cargando ? <p className="dash-sub">Cargando…</p> : lista.length === 0 ? (
        <p className="dash-sub">Sin involucrados todavía.</p>
      ) : (
        <div className="inv-grid">
          {lista.map((i) => (
            <div key={i.vinculoId} className="inv-card">
              {i.fotoUrl ? <img className="inv-foto" src={i.fotoUrl} alt={i.etiqueta} /> : <div className="inv-foto inv-noimg">{i.tipo === "persona" ? "☷" : i.tipo === "vehiculo" ? "▣" : "◉"}</div>}
              <div className="inv-body">
                <span className={`inv-tag inv-${i.tipo}`}>{i.tipo}</span>
                <span className="inv-part">{i.participacion}</span>
                <Link href={i.href} className="inv-nombre">{i.etiqueta || "(sin datos)"}</Link>
              </div>
              <button className="secundario inv-quitar" onClick={() => quitar(i.vinculoId)}>Quitar</button>
            </div>
          ))}
        </div>
      )}

      <h4 style={{ marginTop: 18 }}>Agregar involucrado</h4>
      <form onSubmit={agregar} className="inv-form">
        <div className="form-fila">
          <select value={tipo} onChange={(e) => { setTipo(e.target.value as TipoInv); setParticipacion(""); }}>
            <option value="persona">Persona</option>
            <option value="vehiculo">Vehículo</option>
            <option value="ubicacion">Ubicación / lugar</option>
          </select>
          <label className="check"><input type="radio" checked={modo === "nuevo"} onChange={() => setModo("nuevo")} /> Nuevo</label>
          <label className="check"><input type="radio" checked={modo === "existente"} onChange={() => setModo("existente")} /> Vincular existente</label>
        </div>

        {modo === "nuevo" ? (
          <div className="form-fila">
            {tipo === "persona" && (<>
              <input placeholder="Nombre(s)" value={pNombre} onChange={(e) => setPNombre(e.target.value)} />
              <input placeholder="Apellido paterno" value={pPat} onChange={(e) => setPPat(e.target.value)} />
              <input placeholder="Apellido materno" value={pMat} onChange={(e) => setPMat(e.target.value)} />
              <input placeholder="CURP (opcional)" value={pCurp} onChange={(e) => setPCurp(e.target.value)} />
            </>)}
            {tipo === "vehiculo" && (<>
              <input placeholder="Placas" value={vPlacas} onChange={(e) => setVPlacas(e.target.value)} />
              <input placeholder="Marca" value={vMarca} onChange={(e) => setVMarca(e.target.value)} />
              <input placeholder="Modelo" value={vModelo} onChange={(e) => setVModelo(e.target.value)} />
              <input placeholder="Color" value={vColor} onChange={(e) => setVColor(e.target.value)} />
            </>)}
            {tipo === "ubicacion" && (<>
              <input placeholder="Calle" value={uCalle} onChange={(e) => setUCalle(e.target.value)} />
              <input placeholder="Número ext." value={uNumero} onChange={(e) => setUNumero(e.target.value)} />
              <input placeholder="Colonia" value={uColonia} onChange={(e) => setUColonia(e.target.value)} />
            </>)}
          </div>
        ) : (
          <div className="form-fila">
            <input placeholder="Buscar…" value={filtro} onChange={(e) => setFiltro(e.target.value)} />
            <select value={existenteId} onChange={(e) => setExistenteId(e.target.value)}>
              <option value="">{opcFiltradas.length ? "— Selecciona —" : "Sin registros activos"}</option>
              {opcFiltradas.map((o) => (<option key={o.id} value={o.id}>{o.etiqueta || "(sin datos)"}</option>))}
            </select>
          </div>
        )}

        <div className="form-fila" style={{ alignItems: "center" }}>
          <label style={{ minWidth: 160 }}>Participación
            <CatalogoSelect categoria={CAT[tipo]} value={participacion} onChange={setParticipacion} placeholder="— Participación —" />
          </label>
          <label className="dash-sub" style={{ display: "flex", flexDirection: "column" }}>Fotografía (opcional)
            <input type="file" accept="image/*" capture="environment" onChange={(e) => setFoto(e.target.files?.[0] ?? null)} />
          </label>
          <button type="submit" disabled={guardando}>{guardando ? "Agregando…" : "+ Agregar al incidente"}</button>
        </div>

        {modo === "nuevo" && coincidencias.length > 0 && (
          <AvisoDuplicados titulo={`Preexistencia: ${tipo === "persona" ? "esta persona" : "este vehículo"} ya está en el sistema`} registros={coincidencias} />
        )}
      </form>

      {error && <p style={{ color: "#b00020" }}>{error}</p>}
    </>
  );
}
