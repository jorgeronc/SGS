"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import type { LlamadaCad } from "@/lib/types";
import { CatalogoSelect } from "@/app/components/CatalogoSelect";
import MapaPicker from "@/app/components/MapaPicker";
import { reportesCercanos, type RegistroSimilar } from "@/lib/duplicados";
import AvisoDuplicados from "@/app/components/AvisoDuplicados";
import { unidadesPorLlamada, DESPACHO_LABEL, DESPACHO_COLOR, type UnidadDespacho } from "@/lib/despachos";

const DESP_LABEL: Record<string, string> = {
  recibida: "recibida",
  despachada: "despachado",
  en_atencion: "en atención",
  resuelta: "resuelta",
};

// Grupo de botones para filtrar la lista por una dimensión (estatus, prioridad,
// despacho). Cada opción usa el color de su píldora; la activa se resalta.
function GrupoFiltro({
  label,
  valor,
  opciones,
  onSel,
}: {
  label: string;
  valor: string;
  opciones: { k: string; t: string; cls?: string }[];
  onSel: (k: string) => void;
}) {
  return (
    <div className="cad-filtro">
      <span className="cad-filtro-lbl">{label}</span>
      {opciones.map((o) => (
        <button
          key={o.k}
          type="button"
          className={`cad-fbtn${o.cls ? " cad-pill " + o.cls : " cad-fbtn-todos"}${valor === o.k ? " on" : ""}`}
          onClick={() => onSel(o.k)}
        >
          {o.t}
        </button>
      ))}
    </div>
  );
}

const COLS_CAD: { campo: string; label: string }[] = [
  { campo: "folio", label: "Folio" },
  { campo: "tipo", label: "Tipo" },
  { campo: "prioridad", label: "Prioridad" },
  { campo: "direccion", label: "Ubicación" },
  { campo: "estado_despacho", label: "Despacho" },
  { campo: "unidad", label: "Guardia / unidad" },
  { campo: "fecha_recepcion", label: "Recepción" },
  { campo: "estatus", label: "Estatus" },
];

