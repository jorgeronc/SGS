"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "@/lib/supabaseClient";
import ListaMaestra from "@/app/components/ListaMaestra";
import DireccionGeocode from "@/app/components/DireccionGeocode";
import MapaPicker from "@/app/components/MapaPicker";
import { getConfig } from "@/lib/config";
import { urlReverse } from "@/lib/geo";

// Puntos de control (checkpoints) de un sitio. El `codigo` es lo que el guardia
// escanea (QR / tag NFC) para registrar su paso. Ver migración 0053_rondines.
function NuevoPunto({ onCreado }: { onCreado: () => void }) {
  const [sitios, setSitios] = useState<any[]>([]);
  const [f, setF] = useState({ sitio_id: "", nombre: "", codigo: "", orden: "", descripcion: "", lat: "", lng: "", buscarDir: "", tipo_punto: "control", radio_m: "40", tipo_control: "qr", ubicacion_control: "" });
  const [jur, setJur] = useState(""); const [paisJur, setPaisJur] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  // Al elegir/mover el punto en el mapa: fija coordenadas y (si está vacío)
  // rellena la descripción con el domicilio por geocodificación inversa.
  async function pickEnMapa(la: number, lo: number) {
    setF((p) => ({ ...p, lat: String(la), lng: String(lo) }));
    try {
      const r = await fetch(urlReverse(la, lo));
      const j = await r.json();
      const dir = j?.display_name as string | undefined;
      if (dir) setF((p) => ({ ...p, descripcion: p.descripcion?.trim() ? p.descripcion : dir, buscarDir: dir }));
    } catch { /* sin reverse: quedan solo las coordenadas */ }
  }

  useEffect(() => {
    supabase.from("sitios").select("id, nombre, cliente:clientes(razon_social)").eq("estatus", "activo").order("nombre")
      .then(({ data }) => setSitios((data as any[]) ?? []));
    getConfig().then((c) => { if (c) { setJur(c.jurisdiccion ?? ""); setPaisJur(c.jurisdiccion_pais ?? ""); } });
    set("codigo", `PC-${(crypto.randomUUID().replace(/-/g, "").slice(0, 8)).toUpperCase()}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!f.sitio_id) { setError("Elige el sitio."); return; }
    if (!f.nombre.trim()) { setError("El nombre del punto es obligatorio."); return; }
    if (!f.codigo.trim()) { setError("El código es obligatorio."); return; }
    setCreando(true);
    const { error } = await supabase.from("puntos_control").insert({
      sitio_id: f.sitio_id, nombre: f.nombre.trim(), codigo: f.codigo.trim(),
      orden: f.orden ? Number(f.orden) : null, descripcion: f.descripcion || null,
      latitud: f.lat ? Number(f.lat) : null, longitud: f.lng ? Number(f.lng) : null,
      tipo_punto: f.tipo_punto || "control", radio_m: f.radio_m ? Number(f.radio_m) : 40,
      tipo_control: f.tipo_control || "qr", ubicacion_control: f.ubicacion_control || null,
    });
    setCreando(false);
    if (error) { setError(error.message); return; }
    onCreado();
  }

  return (
    <form onSubmit={crear}>
      <div className="form-fila">
        <select value={f.sitio_id} onChange={(e) => set("sitio_id", e.target.value)} required style={{ flex: 2 }}>
          <option value="">— Sitio —</option>
          {sitios.map((s) => <option key={s.id} value={s.id}>{s.nombre}{s.cliente?.razon_social ? ` · ${s.cliente.razon_social}` : ""}</option>)}
        </select>
        <input placeholder="Nombre del punto (ej. Acceso principal)" value={f.nombre} onChange={(e) => set("nombre", e.target.value)} required style={{ flex: 2 }} />
      </div>
      <div className="form-fila">
        <input placeholder="Código (QR/NFC)" value={f.codigo} onChange={(e) => set("codigo", e.target.value)} required />
        <input placeholder="Orden" type="number" min={0} value={f.orden} onChange={(e) => set("orden", e.target.value)} style={{ maxWidth: 100 }} />
        <input placeholder="Descripción / referencia" value={f.descripcion} onChange={(e) => set("descripcion", e.target.value)} style={{ flex: 2 }} />
        <button type="submit" disabled={creando}>{creando ? "Creando…" : "Agregar punto"}</button>
      </div>
      <div className="form-fila">
        <label className="dash-sub" style={{ display: "flex", flexDirection: "column" }}>Tipo de control
          <select value={f.tipo_control} onChange={(e) => set("tipo_control", e.target.value)}>
            <option value="qr">Código QR</option>
            <option value="nfc">Etiqueta NFC</option>
            <option value="ambos">Ambos (QR + NFC)</option>
          </select>
        </label>
        <label className="dash-sub" style={{ display: "flex", flexDirection: "column" }}>Tipo de punto
          <select value={f.tipo_punto} onChange={(e) => set("tipo_punto", e.target.value)}>
            <option value="control">Control</option>
            <option value="entrada">Entrada (al lugar)</option>
            <option value="salida">Salida (del lugar)</option>
          </select>
        </label>
        <label className="dash-sub" style={{ display: "flex", flexDirection: "column" }}>Radio permitido (m)
          <input type="number" min={5} max={2000} value={f.radio_m} onChange={(e) => set("radio_m", e.target.value)} />
        </label>
      </div>
      <div className="form-fila">
        <input placeholder="Ubicación del control (piso/nivel, área, espacio…)" value={f.ubicacion_control} onChange={(e) => set("ubicacion_control", e.target.value)} style={{ flex: 1 }} />
      </div>
      <div style={{ marginTop: 6, background: "var(--sc-surface-2, #f3f6f9)", border: "1px solid var(--sc-card-line, #e2e6ec)", borderRadius: 8, padding: 8 }}>
        <div className="dash-sub" style={{ fontSize: 12.5, color: "#0b3d66", fontWeight: 700 }}>
          Contenido de la etiqueta ({f.tipo_control === "nfc" ? "NFC" : f.tipo_control === "ambos" ? "QR + NFC" : "QR"}): <code>{f.codigo || "—"}</code>
        </div>
        <div className="dash-sub" style={{ fontSize: 12 }}>Este es el valor que valida el sistema al leer la etiqueta.</div>
      </div>
      <label className="dash-sub" style={{ display: "block", marginTop: 8 }}>Ubicación en el mapa — haz clic o arrastra el marcador para señalar el punto (obtiene domicilio y coordenadas):</label>
      <DireccionGeocode direccion={f.buscarDir} lat={f.lat} lng={f.lng}
        onDireccion={(v) => set("buscarDir", v)} onCoords={(la, lo) => pickEnMapa(Number(la), Number(lo))}
        jurisdiccion={jur} pais={paisJur} size={80} />
      <MapaPicker lat={f.lat ? Number(f.lat) : null} lng={f.lng ? Number(f.lng) : null} onPick={pickEnMapa} className="mapbox" />
      {sitios.length === 0 && <p className="dash-sub">Primero registra un sitio.</p>}
      {error && <p style={{ color: "#b00020" }}>{error}</p>}
      <p style={{ marginTop: 8 }}>
        <a href="/puntos-control/imprimir" target="_blank" rel="noopener noreferrer" className="qbtn2">🖨️ Imprimir todos los códigos QR ↗</a>
      </p>
    </form>
  );
}

export default function PuntosControlPage() {
  return (
    <ListaMaestra
      titulo="Puntos de control"
      subtitulo="Checkpoints por sitio; el guardia escanea su código en cada ronda"
      tabla="puntos_control"
      modulo="puntos_control"
      orderBy="orden"
      select="id, folio, nombre, codigo, orden, descripcion, latitud, longitud, tipo_punto, radio_m, tipo_control, ubicacion_control, estatus, creado_en, sitio_id, sitio:sitios(nombre, cliente_id, cliente:clientes(razon_social))"
      placeholderBuscar="Buscar punto, código, sitio…"
      columnas={[
        { header: "Folio", celda: (r) => r.folio ?? "—" },
        { header: "Sitio", celda: (r) => r.sitio?.nombre ?? "—" },
        { header: "Punto", celda: (r) => r.nombre },
        { header: "Código", celda: (r) => <code>{r.codigo}</code> },
        { header: "Orden", celda: (r) => (r.orden ?? "—") },
        { header: "Estatus", celda: (r) => <span className={r.estatus === "activo" ? "badge-activo" : "badge-cancelado"}>{r.estatus}</span> },
      ]}
      textoBusqueda={(r) => `${r.nombre} ${r.codigo} ${r.sitio?.nombre ?? ""}`}
      detalleHref={(r) => `/clientes/${r.sitio?.cliente_id ?? ""}`}
      quickView={(r) => (
        <>
          <h3 style={{ margin: "0 0 8px" }}>{r.nombre}</h3>
          <dl className="sc-kv">
            <dt>Folio</dt><dd>{r.folio ?? "—"}</dd>
            <dt>Sitio</dt><dd>{r.sitio?.nombre ?? "—"}</dd>
            <dt>Cliente</dt><dd>{r.sitio?.cliente?.razon_social ?? "—"}</dd>
            <dt>Código (contenido)</dt><dd><code>{r.codigo}</code></dd>
            <dt>Tipo de control</dt><dd>{r.tipo_control === "nfc" ? "NFC" : r.tipo_control === "ambos" ? "QR + NFC" : "QR"}</dd>
            <dt>Tipo de punto</dt><dd>{r.tipo_punto ?? "control"}</dd>
            <dt>Ubicación del control</dt><dd>{r.ubicacion_control ?? "—"}</dd>
            <dt>Radio permitido</dt><dd>{r.radio_m != null ? `${r.radio_m} m` : "—"}</dd>
            <dt>Orden</dt><dd>{r.orden ?? "—"}</dd>
            <dt>Descripción</dt><dd>{r.descripcion ?? "—"}</dd>
          </dl>
          {r.estatus === "activo" && r.codigo && (
            <div style={{ marginTop: 12, textAlign: "center", padding: 12, border: "1px solid var(--sc-card-line)", borderRadius: 8 }}>
              <QRCodeSVG value={r.codigo} size={160} includeMargin level="M" />
              <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>Escanéalo desde la app en el rondín</div>
            </div>
          )}
          <p style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <a href={`/puntos-control/imprimir?punto=${r.id}`} target="_blank" rel="noopener noreferrer" className="qbtn2">🖨️ Imprimir este QR ↗</a>
            {r.sitio_id && <a href={`/puntos-control/imprimir?sitio=${r.sitio_id}`} target="_blank" rel="noopener noreferrer" className="qbtn2">🖨️ Imprimir QR del sitio ↗</a>}
            <Link href="/rondines" className="qbtn2">▤ Ver rondines →</Link>
          </p>
        </>
      )}
      editar={[
        { campo: "nombre", label: "Nombre del punto" },
        { campo: "codigo", label: "Código (QR/NFC)" },
        { campo: "orden", label: "Orden", tipo: "number" },
        { campo: "tipo_control", label: "Tipo de control", tipo: "select", opciones: ["qr", "nfc", "ambos"] },
        { campo: "tipo_punto", label: "Tipo de punto", tipo: "select", opciones: ["control", "entrada", "salida"] },
        { campo: "ubicacion_control", label: "Ubicación del control (piso/área)" },
        { campo: "radio_m", label: "Radio permitido (m)", tipo: "number" },
        { campo: "latitud", label: "Latitud", tipo: "number" },
        { campo: "longitud", label: "Longitud", tipo: "number" },
        { campo: "descripcion", label: "Descripción", tipo: "textarea" },
      ]}
      nuevo={(onCreado) => <NuevoPunto onCreado={onCreado} />}
    />
  );
}
