"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "@/lib/supabaseClient";
import { urlFoto } from "@/lib/fotos";
import ListaMaestra from "@/app/components/ListaMaestra";
import CamaraFoto from "@/app/components/CamaraFoto";

const CATEGORIAS = ["Empleado", "Guardia", "Visitante", "Servicio"];
const tipoLabel = (t: string) => (t === "qr" ? "QR" : t === "nfc" ? "NFC" : "Código temporal");
const vigente = (r: any) => {
  const ahora = Date.now();
  const ini = r.vigencia_inicio ? new Date(r.vigencia_inicio).getTime() : -Infinity;
  const fin = r.vigencia_fin ? new Date(r.vigencia_fin).getTime() : Infinity;
  return r.estatus === "activo" && ahora >= ini && ahora <= fin;
};
const localDT = (d: Date) => { const p = (n: number) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
// Vence a 1 año (empleado/guardia/servicio) o al fin del/los día(s) de visita.
const finAnio = () => { const d = new Date(); d.setDate(d.getDate() + 365); return localDT(d); };
const finVisita = (dias: number) => { const d = new Date(); d.setDate(d.getDate() + Math.max(1, dias) - 1); d.setHours(23, 59, 0, 0); return localDT(d); };

// Panel admin: carga de PLANTILLA (imagen de fondo) por categoría de credencial.
function PlantillasPanel() {
  const [abierto, setAbierto] = useState(false);
  const [plantillas, setPlantillas] = useState<Record<string, string>>({});
  const [subiendo, setSubiendo] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function cargar() {
    const { data } = await supabase.from("credencial_plantillas").select("categoria, imagen_ruta");
    const m: Record<string, string> = {};
    ((data as any[]) ?? []).forEach((r) => { if (r.imagen_ruta) m[r.categoria] = r.imagen_ruta; });
    setPlantillas(m);
  }
  useEffect(() => { cargar(); }, []);

  async function subir(categoria: string, file: File) {
    setSubiendo(categoria); setMsg(null);
    const ext = (file.name.split(".").pop() || "png").toLowerCase();
    const path = `credenciales/plantillas/${categoria.toLowerCase()}-${Date.now()}.${ext}`;
    const { error: e1 } = await supabase.storage.from("fotos").upload(path, file, { contentType: file.type || "image/png", upsert: true });
    if (e1) { setSubiendo(null); setMsg(e1.message); return; }
    const { error: e2 } = await supabase.from("credencial_plantillas")
      .upsert({ categoria, imagen_ruta: path, actualizado_en: new Date().toISOString() }, { onConflict: "categoria" });
    setSubiendo(null);
    if (e2) { setMsg(e2.message); return; }
    setMsg(`Plantilla de ${categoria} actualizada.`); cargar();
  }

  return (
    <div style={{ border: "1px solid var(--sc-card-line)", borderRadius: 12, marginBottom: 14, background: "var(--sc-content)" }}>
      <button type="button" onClick={() => setAbierto((v) => !v)} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", background: "transparent", border: "none", cursor: "pointer", color: "var(--sc-text)", padding: "12px 14px", fontSize: 14, fontWeight: 700 }}>
        <span style={{ color: "var(--sc-text-soft)" }}>{abierto ? "▾" : "▸"}</span> 🖼️ Plantillas de impresión por tipo (solo administrador)
      </button>
      {abierto && (
        <div style={{ padding: "0 14px 14px" }}>
          <p style={{ fontSize: 12.5, color: "var(--sc-text-soft)", marginTop: 0 }}>
            Sube un diseño tipo imagen (PNG/JPG, horizontal ~1010×638 px) por cada tipo. Al imprimir, los datos se sobreponen a esa imagen. Si no subes plantilla, se usa el diseño integrado.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px,1fr))", gap: 12 }}>
            {CATEGORIAS.map((c) => (
              <div key={c} style={{ border: "1px solid var(--sc-card-line)", borderRadius: 10, padding: 10 }}>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>{c}</div>
                <div style={{ aspectRatio: "1.585", borderRadius: 8, border: "1px dashed var(--sc-card-line)", overflow: "hidden", background: "var(--sc-btn-soft,#f6ede1)", display: "grid", placeItems: "center", marginBottom: 8 }}>
                  {plantillas[c] ? <img src={urlFoto(plantillas[c]) ?? ""} alt={`Plantilla ${c}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: 12, color: "var(--sc-text-faint)" }}>Sin plantilla</span>}
                </div>
                <label style={{ fontSize: 12.5, color: "var(--sc-btn,#f4a03f)", fontWeight: 700, cursor: "pointer" }}>
                  {subiendo === c ? "Subiendo…" : plantillas[c] ? "Reemplazar imagen" : "Subir imagen"}
                  <input type="file" accept="image/*" style={{ display: "none" }} disabled={!!subiendo}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) subir(c, f); e.currentTarget.value = ""; }} />
                </label>
              </div>
            ))}
          </div>
          {msg && <p style={{ fontSize: 12.5, marginTop: 8, color: msg.includes("actualizada") ? "#0a7c2f" : "#b00020" }}>{msg}</p>}
        </div>
      )}
    </div>
  );
}

// Divide "Nombre y Apellidos" (una columna) en nombre + apellidos.
function partirNombre(full: string) {
  const p = full.trim().split(/\s+/);
  if (p.length <= 1) return { nombre: p[0] ?? full.trim(), ap: null as string | null, am: null as string | null };
  if (p.length === 2) return { nombre: p[0], ap: p[1], am: null as string | null };
  return { nombre: p.slice(0, -2).join(" "), ap: p[p.length - 2], am: p[p.length - 1] };
}

// Importar empleados del cliente (CSV de RH): Cliente, Nombre y Apellidos,
// #empleado, Departamento. Crea/actualiza en Personas (dedup por #empleado) y
// emite la credencial Empleado (código = #empleado, vigencia 1 año). La foto se
// toma en la cita al entregar la credencial.
function ImportarEmpleados({ onListo }: { onListo: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const [proc, setProc] = useState(false);
  const [res, setRes] = useState<{ creados: number; omitidos: number; errores: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function parseCSV(raw: string): { cliente: string; nombre: string; num: string; depto: string }[] {
    const lineas = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (!lineas.length) return [];
    const delim = (lineas[0].match(/;/g)?.length ?? 0) > (lineas[0].match(/,/g)?.length ?? 0) ? ";" : ",";
    const primero = lineas[0].toLowerCase();
    const hayHeader = /cliente|nombre|empleado|departamento/.test(primero);
    const filas = hayHeader ? lineas.slice(1) : lineas;
    return filas.map((l) => {
      const c = l.split(delim).map((x) => x.replace(/^"|"$/g, "").trim());
      return { cliente: c[0] ?? "", nombre: c[1] ?? "", num: c[2] ?? "", depto: c[3] ?? "" };
    }).filter((r) => r.num && r.nombre);
  }

  async function procesar() {
    setError(null); setRes(null);
    const filas = parseCSV(texto);
    if (!filas.length) { setError("No se detectaron filas válidas. Formato: Cliente, Nombre y Apellidos, #empleado, Departamento."); return; }
    setProc(true);
    let creados = 0, omitidos = 0, errores = 0;
    for (const r of filas) {
      try {
        // Persona (dedup por número de empleado).
        const { data: ex } = await supabase.from("personas").select("id").eq("datos_adicionales->>numero_empleado", r.num).limit(1);
        let personaId = (ex as any[])?.[0]?.id as string | undefined;
        if (!personaId) {
          const { nombre, ap, am } = partirNombre(r.nombre);
          const { data, error } = await supabase.from("personas").insert({
            nombre, apellido_paterno: ap, apellido_materno: am,
            datos_adicionales: { rol_persona: "empleado_cliente", empresa: r.cliente || null, numero_empleado: r.num, area: r.depto || null, origen: "importacion_rh" },
          }).select("id").single();
          if (error) throw error;
          personaId = (data as any).id;
        }
        // Credencial Empleado (dedup por código activo).
        const { data: cex } = await supabase.from("credenciales").select("id").eq("codigo", r.num).eq("estatus", "activo").limit(1);
        if (!(cex as any[])?.length) {
          const { error } = await supabase.from("credenciales").insert({
            categoria: "Empleado", persona_id: personaId, descripcion: r.depto || null, tipo: "qr", codigo: r.num,
            fecha_emision: new Date().toISOString(), vigencia_inicio: new Date().toISOString(), vigencia_fin: new Date(finAnio()).toISOString(),
            datos_adicionales: { origen: "importacion_rh" },
          });
          if (error) throw error;
          creados++;
        } else omitidos++;
      } catch { errores++; }
    }
    setProc(false);
    setRes({ creados, omitidos, errores });
    onListo();
  }

  return (
    <div style={{ border: "1px solid var(--sc-card-line)", borderRadius: 12, marginBottom: 14, background: "var(--sc-content)" }}>
      <button type="button" onClick={() => setAbierto((v) => !v)} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", background: "transparent", border: "none", cursor: "pointer", color: "var(--sc-text)", padding: "12px 14px", fontSize: 14, fontWeight: 700 }}>
        <span style={{ color: "var(--sc-text-soft)" }}>{abierto ? "▾" : "▸"}</span> ⬆️ Importar empleados del cliente (CSV de RH)
      </button>
      {abierto && (
        <div style={{ padding: "0 14px 14px" }}>
          <p style={{ fontSize: 12.5, color: "var(--sc-text-soft)", marginTop: 0 }}>
            Columnas: <b>Cliente, Nombre y Apellidos, #empleado, Departamento</b>. Crea la persona en Personas y emite su credencial <b>Empleado</b> (vigencia 1 año). La <b>foto se toma en la cita</b>.
          </p>
          <input type="file" accept=".csv,text/csv" onChange={(e) => { const f = e.target.files?.[0]; if (f) f.text().then(setTexto); }} style={{ marginBottom: 8 }} />
          <textarea value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={"Cliente, Nombre y Apellidos, #empleado, Departamento\nCEDIS Norte, Laura Méndez Ríos, EMP-0421, Logística"} style={{ display: "block", width: "100%", height: 120, resize: "vertical", fontFamily: "monospace", fontSize: 12.5 }} />
          <div style={{ marginTop: 8, display: "flex", gap: 10, alignItems: "center" }}>
            <button type="button" onClick={procesar} disabled={proc} style={{ background: "var(--sc-btn,#f4a03f)", color: "#fff", border: "none", borderRadius: 9, padding: "9px 16px", fontWeight: 700, cursor: "pointer" }}>{proc ? "Procesando…" : "Importar y emitir"}</button>
            {res && <span style={{ fontSize: 13, color: "#0a7c2f" }}>Emitidas: {res.creados} · Omitidas (ya existían): {res.omitidos}{res.errores ? ` · Errores: ${res.errores}` : ""}</span>}
          </div>
          {error && <p style={{ color: "#b00020", fontSize: 12.5, marginTop: 8 }}>{error}</p>}
        </div>
      )}
    </div>
  );
}

// Alta de credencial: categoría (tipo), fecha de emisión, tecnología, código y vigencia.
function NuevaCredencial({ onCreado }: { onCreado: () => void }) {
  const [personas, setPersonas] = useState<any[]>([]);
  const [f, setF] = useState({ categoria: "Empleado", persona_id: "", nombre: "", apellido_paterno: "", apellido_materno: "", referencia: "", tipo: "qr", codigo: "", fecha_emision: localDT(new Date()), vigencia_fin: "" });
  const [dias, setDias] = useState(1); // días de vigencia para Visitante
  const [foto, setFoto] = useState<Blob | null>(null); // foto en vivo del visitante
  const [sitios, setSitios] = useState<any[]>([]);
  const [zonas, setZonas] = useState<any[]>([]);
  const [selSitios, setSelSitios] = useState<string[]>([]);
  const [selZonas, setSelZonas] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  // Vigencia por defecto según el tipo: 1 año (empleado/guardia/servicio) o por
  // día(s) de visita (visitante, editable con el selector de días).
  useEffect(() => {
    setF((p) => ({ ...p, vigencia_fin: p.categoria === "Visitante" ? finVisita(dias) : finAnio() }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.categoria, dias]);

  useEffect(() => {
    supabase.from("personas").select("id, nombre, apellido_paterno, apellido_materno, datos_adicionales").order("nombre").limit(500)
      .then(({ data }) => setPersonas((data as any[]) ?? []));
    supabase.from("sitios").select("id, nombre").eq("estatus", "activo").order("nombre").then(({ data }) => setSitios((data as any[]) ?? []));
    supabase.from("zonas").select("id, nombre").eq("estatus", "activo").order("nombre").then(({ data }) => setZonas((data as any[]) ?? []));
    set("codigo", `CR-${crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Para Empleado/Guardia, prellena el código con el número del elemento (lo que
  // el guardia validará contra la lista de personal al escanear el QR).
  useEffect(() => {
    if (!f.persona_id || !(f.categoria === "Empleado" || f.categoria === "Guardia")) return;
    // Empleado del cliente: su número viene en la persona (importación de RH).
    const per = personas.find((p) => p.id === f.persona_id);
    const numEmp = per?.datos_adicionales?.numero_empleado;
    if (numEmp) { set("codigo", String(numEmp)); return; }
    // Guardia: número del elemento (personal).
    supabase.from("personal").select("numero_placa").eq("persona_id", f.persona_id).eq("estatus", "activo").maybeSingle()
      .then(({ data }) => { const n = (data as any)?.numero_placa; if (n) set("codigo", String(n)); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.persona_id, f.categoria]);

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!f.codigo.trim()) { setError("El código es obligatorio."); return; }
    if (f.categoria === "Visitante") {
      if (!f.nombre.trim()) { setError("Captura el nombre del visitante (queda en Personas)."); return; }
    } else if (!f.persona_id) {
      setError("Elige la persona de la lista (registro maestro)."); return;
    }
    setCreando(true);
    // Persona (registro maestro): existente, o se crea con los datos capturados.
    let personaId = f.persona_id;
    if (!personaId) {
      const { data: pdata, error: perr } = await supabase.from("personas").insert({
        nombre: f.nombre.trim(),
        apellido_paterno: f.apellido_paterno.trim() || null,
        apellido_materno: f.apellido_materno.trim() || null,
        datos_adicionales: { origen: "credencial", empresa: f.referencia.trim() || null },
      }).select("id").single();
      if (perr) { setCreando(false); setError(perr.message); return; }
      personaId = (pdata as any).id;
    }
    // Foto en vivo (visitante): se sube y queda como foto de la persona.
    if (foto && personaId) {
      const path = `personas/${personaId}/${Date.now()}.jpg`;
      const up = await supabase.storage.from("fotos").upload(path, foto, { contentType: "image/jpeg", upsert: true });
      if (!up.error) {
        const { data: cur } = await supabase.from("personas").select("fotografias").eq("id", personaId).maybeSingle();
        const previas = Array.isArray((cur as any)?.fotografias) ? (cur as any).fotografias : [];
        await supabase.from("personas").update({ fotografias: [path, ...previas], actualizado_en: new Date().toISOString() }).eq("id", personaId);
      }
    }
    const { error } = await supabase.from("credenciales").insert({
      categoria: f.categoria,
      persona_id: personaId || null,
      descripcion: f.referencia.trim() || null,
      tipo: f.tipo,
      codigo: f.codigo.trim(),
      fecha_emision: f.fecha_emision ? new Date(f.fecha_emision).toISOString() : new Date().toISOString(),
      vigencia_inicio: new Date().toISOString(),
      vigencia_fin: f.vigencia_fin ? new Date(f.vigencia_fin).toISOString() : null,
      datos_adicionales: {
        acceso: {
          sitios: sitios.filter((s) => selSitios.includes(s.id)).map((s) => ({ id: s.id, nombre: s.nombre })),
          zonas: zonas.filter((z) => selZonas.includes(z.id)).map((z) => ({ id: z.id, nombre: z.nombre })),
        },
      },
    });
    setCreando(false);
    if (error) { setError(error.message); return; }
    onCreado();
  }

  const chip = (on: boolean): React.CSSProperties => ({ padding: "6px 12px", borderRadius: 16, fontSize: 12.5, fontWeight: 600, cursor: "pointer", border: on ? "1.5px solid var(--sc-btn,#f4a03f)" : "1px solid var(--sc-card-line)", background: on ? "var(--sc-btn,#f4a03f)" : "transparent", color: on ? "#fff" : "var(--sc-text)" });

  return (
    <form onSubmit={crear}>
      <div className="form-fila" style={{ alignItems: "flex-end" }}>
        <label className="dash-sub" style={{ display: "flex", flexDirection: "column" }}>Tipo de credencial <span style={{ color: "#e11d48" }}>*</span>
          <select value={f.categoria} onChange={(e) => set("categoria", e.target.value)}>{CATEGORIAS.map((c) => <option key={c}>{c}</option>)}</select>
        </label>
        {f.categoria !== "Visitante" && (
          <label className="dash-sub" style={{ display: "flex", flexDirection: "column", flex: 2 }}>Persona (de la lista) <span style={{ color: "#e11d48" }}>*</span>
            <select value={f.persona_id} onChange={(e) => set("persona_id", e.target.value)}>
              <option value="">— Selecciona la persona —</option>
              {personas.map((p) => <option key={p.id} value={p.id}>{`${p.nombre ?? ""} ${p.apellido_paterno ?? ""} ${p.apellido_materno ?? ""}`.trim()}</option>)}
            </select>
          </label>
        )}
      </div>
      {f.categoria === "Visitante" && (
        <div className="form-fila" style={{ alignItems: "flex-end" }}>
          <label className="dash-sub" style={{ display: "flex", flexDirection: "column", flex: 2 }}>Nombre(s) <span style={{ color: "#e11d48" }}>*</span>
            <input value={f.nombre} onChange={(e) => set("nombre", e.target.value)} />
          </label>
          <label className="dash-sub" style={{ display: "flex", flexDirection: "column", flex: 1 }}>Apellido paterno
            <input value={f.apellido_paterno} onChange={(e) => set("apellido_paterno", e.target.value)} />
          </label>
          <label className="dash-sub" style={{ display: "flex", flexDirection: "column", flex: 1 }}>Apellido materno
            <input value={f.apellido_materno} onChange={(e) => set("apellido_materno", e.target.value)} />
          </label>
        </div>
      )}
      <div className="form-fila">
        <label className="dash-sub" style={{ display: "flex", flexDirection: "column", flex: 1 }}>Referencia (empresa, contrato, etc.)
          <input value={f.referencia} onChange={(e) => set("referencia", e.target.value)} placeholder="Empresa / contrato / motivo" />
        </label>
      </div>
      <div style={{ marginTop: 6 }}>
        <div className="dash-sub" style={{ fontWeight: 700, marginBottom: 4 }}>Acceso a sitios</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {sitios.length === 0 && <span className="dash-sub">Sin sitios activos.</span>}
          {sitios.map((s) => { const on = selSitios.includes(s.id); return (
            <button type="button" key={s.id} style={chip(on)} onClick={() => setSelSitios((p) => on ? p.filter((x) => x !== s.id) : [...p, s.id])}>{s.nombre}</button>
          ); })}
        </div>
        <div className="dash-sub" style={{ fontWeight: 700, margin: "10px 0 4px" }}>Acceso a zonas</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {zonas.length === 0 && <span className="dash-sub">Sin zonas activas.</span>}
          {zonas.map((z) => { const on = selZonas.includes(z.id); return (
            <button type="button" key={z.id} style={chip(on)} onClick={() => setSelZonas((p) => on ? p.filter((x) => x !== z.id) : [...p, z.id])}>{z.nombre}</button>
          ); })}
        </div>
      </div>
      {f.categoria === "Visitante" && (
        <div style={{ marginTop: 8 }}>
          <div className="dash-sub" style={{ marginBottom: 6, fontWeight: 700 }}>Foto del visitante (cámara del dispositivo o conectada)</div>
          <CamaraFoto onCapture={(b) => setFoto(b)} alto={220} />
          {foto && <p style={{ color: "#0a7c2f", fontSize: 13, marginTop: 4 }}>✓ Foto lista</p>}
        </div>
      )}
      <div className="form-fila" style={{ alignItems: "flex-end" }}>
        <label className="dash-sub" style={{ display: "flex", flexDirection: "column" }}>Tecnología
          <select value={f.tipo} onChange={(e) => set("tipo", e.target.value)}>
            <option value="qr">QR</option>
            <option value="nfc">NFC</option>
            <option value="temporal">Código temporal</option>
          </select>
        </label>
        <label className="dash-sub" style={{ display: "flex", flexDirection: "column", flex: 1 }}>Código <span style={{ color: "#e11d48" }}>*</span>
          <input value={f.codigo} onChange={(e) => set("codigo", e.target.value)} required />
        </label>
        <label className="dash-sub" style={{ display: "flex", flexDirection: "column" }}>Emisión
          <input type="datetime-local" value={f.fecha_emision} onChange={(e) => set("fecha_emision", e.target.value)} />
        </label>
        {f.categoria === "Visitante" ? (
          <label className="dash-sub" style={{ display: "flex", flexDirection: "column" }}>Días de vigencia
            <input type="number" min={1} max={90} value={dias} onChange={(e) => setDias(Math.max(1, Number(e.target.value) || 1))} style={{ width: 96 }} />
          </label>
        ) : (
          <label className="dash-sub" style={{ display: "flex", flexDirection: "column" }}>Vence
            <input type="datetime-local" value={f.vigencia_fin} onChange={(e) => set("vigencia_fin", e.target.value)} />
          </label>
        )}
        <button type="submit" disabled={creando}>{creando ? "Emitiendo…" : "Emitir credencial"}</button>
      </div>
      {f.categoria === "Visitante" && <div className="dash-sub" style={{ fontSize: 12, marginTop: 4 }}>Vigencia hasta: {f.vigencia_fin ? new Date(f.vigencia_fin).toLocaleString() : "—"} ({dias} día{dias === 1 ? "" : "s"}).</div>}
      <div style={{ marginTop: 6, background: "var(--sc-surface-2, #f3f6f9)", border: "1px solid var(--sc-card-line, #e2e6ec)", borderRadius: 8, padding: 8 }}>
        <div className="dash-sub" style={{ fontSize: 12.5, color: "#0b3d66", fontWeight: 700 }}>
          {f.categoria} · Contenido ({tipoLabel(f.tipo)}): <code>{f.codigo || "—"}</code>
        </div>
        <div className="dash-sub" style={{ fontSize: 12 }}>Es el valor que valida el sistema en la caseta. En Empleado/Guardia conviene que sea su número de elemento.</div>
      </div>
      {error && <p style={{ color: "#b00020" }}>{error}</p>}
    </form>
  );
}

export default function CredencialesPage() {
  const [k, setK] = useState(0);
  return (
    <div>
      <PlantillasPanel />
      <ImportarEmpleados onListo={() => setK((x) => x + 1)} />
      <ListaMaestra
        key={k}
        titulo="Credenciales"
        subtitulo="Credenciales por tipo (Empleado, Guardia, Visitante, Servicio) con QR/NFC; se validan en la caseta y se imprimen con su plantilla."
        tabla="credenciales"
        modulo="credenciales"
        orderBy="creado_en"
        select="id, folio, categoria, persona_id, descripcion, tipo, codigo, fecha_emision, vigencia_inicio, vigencia_fin, estatus, creado_en, persona:personas(nombre, apellido_paterno, apellido_materno)"
        placeholderBuscar="Buscar código, persona, tipo, descripción…"
        columnas={[
          { header: "Folio", celda: (r) => r.folio ?? "—" },
          { header: "Tipo", celda: (r) => r.categoria ?? "—" },
          { header: "Titular", celda: (r) => (r.persona ? `${r.persona.nombre ?? ""} ${r.persona.apellido_paterno ?? ""}`.trim() : r.descripcion ?? "—") },
          { header: "Tecnología", celda: (r) => tipoLabel(r.tipo) },
          { header: "Código", celda: (r) => <code>{r.codigo}</code> },
          { header: "Emisión", celda: (r) => (r.fecha_emision ? new Date(r.fecha_emision).toLocaleDateString() : "—") },
          { header: "Vigente", celda: (r) => (vigente(r) ? <span style={{ color: "#0a7c2f", fontWeight: 700 }}>Sí</span> : <span style={{ color: "#b00020" }}>No</span>) },
        ]}
        textoBusqueda={(r) => `${r.codigo} ${r.categoria ?? ""} ${r.descripcion ?? ""} ${r.persona?.nombre ?? ""} ${r.persona?.apellido_paterno ?? ""} ${r.folio ?? ""}`}
        detalleHref={(r) => `/credenciales/${r.id}`}
        filtros={[
          { k: "todas", label: "Todas" },
          ...CATEGORIAS.map((c) => ({ k: c.toLowerCase(), label: c, test: (r: any) => r.categoria === c })),
          { k: "vigentes", label: "Vigentes", test: (r: any) => vigente(r) },
        ]}
        quickView={(r) => (
          <>
            <h3 style={{ margin: "0 0 8px" }}>{r.persona ? `${r.persona.nombre ?? ""} ${r.persona.apellido_paterno ?? ""}`.trim() : r.descripcion ?? "Credencial"}</h3>
            <dl className="sc-kv">
              <dt>Tipo</dt><dd>{r.categoria ?? "—"}</dd>
              <dt>Titular</dt><dd>{r.persona ? `${r.persona.nombre ?? ""} ${r.persona.apellido_paterno ?? ""} ${r.persona.apellido_materno ?? ""}`.trim() : "—"}</dd>
              <dt>Referencia</dt><dd>{r.descripcion ?? "—"}</dd>
              <dt>Folio</dt><dd>{r.folio ?? "—"}</dd>
              <dt>Tecnología</dt><dd>{tipoLabel(r.tipo)}</dd>
              <dt>Código</dt><dd><code>{r.codigo}</code></dd>
              <dt>Emisión</dt><dd>{r.fecha_emision ? new Date(r.fecha_emision).toLocaleString() : "—"}</dd>
              <dt>Vence</dt><dd>{r.vigencia_fin ? new Date(r.vigencia_fin).toLocaleString() : "sin vencimiento"}</dd>
              <dt>Vigente</dt><dd>{vigente(r) ? "Sí" : "No"}</dd>
            </dl>
            {r.estatus === "activo" && r.tipo !== "nfc" && r.codigo && (
              <div style={{ marginTop: 12, textAlign: "center", padding: 12, border: "1px solid var(--sc-card-line)", borderRadius: 8 }}>
                <QRCodeSVG value={r.codigo} size={150} includeMargin level="M" />
                <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>Escanéalo en la caseta</div>
              </div>
            )}
          </>
        )}
        editar={[
          { campo: "categoria", label: "Tipo de credencial", tipo: "select", opciones: CATEGORIAS },
          { campo: "descripcion", label: "Referencia (empresa, contrato, etc.)" },
          { campo: "tipo", label: "Tecnología", tipo: "select", opciones: ["qr", "nfc", "temporal"] },
          { campo: "vigencia_fin", label: "Vence", tipo: "date" },
        ]}
        nuevo={(onCreado) => <NuevaCredencial onCreado={onCreado} />}
      />
    </div>
  );
}
