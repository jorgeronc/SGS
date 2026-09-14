"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import ListaMaestra from "@/app/components/ListaMaestra";

const dtLocal = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
const nombrePersonal = (p: any) => {
  const x = p?.persona ?? p;
  return x ? `${x.nombre ?? ""} ${x.apellido_paterno ?? ""} ${x.apellido_materno ?? ""}`.trim() : "—";
};

// Alta de cita de visitante: el guardia/empleado elige sitio + fecha/hora acordada y
// quién solicitó la cita; se genera un LINK de un solo uso para que el visitante
// registre sus datos. Queda registrado quién creó el link (la sesión actual).
function NuevaCitaVisitante({ onCreado }: { onCreado: () => void }) {
  const [sitios, setSitios] = useState<any[]>([]);
  const [personal, setPersonal] = useState<any[]>([]);
  const [miPersonalId, setMiPersonalId] = useState<string>("");
  const [miNombre, setMiNombre] = useState<string>("");

  const [sitioSel, setSitioSel] = useState("");
  const [fecha, setFecha] = useState(dtLocal(new Date(Date.now() + 3600000)));
  const [mismaPersona, setMismaPersona] = useState(false);
  const [solicitanteSel, setSolicitanteSel] = useState("");
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const [resultado, setResultado] = useState<{ folio: string; link: string } | null>(null);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    supabase.from("sitios").select("id, nombre").eq("estatus", "activo").order("nombre").then(({ data }) => setSitios((data as any[]) ?? []));
    supabase.from("personal").select("id, usuario_id, persona:personas(nombre, apellido_paterno, apellido_materno)")
      .eq("estatus", "activo").eq("estado_laboral", "activo").order("id").limit(500)
      .then(({ data }) => setPersonal((data as any[]) ?? []));
    supabase.auth.getUser().then(({ data }) => {
      const uid = data.user?.id;
      if (!uid) return;
      supabase.from("personal").select("id, persona:personas(nombre, apellido_paterno, apellido_materno)").eq("usuario_id", uid).maybeSingle()
        .then(({ data: p }) => { if (p) { setMiPersonalId((p as any).id); setMiNombre(nombrePersonal(p)); } });
    });
  }, []);

  const solicitante = mismaPersona ? miPersonalId : solicitanteSel;

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setResultado(null);
    if (!sitioSel) { setError("Elige el sitio."); return; }
    if (!fecha) { setError("Indica la fecha y hora de la cita."); return; }
    if (!solicitante) { setError("Indica quién solicitó la cita (o marca «el mismo que registra»)."); return; }
    setCreando(true);
    const { data, error: err } = await supabase.rpc("rpc_generar_cita_visitante", {
      p_sitio: sitioSel, p_fecha_hora: new Date(fecha).toISOString(),
      p_motivo: motivo || null, p_solicitante: solicitante,
    });
    setCreando(false);
    if (err) { setError(err.message); return; }
    const row = ((data as any[]) ?? [])[0];
    if (!row?.token) { setError("No se pudo generar el link."); return; }
    const link = `${window.location.origin}/visita/${row.token}`;
    setResultado({ folio: row.folio, link });
    setSitioSel(""); setMotivo(""); setSolicitanteSel(""); setMismaPersona(false);
    setFecha(dtLocal(new Date(Date.now() + 3600000)));
    onCreado();
  }

  function copiar() { if (resultado) { navigator.clipboard?.writeText(resultado.link); setCopiado(true); setTimeout(() => setCopiado(false), 1500); } }
  function whatsapp() { if (resultado) window.open(`https://wa.me/?text=${encodeURIComponent(`Registra tu visita (${resultado.folio}): ${resultado.link}`)}`, "_blank"); }

  return (
    <form onSubmit={crear}>
      <p className="dash-sub" style={{ marginTop: 0 }}>
        Registra la cita y genera un <b>link de un solo uso</b> para que el visitante capture sus datos. El link se destruye al enviarse el registro.
        {miNombre ? <> Lo registra: <b>{miNombre}</b>.</> : null}
      </p>
      <div className="form-grid">
        <label>Sitio
          <select value={sitioSel} onChange={(e) => setSitioSel(e.target.value)}>
            <option value="">— Selecciona el sitio —</option>
            {sitios.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
        </label>
        <label>Fecha y hora de la cita
          <input type="datetime-local" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </label>
        <label>Solicitado por (empleado/guardia)
          <select value={solicitanteSel} disabled={mismaPersona} onChange={(e) => setSolicitanteSel(e.target.value)}>
            <option value="">{mismaPersona ? (miNombre || "Yo") : "— Selecciona —"}</option>
            {personal.map((p) => <option key={p.id} value={p.id}>{nombrePersonal(p)}</option>)}
          </select>
          <label className="dash-sub" style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, fontWeight: 400 }}>
            <input type="checkbox" checked={mismaPersona} disabled={!miPersonalId} onChange={(e) => setMismaPersona(e.target.checked)} />
            El mismo que registra{miNombre ? ` (${miNombre})` : ""}
          </label>
        </label>
        <label>Motivo <span className="dash-sub">(opcional)</span>
          <input type="text" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej. Entrevista, proveedor…" />
        </label>
      </div>

      {error && <p style={{ color: "#b00020" }}>{error}</p>}
      <div style={{ marginTop: 10 }}>
        <button type="submit" disabled={creando}>{creando ? "Generando…" : "Generar cita y link"}</button>
      </div>

      {resultado && (
        <div style={{ marginTop: 14, border: "1px solid var(--sc-card-line)", borderRadius: 10, padding: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
            <span style={{ fontFamily: "monospace", background: "var(--sc-btn-soft,#f6ede1)", padding: "3px 10px", borderRadius: 8 }}>{resultado.folio}</span>
            <span className="dash-sub">Pendiente de registro</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--sc-btn-soft,#f6ede1)", borderRadius: 8, padding: "8px 10px", flexWrap: "wrap" }}>
            <span style={{ flex: 1, minWidth: 200, fontFamily: "monospace", fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{resultado.link}</span>
            <button type="button" className="secundario" onClick={copiar}>{copiado ? "¡Copiado!" : "Copiar"}</button>
            <button type="button" className="secundario" onClick={whatsapp}>WhatsApp</button>
          </div>
          <p className="dash-sub" style={{ fontSize: 12, marginTop: 8 }}>Reenvía el link al visitante. Al registrarse, la cita pasa a «Registrada» y el link deja de funcionar.</p>
        </div>
      )}
    </form>
  );
}

const ESTADO_LBL: Record<string, string> = { pendiente: "Pendiente", registrada: "Registrada", cancelada: "Cancelada" };

export default function CitasVisitantesPage() {
  return (
    <ListaMaestra
      titulo="Citas de visitantes"
      subtitulo="Agenda de visitas por sitio: entrevistas, proveedores y citas. El visitante registra sus datos por un link de un solo uso."
      tabla="citas_visitantes"
      modulo="citas_visitantes"
      orderBy="folio"
      select="id, folio, fecha_hora_cita, estado, empresa, telefono, estatus, creado_en, sitio:sitios(nombre), persona:personas(nombre, apellido_paterno, apellido_materno)"
      placeholderBuscar="Buscar folio, sitio o visitante…"
      columnas={[
        { header: "Folio", campo: "folio", celda: (r) => r.folio ?? "—" },
        { header: "Sitio", celda: (r) => r.sitio?.nombre ?? "—" },
        { header: "Cita", campo: "fecha_hora_cita", celda: (r) => r.fecha_hora_cita ? new Date(r.fecha_hora_cita).toLocaleString() : "—" },
        { header: "Visitante", celda: (r) => (r.persona ? nombrePersonal(r) : "— pendiente —") },
        { header: "Empresa", celda: (r) => r.empresa ?? "—" },
        { header: "Estado", campo: "estado", celda: (r) => ESTADO_LBL[r.estado] ?? r.estado },
      ]}
      textoBusqueda={(r) => `${r.folio ?? ""} ${r.sitio?.nombre ?? ""} ${r.persona ? nombrePersonal(r) : ""} ${r.empresa ?? ""}`}
      detalleHref={() => "#"}
      filtros={[
        { k: "todos", label: "Todas" },
        { k: "pendiente", label: "Pendientes", test: (r) => r.estado === "pendiente" },
        { k: "registrada", label: "Registradas", test: (r) => r.estado === "registrada" },
      ]}
      quickView={(r) => (
        <>
          <h3 style={{ margin: "0 0 8px" }}>{r.folio ?? "Cita"}</h3>
          <dl className="sc-kv">
            <dt>Sitio</dt><dd>{r.sitio?.nombre ?? "—"}</dd>
            <dt>Cita</dt><dd>{r.fecha_hora_cita ? new Date(r.fecha_hora_cita).toLocaleString() : "—"}</dd>
            <dt>Visitante</dt><dd>{r.persona ? nombrePersonal(r) : "— pendiente —"}</dd>
            <dt>Teléfono</dt><dd>{r.telefono ?? "—"}</dd>
            <dt>Empresa</dt><dd>{r.empresa ?? "—"}</dd>
            <dt>Estado</dt><dd>{ESTADO_LBL[r.estado] ?? r.estado}</dd>
          </dl>
        </>
      )}
      nuevo={(onCreado) => <NuevaCitaVisitante onCreado={onCreado} />}
    />
  );
}
