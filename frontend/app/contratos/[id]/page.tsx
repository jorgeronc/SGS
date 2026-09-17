"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { CatalogoSelect } from "@/app/components/CatalogoSelect";
import { SLA_CATALOGO, getSlaConfig } from "@/lib/sla";
import { ESTADO_CONTRATO } from "@/lib/contratos";

type Tab = "resumen" | "servicios" | "sitios" | "sla" | "historial";
const ESTADOS: string[] = ["borrador", "por_aprobar", "programado", "activo", "suspendido", "por_vencer", "vencido", "terminado", "cerrado"];
const COBERTURAS = ["24x7", "franja", "eventual"];
// Requerimientos cuantificables por servicio (catálogo en código).
const REQ_CAT = [
  { clave: "guardias_turno", nombre: "Guardias por turno", unidad: "" },
  { clave: "rondines_turno", nombre: "Rondines por turno", unidad: "" },
  { clave: "visitas_supervisor_turno", nombre: "Visitas de supervisor / turno", unidad: "" },
  { clave: "inspecciones_dia", nombre: "Inspecciones por día", unidad: "" },
  { clave: "tiempo_resp_min", nombre: "Tiempo máx. de respuesta", unidad: "min" },
  { clave: "cobertura_pct", nombre: "Cobertura requerida", unidad: "%" },
];
const reqNombre = (c: string) => REQ_CAT.find((r) => r.clave === c)?.nombre ?? c;
const fmtFecha = (s: string | null) => (s ? new Date(s + "T00:00:00").toLocaleDateString() : "—");

