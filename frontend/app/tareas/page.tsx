"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import ListaMaestra from "@/app/components/ListaMaestra";
import { CatalogoSelect } from "@/app/components/CatalogoSelect";
import DireccionGeocode from "@/app/components/DireccionGeocode";
import SelectorUnidades from "@/app/components/SelectorUnidades";

const BUCKET = "fotos";

function nombreArchivoSeguro(nombre: string): string {
  return nombre.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function NuevaTarea({ onCreado }: { onCreado: () => void }) {
  const [tipo, setTipo] = useState("");
  const [motivo, setMotivo] = useState("");
  const [asunto, setAsunto] = useState("");
  const [instrucciones, setInstrucciones] = useState("");
  const [direccion, setDireccion] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [prioridad, setPrioridad] = useState("media");
  const [todas, setTodas] = useState(true);
  const [seleccion, setSeleccion] = useState<string[]>([]);
  const [fotos, setFotos] = useState<File[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!tipo) { setError("Selecciona el tipo de tarea."); return; }
    if (!todas && seleccion.length === 0) { setError("Elige al menos una unidad o marca «Todas»."); return; }
    setGuardando(true);

    const { data, error: err } = await supabase
      .from("tareas")
      .insert({
        tipo,
        motivo: motivo || null,
        asunto: asunto || null,
        instrucciones: instrucciones || null,
        direccion: direccion || null,
        latitud: lat ? Number(lat) : null,
        longitud: lng ? Number(lng) : null,
        vigencia_desde: desde ? new Date(desde).toISOString() : new Date().toISOString(),
        vigencia_hasta: hasta ? new Date(hasta).toISOString() : null,
        prioridad,
      })
      .select("id")
      .single();

    if (err) { setError(err.message); setGuardando(false); return; }
    const tareaId = (data as any).id as string;

    // Sube las fotografías ya con el id de la tarea (misma ruta que FotosPanel,
    // para que el detalle las muestre y se puedan quitar desde ahí).
    if (fotos.length > 0) {
      const rutas: string[] = [];
      for (const f of fotos) {
        const ruta = `tareas/${tareaId}/${Date.now()}_${nombreArchivoSeguro(f.name)}`;
        const { error: errUp } = await supabase.storage
          .from(BUCKET)
          .upload(ruta, f, { upsert: false, contentType: f.type || undefined });
        if (!errUp) rutas.push(ruta);
      }
      if (rutas.length > 0) {
        await supabase.from("tareas")
          .update({ fotografias: rutas, actualizado_en: new Date().toISOString() })
          .eq("id", tareaId);
      }
      if (rutas.length < fotos.length) {
        setError(`Se subieron ${rutas.length} de ${fotos.length} fotografías.`);
      }
    }

    // Asigna y dispara la notificación push a cada unidad.
    const { data: n, error: errAsig } = await supabase.rpc("rpc_asignar_tarea", {
      p_tarea_id: (data as any).id,
      p_patrullas: todas ? null : seleccion,
    });
    setGuardando(false);
    if (errAsig) { setError(`Tarea creada, pero falló la asignación: ${errAsig.message}`); return; }
    if (!n) { setError("Tarea creada, pero no se asignó a ninguna unidad (¿hay unidades en servicio?)."); return; }

    setTipo(""); setMotivo(""); setAsunto(""); setInstrucciones("");
    setDireccion(""); setLat(""); setLng(""); setDesde(""); setHasta("");
    setPrioridad("media"); setTodas(true); setSeleccion([]); setFotos([]);
    onCreado();
  }

  return (
    <form onSubmit={crear}>
      <div className="form-grid">
        <label>Tipo de tarea
          <CatalogoSelect categoria="tipo_tarea" value={tipo} onChange={setTipo} placeholder="— Selecciona —" />
        </label>
        <label>Motivo
          <CatalogoSelect categoria="motivo_busqueda" value={motivo} onChange={setMotivo} placeholder="— Motivo —" />
        </label>
        <label>Prioridad
          <select value={prioridad} onChange={(e) => setPrioridad(e.target.value)}>
            <option value="alta">alta</option><option value="media">media</option><option value="baja">baja</option>
          </select>
        </label>
        <label>Vigente desde
          <input type="datetime-local" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </label>
        <label>Vigente hasta
          <input type="datetime-local" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </label>
      </div>

      <label className="dash-sub" style={{ display: "block", marginTop: 8 }}>Asunto (resumen corto)</label>
      <input value={asunto} onChange={(e) => setAsunto(e.target.value)} style={{ width: "100%" }}
        placeholder="Ej. Búsqueda de Juan Pérez, 32 años" />

      <label className="dash-sub" style={{ display: "block", marginTop: 8 }}>Lugar</label>
      <DireccionGeocode
        direccion={direccion} lat={lat} lng={lng}
        onDireccion={setDireccion}
        onCoords={(la, lo) => { setLat(la); setLng(lo); }}
        size={100}
      />

      <label className="dash-sub" style={{ display: "block", marginTop: 8 }}>Instrucciones</label>
      <textarea
        style={{ display: "block", width: "100%", minHeight: 80, resize: "vertical" }}
        placeholder="Qué debe hacer la unidad…"
        value={instrucciones}
        onChange={(e) => setInstrucciones(e.target.value)}
      />

      <label className="dash-sub" style={{ display: "block", marginTop: 8 }}>Fotografías</label>
      <input
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        onChange={(e) => setFotos(Array.from(e.target.files ?? []))}
      />
      {fotos.length > 0 && (
        <p className="dash-sub">
          {fotos.length} archivo(s) seleccionado(s): {fotos.map((f) => f.name).join(", ")}
        </p>
      )}

      <div style={{ marginTop: 10 }}>
        <SelectorUnidades todas={todas} setTodas={setTodas} seleccion={seleccion} setSeleccion={setSeleccion} />
      </div>

      {error && <p style={{ color: "#b00020" }}>{error}</p>}
      <div style={{ marginTop: 10 }}>
        <button type="submit" disabled={guardando}>
          {guardando ? "Creando…" : "Crear tarea y notificar"}
        </button>
        <span className="dash-sub" style={{ marginLeft: 10 }}>
          También puedes agregar o quitar fotografías después, en el detalle.
        </span>
      </div>
    </form>
  );
}

