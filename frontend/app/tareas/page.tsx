"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import ListaMaestra from "@/app/components/ListaMaestra";
import { CatalogoSelect } from "@/app/components/CatalogoSelect";
import MapaPicker from "@/app/components/MapaPicker";

const BUCKET = "fotos";

function nombreArchivoSeguro(nombre: string): string {
  return nombre.replace(/[^a-zA-Z0-9._-]/g, "_");
}
function nombreGuardia(p: any): string {
  const x = p?.persona ?? p;
  return x ? `${x.nombre ?? ""} ${x.apellido_paterno ?? ""} ${x.apellido_materno ?? ""}`.trim() : "—";
}

const dtLocal = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
const mas30 = (dt: string) => (dt ? dtLocal(new Date(new Date(dt).getTime() + 30 * 60000)) : "");

// Alta de tarea para GUARDIAS: se elige el SITIO y luego, opcionalmente, guardias
// específicos (si no, todos los del sitio con turno vigente hoy). El fin de vigencia
// se prellenA a +30 min del inicio pero es editable. El guardia la ve en "Mis tareas".
function NuevaTarea({ onCreado }: { onCreado: () => void }) {
  const [tipo, setTipo] = useState("");
  const [asunto, setAsunto] = useState("");
  const [instrucciones, setInstrucciones] = useState("");
  const [direccion, setDireccion] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [desde, setDesde] = useState(dtLocal(new Date()));
  const [hasta, setHasta] = useState(mas30(dtLocal(new Date())));
  const [hastaManual, setHastaManual] = useState(false);
  const [prioridad, setPrioridad] = useState("media");
  const [fotos, setFotos] = useState<File[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Asignación: SIEMPRE por sitio; luego todos sus guardias (hoy) o específicos.
  const [sitios, setSitios] = useState<any[]>([]);
  const [sitioSel, setSitioSel] = useState("");
  const [alcance, setAlcance] = useState<"todos" | "especificos">("todos");
  const [guardiasSitio, setGuardiasSitio] = useState<any[]>([]);
  const [guardiaSel, setGuardiaSel] = useState<string[]>([]);

  useEffect(() => {
    supabase.from("sitios").select("id, nombre, latitud, longitud").eq("estatus", "activo").order("nombre")
      .then(({ data }) => setSitios((data as any[]) ?? []));
  }, []);

  // Guardias con turno vigente HOY en el sitio elegido (para "específicos").
  useEffect(() => {
    setGuardiaSel([]); setGuardiasSitio([]);
    setLat(""); setLng(""); // el punto en el mapa se elige por sitio
    if (!sitioSel) return;
    const hoy = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD local
    supabase.from("turno_guardias")
      .select("personal_id, personal:personal(persona:personas(nombre, apellido_paterno, apellido_materno)), turnos!inner(fecha, estado)")
      .eq("sitio_id", sitioSel).eq("estatus", "activo").eq("turnos.estado", "activo").eq("turnos.fecha", hoy)
      .then(({ data }) => {
        const vistos = new Set<string>(); const arr: any[] = [];
        ((data as any[]) ?? []).forEach((r) => { if (r.personal_id && !vistos.has(r.personal_id)) { vistos.add(r.personal_id); arr.push({ id: r.personal_id, persona: r.personal?.persona }); } });
        setGuardiasSitio(arr);
      });
  }, [sitioSel]);

  function cambiarDesde(v: string) {
    setDesde(v);
    if (!hastaManual) setHasta(mas30(v)); // fin auto +30 min mientras no se edite a mano
  }

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!tipo) { setError("Selecciona el tipo de tarea."); return; }
    if (!sitioSel) { setError("Elige el sitio al que se asigna la tarea."); return; }
    if (alcance === "especificos" && guardiaSel.length === 0) { setError("Elige al menos un guardia, o cambia a «Todos»."); return; }
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
        sitio_id: sitioSel || null, // se fija desde el inicio (evita un UPDATE extra en la RPC)
      })
      .select("id")
      .single();

    if (err) { setError(err.message); setGuardando(false); return; }
    const tareaId = (data as any).id as string;

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

    // Asigna: siempre el sitio; si hay guardias específicos, solo esos (si no, todos).
    const { data: n, error: errAsig } = await supabase.rpc("rpc_asignar_tarea_guardias", {
      p_tarea_id: tareaId,
      p_personal: alcance === "especificos" ? guardiaSel : null,
      p_sitio: sitioSel,
    });
    setGuardando(false);
    if (errAsig) { setError(`Tarea creada, pero falló la asignación: ${errAsig.message}`); return; }
    if (!n) { setError("Tarea creada, pero no se asignó a nadie (¿el sitio no tiene guardias con turno vigente hoy?)."); return; }

    setTipo(""); setAsunto(""); setInstrucciones("");
    setDireccion(""); setLat(""); setLng("");
    const ahora = dtLocal(new Date()); setDesde(ahora); setHasta(mas30(ahora)); setHastaManual(false);
    setPrioridad("media"); setSitioSel(""); setAlcance("todos"); setGuardiaSel([]); setFotos([]);
    onCreado();
  }

  const chip = (on: boolean): React.CSSProperties => ({ padding: "6px 12px", borderRadius: 16, fontSize: 12.5, fontWeight: 600, cursor: "pointer", border: on ? "1.5px solid var(--sc-btn,#f4a03f)" : "1px solid var(--sc-card-line)", background: on ? "var(--sc-btn,#f4a03f)" : "transparent", color: on ? "#fff" : "var(--sc-text)" });
  const seg = (on: boolean): React.CSSProperties => ({ padding: "8px 14px", borderRadius: 9, fontWeight: 700, fontSize: 13, cursor: "pointer", border: on ? "1.5px solid var(--sc-btn,#f4a03f)" : "1px solid var(--sc-card-line)", background: on ? "var(--sc-btn,#f4a03f)" : "transparent", color: on ? "#fff" : "var(--sc-text)" });

  // Centro del mapa = ubicación del sitio elegido (para volar con ~500 m de diámetro).
  const sc = sitios.find((s) => s.id === sitioSel);
  const sitioCentro = sc && sc.latitud != null && sc.longitud != null ? { lat: Number(sc.latitud), lng: Number(sc.longitud) } : null;

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
          <input type="datetime-local" value={desde} onChange={(e) => cambiarDesde(e.target.value)} />
        </label>
        <label>Vigente hasta
          <input type="datetime-local" value={hasta} title="Se prellenA a +30 min del inicio; puedes cambiarlo" onChange={(e) => { setHasta(e.target.value); setHastaManual(true); }} />
        </label>
      </div>

      <label className="dash-sub" style={{ display: "block", marginTop: 8 }}>Asunto (resumen corto)</label>
      <input value={asunto} onChange={(e) => setAsunto(e.target.value)} style={{ width: "100%" }}
        placeholder="Ej. Revisar clima de la cafetería" />

      {/* Sitio: dónde se aplica la tarea */}
      <label className="dash-sub" style={{ display: "block", marginTop: 8 }}>Sitio (dónde se aplica la tarea)
        <select value={sitioSel} onChange={(e) => setSitioSel(e.target.value)} style={{ width: "100%" }}>
          <option value="">— Selecciona el sitio —</option>
          {sitios.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
        </select>
      </label>

      {/* A quién se asigna: todos los del sitio o guardias específicos */}
      {sitioSel && (
        <div style={{ marginTop: 8 }}>
          <div className="dash-sub" style={{ fontWeight: 700, marginBottom: 6 }}>¿A quién se asigna?</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
            <span style={seg(alcance === "todos")} onClick={() => setAlcance("todos")}>👥 Todos los del sitio (hoy)</span>
            <span style={seg(alcance === "especificos")} onClick={() => setAlcance("especificos")}>👷 Guardias específicos</span>
          </div>
          {alcance === "especificos" && (
            <div>
              <div className="dash-sub" style={{ marginBottom: 4 }}>Guardias con turno vigente hoy en este sitio:</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, maxHeight: 160, overflow: "auto" }}>
                {guardiasSitio.length === 0 && <span className="dash-sub">Este sitio no tiene guardias con turno vigente hoy.</span>}
                {guardiasSitio.map((g) => {
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
      )}

      {/* Lugar: mapa (opcional). Al elegir el sitio vuela a su área (~500 m). */}
      <label className="dash-sub" style={{ display: "block", marginTop: 8 }}>Lugar en el sitio (opcional — clic en el mapa para señalar dónde)</label>
      <MapaPicker
        lat={lat ? Number(lat) : null}
        lng={lng ? Number(lng) : null}
        onPick={(la, lo) => { setLat(String(la)); setLng(String(lo)); }}
        centro={sitioCentro}
        radioGeocerca={250}
        className="mapbox"
      />
      {!sitioCentro && <p className="dash-sub" style={{ fontSize: 12 }}>Elige un sitio para centrar el mapa en su área.</p>}
      {lat && lng && <p className="dash-sub" style={{ fontSize: 12 }}>Punto señalado: {Number(lat).toFixed(5)}, {Number(lng).toFixed(5)} <button type="button" className="secundario" style={{ padding: "1px 8px", marginLeft: 6 }} onClick={() => { setLat(""); setLng(""); }}>quitar</button></p>}

      <label className="dash-sub" style={{ display: "block", marginTop: 8 }}>Instrucciones</label>
      <textarea
        style={{ display: "block", width: "100%", minHeight: 80, resize: "vertical" }}
        placeholder="Qué debe hacer el guardia y qué reportar…"
        value={instrucciones}
        onChange={(e) => setInstrucciones(e.target.value)}
      />

      <label className="dash-sub" style={{ display: "block", marginTop: 8 }}>Fotografías de instrucción (opcional — se envían al guardia)</label>
      <input type="file" accept="image/*" capture="environment" multiple
        onChange={(e) => setFotos(Array.from(e.target.files ?? []))} />
      {fotos.length > 0 && (
        <p className="dash-sub">{fotos.length} archivo(s): {fotos.map((f) => f.name).join(", ")}</p>
      )}

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
      orderBy="folio"
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
        { k: "todos", label: "Todas" },
        { k: "vigentes", label: "Vigentes", test: (r) => !r.vigencia_hasta || new Date(r.vigencia_hasta) > new Date() },
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
