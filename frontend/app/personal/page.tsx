"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import ListaMaestra from "@/app/components/ListaMaestra";
import { subirFotoArchivo } from "@/lib/fotos";
import { personasSimilares, type RegistroSimilar } from "@/lib/duplicados";
import AvisoDuplicados from "@/app/components/AvisoDuplicados";

const CATEGORIAS = [
  "Guardia intramuros", "Escolta", "Canino (K9)", "Monitorista / CCTV",
  "Custodia de valores", "Supervisor", "Jefe de turno",
];
const CONTROL = ["aprobado", "pendiente", "no_aprobado", "no_aplica"];

function nombrePersona(p: any) {
  if (!p) return "—";
  return `${p.nombre ?? ""} ${p.apellido_paterno ?? ""} ${p.apellido_materno ?? ""}`.trim();
}

// Muestra una vigencia con color: rojo si venció, naranja si vence en ≤30 días.
function Vigencia({ fecha }: { fecha: string | null }) {
  if (!fecha) return <span style={{ color: "#888" }}>—</span>;
  const d = new Date(fecha + "T00:00:00");
  const dias = Math.ceil((d.getTime() - Date.now()) / 86400000);
  const color = dias < 0 ? "#b00020" : dias <= 30 ? "#c46a00" : "#0a7c2f";
  const etq = dias < 0 ? " (vencida)" : dias <= 30 ? ` (${dias}d)` : "";
  return <span style={{ color, fontWeight: 600 }}>{d.toLocaleDateString()}{etq}</span>;
}

