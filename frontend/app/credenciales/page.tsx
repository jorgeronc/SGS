"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "@/lib/supabaseClient";
import ListaMaestra from "@/app/components/ListaMaestra";

const tipoLabel = (t: string) => (t === "qr" ? "QR" : t === "nfc" ? "NFC" : "Código temporal");
const vigente = (r: any) => {
  const ahora = Date.now();
  const ini = r.vigencia_inicio ? new Date(r.vigencia_inicio).getTime() : -Infinity;
  const fin = r.vigencia_fin ? new Date(r.vigencia_fin).getTime() : Infinity;
  return r.estatus === "activo" && ahora >= ini && ahora <= fin;
};

// Credenciales de acceso (QR / NFC / código temporal). El código es lo que el
// guardia valida en la caseta al escanear/teclear. Ver migración 0063.
function NuevaCredencial({ onCreado }: { onCreado: () => void }) {
  const [personas, setPersonas] = useState<any[]>([]);
  const [f, setF] = useState({ persona_id: "", descripcion: "", tipo: "qr", codigo: "", vigencia_fin: "" });
  const [error, setError] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    supabase.from("personas").select("id, nombre, apellido_paterno, apellido_materno").order("nombre").limit(500)
      .then(({ data }) => setPersonas((data as any[]) ?? []));
    set("codigo", `CR-${crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!f.codigo.trim()) { setError("El código es obligatorio."); return; }
    if (!f.persona_id && !f.descripcion.trim()) { setError("Elige una persona o describe la credencial (ej. Visitante Juan Pérez)."); return; }
    setCreando(true);
    const { error } = await supabase.from("credenciales").insert({
      persona_id: f.persona_id || null,
      descripcion: f.descripcion.trim() || null,
      tipo: f.tipo,
      codigo: f.codigo.trim(),
      vigencia_inicio: new Date().toISOString(),
      vigencia_fin: f.vigencia_fin ? new Date(f.vigencia_fin).toISOString() : null,
    });
    setCreando(false);
    if (error) { setError(error.message); return; }
    onCreado();
  }

  return (
    <form onSubmit={crear}>
      <div className="form-fila">
        <select value={f.persona_id} onChange={(e) => set("persona_id", e.target.value)} style={{ flex: 2 }}>
          <option value="">— Persona (registro maestro, opcional) —</option>
          {personas.map((p) => <option key={p.id} value={p.id}>{`${p.nombre ?? ""} ${p.apellido_paterno ?? ""} ${p.apellido_materno ?? ""}`.trim()}</option>)}
        </select>
        <input placeholder="Descripción (ej. Visitante Juan Pérez)" value={f.descripcion} onChange={(e) => set("descripcion", e.target.value)} style={{ flex: 2 }} />
      </div>
      <div className="form-fila">
        <label className="dash-sub" style={{ display: "flex", flexDirection: "column" }}>Tipo
          <select value={f.tipo} onChange={(e) => set("tipo", e.target.value)}>
            <option value="qr">QR</option>
            <option value="nfc">NFC</option>
            <option value="temporal">Código temporal</option>
          </select>
        </label>
        <input placeholder="Código" value={f.codigo} onChange={(e) => set("codigo", e.target.value)} required />
        <label className="dash-sub" style={{ display: "flex", flexDirection: "column" }}>Vence
          <input type="datetime-local" value={f.vigencia_fin} onChange={(e) => set("vigencia_fin", e.target.value)} />
        </label>
        <button type="submit" disabled={creando}>{creando ? "Emitiendo…" : "Emitir credencial"}</button>
      </div>
      <div style={{ marginTop: 6, background: "var(--sc-surface-2, #f3f6f9)", border: "1px solid var(--sc-card-line, #e2e6ec)", borderRadius: 8, padding: 8 }}>
        <div className="dash-sub" style={{ fontSize: 12.5, color: "#0b3d66", fontWeight: 700 }}>
          Contenido ({tipoLabel(f.tipo)}): <code>{f.codigo || "—"}</code>
        </div>
        <div className="dash-sub" style={{ fontSize: 12 }}>Es el valor que valida el sistema en la caseta.</div>
      </div>
      {error && <p style={{ color: "#b00020" }}>{error}</p>}
    </form>
  );
}

export default function CredencialesPage() {
  return (
    <ListaMaestra
      titulo="Credenciales"
      subtitulo="Credenciales de acceso (QR / NFC / código temporal) que se validan en la caseta"
      tabla="credenciales"
      modulo="credenciales"
      orderBy="creado_en"
      select="id, folio, persona_id, descripcion, tipo, codigo, vigencia_inicio, vigencia_fin, estatus, creado_en, persona:personas(nombre, apellido_paterno, apellido_materno)"
      placeholderBuscar="Buscar código, persona, descripción…"
      columnas={[
        { header: "Folio", celda: (r) => r.folio ?? "—" },
        { header: "Titular", celda: (r) => (r.persona ? `${r.persona.nombre ?? ""} ${r.persona.apellido_paterno ?? ""}`.trim() : r.descripcion ?? "—") },
        { header: "Tipo", celda: (r) => tipoLabel(r.tipo) },
        { header: "Código", celda: (r) => <code>{r.codigo}</code> },
        { header: "Vence", celda: (r) => (r.vigencia_fin ? new Date(r.vigencia_fin).toLocaleString() : "—") },
        { header: "Vigente", celda: (r) => (vigente(r) ? <span style={{ color: "#0a7c2f", fontWeight: 700 }}>Sí</span> : <span style={{ color: "#b00020" }}>No</span>) },
      ]}
      textoBusqueda={(r) => `${r.codigo} ${r.descripcion ?? ""} ${r.persona?.nombre ?? ""} ${r.persona?.apellido_paterno ?? ""} ${r.folio ?? ""}`}
      detalleHref={(r) => (r.persona_id ? `/personas/${r.persona_id}` : "/credenciales")}
      filtros={[
        { k: "todas", label: "Todas" },
        { k: "vigentes", label: "Vigentes", test: (r) => vigente(r) },
        { k: "temporales", label: "Temporales", test: (r) => r.tipo === "temporal" },
      ]}
      quickView={(r) => (
        <>
          <h3 style={{ margin: "0 0 8px" }}>{r.persona ? `${r.persona.nombre ?? ""} ${r.persona.apellido_paterno ?? ""}`.trim() : r.descripcion ?? "Credencial"}</h3>
          <dl className="sc-kv">
            <dt>Folio</dt><dd>{r.folio ?? "—"}</dd>
            <dt>Tipo</dt><dd>{tipoLabel(r.tipo)}</dd>
            <dt>Código</dt><dd><code>{r.codigo}</code></dd>
            <dt>Desde</dt><dd>{r.vigencia_inicio ? new Date(r.vigencia_inicio).toLocaleString() : "—"}</dd>
            <dt>Vence</dt><dd>{r.vigencia_fin ? new Date(r.vigencia_fin).toLocaleString() : "sin vencimiento"}</dd>
            <dt>Vigente</dt><dd>{vigente(r) ? "Sí" : "No"}</dd>
          </dl>
          {r.estatus === "activo" && r.tipo !== "nfc" && r.codigo && (
            <div style={{ marginTop: 12, textAlign: "center", padding: 12, border: "1px solid var(--sc-card-line)", borderRadius: 8 }}>
              <QRCodeSVG value={r.codigo} size={160} includeMargin level="M" />
              <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>Escanéalo en la caseta</div>
            </div>
          )}
        </>
      )}
      editar={[
        { campo: "descripcion", label: "Descripción" },
        { campo: "tipo", label: "Tipo", tipo: "select", opciones: ["qr", "nfc", "temporal"] },
        { campo: "vigencia_fin", label: "Vence", tipo: "date" },
      ]}
      nuevo={(onCreado) => <NuevaCredencial onCreado={onCreado} />}
    />
  );
}
