"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import ListaMaestra from "@/app/components/ListaMaestra";
import { CatalogoSelect } from "@/app/components/CatalogoSelect";
import DireccionGeocode from "@/app/components/DireccionGeocode";

const BUCKET = "fotos";

function nombreArchivoSeguro(nombre: string): string {
  return nombre.replace(/[^a-zA-Z0-9._-]/g, "_");
}
function nombreGuardia(p: any): string {
  const x = p?.persona ?? p;
  return x ? `${x.nombre ?? ""} ${x.apellido_paterno ?? ""} ${x.apellido_materno ?? ""}`.trim() : "—";
}

// Alta de tarea para GUARDIAS: se asigna a guardias específicos o a todos los del
// un sitio (turno vigente hoy). El guardia la ve en el móvil, en "Mis tareas".
function NuevaTarea({ onCreado }: { onCreado: () => void }) {
  const [tipo, setTipo] = useState("");
  const [asunto, setAsunto] = useState("");
  const [instrucciones, setInstrucciones] = useState("");
  const [direccion, setDireccion] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [prioridad, setPrioridad] = useState("media");
  const [fotos, setFotos] = useState<File[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Asignación: por sitio (todos sus guardias hoy) o por guardias específicos.
  const [modo, setModo] = useState<"sitio" | "guardias">("sitio");
  const [sitios, setSitios] = useState<any[]>([]);
  const [guardias, setGuardias] = useState<any[]>([]);
  const [sitioSel, setSitioSel] = useState("");
  const [guardiaSel, setGuardiaSel] = useState<string[]>([]);

  useEffect(() => {
    supabase.from("sitios").select("id, nombre").eq("estatus", "activo").order("nombre")
      .then(({ data }) => setSitios((data as any[]) ?? []));
    supabase.from("personal").select("id, persona:personas(nombre, apellido_paterno, apellido_materno)")
      .eq("estatus", "activo").eq("estado_laboral", "activo").order("id")
      .then(({ data }) => setGuardias((data as any[]) ?? []));
  }, []);

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!tipo) { setError("Selecciona el tipo de tarea."); return; }
    if (modo === "sitio" && !sitioSel) { setError("Elige el sitio al que se asigna la tarea."); return; }
    if (modo === "guardias" && guardiaSel.length === 0) { setError("Elige al menos un guardia."); return; }
    setGuardando(true);

    const { data, error: err } = await supabase
      .from("tareas")
      .insert({
        tipo,
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

    // Fotografías (misma ruta que el detalle).
    if (fotos.length > 0) {
      const rutas: string[] = [];
      for (const f of fotos) {
        const ruta = `tareas/${tareaId}/${Date.now()}_${nombreArchivoSeguro(f.name)}`;
        const { error: errUp } = await supabase.storage.from(BUCKET).upload(ruta, f, { upsert: false, contentType: f.type || undefined });
        if (!errUp) rutas.push(ruta);
      }
      if (rutas.length > 0) {
        await supabase.from("tareas").update({ fotografias: rutas, actualizado_en: new Date().toISOString() }).eq("id", tareaId);
      }
    }

    // Asigna a guardias (por id y/o por sitio) y dispara la notificación push.
    const { data: n, error: errAsig } = await supabase.rpc("rpc_asignar_tarea_guardias", {
      p_tarea_id: tareaId,
      p_personal: modo === "guardias" ? guardiaSel : null,
      p_sitio: modo === "sitio" ? sitioSel : null,
    });
    setGuardando(false);
    if (errAsig) { setError(`Tarea creada, pero falló la asignación: ${errAsig.message}`); return; }
    if (!n) { setError(modo === "sitio" ? "Tarea creada, pero ese sitio no tiene guardias con turno vigente hoy." : "Tarea creada, pero no se asignó a ningún guardia."); return; }

    setTipo(""); setAsunto(""); setInstrucciones("");
    setDireccion(""); setLat(""); setLng(""); setDesde(""); setHasta("");
    setPrioridad("media"); setSitioSel(""); setGuardiaSel([]); setFotos([]);
    onCreado();
  }

  const chip = (on: boolean): React.CSSProperties => ({ padding: "6px 12px", borderRadius: 16, fontSize: 12.5, fontWeight: 600, cursor: "pointer", border: on ? "1.5px solid var(--sc-btn,#f4a03f)" : "1px solid var(--sc-card-line)", background: on ? "var(--sc-btn,#f4a03f)" : "transparent", color: on ? "#fff" : "var(--sc-text)" });
  const seg = (on: boolean): React.CSSProperties => ({ padding: "8px 14px", borderRadius: 9, fontWeight: 700, fontSize: 13, cursor: "pointer", border: on ? "1.5px solid var(--sc-btn,#f4a03f)" : "1px solid var(--sc-card-line)", background: on ? "var(--sc-btn,#f4a03f)" : "transparent", color: on ? "#fff" : "var(--sc-text)" });

  return (
    <form onSubmit={crear}>
      <div className="form-grid">
        <label>Tipo de tarea
          <CatalogoSelect categoria="tipo_tarea" value={tipo} onChange={setTipo} placeholder="— Selecciona —" />
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
        placeholder="Ej. Revisar clima de la cafetería" />

      <label className="dash-sub" style={{ display: "block", marginTop: 8 }}>Lugar / área (opcional)</label>
      <DireccionGeocode
        direccion={direccion} lat={lat} lng={lng}
        onDireccion={setDireccion}
        onCoords={(la, lo) => { setLat(la); setLng(lo); }}
        size={100}
      />

      <label className="dash-sub" style={{ display: "block", marginTop: 8 }}>Instrucciones</label>
      <textarea
        style={{ display: "block", width: "100%", minHeight: 80, resize: "vertical" }}
        placeholder="Qué debe hacer el guardia y qué reportar…"
        value={instrucciones}
        onChange={(e) => setInstrucciones(e.target.value)}
      />

      <label className="dash-sub" style={{ display: "block", marginTop: 8 }}>Fotografías (opcional)</label>
      <input type="file" accept="image/*" capture="environment" multiple
        onChange={(e) => setFotos(Array.from(e.target.files ?? []))} />
      {fotos.length > 0 && (
        <p className="dash-sub">{fotos.length} archivo(s): {fotos.map((f) => f.name).join(", ")}</p>
      )}

      {/* Asignación: por sitio o por guardias */}
      <div style={{ marginTop: 12 }}>
        <div className="dash-sub" style={{ fontWeight: 700, marginBottom: 6 }}>¿A quién se asigna?</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <span style={seg(modo === "sitio")} onClick={() => setModo("sitio")}>🛡 Por sitio</span>
          <span style={seg(modo === "guardias")} onClick={() => setModo("guardias")}>👷 Por guardias</span>
        </div>
        {modo === "sitio" ? (
          <label className="dash-sub" style={{ display: "block" }}>Sitio (se asigna a todos sus guardias con turno vigente hoy)
            <select value={sitioSel} onChange={(e) => setSitioSel(e.target.value)} style={{ width: "100%" }}>
              <option value="">— Selecciona el sitio —</option>
              {sitios.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          </label>
        ) : (
          <div>
            <div className="dash-sub" style={{ marginBottom: 4 }}>Elige uno o varios guardias:</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, maxHeight: 160, overflow: "auto" }}>
              {guardias.length === 0 && <span className="dash-sub">Sin guardias activos.</span>}
              {guardias.map((g) => {
                const on = guardiaSel.includes(g.id);
                return (
                  <button type="button" key={g.id} style={chip(on)}
                    onClick={() => setGuardiaSel((p) => on ? p.filter((x) => x !== g.id) : [...p, g.id])}>
                    {nombreGuardia(g)}
                  </button>
                );
              })}
            </div>
            {guardiaSel.length > 0 && <p className="dash-sub" style={{ marginTop: 4 }}>{guardiaSel.length} guardia(s) seleccionado(s).</p>}
          </div>
        )}
      </div>

      {error && <p style={{ color: "#b00020" }}>{error}</p>}
      <div style={{ marginTop: 10 }}>
        <button type="submit" disabled={guardando}>
          {guardando ? "Creando…" : "Crear tarea y notificar"}
        </button>
        <span className="dash-sub" style={{ marginLeft: 10 }}>El guardia la verá en el móvil, en «Mis tareas».</span>
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
      subtitulo="Tareas para los guardias: revisar áreas, verificar reportes, apoyos y novedades"
      tabla="tareas"
      modulo="tareas"
      select="id, folio, tipo, asunto, direccion, prioridad, estado, vigencia_desde, vigencia_hasta, fotografias, estatus, creado_en"
      miniatura={(r) => r.fotografias}
      placeholderBuscar="Buscar folio, tipo, asunto o lugar…"
      columnas={[
        { header: "Folio", campo: "folio", celda: (r) => r.folio ?? "—" },
        { header: "Tipo", campo: "tipo", celda: (r) => r.tipo ?? "—" },
        { header: "Asunto", campo: "asunto", celda: (r) => r.asunto ?? "—" },
        { header: "Lugar / área", celda: (r) => r.direccion ?? "—" },
        { header: "Prioridad", campo: "prioridad", celda: (r) => r.prioridad ?? "—" },
        { header: "Vigencia", campo: "vigencia_hasta", celda: (r) => vigenciaTexto(r) },
        { header: "Estado", campo: "estado", celda: (r) => r.estado ?? "—" },
        { header: "Creada", campo: "creado_en", celda: (r) => new Date(r.creado_en).toLocaleDateString() },
      ]}
      textoBusqueda={(r) => `${r.folio ?? ""} ${r.tipo ?? ""} ${r.asunto ?? ""} ${r.direccion ?? ""}`}
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
            <dt>Asunto</dt><dd>{r.asunto ?? "—"}</dd>
            <dt>Lugar / área</dt><dd>{r.direccion ?? "—"}</dd>
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