// Alta de Guardia: crea la persona (índice maestro) + el registro de personal
// ligado, con su categoría. El resto de campos (registro, control de confianza,
// portación, contacto) se completan en la edición de la ficha.
function NuevoGuardia({ onCreado }: { onCreado: () => void }) {
  const [nombre, setNombre] = useState("");
  const [apPaterno, setApPaterno] = useState("");
  const [apMaterno, setApMaterno] = useState("");
  const [curp, setCurp] = useState("");
  const [rfc, setRfc] = useState("");
  const [sexo, setSexo] = useState("");
  const [fnac, setFnac] = useState("");
  const [foto, setFoto] = useState<File | null>(null);
  const [gafete, setGafete] = useState("");
  const [categoria, setCategoria] = useState("");
  const [estado, setEstado] = useState("activo");
  const [error, setError] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const [avisos, setAvisos] = useState<RegistroSimilar[] | null>(null);
  const [coincidencias, setCoincidencias] = useState<RegistroSimilar[]>([]);

  useEffect(() => {
    const curpT = curp.trim(), nomT = nombre.trim();
    if (curpT.length < 5 && nomT.length < 3) { setCoincidencias([]); return; }
    const t = setTimeout(async () => {
      setCoincidencias(await personasSimilares({ curp: curpT, nombre: nomT, apellido_paterno: apPaterno }));
    }, 450);
    return () => clearTimeout(t);
  }, [curp, nombre, apPaterno]);

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!nombre.trim()) { setError("El nombre es obligatorio."); return; }
    setCreando(true);
    const similares = await personasSimilares({ curp, nombre, apellido_paterno: apPaterno });

    const { data: persona, error: eP } = await supabase.from("personas").insert({
      nombre: nombre.trim(),
      apellido_paterno: apPaterno || null,
      apellido_materno: apMaterno || null,
      curp: curp || null,
      rfc: rfc || null,
      sexo: sexo || null,
      fecha_nacimiento: fnac || null,
    }).select("id").single();
    if (eP || !persona) { setError(eP?.message ?? "No se pudo crear la persona."); setCreando(false); return; }

    if (foto) {
      const ruta = await subirFotoArchivo("personas", persona.id, foto);
      if (ruta) await supabase.from("personas").update({ fotografias: [ruta] }).eq("id", persona.id);
    }

    const { error: ePer } = await supabase.from("personal").insert({
      persona_id: persona.id,
      numero_placa: gafete || null,
      categoria: categoria || null,
      estado_laboral: estado,
    });
    setCreando(false);
    if (ePer) { setError(ePer.message); return; }
    setAvisos(similares);
  }

  if (avisos !== null) {
    return (
      <div>
        <p style={{ color: "#0a7c2f", fontWeight: 700 }}>✔ Guardia registrado y agregado al índice de Personas.</p>
        <AvisoDuplicados titulo="Esta persona ya estaba registrada en el sistema" registros={avisos} />
        <button onClick={onCreado} style={{ marginTop: 8 }}>Listo</button>
      </div>
    );
  }

  return (
    <form onSubmit={crear}>
      <p className="dash-sub">Datos de la persona (se crean en el índice de Personas):</p>
      <div className="form-fila">
        <input placeholder="Nombre(s)" value={nombre} onChange={(e) => setNombre(e.target.value)} required />
        <input placeholder="Apellido paterno" value={apPaterno} onChange={(e) => setApPaterno(e.target.value)} />
        <input placeholder="Apellido materno" value={apMaterno} onChange={(e) => setApMaterno(e.target.value)} />
        <select value={sexo} onChange={(e) => setSexo(e.target.value)}>
          <option value="">— Sexo —</option>
          <option value="HOMBRE">HOMBRE</option>
          <option value="MUJER">MUJER</option>
        </select>
      </div>
      <div className="form-fila">
        <input placeholder="CURP" value={curp} onChange={(e) => setCurp(e.target.value)} />
        <input placeholder="RFC" value={rfc} onChange={(e) => setRfc(e.target.value)} />
        <label className="dash-sub" style={{ display: "flex", flexDirection: "column" }}>Fecha de nacimiento
          <input type="date" value={fnac} onChange={(e) => setFnac(e.target.value)} />
        </label>
        <label className="dash-sub" style={{ display: "flex", flexDirection: "column" }}>Fotografía
          <input type="file" accept="image/*" onChange={(e) => setFoto(e.target.files?.[0] ?? null)} />
        </label>
      </div>
      <AvisoDuplicados titulo="Esta persona ya está registrada en el sistema" registros={coincidencias} />

      <p className="dash-sub">Datos del guardia:</p>
      <div className="form-fila">
        <input placeholder="No. de gafete / ID" value={gafete} onChange={(e) => setGafete(e.target.value)} />
        <select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
          <option value="">— Categoría —</option>
          {CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={estado} onChange={(e) => setEstado(e.target.value)}>
          <option value="activo">Activo</option>
          <option value="licencia">Licencia</option>
          <option value="suspendido">Suspendido</option>
          <option value="baja">Baja</option>
        </select>
        <button type="submit" disabled={creando}>{creando ? "Creando…" : "Agregar guardia"}</button>
      </div>
      {error && <p style={{ color: "#b00020" }}>{error}</p>}
    </form>
  );
}