// Central / Despacho (versión seguridad privada): atención de incidencias y
// alertas (incluye el pánico enviado desde la app del guardia), con despacho a
// sitios/puestos y guardias. Reutiliza la infraestructura CAD heredada del fork.
export default function CentralDespachoPage() {
  const router = useRouter();
  const [llamadas, setLlamadas] = useState<LlamadaCad[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [orden, setOrden] = useState<{ campo: string; dir: "asc" | "desc" } | null>(null);
  const [limite, setLimite] = useState(50);
  // Incidencias con transmisión en vivo (bodycam) — para el indicador "EN VIVO".
  const [enVivo, setEnVivo] = useState<Set<string>>(new Set());
  // Guardia/unidad que atiende cada incidencia (del despacho más reciente).
  const [unidades, setUnidades] = useState<Record<string, UnidadDespacho>>({});
  // Filtros de la lista (vacío = todos).
  const [fEstatus, setFEstatus] = useState("");
  const [fPrioridad, setFPrioridad] = useState("");
  const [fDespacho, setFDespacho] = useState("");

  function clickH(campo: string) {
    setOrden((o) => (o?.campo === campo ? { campo, dir: o.dir === "asc" ? "desc" : "asc" } : { campo, dir: "asc" }));
  }
  const filtradas = useMemo(() => {
    const arr = llamadas.filter((l) =>
      (!fEstatus || l.estatus === fEstatus) &&
      (!fPrioridad || l.prioridad === fPrioridad) &&
      (!fDespacho || l.estado_despacho === fDespacho)
    );
    if (orden) {
      arr.sort((a, b) => {
        const va = (a as any)[orden.campo], vb = (b as any)[orden.campo];
        if (va == null && vb == null) return 0;
        if (va == null) return 1;
        if (vb == null) return -1;
        return String(va).localeCompare(String(vb), "es", { numeric: true, sensitivity: "base" });
      });
      if (orden.dir === "desc") arr.reverse();
    }
    return arr;
  }, [llamadas, orden, fEstatus, fPrioridad, fDespacho]);
  const visibles = useMemo(() => filtradas.slice(0, limite), [filtradas, limite]);

  // Mapa en nueva pestaña con los MISMOS filtros aplicados en la lista.
  function mapaHref(): string {
    const p = new URLSearchParams();
    if (fEstatus) p.set("estatus", fEstatus);
    if (fPrioridad) p.set("prioridad", fPrioridad);
    if (fDespacho) p.set("despacho", fDespacho);
    const qs = p.toString();
    return qs ? `/cad/mapa?${qs}` : "/cad/mapa";
  }

  const [tipo, setTipo] = useState("");
  const [prioridad, setPrioridad] = useState("media");
  const [reportante, setReportante] = useState("");
  const [telefono, setTelefono] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [direccion, setDireccion] = useState("");
  const [latitud, setLatitud] = useState("");
  const [longitud, setLongitud] = useState("");
  const [reportesUbic, setReportesUbic] = useState<RegistroSimilar[]>([]);
  // Catálogo de sitios (el incidente se ancla a un sitio registrado).
  const [sitios, setSitios] = useState<any[]>([]);
  const [sitioId, setSitioId] = useState("");

  useEffect(() => {
    supabase.from("sitios").select("id, nombre, latitud, longitud, cliente:clientes(razon_social)")
      .eq("estatus", "activo").order("nombre")
      .then(({ data }) => setSitios((data as any[]) ?? []));
  }, []);

  // Alerta de "punto caliente": incidencias previas cerca de la ubicación.
  useEffect(() => {
    const lat = latitud ? Number(latitud) : null;
    const lng = longitud ? Number(longitud) : null;
    if (lat == null && direccion.trim().length < 6) { setReportesUbic([]); return; }
    const t = setTimeout(async () => setReportesUbic(await reportesCercanos({ lat, lng, direccion })), 500);
    return () => clearTimeout(t);
  }, [direccion, latitud, longitud]);

  async function cargarLlamadas() {
    setCargando(true);
    const { data, error } = await supabase
      .from("llamadas_cad")
      .select("*")
      .order("fecha_recepcion", { ascending: false });

    if (error) {
      setError(error.message);
    } else {
      setLlamadas(data as LlamadaCad[]);
      await supabase.rpc("rpc_registrar_bitacora", {
        p_tipo_accion: "CONSULTAR",
        p_entidad_tipo: "llamadas_cad",
        p_entidad_id: null,
        p_modulo: "cad",
      });
    }
    setCargando(false);
  }

  useEffect(() => {
    cargarLlamadas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Transmisiones en vivo (bodycam) + realtime, para marcar "EN VIVO" en la lista.
  useEffect(() => {
    async function cargarVivo() {
      const { data } = await supabase
        .from("transmisiones")
        .select("llamada_id")
        .eq("estatus", "activo")
        .eq("estado", "en_vivo");
      setEnVivo(new Set(((data as any[]) ?? []).map((r) => r.llamada_id).filter(Boolean)));
    }
    cargarVivo();
    const canal = supabase
      .channel("cad-lista-tx")
      .on("postgres_changes", { event: "*", schema: "public", table: "transmisiones" }, cargarVivo)
      .subscribe();
    return () => { supabase.removeChannel(canal); };
  }, []);

  // Guardias/unidades que atienden + realtime sobre despachos (columna Guardia).
  useEffect(() => {
    const cargarUnidades = () => unidadesPorLlamada().then(setUnidades);
    cargarUnidades();
    const canal = supabase
      .channel("cad-lista-desp")
      .on("postgres_changes", { event: "*", schema: "public", table: "despachos" }, cargarUnidades)
      .subscribe();
    return () => { supabase.removeChannel(canal); };
  }, []);

  async function agregarLlamada(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!sitioId) {
      setError("Elige el sitio donde ocurrió la incidencia.");
      return;
    }
    if (telefono && telefono.length !== 10) {
      setError("El teléfono debe tener 10 dígitos.");
      return;
    }

    const s = sitios.find((x) => x.id === sitioId);
    const { data, error } = await supabase.from("llamadas_cad").insert({
      tipo: tipo || null,
      prioridad,
      reportante: reportante || null,
      telefono: telefono || null,
      descripcion: descripcion || null,
      sitio_id: sitioId,
      direccion: direccion.trim() || s?.nombre || "Sitio",
      latitud: latitud ? Number(latitud) : (s?.latitud ?? null),
      longitud: longitud ? Number(longitud) : (s?.longitud ?? null),
      datos_adicionales: { origen: "central_operador" },
    }).select("id").single();

    if (error) {
      setError(error.message);
      return;
    }

    // Abre el detalle de la incidencia para continuar con el despacho.
    router.push(`/cad/${(data as any).id}`);
  }

  return (
    <main className="contenedor">
      <h2>Central / Despacho — Atención de incidencias</h2>

      <form onSubmit={agregarLlamada}>
        <label className="dash-sub">Tipo de incidencia a atender (catálogo administrable)</label>
        <div className="form-fila">
          <CatalogoSelect categoria="tipo_incidencia" value={tipo} onChange={setTipo} placeholder="— Tipo de incidencia —" />
          <select value={prioridad} onChange={(e) => setPrioridad(e.target.value)}>
            <option value="alta">Prioridad alta</option>
            <option value="media">Prioridad media</option>
            <option value="baja">Prioridad baja</option>
          </select>
          <input placeholder="Reportante" value={reportante} onChange={(e) => setReportante(e.target.value)} maxLength={45} style={{ width: "45ch", maxWidth: "100%" }} />
          <input placeholder="Teléfono (10 dígitos)" value={telefono} onChange={(e) => setTelefono(e.target.value.replace(/\D/g, "").slice(0, 10))} inputMode="numeric" maxLength={10} style={{ width: "14ch" }} />
        </div>

        <label className="dash-sub">
          Sitio donde ocurrió <span style={{ color: "#b00020" }}>*</span> (el incidente se ancla a un sitio registrado)
        </label>
        <div className="form-fila">
          <select value={sitioId} onChange={(e) => {
            const id = e.target.value; setSitioId(id);
            const s = sitios.find((x) => x.id === id);
            if (s?.latitud != null && s?.longitud != null) { setLatitud(String(s.latitud)); setLongitud(String(s.longitud)); } else { setLatitud(""); setLongitud(""); }
            setDireccion(s?.nombre ?? "");
          }} required style={{ flex: 1, minWidth: 260 }}>
            <option value="">— Sitio —</option>
            {sitios.map((s) => <option key={s.id} value={s.id}>{s.nombre}{s.cliente?.razon_social ? ` · ${s.cliente.razon_social}` : ""}</option>)}
          </select>
          <input placeholder="Referencia dentro del sitio (opcional)" value={direccion} onChange={(e) => setDireccion(e.target.value)} style={{ flex: 1, minWidth: 220 }} />
        </div>
        {sitioId && (
          <>
            <label className="dash-sub" style={{ display: "block", marginTop: 6 }}>Punto exacto — haz clic o arrastra el marcador alrededor del sitio:</label>
            <MapaPicker lat={latitud ? Number(latitud) : null} lng={longitud ? Number(longitud) : null}
              onPick={(la, lo) => { setLatitud(String(la)); setLongitud(String(lo)); }} className="mapbox" />
          </>
        )}
        <AvisoDuplicados titulo="Este sitio ya tiene incidencias previas cercanas" registros={reportesUbic} />

        <label className="dash-sub">Descripción</label>
        <div className="form-fila">
          <input placeholder="Descripción de la incidencia" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} style={{ flex: 1, minWidth: 260 }} />
        </div>

        <div className="form-fila" style={{ marginTop: 8 }}>
          <button type="submit">Registrar incidencia</button>
        </div>
      </form>

      {error && <p style={{ color: "#b00020" }}>{error}</p>}

      {cargando ? (
        <p>Cargando...</p>
      ) : (
        <>
        <fieldset className="cad-filtros-box ancho">
          <legend>Filtros</legend>
          <div className="cad-filtros-row">
            <GrupoFiltro label="Estatus" valor={fEstatus} onSel={setFEstatus} opciones={[
              { k: "", t: "Todos" },
              { k: "activo", t: "Activo", cls: "est-activo" },
              { k: "cerrado", t: "Cerrado", cls: "est-cerrado" },
              { k: "cancelado", t: "Cancelado", cls: "est-cancelado" },
            ]} />
            <GrupoFiltro label="Prioridad" valor={fPrioridad} onSel={setFPrioridad} opciones={[
              { k: "", t: "Todas" },
              { k: "alta", t: "Alta", cls: "prio-alta" },
              { k: "media", t: "Media", cls: "prio-media" },
              { k: "baja", t: "Baja", cls: "prio-baja" },
            ]} />
            <GrupoFiltro label="Despacho" valor={fDespacho} onSel={setFDespacho} opciones={[
              { k: "", t: "Todos" },
              { k: "recibida", t: "Recibida", cls: "desp-recibida" },
              { k: "despachada", t: "Despachado", cls: "desp-despachada" },
              { k: "en_atencion", t: "En atención", cls: "desp-en_atencion" },
              { k: "resuelta", t: "Resuelta", cls: "desp-resuelta" },
            ]} />
          </div>
        </fieldset>

        <div className="cad-list-head">
          <h3>Incidencias y alertas</h3>
          <a href={mapaHref()} target="_blank" rel="noopener noreferrer" className="cad-mapbtn">
            🗺️ Ver en mapa (según filtros) ↗
          </a>
        </div>
        <div className="sc-listbar">
          <span className="dash-sub">
            Mostrando {visibles.length} de {filtradas.length}
            {filtradas.length !== llamadas.length && ` (filtrados de ${llamadas.length})`}
          </span>
          <label className="sc-limite">Máx.
            <input type="number" min={1} value={limite} onChange={(e) => setLimite(Math.max(1, Number(e.target.value) || 1))} />
            registros
          </label>
        </div>
        <table>
          <thead>
            <tr>
              {COLS_CAD.map((c) => (
                <th key={c.campo} className="sortable" style={{ cursor: "pointer", userSelect: "none" }} onClick={() => clickH(c.campo)}>
                  {c.label}
                  <span className="sc-sort">{orden?.campo === c.campo ? (orden.dir === "asc" ? " ▲" : " ▼") : " ⇅"}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibles.map((l) => (
              <tr key={l.id}>
                <td>
                  <Link href={`/cad/${l.id}`}>{l.folio ?? "s/folio"}</Link>
                  {enVivo.has(l.id) && <span className="tx-envivo">🔴 EN VIVO</span>}
                </td>
                <td>{l.tipo ?? "—"}</td>
                <td><span className={`cad-pill prio-${l.prioridad}`}>{l.prioridad}</span></td>
                <td>{l.direccion ?? "—"}</td>
                <td><span className={`cad-pill desp-${l.estado_despacho}`}>{DESP_LABEL[l.estado_despacho] ?? l.estado_despacho}</span></td>
                <td>
                  {unidades[l.id] ? (
                    <span title={unidades[l.id].oficial}>
                      <b>{unidades[l.id].numero ? `#${unidades[l.id].numero}` : "unidad"}</b>{" "}
                      <span className="cad-uni-pill" style={{ background: DESPACHO_COLOR[unidades[l.id].estado] ?? "#607d8b" }}>
                        {DESPACHO_LABEL[unidades[l.id].estado] ?? unidades[l.id].estado}
                      </span>
                    </span>
                  ) : (
                    <span style={{ color: "#999" }}>—</span>
                  )}
                </td>
                <td>{new Date(l.fecha_recepcion).toLocaleString()}</td>
                <td><span className={`cad-pill est-${l.estatus}`}>{l.estatus}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
        </>
      )}
    </main>
  );
}
