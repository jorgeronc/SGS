"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import ListaMaestra from "@/app/components/ListaMaestra";
import MapaPicker from "@/app/components/MapaPicker";
import VisorCamara from "@/app/components/VisorCamara";

const PROVEEDORES = [
  { v: "manual", label: "Manual (NVR/DVR del cliente · HLS/MJPEG/embed)" },
  { v: "windy", label: "Windy (webcams públicas · requiere API key)" },
];
const proveedorLabel = (p: string) => (p === "windy" ? "Windy" : "Manual");
const estadoLabel = (e: string) => (e === "inactiva" ? "Inactiva" : e === "mantenimiento" ? "Mantenimiento" : "Activa");

// Cámaras fijas (CCTV) ancladas a un sitio. El video NO se almacena: la señal la
// resuelve al vuelo la Edge Function `camara_vista`. Ver migración 0061.
function NuevaCamara({ onCreado }: { onCreado: () => void }) {
  const [sitios, setSitios] = useState<any[]>([]);
  const [f, setF] = useState({
    sitio_id: "", nombre: "", proveedor: "manual", stream_url: "", proveedor_ref: "",
    ubicacion_desc: "", estado_operativo: "activa", lat: "", lng: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  // Importación masiva desde el proveedor (Windy).
  const [imp, setImp] = useState({ abierto: false, sitio_id: "", radio_km: "25", limite: "10" });
  const [impMsg, setImpMsg] = useState<string | null>(null);
  const [importando, setImportando] = useState(false);
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    supabase.from("sitios").select("id, nombre, latitud, longitud, cliente:clientes(razon_social)").eq("estatus", "activo").order("nombre")
      .then(({ data }) => setSitios((data as any[]) ?? []));
  }, []);

  // Al elegir el sitio, si aún no hay coordenadas, hereda las del sitio.
  function elegirSitio(id: string) {
    const s = sitios.find((x) => x.id === id);
    setF((p) => ({
      ...p, sitio_id: id,
      lat: p.lat || (s?.latitud != null ? String(s.latitud) : ""),
      lng: p.lng || (s?.longitud != null ? String(s.longitud) : ""),
    }));
  }

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!f.sitio_id) { setError("Elige el sitio."); return; }
    if (!f.nombre.trim()) { setError("El nombre de la cámara es obligatorio."); return; }
    if (f.proveedor === "manual" && !f.stream_url.trim()) { setError("Una cámara manual requiere la URL del stream (HLS/MJPEG/embed)."); return; }
    if (f.proveedor !== "manual" && !f.proveedor_ref.trim()) { setError("Indica el ID de la cámara en el proveedor (proveedor_ref)."); return; }
    setCreando(true);
    const { error } = await supabase.from("camaras").insert({
      sitio_id: f.sitio_id, nombre: f.nombre.trim(), proveedor: f.proveedor,
      stream_url: f.proveedor === "manual" ? f.stream_url.trim() : null,
      proveedor_ref: f.proveedor !== "manual" ? f.proveedor_ref.trim() : null,
      ubicacion_desc: f.ubicacion_desc.trim() || null, estado_operativo: f.estado_operativo,
      latitud: f.lat ? Number(f.lat) : null, longitud: f.lng ? Number(f.lng) : null,
    });
    setCreando(false);
    if (error) { setError(error.message); return; }
    onCreado();
  }

  async function importar() {
    setImpMsg(null);
    if (!imp.sitio_id) { setImpMsg("Elige el sitio para buscar cámaras cercanas."); return; }
    setImportando(true);
    const { data, error } = await supabase.functions.invoke("camara_vista", {
      body: { accion: "importar", sitio_id: imp.sitio_id, radio_km: Number(imp.radio_km), limite: Number(imp.limite), proveedor: "windy" },
    });
    setImportando(false);
    if (error || (data as any)?.error) {
      let msg = (data as any)?.error ?? error?.message ?? "No se pudo importar.";
      try { const ctx = (error as any)?.context; if (ctx?.json) { const b = await ctx.json(); if (b?.error) msg = b.error; } } catch { /* */ }
      setImpMsg(msg); return;
    }
    setImpMsg(`Importadas ${(data as any).importadas}, omitidas ${(data as any).omitidas}.`);
    onCreado();
  }

  return (
    <form onSubmit={crear}>
      <div className="form-fila">
        <select value={f.sitio_id} onChange={(e) => elegirSitio(e.target.value)} required style={{ flex: 2 }}>
          <option value="">— Sitio —</option>
          {sitios.map((s) => <option key={s.id} value={s.id}>{s.nombre}{s.cliente?.razon_social ? ` · ${s.cliente.razon_social}` : ""}</option>)}
        </select>
        <input placeholder="Nombre (ej. Acceso norte)" value={f.nombre} onChange={(e) => set("nombre", e.target.value)} required style={{ flex: 2 }} />
      </div>
      <div className="form-fila">
        <label className="dash-sub" style={{ display: "flex", flexDirection: "column" }}>Proveedor
          <select value={f.proveedor} onChange={(e) => set("proveedor", e.target.value)}>
            {PROVEEDORES.map((p) => <option key={p.v} value={p.v}>{p.label}</option>)}
          </select>
        </label>
        <label className="dash-sub" style={{ display: "flex", flexDirection: "column" }}>Estado
          <select value={f.estado_operativo} onChange={(e) => set("estado_operativo", e.target.value)}>
            <option value="activa">Activa</option>
            <option value="inactiva">Inactiva</option>
            <option value="mantenimiento">Mantenimiento</option>
          </select>
        </label>
      </div>
      {f.proveedor === "manual" ? (
        <div className="form-fila">
          <input placeholder="URL del stream (HLS .m3u8 / MJPEG / embed)" value={f.stream_url} onChange={(e) => set("stream_url", e.target.value)} style={{ flex: 3 }} />
        </div>
      ) : (
        <div className="form-fila">
          <input placeholder="ID de la cámara en el proveedor (proveedor_ref)" value={f.proveedor_ref} onChange={(e) => set("proveedor_ref", e.target.value)} style={{ flex: 3 }} />
        </div>
      )}
      <div className="form-fila">
        <input placeholder="Ubicación / referencia (piso, área, orientación…)" value={f.ubicacion_desc} onChange={(e) => set("ubicacion_desc", e.target.value)} style={{ flex: 2 }} />
        <button type="submit" disabled={creando}>{creando ? "Creando…" : "Agregar cámara"}</button>
      </div>
      <label className="dash-sub" style={{ display: "block", marginTop: 8 }}>Ubicación en el mapa — haz clic o arrastra el marcador (por defecto hereda la del sitio):</label>
      <MapaPicker lat={f.lat ? Number(f.lat) : null} lng={f.lng ? Number(f.lng) : null}
        onPick={(la, lo) => setF((p) => ({ ...p, lat: String(la), lng: String(lo) }))} className="mapbox" />
      {sitios.length === 0 && <p className="dash-sub">Primero registra un sitio.</p>}
      {error && <p style={{ color: "#b00020" }}>{error}</p>}

      {/* Alta masiva desde el proveedor (Windy) */}
      <div style={{ marginTop: 12, borderTop: "1px dashed var(--sc-card-line)", paddingTop: 10 }}>
        <button type="button" className="qbtn2" onClick={() => setImp((p) => ({ ...p, abierto: !p.abierto }))}>
          {imp.abierto ? "▾" : "▸"} Importar cámaras del proveedor (Windy)
        </button>
        {imp.abierto && (
          <div style={{ marginTop: 8 }}>
            <div className="form-fila">
              <select value={imp.sitio_id} onChange={(e) => setImp((p) => ({ ...p, sitio_id: e.target.value }))} style={{ flex: 2 }}>
                <option value="">— Sitio (centro de búsqueda) —</option>
                {sitios.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select>
              <input type="number" min={1} max={250} value={imp.radio_km} onChange={(e) => setImp((p) => ({ ...p, radio_km: e.target.value }))} title="Radio km" style={{ maxWidth: 110 }} />
              <input type="number" min={1} max={50} value={imp.limite} onChange={(e) => setImp((p) => ({ ...p, limite: e.target.value }))} title="Límite" style={{ maxWidth: 90 }} />
              <button type="button" onClick={importar} disabled={importando}>{importando ? "Importando…" : "Importar"}</button>
            </div>
            <p className="dash-sub" style={{ fontSize: 12 }}>Da de alta las cámaras públicas cercanas al sitio (dedup por proveedor). Requiere el secreto WINDY_API_KEY.</p>
            {impMsg && <p style={{ color: impMsg.startsWith("Importadas") ? "#0a7c2f" : "#b00020", fontSize: 13 }}>{impMsg}</p>}
          </div>
        )}
      </div>
    </form>
  );
}