export default function GuardiasPage() {
  return (
    <ListaMaestra
      titulo="Guardias"
      subtitulo="Guardias de seguridad (ligado a Personas)"
      tabla="personal"
      modulo="personal"
      select="id, numero_placa, categoria, registro_autoridad, registro_vigencia, control_confianza, control_confianza_vigencia, porta_arma, licencia_colectiva, contacto_emergencia_nombre, contacto_emergencia_tel, estado_laboral, estatus, creado_en, persona:personas(nombre, apellido_paterno, apellido_materno, fotografias)"
      miniatura={(r) => r.persona?.fotografias}
      placeholderBuscar="Buscar gafete, categoría, nombre…"
      columnas={[
        { header: "Gafete", celda: (r) => r.numero_placa ?? "s/gafete" },
        { header: "Nombre", celda: (r) => nombrePersona(r.persona) },
        { header: "Categoría", celda: (r) => r.categoria ?? "—" },
        { header: "Registro (vig.)", celda: (r) => <Vigencia fecha={r.registro_vigencia} /> },
        { header: "Control conf. (vig.)", celda: (r) => <Vigencia fecha={r.control_confianza_vigencia} /> },
        { header: "Arma", celda: (r) => (r.porta_arma ? "Sí" : "No") },
        { header: "Estado", celda: (r) => r.estado_laboral },
        { header: "Estatus", celda: (r) => <span className={r.estatus === "activo" ? "badge-activo" : "badge-cancelado"}>{r.estatus}</span> },
      ]}
      textoBusqueda={(r) => `${r.numero_placa ?? ""} ${r.categoria ?? ""} ${nombrePersona(r.persona)}`}
      detalleHref={(r) => `/personal/${r.id}`}
      filtros={[
        { k: "todos", label: "Todos" },
        { k: "activos", label: "Activos", test: (r) => r.estado_laboral === "activo" && r.estatus === "activo" },
        { k: "armados", label: "Armados", test: (r) => !!r.porta_arma },
        { k: "vencidos", label: "Vigencia vencida", test: (r) => {
          const hoy = new Date().toISOString().slice(0, 10);
          return (!!r.registro_vigencia && r.registro_vigencia < hoy) || (!!r.control_confianza_vigencia && r.control_confianza_vigencia < hoy);
        } },
      ]}
      quickView={(r) => (
        <>
          <h3 style={{ margin: "0 0 8px" }}>{nombrePersona(r.persona)}</h3>
          <dl className="sc-kv">
            <dt>Gafete / ID</dt><dd>{r.numero_placa ?? "—"}</dd>
            <dt>Categoría</dt><dd>{r.categoria ?? "—"}</dd>
            <dt>Registro autoridad</dt><dd>{r.registro_autoridad ?? "—"}</dd>
            <dt>Vigencia registro</dt><dd><Vigencia fecha={r.registro_vigencia} /></dd>
            <dt>Control y confianza</dt><dd>{r.control_confianza ?? "—"}</dd>
            <dt>Vigencia control</dt><dd><Vigencia fecha={r.control_confianza_vigencia} /></dd>
            <dt>Portación de arma</dt><dd>{r.porta_arma ? `Sí${r.licencia_colectiva ? ` · ${r.licencia_colectiva}` : ""}` : "No"}</dd>
            <dt>Contacto emergencia</dt><dd>{r.contacto_emergencia_nombre ? `${r.contacto_emergencia_nombre}${r.contacto_emergencia_tel ? ` · ${r.contacto_emergencia_tel}` : ""}` : "—"}</dd>
            <dt>Estado</dt><dd>{r.estado_laboral}</dd>
          </dl>
          <p style={{ marginTop: 10 }}><Link href={`/personal/${r.id}`} className="qbtn2">▤ Abrir expediente / capacitación →</Link></p>
        </>
      )}
      editar={[
        { campo: "numero_placa", label: "Gafete / ID" },
        { campo: "categoria", label: "Categoría", tipo: "select", opciones: CATEGORIAS },
        { campo: "estado_laboral", label: "Estado laboral", tipo: "select", opciones: ["activo", "licencia", "suspendido", "baja"] },
        { campo: "registro_autoridad", label: "Registro / credencial (autoridad)" },
        { campo: "registro_vigencia", label: "Vigencia del registro", tipo: "date" },
        { campo: "control_confianza", label: "Control y confianza", tipo: "select", opciones: CONTROL },
        { campo: "control_confianza_vigencia", label: "Vigencia control y confianza", tipo: "date" },
        { campo: "porta_arma", label: "Porta arma", tipo: "checkbox" },
        { campo: "licencia_colectiva", label: "Licencia colectiva (amparo)" },
        { campo: "contacto_emergencia_nombre", label: "Contacto de emergencia" },
        { campo: "contacto_emergencia_tel", label: "Tel. contacto de emergencia" },
      ]}
      nuevo={(onCreado) => <NuevoGuardia onCreado={onCreado} />}
    />
  );
}
