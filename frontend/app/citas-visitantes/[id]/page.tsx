"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { SelectPersonal } from "@/app/components/Pickers";

const ESTADO_LBL: Record<string, string> = { pendiente: "Pendiente de registro", registrada: "Registrada", cancelada: "Cancelada" };
const nombrePersona = (p: any) => (p ? `${p.nombre ?? ""} ${p.apellido_paterno ?? ""} ${p.apellido_materno ?? ""}`.trim() : "—");
const dtLocal = (s: string | null) => (s ? new Date(new Date(s).getTime() - new Date(s).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "");

export default function CitaVisitanteDetallePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [c, setC] = useState<any>(null);
  const [solicitante, setSolicitante] = useState<string>("—");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [sitios, setSitios] = useState<any[]>([]);
  const [editando, setEditando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [ed, setEd] = useState<{ sitio_id: string; fecha_hora_cita: string; solicitante_personal_id: string }>({ sitio_id: "", fecha_hora_cita: "", solicitante_personal_id: "" });

  useEffect(() => {
    supabase.from("sitios").select("id, nombre").eq("estatus", "activo").order("nombre").then(({ data }) => setSitios((data as any[]) ?? []));
  }, []);

  const cargar = useCallback(async () => {
    setCargando(true);
    const { data, error: err } = await supabase.from("citas_visitantes")
      .select("id, folio, fecha_hora_cita, estado, motivo, telefono, empresa, persona_visita_texto, persona_id, token, token_expira, registrado_en, creado_en, solicitante_personal_id, sitio_id, estatus, sitio:sitios(nombre), persona:personas(nombre, apellido_paterno, apellido_materno), vehiculo:vehiculos(marca, modelo, placas)")
      .eq("id", params.id).maybeSingle();
    if (err) { setError(err.message); setCargando(false); return; }
    setC(data);
    if ((data as any)?.solicitante_personal_id) {
      const { data: p } = await supabase.from("personal").select("persona:personas(nombre, apellido_paterno, apellido_materno)").eq("id", (data as any).solicitante_personal_id).maybeSingle();
      setSolicitante(nombrePersona((p as any)?.persona));
    }
    setCargando(false);
  }, [params.id]);

  useEffect(() => { cargar(); }, [cargar]);

  const link = c?.token ? `${typeof window !== "undefined" ? window.location.origin : ""}/visita/${c.token}` : null;
  function copiar() { if (link) { navigator.clipboard?.writeText(link); setCopiado(true); setTimeout(() => setCopiado(false), 1500); } }
  function whatsapp() { if (link) window.open(`https://wa.me/?text=${encodeURIComponent(`Registra tu visita (${c.folio}): ${link}`)}`, "_blank"); }
  // Envía los datos de la cita al alta de credencial (tipo Visitante). El guardia
  // elige sitio/zona y toma la foto; la empresa va en "Referencia".
  function emitirCredencial() {
    // Se pasa el folio (id de la cita); el alta de credenciales lo preselecciona y
    // trae los datos del visitante. El guardia elige sitio/zona y toma la foto.
    router.push(`/credenciales?cat=Visitante&folio=${encodeURIComponent(c.id)}`);
  }
  function iniciarEdicion() {
    setEd({ sitio_id: c.sitio_id ?? (c.sitio?.id ?? ""), fecha_hora_cita: dtLocal(c.fecha_hora_cita), solicitante_personal_id: c.solicitante_personal_id ?? "" });
    setMsg(null); setEditando(true);
  }
  async function guardarCita() {
    setGuardando(true); setMsg(null);
    const { error: err } = await supabase.from("citas_visitantes").update({
      sitio_id: ed.sitio_id || null,
      fecha_hora_cita: ed.fecha_hora_cita ? new Date(ed.fecha_hora_cita).toISOString() : null,
      solicitante_personal_id: ed.solicitante_personal_id || null,
      actualizado_en: new Date().toISOString(),
    }).eq("id", params.id);
    setGuardando(false);
    if (err) { setMsg(err.message); return; }
    setEditando(false); cargar();
  }

  const card: React.CSSProperties = { border: "1px solid var(--sc-card-line)", borderRadius: 12, padding: "12px 16px", marginTop: 10, background: "var(--sc-content)" };

  if (cargando) return <main className="contenedor"><p>Cargando…</p></main>;
  if (error) return <main className="contenedor"><p style={{ color: "#b00020" }}>{error}</p></main>;
  if (!c) return <main className="contenedor"><p>Cita no encontrada.</p></main>;

  const vencido = c.token_expira && new Date(c.token_expira) < new Date();

  return (
    <main className="contenedor">
      <p><Link href="/citas-visitantes">← Citas de visitantes</Link></p>
      <h1 className="dash-h1">{c.folio ?? "Cita"} · Visitante</h1>
      <p className="dash-sub">Estado: <b>{ESTADO_LBL[c.estado] ?? c.estado}</b>{c.estatus === "cancelado" ? " · CANCELADA" : ""}</p>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginTop: 6 }}>
        <h3 style={{ margin: 0 }}>Datos de la cita</h3>
        {c.estado === "pendiente" && c.estatus !== "cancelado" && (
          !editando
            ? <button onClick={iniciarEdicion}>✏️ Editar</button>
            : <span style={{ display: "flex", gap: 8 }}><button onClick={guardarCita} disabled={guardando}>{guardando ? "Guardando…" : "💾 Guardar"}</button><button className="secundario" onClick={() => { setEditando(false); setMsg(null); }}>Cancelar</button></span>
        )}
      </div>
      <div style={card}>
        {!editando ? (
          <dl className="sc-kv" style={{ margin: 0 }}>
            <dt>Sitio</dt><dd>{c.sitio?.nombre ?? "—"}</dd>
            <dt>Fecha y hora</dt><dd>{c.fecha_hora_cita ? new Date(c.fecha_hora_cita).toLocaleString() : "—"}</dd>
            <dt>Solicitado por</dt><dd>{solicitante}</dd>
          </dl>
        ) : (
          <div className="form-grid">
            <label>Sitio
              <select value={ed.sitio_id} onChange={(e) => setEd((p) => ({ ...p, sitio_id: e.target.value }))}>
                <option value="">— Sitio —</option>
                {sitios.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select>
            </label>
            <label>Fecha y hora de la cita
              <input type="datetime-local" value={ed.fecha_hora_cita} onChange={(e) => setEd((p) => ({ ...p, fecha_hora_cita: e.target.value }))} />
            </label>
            <label style={{ gridColumn: "1 / -1" }}>Solicitado por (empleado/guardia)
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <SelectPersonal value={ed.solicitante_personal_id} onChange={(v) => setEd((p) => ({ ...p, solicitante_personal_id: v }))} placeholder="— Solicitante —" />
              </div>
            </label>
          </div>
        )}
        {msg && <p style={{ color: "#b00020", marginBottom: 0 }}>{msg}</p>}
      </div>

      {c.estado === "pendiente" ? (
        <>
          <h3>Link del visitante</h3>
          <div style={card}>
            {link && !vencido ? (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--sc-btn-soft,#f6ede1)", borderRadius: 8, padding: "8px 10px", flexWrap: "wrap" }}>
                  <span style={{ flex: 1, minWidth: 220, fontFamily: "monospace", fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{link}</span>
                  <button className="secundario" onClick={copiar}>{copiado ? "¡Copiado!" : "Copiar"}</button>
                  <button className="secundario" onClick={whatsapp}>WhatsApp</button>
                </div>
                <p className="dash-sub" style={{ fontSize: 12, marginTop: 8, marginBottom: 0 }}>Reenvíalo al visitante. Es de un solo uso: al registrarse, deja de funcionar.{c.token_expira ? ` Vence: ${new Date(c.token_expira).toLocaleString()}.` : ""}</p>
              </>
            ) : (
              <p className="dash-sub" style={{ color: "#8a1220", margin: 0 }}>El link {vencido ? "venció" : "no está disponible"}. Genera una nueva cita para emitir otro link.</p>
            )}
          </div>
        </>
      ) : c.estado === "registrada" ? (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginTop: 6 }}>
            <h3 style={{ margin: 0 }}>Datos del visitante</h3>
            <button onClick={emitirCredencial}>🎫 Emitir credencial de visitante</button>
          </div>
          <div style={card}>
            <dl className="sc-kv" style={{ margin: 0 }}>
              <dt>Visitante</dt><dd>{nombrePersona(c.persona)}</dd>
              <dt>Teléfono</dt><dd>{c.telefono ?? "—"}</dd>
              <dt>Motivo</dt><dd>{c.motivo ?? "—"}</dd>
              <dt>Persona a la que visita</dt><dd>{c.persona_visita_texto ?? "—"}</dd>
              <dt>Empresa</dt><dd>{c.empresa ?? "—"}</dd>
              <dt>Vehículo</dt><dd>{c.vehiculo ? `${c.vehiculo.marca ?? ""} ${c.vehiculo.modelo ?? ""} · ${c.vehiculo.placas ?? ""}`.trim() : "—"}</dd>
              <dt>Registrado</dt><dd>{c.registrado_en ? new Date(c.registrado_en).toLocaleString() : "—"}</dd>
            </dl>
          </div>
          <p className="dash-sub" style={{ fontSize: 12, marginTop: 8 }}>Al emitir la credencial se enviarán nombre, apellidos y empresa (en Referencia); el guardia elige sitio y zona, y toma la foto.</p>
        </>
      ) : null}
    </main>
  );
}
