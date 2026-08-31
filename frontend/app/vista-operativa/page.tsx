"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

const AZUL = "#1F3A5F";
const NIVELES = ["Normal", "Controlada", "Alto valor", "Sensible", "Crítica"];
const LIB_LBL: Record<string, string> = {
  access_validated: "Acceso autorizado", identity_validated: "Identidad validada",
  asset_validated: "Activo de transporte", cargo_units_validated: "Unidades de carga",
  inspection_completed: "Inspección completa", seal_validated: "Sello sin alteración",
  required_evidence_completed: "Evidencia requerida", gps_available: "GPS disponible",
  risk_protocol_completed: "Riesgo evaluado", supervisor_approval: "Aprobación de mando",
};

// Colores y glifo por estado de etapa.
const EST: Record<string, { c: string; ico: string; lbl: string }> = {
  COMPLETED: { c: "#0a7c2f", ico: "✓", lbl: "Completa" },
  IN_PROGRESS: { c: "#1e73be", ico: "●", lbl: "Actual" },
  READY: { c: "#607d8b", ico: "○", lbl: "Disponible" },
  PENDING: { c: "#9aa3ad", ico: "○", lbl: "Pendiente" },
  WARNING: { c: "#b8860b", ico: "⚠", lbl: "Con novedad" },
  BLOCKED: { c: "#e23b53", ico: "⛔", lbl: "Bloqueada" },
};
const EST_MOV: Record<string, string> = {
  PROGRAMADO: "#607d8b", EN_PREPARACION: "#b8860b", EN_TRANSITO: "#1e73be", DETENIDO: "#e23b53",
  EN_PATIO: "#7a3fbf", FINALIZADO: "#0a7c2f", CANCELADO: "#8a1220",
};
const fFecha = (s: any) => (s ? new Date(s).toLocaleString() : "—");
const fHora = (s: any) => (s ? new Date(s).toLocaleString() : "—");