export default function ContratoDetallePage() {
  const params = useParams<{ id: string }>();
  const [c, setC] = useState<any>(null);
  const [servicios, setServicios] = useState<any[]>([]);
  const [puestos, setPuestos] = useState<any[]>([]);
  const [reqs, setReqs] = useState<any[]>([]);
  const [slaOverride, setSlaOverride] = useState<Record<string, { valor: number | null; activa: boolean }>>({});
  const [slaCliente, setSlaCliente] = useState<Record<string, { valor: number | null; activa: boolean }>>({});
  const [sitiosCliente, setSitiosCliente] = useState<any[]>([]);
  const [tab, setTab] = useState<Tab>("resumen");
  const [editando, setEditando] = useState(false);
  const [ed, setEd] = useState<any>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [expandido, setExpandido] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const { data: ct, error: e1 } = await supabase.from("contratos")
      .select("*, cliente:clientes(razon_social), coordinador:personal!contratos_coordinador_operativo_fkey(persona:personas(nombre, apellido_paterno, apellido_materno))")
      .eq("id", params.id).maybeSingle();
    if (e1) { setError(e1.message); return; }
    setC(ct);
    setEd({
      nombre: (ct as any)?.nombre ?? "", numero: (ct as any)?.numero ?? "", descripcion: (ct as any)?.descripcion ?? "",
      fecha_inicio: (ct as any)?.fecha_inicio ?? "", fecha_fin: (ct as any)?.fecha_fin ?? "",
      referencia_comercial: (ct as any)?.referencia_comercial ?? "", account_manager: (ct as any)?.account_manager ?? "",
      coordinador_operativo: (ct as any)?.coordinador_operativo ?? "", renovacion_tipo: (ct as any)?.renovacion_tipo ?? "manual",
      renovacion_aviso_dias: (ct as any)?.renovacion_aviso_dias ?? 30, notas: (ct as any)?.notas ?? "",
    });
    const clienteId = (ct as any)?.cliente_id;
    const [{ data: sv }, { data: si }] = await Promise.all([
      supabase.from("contrato_servicios").select("*, sitio:sitios(nombre)").eq("contrato_id", params.id).eq("estatus", "activo").order("creado_en"),
      clienteId ? supabase.from("sitios").select("id, nombre").eq("cliente_id", clienteId).eq("estatus", "activo").order("nombre") : Promise.resolve({ data: [] } as any),
    ]);
    setServicios((sv as any[]) ?? []);
    setSitiosCliente((si as any[]) ?? []);
    const svIds = ((sv as any[]) ?? []).map((s) => s.id);
    if (svIds.length) {
      const [{ data: pu }, { data: rq }] = await Promise.all([
        supabase.from("contrato_puestos").select("*, sitio:sitios(nombre)").in("contrato_servicio_id", svIds).eq("estatus", "activo").order("creado_en"),
        supabase.from("contrato_requerimientos").select("*").in("contrato_servicio_id", svIds).eq("estatus", "activo").order("creado_en"),
      ]);
      setPuestos((pu as any[]) ?? []);
      setReqs((rq as any[]) ?? []);
    } else { setPuestos([]); setReqs([]); }
    // SLA: override del contrato + config del cliente (para mostrar herencia).
    const { data: sm } = await supabase.from("contrato_sla_metas").select("clave, valor, activa").eq("contrato_id", params.id);
    const ov: Record<string, { valor: number | null; activa: boolean }> = {};
    ((sm as any[]) ?? []).forEach((r) => { ov[r.clave] = { valor: r.valor, activa: r.activa }; });
    setSlaOverride(ov);
    if (clienteId) setSlaCliente(await getSlaConfig(clienteId));
  }, [params.id]);

  useEffect(() => { cargar(); }, [cargar]);

  async function guardarCabecera() {
    setGuardando(true); setError(null); setMsg(null);
    if (ed.fecha_inicio && ed.fecha_fin && ed.fecha_fin < ed.fecha_inicio) { setError("La fecha fin no puede ser anterior al inicio."); setGuardando(false); return; }
    const { error } = await supabase.from("contratos").update({
      nombre: ed.nombre.trim() || null, numero: ed.numero || null, descripcion: ed.descripcion || null,
      fecha_inicio: ed.fecha_inicio || null, fecha_fin: ed.fecha_fin || null,
      referencia_comercial: ed.referencia_comercial || null, account_manager: ed.account_manager || null,
      coordinador_operativo: ed.coordinador_operativo || null, renovacion_tipo: ed.renovacion_tipo || null,
      renovacion_aviso_dias: ed.renovacion_aviso_dias ? Number(ed.renovacion_aviso_dias) : null, notas: ed.notas || null,
      actualizado_en: new Date().toISOString(),
    }).eq("id", params.id);
    setGuardando(false);
    if (error) { setError(error.message); return; }
    setMsg("Cambios guardados."); setEditando(false); cargar();
  }

  async function cambiarEstado(estado: string) {
    setError(null);
    const { error } = await supabase.from("contratos").update({ estado, actualizado_en: new Date().toISOString() }).eq("id", params.id);
    if (error) { setError(error.message); return; }
    cargar();
  }

  const dotacionContratada = useMemo(() => servicios.reduce((a, s) => a + (s.guardias_requeridos ?? 0), 0), [servicios]);
  const sitiosSet = useMemo(() => new Set(servicios.filter((s) => s.sitio_id).map((s) => s.sitio_id)), [servicios]);
  const diasRestantes = c?.fecha_fin ? Math.ceil((new Date(c.fecha_fin + "T00:00:00").getTime() - Date.now()) / 86400000) : null;

  if (!c) return <main className="contenedor">{error ? <p style={{ color: "#b00020" }}>{error}</p> : <p>Cargando…</p>}</main>;

  const est = ESTADO_CONTRATO[c.estado] ?? { lbl: c.estado, bg: "#607d8b", fg: "#fff" };
  const nombrePersona = (p: any) => (p?.persona ? `${p.persona.nombre ?? ""} ${p.persona.apellido_paterno ?? ""}`.trim() : "—");
  const card: React.CSSProperties = { border: "1px solid var(--sc-card-line)", borderRadius: 12, padding: "12px 16px", background: "var(--sc-content)" };
  const tabBtn = (k: Tab, label: string): React.CSSProperties => ({ padding: "9px 14px", fontSize: 13.5, fontWeight: 700, cursor: "pointer", background: "transparent", border: "none", borderBottom: tab === k ? "3px solid var(--sc-btn,#f4a03f)" : "3px solid transparent", color: tab === k ? "var(--sc-text)" : "var(--sc-text-soft)" });

  return (
    <main className="contenedor">
      <p style={{ marginBottom: 4 }}><Link href="/contratos">← Contratos</Link></p>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <h1 className="dash-h1" style={{ marginBottom: 4 }}>{c.folio ? `[${c.folio}] ` : ""}{c.nombre}</h1>
          <p className="dash-sub" style={{ margin: 0 }}>{c.cliente?.razon_social ?? "—"} · {fmtFecha(c.fecha_inicio)} → {fmtFecha(c.fecha_fin)}{diasRestantes != null ? ` · ${diasRestantes >= 0 ? `${diasRestantes} días restantes` : `vencido hace ${-diasRestantes} días`}` : ""}</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ background: est.bg, color: est.fg, fontWeight: 700, fontSize: 13, borderRadius: 8, padding: "4px 12px" }}>{est.lbl}</span>
          <label className="dash-sub" style={{ display: "flex", alignItems: "center", gap: 6 }}>Estado
            <select value={c.estado} onChange={(e) => cambiarEstado(e.target.value)}>
              {ESTADOS.map((s) => <option key={s} value={s}>{ESTADO_CONTRATO[s]?.lbl ?? s}</option>)}
            </select>
          </label>
        </div>
      </div>

      <div style={{ display: "flex", gap: 20, margin: "14px 0", flexWrap: "wrap" }}>
        <div className="cad-stat"><span className="cad-stat-lbl">Sitios</span><b>{sitiosSet.size}</b></div>
        <div className="cad-stat"><span className="cad-stat-lbl">Servicios</span><b>{servicios.length}</b></div>
        <div className="cad-stat"><span className="cad-stat-lbl">Dotación contratada</span><b>{dotacionContratada}</b></div>
        <div className="cad-stat"><span className="cad-stat-lbl">Coordinador</span><b>{nombrePersona(c.coordinador)}</b></div>
      </div>

      <div style={{ display: "flex", borderBottom: "1px solid var(--sc-card-line)", flexWrap: "wrap", marginBottom: 14 }}>
        <button style={tabBtn("resumen", "")} onClick={() => setTab("resumen")}>Resumen</button>
        <button style={tabBtn("servicios", "")} onClick={() => setTab("servicios")}>Servicios ({servicios.length})</button>
        <button style={tabBtn("sitios", "")} onClick={() => setTab("sitios")}>Sitios ({sitiosSet.size})</button>
        <button style={tabBtn("sla", "")} onClick={() => setTab("sla")}>SLA</button>
        <button style={tabBtn("historial", "")} onClick={() => setTab("historial")}>Historial</button>
      </div>

      {msg && <p style={{ color: "#0a7c2f" }}>{msg}</p>}
      {error && <p style={{ color: "#b00020" }}>{error}</p>}

      {tab === "resumen" && (
        <div style={{ ...card }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <h3 style={{ margin: 0 }}>Datos del contrato</h3>
            {!editando ? <button onClick={() => setEditando(true)}>✏️ Editar</button>
              : <span style={{ display: "flex", gap: 8 }}><button className="cad-guardar" onClick={guardarCabecera} disabled={guardando}>{guardando ? "Guardando…" : "💾 Guardar"}</button><button className="secundario" onClick={() => { setEditando(false); cargar(); }}>Cancelar</button></span>}
          </div>
          {!editando ? (
            <dl className="sc-kv" style={{ margin: 0 }}>
              <dt>No. de contrato</dt><dd>{c.numero ?? "—"}</dd>
              <dt>Vigencia</dt><dd>{fmtFecha(c.fecha_inicio)} → {fmtFecha(c.fecha_fin)}</dd>
              <dt>Referencia comercial</dt><dd>{c.referencia_comercial ?? "—"}</dd>
              <dt>Account manager</dt><dd>{c.account_manager ?? "—"}</dd>
              <dt>Coordinador operativo</dt><dd>{nombrePersona(c.coordinador)}</dd>
              <dt>Renovación</dt><dd>{c.renovacion_tipo ?? "—"}{c.renovacion_aviso_dias ? ` · aviso ${c.renovacion_aviso_dias} días` : ""}</dd>
              <dt>Descripción</dt><dd>{c.descripcion ?? "—"}</dd>
              <dt>Notas</dt><dd>{c.notas ?? "—"}</dd>
            </dl>
          ) : (
            <div className="form-grid">
              <label>Nombre<input value={ed.nombre} onChange={(e) => setEd({ ...ed, nombre: e.target.value })} /></label>
              <label>No. de contrato<input value={ed.numero} onChange={(e) => setEd({ ...ed, numero: e.target.value })} /></label>
              <label>Inicio<input type="date" value={ed.fecha_inicio} onChange={(e) => setEd({ ...ed, fecha_inicio: e.target.value })} /></label>
              <label>Fin<input type="date" value={ed.fecha_fin} onChange={(e) => setEd({ ...ed, fecha_fin: e.target.value })} /></label>
              <label>Referencia comercial<input value={ed.referencia_comercial} onChange={(e) => setEd({ ...ed, referencia_comercial: e.target.value })} /></label>
              <label>Account manager<input value={ed.account_manager} onChange={(e) => setEd({ ...ed, account_manager: e.target.value })} /></label>
              <label>Coordinador operativo<CoordSelect value={ed.coordinador_operativo} onChange={(v) => setEd({ ...ed, coordinador_operativo: v })} /></label>
              <label>Renovación<select value={ed.renovacion_tipo} onChange={(e) => setEd({ ...ed, renovacion_tipo: e.target.value })}><option value="manual">Manual</option><option value="automatica">Automática</option><option value="ninguna">Ninguna</option></select></label>
              <label>Aviso de renovación (días)<input type="number" value={ed.renovacion_aviso_dias} onChange={(e) => setEd({ ...ed, renovacion_aviso_dias: e.target.value })} /></label>
              <label style={{ gridColumn: "1 / -1" }}>Descripción<textarea value={ed.descripcion} onChange={(e) => setEd({ ...ed, descripcion: e.target.value })} /></label>
              <label style={{ gridColumn: "1 / -1" }}>Notas<textarea value={ed.notas} onChange={(e) => setEd({ ...ed, notas: e.target.value })} /></label>
            </div>
          )}
        </div>
      )}

      {tab === "servicios" && (
        <ServiciosTab
          contratoId={params.id} servicios={servicios} puestos={puestos} reqs={reqs} sitios={sitiosCliente}
          expandido={expandido} setExpandido={setExpandido} onCambio={cargar}
        />
      )}

      {tab === "sitios" && (
        <div style={{ ...card }}>
          <h3 style={{ marginTop: 0 }}>Sitios del contrato</h3>
          {sitiosSet.size === 0 ? <p className="dash-sub">Aún no hay sitios; agrégalos desde la pestaña Servicios.</p> : (
            <table><thead><tr><th>Sitio</th><th>Servicios</th><th>Guardias req.</th><th>Supervisores req.</th></tr></thead>
              <tbody>
                {Array.from(sitiosSet).map((sid) => {
                  const svs = servicios.filter((s) => s.sitio_id === sid);
                  return (
                    <tr key={sid as string}>
                      <td>{svs[0]?.sitio?.nombre ?? "—"}</td>
                      <td>{svs.map((s) => s.tipo_servicio).filter(Boolean).join(", ") || "—"}</td>
                      <td>{svs.reduce((a, s) => a + (s.guardias_requeridos ?? 0), 0)}</td>
                      <td>{svs.reduce((a, s) => a + (s.supervisores_requeridos ?? 0), 0)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === "sla" && (
        <SlaTab contratoId={params.id} override={slaOverride} cliente={slaCliente} onCambio={cargar} />
      )}

      {tab === "historial" && (
        <div style={{ ...card }}>
          <h3 style={{ marginTop: 0 }}>Historial</h3>
          <p className="dash-sub">Cada cambio de estado, alta y modificación queda en la <Link href="/bitacora" style={{ color: "var(--sc-btn,#f4a03f)" }}>Auditoría</Link> (antes/después) filtrando por el módulo Contratos y el folio {c.folio ?? ""}.</p>
        </div>
      )}
    </main>
  );
}

// Selector de coordinador operativo: personal con cuenta de rol coordinador.
function CoordSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [ops, setOps] = useState<any[]>([]);
  useEffect(() => {
    (async () => {
      const [{ data: per }, { data: perf }] = await Promise.all([
        supabase.from("personal").select("id, usuario_id, persona:personas(nombre, apellido_paterno)").eq("estatus", "activo").eq("estado_laboral", "activo"),
        supabase.from("usuarios_perfil").select("id, rol"),
      ]);
      const rol = new Map(((perf as any[]) ?? []).map((p) => [p.id, p.rol]));
      setOps(((per as any[]) ?? []).filter((p) => p.usuario_id && ["coordinador", "administrador"].includes(rol.get(p.usuario_id))));
    })();
  }, []);
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">— Sin coordinador —</option>
      {ops.map((p) => <option key={p.id} value={p.id}>{`${p.persona?.nombre ?? ""} ${p.persona?.apellido_paterno ?? ""}`.trim()}</option>)}
    </select>
  );
}

// ------- Servicios (con puestos y requerimientos) -------
function ServiciosTab({ contratoId, servicios, puestos, reqs, sitios, expandido, setExpandido, onCambio }: any) {
  const [nuevo, setNuevo] = useState({ tipo_servicio: "", sitio_id: "", cobertura_tipo: "24x7", guardias_requeridos: "", supervisores_requeridos: "" });
  const [msg, setMsg] = useState<string | null>(null);
  const card: React.CSSProperties = { border: "1px solid var(--sc-card-line)", borderRadius: 12, padding: "12px 16px", background: "var(--sc-content)", marginBottom: 12 };

  async function agregar() {
    if (!nuevo.tipo_servicio) { setMsg("Elige el tipo de servicio."); return; }
    const { error } = await supabase.from("contrato_servicios").insert({
      contrato_id: contratoId, tipo_servicio: nuevo.tipo_servicio, sitio_id: nuevo.sitio_id || null,
      cobertura_tipo: nuevo.cobertura_tipo || null,
      guardias_requeridos: nuevo.guardias_requeridos ? Number(nuevo.guardias_requeridos) : null,
      supervisores_requeridos: nuevo.supervisores_requeridos ? Number(nuevo.supervisores_requeridos) : null,
      estado: "activo",
    });
    if (error) { setMsg(error.message); return; }
    setNuevo({ tipo_servicio: "", sitio_id: "", cobertura_tipo: "24x7", guardias_requeridos: "", supervisores_requeridos: "" });
    setMsg(null); onCambio();
  }
  async function terminarServicio(id: string) {
    if (!confirm("¿Terminar este servicio? El histórico se conserva.")) return;
    await supabase.from("contrato_servicios").update({ estado: "terminado", fecha_fin: new Date().toISOString().slice(0, 10), actualizado_en: new Date().toISOString() }).eq("id", id);
    onCambio();
  }

  return (
    <div>
      <div style={card}>
        <h3 style={{ marginTop: 0 }}>Agregar servicio</h3>
        <div className="form-fila">
          <label className="dash-sub" style={{ display: "flex", flexDirection: "column", flex: 2 }}>Tipo de servicio
            <CatalogoSelect categoria="tipo_servicio_contrato" value={nuevo.tipo_servicio} onChange={(v) => setNuevo({ ...nuevo, tipo_servicio: v })} placeholder="— Tipo —" />
          </label>
          <label className="dash-sub" style={{ display: "flex", flexDirection: "column", flex: 2 }}>Sitio
            <select value={nuevo.sitio_id} onChange={(e) => setNuevo({ ...nuevo, sitio_id: e.target.value })}>
              <option value="">— Sitio (opcional) —</option>
              {sitios.map((s: any) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          </label>
          <label className="dash-sub" style={{ display: "flex", flexDirection: "column" }}>Cobertura
            <select value={nuevo.cobertura_tipo} onChange={(e) => setNuevo({ ...nuevo, cobertura_tipo: e.target.value })}>{COBERTURAS.map((x) => <option key={x} value={x}>{x}</option>)}</select>
          </label>
          <label className="dash-sub" style={{ display: "flex", flexDirection: "column" }}>Guardias req.
            <input type="number" value={nuevo.guardias_requeridos} onChange={(e) => setNuevo({ ...nuevo, guardias_requeridos: e.target.value })} style={{ width: 90 }} />
          </label>
          <label className="dash-sub" style={{ display: "flex", flexDirection: "column" }}>Superv. req.
            <input type="number" value={nuevo.supervisores_requeridos} onChange={(e) => setNuevo({ ...nuevo, supervisores_requeridos: e.target.value })} style={{ width: 90 }} />
          </label>
          <button onClick={agregar}>Agregar</button>
        </div>
        {msg && <p style={{ color: "#b00020" }}>{msg}</p>}
      </div>

      {servicios.length === 0 ? <p className="dash-sub">Sin servicios. Agrega el primero arriba.</p> : servicios.map((s: any) => {
        const estPill = s.estado === "activo" ? { bg: "#e6f6ec", fg: "#0a7c2f" } : s.estado === "suspendido" ? { bg: "#fde7e7", fg: "#b00020" } : { bg: "#ececec", fg: "#555" };
        const dato = (label: string, valor: React.ReactNode) => (
          <span style={{ fontSize: 12.5, color: "var(--sc-text-soft)" }}><b style={{ color: "var(--sc-text)", fontWeight: 600 }}>{label}:</b> {valor}</span>
        );
        return (
        <div key={s.id} style={card}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <b style={{ fontSize: 15 }}>{s.tipo_servicio ?? "Servicio"}</b>
                <span style={{ background: estPill.bg, color: estPill.fg, fontWeight: 700, fontSize: 11, borderRadius: 7, padding: "2px 8px", textTransform: "capitalize" }}>{s.estado}</span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 20px", marginTop: 6 }}>
                {dato("Sitio", s.sitio?.nombre ?? "Sin sitio")}
                {dato("Cobertura", s.cobertura_tipo ?? "—")}
                {dato("Guardias", s.guardias_requeridos ?? 0)}
                {dato("Superv.", s.supervisores_requeridos ?? 0)}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexShrink: 0, flexWrap: "wrap" }}>
              <button className="secundario" onClick={() => setExpandido(expandido === s.id ? null : s.id)}>{expandido === s.id ? "▾ Ocultar" : "▸ Puestos y requerimientos"}</button>
              {s.estado === "activo" && <button className="secundario" onClick={() => terminarServicio(s.id)}>Terminar</button>}
            </div>
          </div>
          {expandido === s.id && (
            <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <PuestosPanel servicioId={s.id} sitioId={s.sitio_id} sitios={sitios} puestos={puestos.filter((p: any) => p.contrato_servicio_id === s.id)} onCambio={onCambio} />
              <ReqPanel servicioId={s.id} reqs={reqs.filter((r: any) => r.contrato_servicio_id === s.id)} onCambio={onCambio} />
            </div>
          )}
        </div>
        );
      })}
    </div>
  );
}

function PuestosPanel({ servicioId, sitioId, sitios, puestos, onCambio }: any) {
  const [n, setN] = useState({ nombre: "", dotacion_requerida: "", horario: "", dias: "" });
  async function agregar() {
    if (!n.nombre.trim()) return;
    await supabase.from("contrato_puestos").insert({ contrato_servicio_id: servicioId, sitio_id: sitioId || null, nombre: n.nombre.trim(), dotacion_requerida: n.dotacion_requerida ? Number(n.dotacion_requerida) : null, horario: n.horario || null, dias: n.dias || null, estado: "activo" });
    setN({ nombre: "", dotacion_requerida: "", horario: "", dias: "" }); onCambio();
  }
  async function quitar(id: string) { await supabase.from("contrato_puestos").update({ estatus: "cancelado", cancelado_en: new Date().toISOString() }).eq("id", id); onCambio(); }
  return (
    <div>
      <h4 style={{ margin: "0 0 8px" }}>Puestos</h4>
      {puestos.length === 0 ? <p className="dash-sub" style={{ margin: "0 0 8px" }}>Sin puestos.</p> : puestos.map((p: any) => (
        <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, padding: "4px 0", borderBottom: "1px solid var(--sc-card-line)" }}>
          <b>{p.nombre}</b><span className="dash-sub">{p.dotacion_requerida ?? 0} guardias{p.horario ? ` · ${p.horario}` : ""}{p.dias ? ` · ${p.dias}` : ""}</span>
          <span style={{ flex: 1 }} /><button className="secundario" onClick={() => quitar(p.id)} style={{ padding: "2px 8px" }}>✕</button>
        </div>
      ))}
      <div className="form-fila" style={{ marginTop: 8, gap: 6, flexWrap: "wrap" }}>
        <input placeholder="Nombre del puesto" value={n.nombre} onChange={(e) => setN({ ...n, nombre: e.target.value })} />
        <input type="number" placeholder="Dotación" value={n.dotacion_requerida} onChange={(e) => setN({ ...n, dotacion_requerida: e.target.value })} style={{ width: 90 }} />
        <input placeholder="Horario (24x7)" value={n.horario} onChange={(e) => setN({ ...n, horario: e.target.value })} style={{ width: 110 }} />
        <button className="secundario" onClick={agregar}>+ Puesto</button>
      </div>
    </div>
  );
}

function ReqPanel({ servicioId, reqs, onCambio }: any) {
  const [n, setN] = useState({ clave: "guardias_turno", valor: "" });
  async function agregar() {
    if (n.valor === "") return;
    const unidad = REQ_CAT.find((r) => r.clave === n.clave)?.unidad || null;
    // WORM: si ya existe la clave activa, se actualiza; si no, se inserta.
    const existente = reqs.find((r: any) => r.clave === n.clave);
    if (existente) {
      await supabase.from("contrato_requerimientos").update({ valor: Number(n.valor), unidad, actualizado_en: new Date().toISOString() }).eq("id", existente.id);
    } else {
      await supabase.from("contrato_requerimientos").insert({ contrato_servicio_id: servicioId, clave: n.clave, valor: Number(n.valor), unidad, estatus: "activo" });
    }
    setN({ clave: n.clave, valor: "" }); onCambio();
  }
  async function quitar(id: string) { await supabase.from("contrato_requerimientos").update({ estatus: "cancelado", cancelado_en: new Date().toISOString() }).eq("id", id); onCambio(); }
  return (
    <div>
      <h4 style={{ margin: "0 0 8px" }}>Requerimientos</h4>
      {reqs.length === 0 ? <p className="dash-sub" style={{ margin: "0 0 8px" }}>Sin requerimientos.</p> : reqs.map((r: any) => (
        <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, padding: "4px 0", borderBottom: "1px solid var(--sc-card-line)" }}>
          <b>{reqNombre(r.clave)}</b><span style={{ flex: 1 }} /><span>{r.valor}{r.unidad ? ` ${r.unidad}` : ""}</span><button className="secundario" onClick={() => quitar(r.id)} style={{ padding: "2px 8px" }}>✕</button>
        </div>
      ))}
      <div className="form-fila" style={{ marginTop: 8, gap: 6, flexWrap: "wrap" }}>
        <select value={n.clave} onChange={(e) => setN({ ...n, clave: e.target.value })}>{REQ_CAT.map((r) => <option key={r.clave} value={r.clave}>{r.nombre}</option>)}</select>
        <input type="number" placeholder="Valor" value={n.valor} onChange={(e) => setN({ ...n, valor: e.target.value })} style={{ width: 90 }} />
        <button className="secundario" onClick={agregar}>+ Requerimiento</button>
      </div>
    </div>
  );
}

// ------- SLA (override del contrato sobre el del cliente) -------
function SlaTab({ contratoId, override, cliente, onCambio }: any) {
  const [msg, setMsg] = useState<string | null>(null);
  const grupos = useMemo(() => {
    const g: Record<string, typeof SLA_CATALOGO> = {};
    SLA_CATALOGO.forEach((m) => { (g[m.modulo] ??= [] as any).push(m); });
    return g;
  }, []);

  async function set(clave: string, campo: "valor" | "activa", value: any) {
    const actual = override[clave] ?? {};
    const fila = { contrato_id: contratoId, clave, valor: campo === "valor" ? (value === "" ? null : Number(value)) : (actual.valor ?? null), activa: campo === "activa" ? value : (actual.activa ?? true), actualizado_en: new Date().toISOString() };
    const { error } = await supabase.from("contrato_sla_metas").upsert(fila, { onConflict: "contrato_id,clave" } as any);
    if (error) { setMsg(error.message); return; }
    setMsg(null); onCambio();
  }
  async function limpiar(clave: string) {
    // Quitar el override → el contrato vuelve a heredar la meta del cliente.
    await supabase.from("contrato_sla_metas").delete().eq("contrato_id", contratoId).eq("clave", clave);
    onCambio();
  }
  const card: React.CSSProperties = { border: "1px solid var(--sc-card-line)", borderRadius: 12, padding: "12px 16px", background: "var(--sc-content)" };

  return (
    <div style={card}>
      <h3 style={{ marginTop: 0 }}>SLA del contrato</h3>
      <p className="dash-sub">Cada meta puede <b>heredar</b> el valor del cliente o definir un <b>override</b> propio del contrato. Sin override, aplica el del cliente.</p>
      {Object.entries(grupos).map(([modulo, metas]) => (
        <div key={modulo} style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".04em", color: "var(--sc-text-soft)", margin: "6px 0" }}>{modulo}</div>
          {(metas as any[]).map((m) => {
            const ov = override[m.clave];
            const heredado = cliente[m.clave]?.valor ?? m.defecto;
            return (
              <div key={m.clave} style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 0", borderBottom: "1px solid var(--sc-card-line)", flexWrap: "wrap" }}>
                <span style={{ flex: 1, minWidth: 200, fontSize: 13.5 }}>{m.nombre} <span className="dash-sub">({m.dir} {m.unidad})</span></span>
                <span className="dash-sub" style={{ fontSize: 12 }}>Cliente: <b>{heredado}</b></span>
                {ov ? (
                  <>
                    <input type="number" value={ov.valor ?? ""} onChange={(e) => set(m.clave, "valor", e.target.value)} style={{ width: 90 }} />
                    <label className="dash-sub" style={{ display: "flex", alignItems: "center", gap: 4 }}><input type="checkbox" checked={ov.activa} onChange={(e) => set(m.clave, "activa", e.target.checked)} />aplica</label>
                    <button className="secundario" onClick={() => limpiar(m.clave)} style={{ padding: "2px 8px" }}>Heredar</button>
                  </>
                ) : (
                  <button className="secundario" onClick={() => set(m.clave, "valor", heredado)} style={{ padding: "2px 10px" }}>Override</button>
                )}
              </div>
            );
          })}
        </div>
      ))}
      {msg && <p style={{ color: "#b00020" }}>{msg}</p>}
    </div>
  );
}
