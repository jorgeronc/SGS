"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

// Despacho de RECURSOS de un incidente: guardias del sitio (rol de turno) +
// supervisores + recursos propios (catálogo) + contacto a autoridades de
// seguridad (directorio, por zona del sitio). Se despacha arrastrando el recurso
// al área de despachados o seleccionando + "Despachar". Todo queda en el historial
// (tabla despachos). Ver migraciones 0068/0069.
interface Recurso { key: string; tipo: string; nombre: string; sub?: string; personalId?: string; autoridadId?: string; telefono?: string | null }
interface Desp { id: string; recurso_tipo: string | null; recurso_nombre: string | null; estado: string; es_contacto: boolean; personal_id: string | null; autoridad_id: string | null }

const EST_DESP = ["asignada", "en_ruta", "en_sitio", "liberada"];
const EST_DESP_LABEL: Record<string, string> = { asignada: "Asignada", en_ruta: "En ruta", en_sitio: "En sitio", liberada: "Liberada" };
const nom = (p: any) => [p?.persona?.nombre, p?.persona?.apellido_paterno].filter(Boolean).join(" ") || "Elemento";
// Fechas de turno relevantes en hora LOCAL (ayer+hoy): con toISOString() el "hoy"
// se calculaba en UTC y de noche (UTC ya era el día siguiente) el pool de guardias
// del turno salía vacío; además cubre turnos que cruzan medianoche.
const pad2 = (n: number) => String(n).padStart(2, "0");
const ymdLocal = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const fechasTurno = () => { const n = new Date(); return [ymdLocal(new Date(n.getTime() - 86400000)), ymdLocal(n)]; };

