"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import ListaMaestra from "@/app/components/ListaMaestra";
import MapaPicker from "@/app/components/MapaPicker";
import CameraDetailDrawer from "@/app/components/CameraDetailDrawer";

const proveedorLabel = (p: string) => (p === "windy" ? "Windy" : "Manual");
const estadoLabel = (e: string) => (e === "inactiva" ? "Inactiva" : e === "mantenimiento" ? "Mantenimiento" : "Activa");
const RADIOS_M = [500, 1000, 3000, 5000, 10000, 25000]; // metros a la redonda del sitio

// Cámaras fijas (CCTV) ancladas a un sitio. El video NO se almacena: la señal la
// resuelve al vuelo la Edge Function `camara_vista`. Ver migración 0061.
//
// FLUJO PRINCIPAL (como en SOME): eliges el sitio, se toman sus coordenadas y se
// buscan/agregan las cámaras de Windy alrededor — sin capturar ningún ID/URL.
// El alta MANUAL (stream del NVR/DVR del cliente) es la opción secundaria.
function NuevaCamara({ onCreado }: { onCreado: () => void }) {
  const [sitios, setSitios] = useState<any[]>([]);
  // Búsqueda por sitio (Windy).
  const [d, setD] = useState({ sitio_id: "", radio_m: "5000", limite: "20" });
  const [dMsg, setDMsg] = useState<string | null>(null);
  const [dOk, setDOk] = useState(false);
  const [buscando, setBuscando] = useState(false);
  // Alta manual (secundaria).
  const [manualAbierto, setManualAbierto] = useState(false);
  const [f, setF] = useState({ sitio_id: "", nombre: "", stream_url: "", ubicacion_desc: "", estado_operativo: "activa", lat: "", lng: "" });
  const [error, setError] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    supabase.from("sitios").select("id, nombre, latitud, longitud, cliente:clientes(razon_social)").eq("estatus", "activo").order("nombre")
      .then(({ data }) => setSitios((data as any[]) ?? []));
  }, []);

  const sitioSel = sitios.find((x) => x.id === d.sitio_id);
  const sitioSinCoords = !!sitioSel && (sitioSel.latitud == null || sitioSel.longitud == null);

  // Busca en Windy alrededor del sitio y da de alta las que falten.
  async function buscarYAgregar() {
    setDMsg(null); setDOk(false);
    if (!d.sitio_id) { setDMsg("Elige el sitio."); return; }
    if (sitioSinCoords) { setDMsg("El sitio no tiene coordenadas. Georreferéncialo primero en Sitios."); return; }
    setBuscando(true);
    const radioKm = Math.max(1, Math.round(Number(d.radio_m) / 1000)); // Windy busca en km
    const { data, error } = await supabase.functions.invoke("camara_vista", {
      body: { accion: "importar", sitio_id: d.sitio_id, radio_km: radioKm, limite: Number(d.limite), proveedor: "windy" },
    });
    setBuscando(false);
    if (error || (data as any)?.error) {
      let msg = (data as any)?.error ?? error?.message ?? "No se pudo buscar.";
      try { const ctx = (error as any)?.context; if (ctx?.json) { const b = await ctx.json(); if (b?.error) msg = b.error; } } catch { /* */ }
      setDMsg(msg); return;
    }
    const n = (data as any).importadas ?? 0, om = (data as any).omitidas ?? 0;
    setDOk(true);
    setDMsg(n === 0 && om === 0
      ? "No se encontraron cámaras de Windy en ese radio. Prueba ampliándolo."
      : `Agregadas ${n} cámara(s)${om ? ` · ${om} ya existían` : ""}.`);
    if (n > 0) onCreado();
  }

  // Alta manual (NVR/DVR del cliente): requiere stream_url.
  async function crearManual(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!f.sitio_id) { setError("Elige el sitio."); return; }
    if (!f.nombre.trim()) { setError("El nombre de la cámara es obligatorio."); return; }
    if (!f.stream_url.trim()) { setError("Una cámara manual requiere la URL del stream (HLS/MJPEG/embed)."); return; }
    setCreando(true);
    const { error } = await supabase.from("camaras").insert({
      sitio_id: f.sitio_id, nombre: f.nombre.trim(), proveedor: "manual", stream_url: f.stream_url.trim(),
      ubicacion_desc: f.ubicacion_desc.trim() || null, estado_operativo: f.estado_operativo,
      latitud: f.lat ? Number(f.lat) : null, longitud: f.lng ? Number(f.lng) : null,
    });
    setCreando(false);
    if (error) { setError(error.message); return; }
    setF({ sitio_id: "", nombre: "", stream_url: "", ubicacion_desc: "", estado_operativo: "activa", lat: "", lng: "" });
    onCreado();
  }

  function elegirSitioManual(id: string) {
    const s = sitios.find((x) => x.id === id);
    setF((p) => ({ ...p, sitio_id: id,
      lat: p.lat || (s?.latitud != null ? String(s.latitud) : ""),
      lng: p.lng || (s?.longitud != null ? String(s.longitud) : "") }));
  }

  return (
    <div>
      {/* FLUJO PRINCIPAL: buscar cámaras alrededor del sitio (Windy) */}
      <h4 style={{ margin: "0 0 8px" }}>Buscar cámaras alrededor de un sitio</h4>
      <p className="dash-sub" style={{ fontSize: 12.5, marginTop: 0 }}>
        Se toman las coordenadas del sitio y se buscan las cámaras de Windy a la redonda; las nuevas se agregan automáticamente (sin capturar ID ni URL).
      </p>
      <div className="form-fila">
        <select value={d.sitio_id} onChange={(e) => { setD((p) => ({ ...p, sitio_id: e.target.value })); setDMsg(null); }} style={{ flex: 2 }}>
          <option value="">— Sitio —</option>
          {sitios.map((s) => <option key={s.id} value={s.id}>{s.nombre}{s.cliente?.razon_social ? ` · ${s.cliente.razon_social}` : ""}</option>)}
        </select>
        <label className="dash-sub" style={{ display: "flex", flexDirection: "column" }}>Radio a la redonda
          <select value={d.radio_m} onChange={(e) => setD((p) => ({ ...p, radio_m: e.target.value }))}>
            {RADIOS_M.map((m) => <option key={m} value={m}>{m >= 1000 ? `${m / 1000} km` : `${m} m`}</option>)}
          </select>
        </label>
        <label className="dash-sub" style={{ display: "flex", flexDirection: "column" }}>Máx. cámaras
          <input type="number" min={1} max={50} value={d.limite} onChange={(e) => setD((p) => ({ ...p, limite: e.target.value }))} style={{ maxWidth: 90 }} />
        </label>
        <button type="button" onClick={buscarYAgregar} disabled={buscando} style={{ alignSelf: "flex-end" }}>
          {buscando ? "Buscando…" : "🔍 Buscar y agregar"}
        </button>
      </div>
      {sitioSel && (
        <p className="dash-sub" style={{ fontSize: 12 }}>
          {sitioSinCoords
            ? <span style={{ color: "#b00020" }}>⚠ Este sitio no tiene coordenadas — georreferéncialo en Sitios para poder buscar.</span>
            : `📍 Centro de búsqueda: ${sitioSel.latitud}, ${sitioSel.longitud}`}
        </p>
      )}
      {dMsg && <p style={{ color: dOk ? "#0a7c2f" : "#b00020", fontSize: 13 }}>{dMsg}</p>}
      {sitios.length === 0 && <p className="dash-sub">Primero registra un sitio.</p>}

      {/* OPCIÓN SECUNDARIA: alta manual (NVR/DVR del cliente) */}
      <div style={{ marginTop: 14, borderTop: "1px dashed var(--sc-card-line)", paddingTop: 10 }}>
        <button type="button" className="qbtn2" onClick={() => setManualAbierto((v) => !v)}>
          {manualAbierto ? "▾" : "▸"} Agregar una cámara manual (NVR/DVR del cliente)
        </button>
        {manualAbierto && (
          <form onSubmit={crearManual} style={{ marginTop: 8 }}>
            <div className="form-fila">
              <select value={f.sitio_id} onChange={(e) => elegirSitioManual(e.target.value)} required style={{ flex: 2 }}>
                <option value="">— Sitio —</option>
                {sitios.map((s) => <option key={s.id} value={s.id}>{s.nombre}{s.cliente?.razon_social ? ` · ${s.cliente.razon_social}` : ""}</option>)}
              </select>
              <input placeholder="Nombre (ej. Acceso norte)" value={f.nombre} onChange={(e) => set("nombre", e.target.value)} style={{ flex: 2 }} />
              <label className="dash-sub" style={{ display: "flex", flexDirection: "column" }}>Estado
                <select value={f.estado_operativo} onChange={(e) => set("estado_operativo", e.target.value)}>
                  <option value="activa">Activa</option>
                  <option value="inactiva">Inactiva</option>
                  <option value="mantenimiento">Mantenimiento</option>
                </select>
              </label>
            </div>
            <div className="form-fila">
              <input placeholder="URL del stream (HLS .m3u8 / MJPEG / embed)" value={f.stream_url} onChange={(e) => set("stream_url", e.target.value)} style={{ flex: 3 }} />
            </div>
            <div className="form-fila">
              <input placeholder="Ubicación / referencia (piso, área, orientación…)" value={f.ubicacion_desc} onChange={(e) => set("ubicacion_desc", e.target.value)} style={{ flex: 2 }} />
              <button type="submit" disabled={creando}>{creando ? "Creando…" : "Agregar cámara"}</button>
            </div>
            <label className="dash-sub" style={{ display: "block", marginTop: 8 }}>Ubicación en el mapa — clic o arrastra el marcador (por defecto hereda la del sitio):</label>
            <MapaPicker lat={f.lat ? Number(f.lat) : null} lng={f.lng ? Number(f.lng) : null}
              onPick={(la, lo) => setF((p) => ({ ...p, lat: String(la), lng: String(lo) }))} className="mapbox" />
            {error && <p style={{ color: "#b00020" }}>{error}</p>}
          </form>
        )}
      </div>
    </div>
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
          {/* Inspector de cámara reutilizable (Detalle/Eventos/Historial + acciones) */}
          <CameraDetailDrawer camaraId={r.id} />
          <p style={{ marginTop: 10 }}>
            <Link href="/videovigilancia/muro" className="qbtn2">🖥 Ver muro completo →</Link>
          </p>
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