export default function VideovigilanciaPage() {
  return (
    <ListaMaestra
      titulo="Videovigilancia"
      subtitulo="Cámaras fijas (CCTV) por sitio. El video no se almacena; la señal se resuelve al vuelo."
      tabla="camaras"
      modulo="camaras"
      orderBy="creado_en"
      select="id, folio, nombre, proveedor, proveedor_ref, stream_url, ubicacion_desc, estado_operativo, latitud, longitud, estatus, creado_en, sitio_id, sitio:sitios(nombre, cliente_id, cliente:clientes(razon_social))"
      placeholderBuscar="Buscar cámara, sitio, ubicación…"
      columnas={[
        { header: "Folio", celda: (r) => r.folio ?? "—" },
        { header: "Sitio", celda: (r) => r.sitio?.nombre ?? "—" },
        { header: "Cámara", celda: (r) => r.nombre },
        { header: "Proveedor", celda: (r) => proveedorLabel(r.proveedor) },
        { header: "Estado", celda: (r) => {
          const c = r.estado_operativo === "activa" ? "#0a7c2f" : r.estado_operativo === "mantenimiento" ? "#b8860b" : "#8a94a6";
          return <span style={{ color: c, fontWeight: 600 }}>{estadoLabel(r.estado_operativo)}</span>;
        } },
        { header: "Estatus", celda: (r) => <span className={r.estatus === "activo" ? "badge-activo" : "badge-cancelado"}>{r.estatus}</span> },
      ]}
      textoBusqueda={(r) => `${r.nombre} ${r.sitio?.nombre ?? ""} ${r.ubicacion_desc ?? ""} ${r.folio ?? ""}`}
      detalleHref={(r) => `/clientes/${r.sitio?.cliente_id ?? ""}`}
      filtros={[
        { k: "todos", label: "Todas" },
        { k: "activas", label: "Activas", test: (r) => r.estado_operativo === "activa" },
        { k: "manual", label: "Manual", test: (r) => r.proveedor === "manual" },
        { k: "mantenimiento", label: "En mantenimiento", test: (r) => r.estado_operativo === "mantenimiento" },
      ]}
      quickView={(r) => (
        <>
          <h3 style={{ margin: "0 0 8px" }}>{r.nombre}</h3>
          <dl className="sc-kv">
            <dt>Folio</dt><dd>{r.folio ?? "—"}</dd>
            <dt>Sitio</dt><dd>{r.sitio?.nombre ?? "—"}</dd>
            <dt>Cliente</dt><dd>{r.sitio?.cliente?.razon_social ?? "—"}</dd>
            <dt>Proveedor</dt><dd>{proveedorLabel(r.proveedor)}{r.proveedor_ref ? ` · ${r.proveedor_ref}` : ""}</dd>
            <dt>Estado</dt><dd>{estadoLabel(r.estado_operativo)}</dd>
            <dt>Ubicación</dt><dd>{r.ubicacion_desc ?? "—"}</dd>
            <dt>Coordenadas</dt><dd>{r.latitud != null ? `${r.latitud}, ${r.longitud}` : "—"}</dd>
          </dl>
          {r.estatus === "activo" && r.estado_operativo === "activa" && (
            <div style={{ marginTop: 12 }}>
              <VisorCamara camaraId={r.id} nombre={r.nombre} alto={200} />
            </div>
          )}
          <p style={{ marginTop: 10 }}><Link href="/videovigilancia/muro" className="qbtn2">🖥 Ver muro de cámaras →</Link></p>
        </>
      )}
      editar={[
        { campo: "nombre", label: "Nombre de la cámara" },
        { campo: "estado_operativo", label: "Estado operativo", tipo: "select", opciones: ["activa", "inactiva", "mantenimiento"] },
        { campo: "stream_url", label: "URL del stream (proveedor manual)" },
        { campo: "proveedor_ref", label: "ID en el proveedor (proveedor_ref)" },
        { campo: "ubicacion_desc", label: "Ubicación / referencia" },
        { campo: "latitud", label: "Latitud", tipo: "number" },
        { campo: "longitud", label: "Longitud", tipo: "number" },
      ]}
      nuevo={(onCreado) => <NuevaCamara onCreado={onCreado} />}
    />
  );
}