export default function DespachoRecursos({ llamadaId, sitioId, editable, onDespacho }: { llamadaId: string; sitioId: string | null; editable: boolean; onDespacho?: () => void }) {
  const [desp, setDesp] = useState<Desp[]>([]);
  const [guardias, setGuardias] = useState<Recurso[]>([]);
  const [propios, setPropios] = useState<Recurso[]>([]);
  const [autoridades, setAutoridades] = useState<Recurso[]>([]);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [openR, setOpenR] = useState(true);
  const [openA, setOpenA] = useState(true);
  const [sobre, setSobre] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const cargarDesp = useCallback(async () => {
    const { data } = await supabase.from("despachos").select("id, recurso_tipo, recurso_nombre, estado, es_contacto, personal_id, autoridad_id").eq("llamada_id", llamadaId).eq("estatus", "activo").order("fecha_asignacion", { ascending: true });
    setDesp((data as any[]) ?? []);
  }, [llamadaId]);
  useEffect(() => { cargarDesp(); }, [cargarDesp]);

  // Auto-refresco: cualquier cambio en los despachos de este incidente (p. ej. un
  // guardia que pasa a En ruta / En el lugar desde el móvil, u otro operador que
  // despacha) actualiza la lista sin recargar la página.
  useEffect(() => {
    const canal = supabase
      .channel(`desp-recursos:${llamadaId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "despachos", filter: `llamada_id=eq.${llamadaId}` }, cargarDesp)
      .subscribe();
    return () => { supabase.removeChannel(canal); };
  }, [llamadaId, cargarDesp]);

  useEffect(() => {
    const fechas = fechasTurno();
    supabase.from("cat_opciones").select("valor").eq("categoria", "recurso_propio").eq("activo", true).order("orden")
      .then(({ data }) => setPropios(((data as any[]) ?? []).map((r) => ({ key: "prop:" + r.valor, tipo: "recurso_propio", nombre: r.valor }))));

    (async () => {
      const recs: Recurso[] = [];
      // Supervisores del turno vigente: por sitio (turno_supervisores) + el legacy
      // de cabecera (turnos.supervisor_id). Ambos filtrados por turno activo y fecha local.
      const supSet = new Set<string>();
      const { data: turnos } = await supabase.from("turnos").select("supervisor_id, estado, fecha").eq("estado", "activo").in("fecha", fechas).not("supervisor_id", "is", null);
      ((turnos as any[]) ?? []).forEach((t) => supSet.add(t.supervisor_id));
      if (sitioId) {
        const { data: ts } = await supabase.from("turno_supervisores").select("supervisor_personal_id, turno:turnos(estado, fecha)").eq("sitio_id", sitioId).eq("estatus", "activo");
        ((ts as any[]) ?? []).filter((r) => r.turno?.estado === "activo" && fechas.includes(r.turno?.fecha)).forEach((r) => supSet.add(r.supervisor_personal_id));
      }
      const supIds = Array.from(supSet).filter(Boolean);
      let guaIds: string[] = [];
      if (sitioId) {
        const { data: tg } = await supabase.from("turno_guardias").select("personal_id, turno:turnos(estado, fecha)").eq("sitio_id", sitioId);
        guaIds = ((tg as any[]) ?? []).filter((r) => r.turno?.estado === "activo" && fechas.includes(r.turno?.fecha)).map((r) => r.personal_id);
      }
      const ids = Array.from(new Set([...supIds, ...guaIds]));
      if (ids.length) {
        const { data: per } = await supabase.from("personal").select("id, telefono, persona:personas(nombre, apellido_paterno)").in("id", ids);
        const byId = new Map(((per as any[]) ?? []).map((p) => [p.id, p]));
        supIds.forEach((id) => { const p = byId.get(id); if (p) recs.push({ key: "sup:" + id, tipo: "supervisor", nombre: nom(p), sub: "Supervisor", personalId: id, telefono: p.telefono }); });
        guaIds.forEach((id) => { if (supIds.includes(id)) return; const p = byId.get(id); if (p) recs.push({ key: "gua:" + id, tipo: "guardia", nombre: nom(p), sub: "Guardia del sitio", personalId: id, telefono: p.telefono }); });
      }
      setGuardias(recs);
    })();

    (async () => {
      let zonaTxt = "";
      if (sitioId) { const { data: s } = await supabase.from("sitios").select("nombre, direccion").eq("id", sitioId).maybeSingle(); zonaTxt = `${(s as any)?.nombre ?? ""} ${(s as any)?.direccion ?? ""}`.toLowerCase(); }
      const { data } = await supabase.from("directorio_autoridades").select("id, tipo, nombre, telefono, zona").eq("estatus", "activo").order("tipo");
      const arr = (data as any[]) ?? [];
      const match = arr.filter((a) => a.zona && zonaTxt && zonaTxt.includes(String(a.zona).toLowerCase()));
      const lista = match.length ? match : arr;
      setAutoridades(lista.map((a) => ({ key: "aut:" + a.id, tipo: "autoridad", nombre: a.nombre, sub: `${a.tipo ?? ""}${a.zona ? " · " + a.zona : ""}`, autoridadId: a.id, telefono: a.telefono })));
    })();
  }, [sitioId]);

  const porKey = useMemo(() => new Map([...guardias, ...propios, ...autoridades].map((r) => [r.key, r])), [guardias, propios, autoridades]);

  // Recursos ya despachados (activos): para no despacharlos dos veces.
  const despPersonal = useMemo(() => new Set(desp.filter((d) => d.personal_id).map((d) => d.personal_id as string)), [desp]);
  const despAutoridad = useMemo(() => new Set(desp.filter((d) => d.autoridad_id).map((d) => d.autoridad_id as string)), [desp]);
  const despPropio = useMemo(() => new Set(desp.filter((d) => !d.personal_id && !d.autoridad_id && d.recurso_tipo === "recurso_propio" && d.recurso_nombre).map((d) => d.recurso_nombre as string)), [desp]);
  const yaDespachado = useCallback((r: Recurso) => (!!r.personalId && despPersonal.has(r.personalId)) || (!!r.autoridadId && despAutoridad.has(r.autoridadId)) || (r.tipo === "recurso_propio" && despPropio.has(r.nombre)), [despPersonal, despAutoridad, despPropio]);

  async function despachar(rs: Recurso[]) {
    if (!editable) return;
    // No despachar dos veces el mismo recurso (ya despachado o repetido en el lote).
    const vistos = new Set<string>();
    const nuevos = rs.filter((r) => {
      if (yaDespachado(r)) return false;
      const k = r.personalId ?? r.autoridadId ?? `prop:${r.nombre}`;
      if (vistos.has(k)) return false; vistos.add(k); return true;
    });
    if (!nuevos.length) { setMsg("Ese recurso ya está despachado."); return; }
    const rows = nuevos.map((r) => ({ llamada_id: llamadaId, personal_id: r.personalId ?? null, autoridad_id: r.autoridadId ?? null, recurso_tipo: r.tipo, recurso_nombre: r.nombre, es_contacto: r.tipo === "autoridad", estado: "asignada" }));
    const { error } = await supabase.from("despachos").insert(rows);
    if (error) { setMsg(error.message); return; }
    // Al asignar un recurso, el incidente pasa a "en despacho" (si seguía en recibida).
    await supabase.from("llamadas_cad").update({ estado_despacho: "despachada", actualizado_en: new Date().toISOString() }).eq("id", llamadaId).eq("estado_despacho", "recibida");
    setSel(new Set()); setMsg(null); cargarDesp(); onDespacho?.();
  }
  async function cambiarEstado(id: string, estado: string) {
    const { error } = await supabase.from("despachos").update({ estado, actualizado_en: new Date().toISOString() }).eq("id", id);
    if (error) { setMsg(error.message); return; }
    setMsg(null); cargarDesp(); onDespacho?.();
  }
  // Cancelar/deshacer un despacho (queda en el historial, con motivo y operador).
  async function cancelar(d: Desp) {
    if (!editable) return;
    const motivo = window.prompt("Motivo de la cancelación de este despacho (opcional):", "");
    if (motivo === null) return;
    const { error } = await supabase.rpc("rpc_cancelar_despacho", { p_id: d.id, p_motivo: motivo || null });
    if (error) { setMsg(error.message); return; }
    setMsg(null); cargarDesp(); onDespacho?.();
  }
  const despacharSel = () => despachar(Array.from(sel).map((k) => porKey.get(k)!).filter(Boolean));

  const item = (r: Recurso) => (
    <label key={r.key} draggable={editable} onDragStart={(e) => e.dataTransfer.setData("rkey", r.key)}
      style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", border: "1px solid var(--sc-card-line)", borderRadius: 9, marginBottom: 6, cursor: editable ? "grab" : "default", background: sel.has(r.key) ? "var(--sc-btn-soft,#f6ede1)" : "transparent" }}>
      {editable && <input type="checkbox" checked={sel.has(r.key)} onChange={(e) => setSel((p) => { const n = new Set(p); e.target.checked ? n.add(r.key) : n.delete(r.key); return n; })} />}
      <span style={{ fontSize: 15 }}>{r.tipo === "autoridad" ? "🚨" : r.tipo === "supervisor" ? "🎖️" : r.tipo === "guardia" ? "👮" : "🧰"}</span>
      <div style={{ flex: 1, minWidth: 0 }}><b style={{ fontSize: 13.5 }}>{r.nombre}</b><div style={{ fontSize: 12, color: "var(--sc-text-soft)" }}>{r.sub}{r.telefono ? ` · ${r.telefono}` : ""}</div></div>
      {r.telefono && <a href={`tel:${r.telefono}`} onClick={(e) => e.stopPropagation()} style={{ color: "#1f9d5c", textDecoration: "none", fontSize: 12.5 }}>📞</a>}
    </label>
  );
  const box: React.CSSProperties = { border: "1px solid var(--sc-card-line)", borderRadius: 12, padding: "10px 12px" };
  const cabe = (t: string, open: boolean, tog: () => void) => (
    <button onClick={tog} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", background: "transparent", border: "none", cursor: "pointer", color: "var(--sc-text)", padding: 0, fontSize: 13.5, fontWeight: 700, marginBottom: open ? 8 : 0 }}>
      <span style={{ width: 12, color: "var(--sc-text-soft)" }}>{open ? "▾" : "▸"}</span>{t}
    </button>
  );

  return (
    <div>
      <h3 style={{ margin: "0 0 10px", fontSize: 14 }}>🚓 Despacho de recursos</h3>

      {/* Recursos despachados (área de drop) */}
      <div onDragOver={(e) => { if (editable) { e.preventDefault(); setSobre(true); } }} onDragLeave={() => setSobre(false)}
        onDrop={(e) => { e.preventDefault(); setSobre(false); const k = e.dataTransfer.getData("rkey"); const r = porKey.get(k); if (r) despachar([r]); }}
        style={{ ...box, marginBottom: 12, minHeight: 70, background: sobre ? "var(--sc-btn-soft,#f6ede1)" : "transparent", outline: sobre ? "2px dashed var(--sc-btn,#f4a03f)" : undefined }}>
        <div style={{ fontSize: 12, color: "var(--sc-text-soft)", marginBottom: 6 }}>Recursos despachados / contactados{editable ? " — arrastra aquí un recurso o selecciónalo y pulsa Despachar. Para deshacer un despacho, pulsa ✕ o arrástralo de vuelta a la lista." : ""}</div>
        {desp.length === 0 ? <div style={{ color: "var(--sc-text-faint)", fontSize: 12.5, textAlign: "center", padding: 8 }}>Sin recursos despachados todavía.</div> :
          desp.map((d) => (
            <div key={d.id} draggable={editable} onDragStart={(e) => e.dataTransfer.setData("dkey", d.id)}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 4px", borderBottom: "1px solid var(--sc-card-line)", cursor: editable ? "grab" : "default" }}>
              <span style={{ fontSize: 14 }}>{d.es_contacto ? "🚨" : d.recurso_tipo === "supervisor" ? "🎖️" : d.recurso_tipo === "recurso_propio" ? "🧰" : "👮"}</span>
              <div style={{ flex: 1, minWidth: 0 }}>{d.es_contacto && <span style={{ marginRight: 6, fontSize: 10.5, fontWeight: 800, color: "#e23b53" }}>Autoridad — Enterada</span>}<b style={{ fontSize: 13 }}>{d.recurso_nombre ?? "Recurso"}</b></div>
              {d.es_contacto ? <span style={{ fontSize: 12, color: "var(--sc-text-soft)" }}>autoridad</span> :
                <select value={d.estado} disabled={!editable} onChange={(e) => cambiarEstado(d.id, e.target.value)} style={{ fontSize: 12.5, padding: "3px 6px", borderRadius: 7, border: "1px solid var(--sc-card-line)", background: "var(--sc-content)", color: "var(--sc-text)" }}>
                  {EST_DESP.map((s) => <option key={s} value={s}>{EST_DESP_LABEL[s] ?? s}</option>)}
                </select>}
              {editable && <button onClick={() => cancelar(d)} title="Cancelar / deshacer despacho" style={{ background: "transparent", border: "none", color: "#e23b53", cursor: "pointer", fontSize: 15, lineHeight: 1, padding: "2px 4px" }}>✕</button>}
            </div>
          ))}
      </div>

      {editable && (
        <>
          <div onDragOver={(e) => { if (e.dataTransfer.types.includes("dkey")) e.preventDefault(); }}
            onDrop={(e) => { const dk = e.dataTransfer.getData("dkey"); if (!dk) return; e.preventDefault(); const d = desp.find((x) => x.id === dk); if (d) cancelar(d); }}
            style={{ ...box, marginBottom: 10 }}>
            {cabe("Recursos posibles a despachar", openR, () => setOpenR((v) => !v))}
            {openR && <div>
              {guardias.filter((r) => !yaDespachado(r)).length + propios.filter((r) => !yaDespachado(r)).length === 0 && <div style={{ fontSize: 12.5, color: "var(--sc-text-soft)" }}>Sin recursos disponibles para despachar.</div>}
              {guardias.filter((r) => !yaDespachado(r)).map(item)}{propios.filter((r) => !yaDespachado(r)).map(item)}
            </div>}
          </div>
          <div style={{ ...box, marginBottom: 10 }}>
            {cabe("Autoridades de seguridad", openA, () => setOpenA((v) => !v))}
            {openA && <div>
              {autoridades.filter((r) => !yaDespachado(r)).length === 0 && <div style={{ fontSize: 12.5, color: "var(--sc-text-soft)" }}>Aún no hay autoridades disponibles en el <a href="/directorio" style={{ color: "var(--sc-btn,#f4a03f)" }}>Directorio</a>.</div>}
              {autoridades.filter((r) => !yaDespachado(r)).map(item)}
            </div>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button onClick={despacharSel} disabled={sel.size === 0} style={{ background: "var(--sc-btn,#f4a03f)", color: "#fff", border: "none", borderRadius: 9, padding: "9px 18px", fontWeight: 700, cursor: sel.size ? "pointer" : "not-allowed", opacity: sel.size ? 1 : 0.6 }}>Despachar seleccionados ({sel.size})</button>
            {msg && <span style={{ color: "#e23b53", fontSize: 12.5 }}>{msg}</span>}
          </div>
        </>
      )}
    </div>
  );
}