function vigenciaTexto(r: any): string {
  if (!r.vigencia_hasta) return "Sin vencimiento";
  const fin = new Date(r.vigencia_hasta);
  return `${fin.toLocaleString()}${fin < new Date() ? " (vencida)" : ""}`;
}

export default function TareasPage() {
  return (
    <ListaMaestra
      titulo="Tareas"
      subtitulo="Solicitudes de trabajo a las unidades en servicio"
      tabla="tareas"
      modulo="tareas"
      select="id, folio, tipo, motivo, asunto, direccion, prioridad, estado, vigencia_desde, vigencia_hasta, fotografias, estatus, creado_en"
      miniatura={(r) => r.fotografias}
      placeholderBuscar="Buscar folio, tipo, motivo o lugar…"
      columnas={[
        { header: "Folio", campo: "folio", celda: (r) => r.folio ?? "—" },
        { header: "Tipo", campo: "tipo", celda: (r) => r.tipo ?? "—" },
        { header: "Motivo", campo: "motivo", celda: (r) => r.motivo ?? "—" },
        { header: "Lugar", celda: (r) => r.direccion ?? "—" },
        { header: "Prioridad", campo: "prioridad", celda: (r) => r.prioridad ?? "—" },
        { header: "Vigencia", campo: "vigencia_hasta", celda: (r) => vigenciaTexto(r) },
        { header: "Estado", campo: "estado", celda: (r) => r.estado ?? "—" },
        { header: "Creada", campo: "creado_en", celda: (r) => new Date(r.creado_en).toLocaleDateString() },
      ]}
      textoBusqueda={(r) => `${r.folio ?? ""} ${r.tipo ?? ""} ${r.motivo ?? ""} ${r.asunto ?? ""} ${r.direccion ?? ""}`}
      detalleHref={(r) => `/tareas/${r.id}`}
      filtros={[
        { k: "vigentes", label: "Vigentes", test: (r) => !r.vigencia_hasta || new Date(r.vigencia_hasta) > new Date() },
        { k: "todos", label: "Todas" },
        { k: "abiertas", label: "Abiertas", test: (r) => r.estado === "abierta" },
        { k: "completadas", label: "Completadas", test: (r) => r.estado === "completada" },
      ]}
      filtrosAvanzados={[
        { campo: "tipo", label: "Tipo", tipo: "texto" },
        { campo: "prioridad", label: "Prioridad", tipo: "select", opciones: ["alta", "media", "baja"] },
      ]}
      quickView={(r) => (
        <>
          <h3 style={{ margin: "0 0 8px" }}>{r.folio ?? "Tarea"}</h3>
          <dl className="sc-kv">
            <dt>Tipo</dt><dd>{r.tipo ?? "—"}</dd>
            <dt>Motivo</dt><dd>{r.motivo ?? "—"}</dd>
            <dt>Asunto</dt><dd>{r.asunto ?? "—"}</dd>
            <dt>Lugar</dt><dd>{r.direccion ?? "—"}</dd>
            <dt>Prioridad</dt><dd>{r.prioridad}</dd>
            <dt>Vigencia</dt><dd>{vigenciaTexto(r)}</dd>
            <dt>Estado</dt><dd>{r.estado}</dd>
          </dl>
        </>
      )}
      nuevo={(onCreado) => <NuevaTarea onCreado={onCreado} />}
    />
  );
}
