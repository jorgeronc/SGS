"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import ListaMaestra from "@/app/components/ListaMaestra";
import { subirFotoArchivo } from "@/lib/fotos";
import { personasSimilares, type RegistroSimilar } from "@/lib/duplicados";
import AvisoDuplicados from "@/app/components/AvisoDuplicados";

function nombrePersona(p: any) {
  if (!p) return "—";
  return `${p.nombre ?? ""} ${p.apellido_paterno ?? ""} ${p.apellido_materno ?? ""}`.trim();
}

// El alta de Personal captura TODOS los datos de la persona + foto aquí mismo:
// crea el registro maestro en Personas (con la foto) y luego el de Personal
// ligado. Antes avisa si ya existen registros previos de esa persona (sin bloquear).
function NuevoPersonal({ onCreado }: { onCreado: () => void }) {
  const [nombre, setNombre] = useState("");
  const [apPaterno, setApPaterno] = useState("");
  const [apMaterno, setApMaterno] = useState("");
  const [curp, setCurp] = useState("");
  const [rfc, setRfc] = useState("");
  const [sexo, setSexo] = useState("");
  const [fnac, setFnac] = useState("");
  const [foto, setFoto] = useState<File | null>(null);
  const [placa, setPlaca] = useState("");
  const [rango, setRango] = useState("");
  const [adscripcion, setAdscripcion] = useState("");
  const [estado, setEstado] = useState("activo");
  const [error, setError] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const [avisos, setAvisos] = useState<RegistroSimilar[] | null>(null);
  const [coincidencias, setCoincidencias] = useState<RegistroSimilar[]>([]);

  // Alerta en vivo: mientras se captura CURP o nombre, avisar si esa persona
  // ya está registrada en el sistema (posibles antecedentes).
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

    // 1) Avisar de personas previas similares (no bloquea).
    const similares = await personasSimilares({ curp, nombre, apellido_paterno: apPaterno });

    // 2) Crear el registro maestro en Personas.
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

    // 3) Subir la foto (si hay) al registro de Personas.
    if (foto) {
      const ruta = await subirFotoArchivo("personas", persona.id, foto);
      if (ruta) await supabase.from("personas").update({ fotografias: [ruta] }).eq("id", persona.id);
    }

    // 4) Crear el registro de Personal ligado a esa persona.
    const { error: ePer } = await supabase.from("personal").insert({
      persona_id: persona.id,
      numero_placa: placa || null,
      rango: rango || null,
      adscripcion: adscripcion || null,
      estado_laboral: estado,
    });
    setCreando(false);
    if (ePer) { setError(ePer.message); return; }

    setAvisos(similares);
  }

  if (avisos !== null) {
    return (
      <div>
        <p style={{ color: "#0a7c2f", fontWeight: 700 }}>✔ Personal creado y agregado al índice de Personas.</p>
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

      <p className="dash-sub">Datos de empleo (Personal):</p>
      <div className="form-fila">
        <input placeholder="No. placa / matrícula" value={placa} onChange={(e) => setPlaca(e.target.value)} />
        <input placeholder="Rango" value={rango} onChange={(e) => setRango(e.target.value)} />
        <input placeholder="Adscripción" value={adscripcion} onChange={(e) => setAdscripcion(e.target.value)} />
        <select value={estado} onChange={(e) => setEstado(e.target.value)}>
          <option value="activo">Activo</option>
          <option value="licencia">Licencia</option>
          <option value="suspendido">Suspendido</option>
          <option value="baja">Baja</option>
        </select>
        <button type="submit" disabled={creando}>{creando ? "Creando…" : "Agregar personal"}</button>
      </div>
      {error && <p style={{ color: "#b00020" }}>{error}</p>}
    </form>
  );
}

export default function PersonalPage() {
  // CRP = patrulla asignada en el rol de servicio vigente. Se deriva de la vista
  // patrullas_en_servicio (personal_id -> número de patrulla); se actualiza solo
  // al crear/cambiar el rol de servicio.
  const [crpMap, setCrpMap] = useState<Record<string, string>>({});
  useEffect(() => {
    supabase.from("patrullas_en_servicio").select("personal_id, numero").then(({ data }) => {
      const m: Record<string, string> = {};
      ((data as any[]) ?? []).forEach((r) => { if (r.personal_id != null && r.numero != null) m[r.personal_id] = String(r.numero); });
      setCrpMap(m);
    });
  }, []);
  const crpDe = (r: any) => crpMap[r.id] ?? "—";

  return (
    <ListaMaestra
      titulo="Personal"
      subtitulo="Personal de la agencia (ligado a Personas)"
      tabla="personal"
      modulo="personal"
      select="id, numero_placa, rango, adscripcion, estado_laboral, estatus, creado_en, persona:personas(nombre, apellido_paterno, apellido_materno, fotografias)"
      miniatura={(r) => r.persona?.fotografias}
      placeholderBuscar="Buscar placa, rango, nombre…"
      columnas={[
        { header: "Placa", celda: (r) => r.numero_placa ?? "s/placa" },
        { header: "Nombre", celda: (r) => nombrePersona(r.persona) },
        { header: "CRP", celda: (r) => crpDe(r) },
        { header: "Rango", celda: (r) => r.rango ?? "—" },
        { header: "Adscripción", celda: (r) => r.adscripcion ?? "—" },
        { header: "Estado", celda: (r) => r.estado_laboral },
        { header: "Estatus", celda: (r) => <span className={r.estatus === "activo" ? "badge-activo" : "badge-cancelado"}>{r.estatus}</span> },
      ]}
      textoBusqueda={(r) => `${r.numero_placa ?? ""} ${r.rango ?? ""} ${nombrePersona(r.persona)}`}
      detalleHref={(r) => `/personal/${r.id}`}
      filtros={[
        { k: "todos", label: "Todos" },
        { k: "activos", label: "Activos", test: (r) => r.estado_laboral === "activo" && r.estatus === "activo" },
      ]}
      quickView={(r) => (
        <>
          <h3 style={{ margin: "0 0 8px" }}>{nombrePersona(r.persona)}</h3>
          <dl className="sc-kv">
            <dt>Placa</dt><dd>{r.numero_placa ?? "—"}</dd>
            <dt>CRP (rol de servicio)</dt><dd>{crpDe(r)}</dd>
            <dt>Rango</dt><dd>{r.rango ?? "—"}</dd>
            <dt>Adscripción</dt><dd>{r.adscripcion ?? "—"}</dd>
            <dt>Estado</dt><dd>{r.estado_laboral}</dd>
          </dl>
          <p style={{ marginTop: 10 }}><Link href={`/personal/${r.id}`} className="qbtn2">▤ Abrir expediente / Kardex →</Link></p>
        </>
      )}
      editar={[
        { campo: "numero_placa", label: "Placa / matrícula" },
        { campo: "rango", label: "Rango" },
        { campo: "adscripcion", label: "Adscripción" },
        { campo: "estado_laboral", label: "Estado laboral", tipo: "select", opciones: ["activo", "licencia", "suspendido", "baja"] },
      ]}
      nuevo={(onCreado) => <NuevoPersonal onCreado={onCreado} />}
    />
  );
}