function VistaOperativa() {
  const sp = useSearchParams();
  const router = useRouter();
  const [movs, setMovs] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string | null>(sp.get("movementId"));
  const [data, setData] = useState<any>(null);
  const [cargando, setCargando] = useState(false);
  const [etapaSel, setEtapaSel] = useState<any>(null);
  const [accion, setAccion] = useState(false);
  const [nivelManual, setNivelManual] = useState("");
  const canalRef = useRef<any>(null);

  // Lista para el selector: movimientos no finalizados (folio/ref/placa/ruta).
  useEffect(() => {
    supabase.from("movimientos")
      .select("id, folio, tipo_movimiento, estado, referencia_externa, origen:sitios!sitio_origen_id(nombre), destino:sitios!sitio_destino_id(nombre), activo:transporte_activos(identificador, placas, economico)")
      .eq("estatus", "activo").not("estado", "in", "(FINALIZADO,CANCELADO)")
      .order("creado_en", { ascending: false }).limit(200)
      .then(({ data }) => setMovs((data as any[]) ?? []));
  }, []);

  const cargar = useCallback(async (id: string) => {
    setCargando(true);
    const { data: d, error } = await supabase.rpc("rpc_flujo_operativo", { p_movimiento_id: id });
    if (!error) setData(d);
    setCargando(false);
  }, []);

  // Carga + realtime al cambiar el movimiento seleccionado.
  useEffect(() => {
    if (canalRef.current) { supabase.removeChannel(canalRef.current); canalRef.current = null; }
    if (!sel) { setData(null); return; }
    cargar(sel);
    const ch = supabase.channel(`flujo:${sel}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "movimiento_eventos", filter: `movimiento_id=eq.${sel}` }, () => cargar(sel))
      .on("postgres_changes", { event: "*", schema: "public", table: "movimientos", filter: `id=eq.${sel}` }, () => cargar(sel))
      .subscribe();
    canalRef.current = ch;
    return () => { supabase.removeChannel(ch); canalRef.current = null; };
  }, [sel, cargar]);

  const filtrados = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return movs.slice(0, 40);
    return movs.filter((m) => {
      const hay = [m.folio, m.referencia_externa, m.origen?.nombre, m.destino?.nombre,
        m.activo?.identificador, m.activo?.placas, m.activo?.economico].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(t);
    }).slice(0, 40);
  }, [q, movs]);

  const mv = data?.movement;
  const k = data?.kpis;
  const stages: any[] = data?.stages ?? [];
  const incidentes: any[] = data?.exceptions?.incidentes ?? [];
  const timeline: any[] = data?.timeline ?? [];
  const permisos: string[] = data?.permisos ?? [];
  const puede = (p: string) => permisos.includes(p);
  const clearance = data?.clearance;

  // Acciones de Fase B (liberación, riesgo, incidente).
  async function aprobarLib() {
    if (!sel) return;
    const notas = window.prompt("Notas de aprobación (opcional):");
    if (notas === null) return;
    setAccion(true);
    const { error } = await supabase.rpc("rpc_aprobar_liberacion", { p_movimiento_id: sel, p_notas: notas || null });
    setAccion(false);
    if (error) return alert(error.message);
    setEtapaSel(null); cargar(sel);
  }
  async function rechazarLib() {
    if (!sel) return;
    const motivo = window.prompt("Motivo del rechazo de la liberación:");
    if (!motivo) return;
    setAccion(true);
    const { error } = await supabase.rpc("rpc_rechazar_liberacion", { p_movimiento_id: sel, p_motivo: motivo });
    setAccion(false);
    if (error) return alert(error.message);
    setEtapaSel(null); cargar(sel);
  }
  async function recalcRiesgo() {
    if (!sel) return;
    setAccion(true);
    const { error } = await supabase.rpc("rpc_recalcular_riesgo", { p_movimiento_id: sel });
    setAccion(false);
    if (error) return alert(error.message);
    cargar(sel);
  }
  async function ajustarRiesgo() {
    if (!sel || !nivelManual) return;
    const motivo = window.prompt("Motivo del ajuste de riesgo:") || "";
    setAccion(true);
    const { error } = await supabase.rpc("rpc_ajustar_riesgo", { p_movimiento_id: sel, p_nivel: nivelManual, p_motivo: motivo });
    setAccion(false);
    if (error) return alert(error.message);
    setNivelManual(""); cargar(sel);
  }
  async function crearIncidente() {
    if (!sel) return;
    const tipo = window.prompt("Tipo de incidente:", "Incidente logístico");
    if (!tipo) return;
    const desc = window.prompt("Descripción (opcional):") || null;
    setAccion(true);
    const { data: r, error } = await supabase.rpc("rpc_incidente_desde_movimiento", { p_movimiento_id: sel, p_tipo: tipo, p_descripcion: desc, p_prioridad: "media" });
    setAccion(false);
    if (error) return alert(error.message);
    cargar(sel);
    if ((r as any)?.id) router.push(`/cad/${(r as any).id}`);
  }

  const card: React.CSSProperties = { background: "var(--sc-content)", border: "1px solid var(--sc-card-line)", borderRadius: 12, padding: 16, marginBottom: 16 };

  return (
    <main className="contenedor" style={{ padding: 18 }}>
      {/* Selector de movimiento */}
      <div style={{ ...card, marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <b style={{ fontSize: 16, color: AZUL }}>🧭 Vista Operativa</b>
          <input
            placeholder="Buscar movimiento: folio, referencia, placa, económico, ruta…"
            value={q} onChange={(e) => setQ(e.target.value)}
            style={{ flex: 1, minWidth: 240, padding: "9px 12px", borderRadius: 8, border: "1px solid var(--sc-card-line)", background: "var(--sc-content)", color: "var(--sc-text)" }}
          />
          <select value={sel ?? ""} onChange={(e) => setSel(e.target.value || null)}
            style={{ minWidth: 220, padding: "9px 12px", borderRadius: 8, border: "1px solid var(--sc-card-line)", background: "var(--sc-content)", color: "var(--sc-text)" }}>
            <option value="">{filtrados.length ? "— Elegir movimiento —" : "Sin movimientos activos"}</option>
            {filtrados.map((m) => (
              <option key={m.id} value={m.id}>
                {[m.folio, m.activo?.placas, `${m.origen?.nombre ?? "—"}→${m.destino?.nombre ?? "—"}`].filter(Boolean).join(" · ")}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!sel && <div style={{ ...card, color: "var(--sc-text-soft)" }}>Elige un movimiento para ver su flujo operativo.</div>}
      {sel && cargando && !data && <div style={{ ...card }}>Cargando flujo…</div>}
      {data?.error && <div style={{ ...card, color: "#b00020" }}>{data.error}</div>}

      {mv && (
        <>
          {/* Encabezado operativo */}
          <div style={card}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <b style={{ fontSize: 22 }}>{mv.folio ?? "Movimiento"}</b>
              <span style={{ background: EST_MOV[mv.estado] ?? "#607d8b", color: "#fff", borderRadius: 999, padding: "3px 12px", fontSize: 12, fontWeight: 800 }}>{mv.estado}</span>
              <span style={{ color: "var(--sc-text-soft)" }}>{mv.tipo}{mv.nivel_riesgo ? ` · Riesgo: ${mv.nivel_riesgo}` : ""}</span>
              <Link href={`/logistica/movimientos/${mv.id}`} style={{ marginLeft: "auto", color: "var(--sc-btn,#f4a03f)", fontWeight: 700, textDecoration: "none" }}>Ver detalle →</Link>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "4px 24px", marginTop: 12, fontSize: 13 }}>
              <div><b>Ruta:</b> {mv.origen ?? "—"} → {mv.destino ?? "—"}</div>
              <div><b>Activo:</b> {mv.activo ?? "—"}{mv.activo_tipo ? ` · ${mv.activo_tipo}` : ""}</div>
              <div><b>Programado:</b> {fFecha(mv.programado_inicio)} → {fFecha(mv.programado_fin)}</div>
              <div><b>Real:</b> {fFecha(mv.real_inicio)} → {fFecha(mv.real_fin)}</div>
              <div><b>Referencia:</b> {mv.referencia_externa ?? "—"}</div>
              <div><b>GPS:</b> {mv.gps_device_id ?? "—"}</div>
            </div>
          </div>

          {/* KPIs contextuales */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 12, marginBottom: 16 }}>
            {[
              { l: "Activos", v: k?.activos ?? 0 },
              { l: "Hallazgos", v: k?.hallazgos ?? 0, c: (k?.hallazgos ?? 0) > 0 ? "#b8860b" : undefined },
              { l: "Incidentes", v: k?.incidentes ?? 0, c: (k?.incidentes ?? 0) > 0 ? "#e23b53" : undefined },
              { l: "Inspecciones", v: k?.inspecciones ?? 0 },
              { l: "Unidades", v: k?.unidades ?? 0 },
              { l: "Carga sensible", v: k?.carga_sensible ?? 0, c: (k?.carga_sensible ?? 0) > 0 ? "#7a3fbf" : undefined },
            ].map((x) => (
              <div key={x.l} style={{ background: "var(--sc-content)", border: "1px solid var(--sc-card-line)", borderRadius: 12, padding: "12px 14px" }}>
                <div style={{ fontSize: 24, fontWeight: 800, color: x.c ?? AZUL, lineHeight: 1 }}>{x.v}</div>
                <div style={{ fontSize: 12, color: "var(--sc-text-soft)", marginTop: 4, textTransform: "uppercase", letterSpacing: 0.4 }}>{x.l}</div>
              </div>
            ))}
          </div>

          {/* Flujo operativo interactivo */}
          <div style={card}>
            <h3 style={{ margin: "0 0 12px", fontSize: 13, color: AZUL, textTransform: "uppercase", letterSpacing: 0.5 }}>Flujo operativo</h3>
            <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 6 }}>
              {stages.map((s, i) => {
                const e = EST[s.status] ?? EST.PENDING;
                const actual = s.status === "IN_PROGRESS";
                return (
                  <div key={s.id} style={{ display: "flex", alignItems: "stretch", gap: 10, flex: "0 0 auto" }}>
                    <button onClick={() => setEtapaSel(s)} title={s.blockReason ?? s.label}
                      style={{
                        minWidth: 150, textAlign: "left", cursor: "pointer",
                        background: actual ? e.c : "var(--sc-content)",
                        border: `1.5px solid ${e.c}`, borderRadius: 12, padding: "10px 12px",
                        boxShadow: actual ? "0 2px 10px rgba(30,115,190,.35)" : "none",
                      }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ color: actual ? "#fff" : e.c, fontWeight: 900, fontSize: 15 }}>{e.ico}</span>
                        <span style={{ color: actual ? "#fff" : "var(--sc-text)", fontWeight: 700, fontSize: 13 }}>{s.label}{s.required ? "" : " "}</span>
                      </div>
                      <div style={{ color: actual ? "rgba(255,255,255,.9)" : e.c, fontSize: 11.5, fontWeight: 700, marginTop: 5 }}>
                        {s.blockReason ? `Falta: ${s.blockReason}` : e.lbl}{typeof s.count === "number" && s.count > 0 ? ` · ${s.count}` : ""}
                      </div>
                    </button>
                    {i < stages.length - 1 && <div style={{ alignSelf: "center", color: "var(--sc-text-faint)", fontSize: 16 }}>→</div>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Rama de excepciones: hallazgos (Fase C) + incidentes ligados */}
          <div style={card}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <h3 style={{ margin: 0, fontSize: 13, color: AZUL, textTransform: "uppercase", letterSpacing: 0.5 }}>Excepciones</h3>
              {puede("incident.create") && (
                <button onClick={crearIncidente} disabled={accion}
                  style={{ marginLeft: "auto", background: "#e23b53", color: "#fff", border: "none", borderRadius: 8, padding: "6px 12px", fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}>
                  + Crear incidente
                </button>
              )}
            </div>
            {incidentes.length === 0 ? (
              <p style={{ color: "var(--sc-text-soft)", fontSize: 13, margin: 0 }}>Sin incidentes ligados. Los hallazgos de monitoreo llegan en la Fase C.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {incidentes.map((it) => (
                  <Link key={it.id} href={`/cad/${it.id}`} style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: "inherit", border: "1px solid var(--sc-card-line)", borderRadius: 10, padding: "9px 12px" }}>
                    <span style={{ background: "#e23b53", color: "#fff", borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 800 }}>{it.folio ?? "INC"}</span>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{it.tipo ?? "Incidente"}</span>
                    <span style={{ marginLeft: "auto", color: "var(--sc-text-soft)", fontSize: 12 }}>{it.estado_despacho ?? ""}{it.prioridad ? ` · ${it.prioridad}` : ""} →</span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Timeline */}
          <div style={card}>
            <h3 style={{ margin: "0 0 10px", fontSize: 13, color: AZUL, textTransform: "uppercase", letterSpacing: 0.5 }}>Línea de tiempo</h3>
            {timeline.length === 0 ? (
              <p style={{ color: "var(--sc-text-soft)", fontSize: 13, margin: 0 }}>Sin eventos registrados todavía.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {timeline.map((ev) => (
                  <div key={ev.id} style={{ display: "flex", gap: 10, fontSize: 12.5, borderBottom: "1px solid var(--sc-card-line)", paddingBottom: 6 }}>
                    <span style={{ color: "var(--sc-text-soft)", minWidth: 150 }}>{fHora(ev.creado_en)}</span>
                    <span style={{ fontWeight: 700 }}>{ev.tipo_evento}</span>
                    <span style={{ color: "var(--sc-text-soft)" }}>{ev.actor ?? ""}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Drawer de etapa */}
      {etapaSel && (
        <div onClick={() => setEtapaSel(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.35)", zIndex: 60, display: "flex", justifyContent: "flex-end" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "min(420px, 92vw)", height: "100%", background: "var(--sc-content)", borderLeft: "1px solid var(--sc-card-line)", padding: 20, overflowY: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ color: (EST[etapaSel.status] ?? EST.PENDING).c, fontWeight: 900, fontSize: 20 }}>{(EST[etapaSel.status] ?? EST.PENDING).ico}</span>
              <b style={{ fontSize: 18 }}>{etapaSel.label}</b>
              <button onClick={() => setEtapaSel(null)} style={{ marginLeft: "auto", background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "var(--sc-text-soft)" }}>×</button>
            </div>
            <div style={{ marginTop: 14, fontSize: 14, lineHeight: 1.8 }}>
              <div><b>Estado:</b> {(EST[etapaSel.status] ?? EST.PENDING).lbl} ({etapaSel.status})</div>
              {typeof etapaSel.count === "number" && <div><b>Registros:</b> {etapaSel.count}</div>}
              {etapaSel.blockReason && <div style={{ color: "#e23b53" }}><b>Falta:</b> {etapaSel.blockReason}</div>}
              <div><b>Obligatoria:</b> {etapaSel.required ? "Sí" : "No"}</div>
            </div>

            {/* Liberación de seguridad: checklist + aprobar/rechazar */}
            {etapaSel.id === "liberacion" && clearance?.checklist && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--sc-text-soft)", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 8 }}>Checklist del gate</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {Object.entries(LIB_LBL).map(([k2, lbl]) => {
                    const ok = !!clearance.checklist[k2];
                    return (
                      <div key={k2} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                        <span style={{ color: ok ? "#0a7c2f" : "#e23b53", fontWeight: 900 }}>{ok ? "✓" : "✗"}</span>
                        <span style={{ color: ok ? "var(--sc-text)" : "#e23b53" }}>{lbl}</span>
                      </div>
                    );
                  })}
                </div>
                {clearance.aprobacion && (
                  <div style={{ marginTop: 12, fontSize: 12.5, color: "var(--sc-text-soft)" }}>
                    Última: <b>{clearance.aprobacion.resultado}</b> {clearance.aprobacion.folio ? `(${clearance.aprobacion.folio})` : ""} · {clearance.aprobacion.aprobado_por ?? ""}
                  </div>
                )}
                {puede("logistics.clearance.approve") && (
                  <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                    <button onClick={aprobarLib} disabled={accion || clearance.resultado !== "READY"}
                      title={clearance.resultado !== "READY" ? `Faltan controles: ${clearance.faltantes ?? ""}` : ""}
                      style={{ flex: 1, background: clearance.resultado === "READY" ? "#0a7c2f" : "#9aa3ad", color: "#fff", border: "none", borderRadius: 9, padding: "10px", fontWeight: 800, cursor: clearance.resultado === "READY" ? "pointer" : "not-allowed" }}>
                      Aprobar liberación
                    </button>
                    <button onClick={rechazarLib} disabled={accion}
                      style={{ flex: 1, background: "#fff", color: "#e23b53", border: "1.5px solid #e23b53", borderRadius: 9, padding: "10px", fontWeight: 800, cursor: "pointer" }}>
                      Rechazar
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Evaluación de riesgo: recalcular + ajuste manual */}
            {etapaSel.id === "riesgo" && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 13 }}>Nivel actual: <b>{mv?.nivel_riesgo ?? "sin evaluar"}</b></div>
                {puede("logistics.risk.manage") && (
                  <>
                    <button onClick={recalcRiesgo} disabled={accion}
                      style={{ marginTop: 12, background: AZUL, color: "#fff", border: "none", borderRadius: 9, padding: "9px 14px", fontWeight: 800, cursor: "pointer" }}>
                      Recalcular por reglas
                    </button>
                    <div style={{ marginTop: 12, fontSize: 12, fontWeight: 700, color: "var(--sc-text-soft)", textTransform: "uppercase", letterSpacing: 0.4 }}>Ajuste manual</div>
                    <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                      <select value={nivelManual} onChange={(e) => setNivelManual(e.target.value)}
                        style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "1px solid var(--sc-card-line)", background: "var(--sc-content)", color: "var(--sc-text)" }}>
                        <option value="">— Nivel —</option>
                        {NIVELES.map((n) => <option key={n} value={n}>{n}</option>)}
                      </select>
                      <button onClick={ajustarRiesgo} disabled={accion || !nivelManual}
                        style={{ background: "var(--sc-btn,#f4a03f)", color: "#3a2a10", border: "none", borderRadius: 8, padding: "8px 14px", fontWeight: 800, cursor: nivelManual ? "pointer" : "not-allowed" }}>
                        Ajustar
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {etapaSel.route && (
              <Link href={etapaSel.route} style={{ display: "inline-block", marginTop: 20, background: "var(--sc-btn,#f4a03f)", color: "#3a2a10", fontWeight: 800, borderRadius: 10, padding: "10px 16px", textDecoration: "none" }}>
                Abrir módulo completo →
              </Link>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

export default function VistaOperativaPage() {
  return (
    <Suspense fallback={<main className="contenedor" style={{ padding: 18 }}>Cargando…</main>}>
      <VistaOperativa />
    </Suspense>
  );
}
