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
const nom = (p: any) => [p?.persona?.nombre, p?.persona?.apellido_paterno].filter(Boolean).join(" ") || "Elemento";

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

  useEffect(() => {
    const hoy = new Date().toISOString().slice(0, 10);
    supabase.from("cat_opciones").select("valor").eq("categoria", "recurso_propio").eq("activo", true).order("orden")
      .then(({ data }) => setPropios(((data as any[]) ?? []).map((r) => ({ key: "prop:" + r.valor, tipo: "recurso_propio", nombre: r.valor }))));

    (async () => {
      const recs: Recurso[] = [];
      const { data: turnos } = await supabase.from("turnos").select("supervisor_id, estado, fecha").eq("estado", "activo").eq("fecha", hoy).not("supervisor_id", "is", null);
      const supIds = Array.from(new Set(((turnos as any[]) ?? []).map((t) => t.supervisor_id)));
      let guaIds: string[] = [];
      if (sitioId) {
        const { data: tg } = await supabase.from("turno_guardias").select("personal_id, turno:turnos(estado, fecha)").eq("sitio_id", sitioId);
        guaIds = ((tg as any[]) ?? []).filter((r) => r.turno?.estado === "activo" && r.turno?.fecha === hoy).map((r) => r.personal_id);
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

  async function despachar(rs: Recurso[]) {
    if (!rs.length || !editable) return;
    const rows = rs.map((r) => ({ llamada_id: llamadaId, personal_id: r.personalId ?? null, autoridad_id: r.autoridadId ?? null, recurso_tipo: r.tipo, recurso_nombre: r.nombre, es_contacto: r.tipo === "autoridad", estado: "asignada" }));
    const { error } = await supabase.from("despachos").insert(rows);
    if (error) { setMsg(error.message); return; }
    // Al asignar un recurso, el incidente pasa a "en despacho" (si seguía en recibida).
    await supabase.from("llamadas_cad").update({ estado_despacho: "despachada", actualizado_en: new Date().toISOString() }).eq("id", llamadaId).eq("estado_despacho", "recibida");
    setSel(new Set()); setMsg(null); cargarDesp(); onDespacho?.();
  }
  async function cambiarEstado(id: string, estado: string) { await supabase.from("despachos").update({ estado, actualizado_en: new Date().toISOString() }).eq("id", id); cargarDesp(); }
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
        <div style={{ fontSize: 12, color: "var(--sc-text-soft)", marginBottom: 6 }}>Recursos despachados / contactados{editable ? " — arrastra aquí un recurso o selecciónalo y pulsa Despachar" : ""}</div>
        {desp.length === 0 ? <div style={{ color: "var(--sc-text-faint)", fontSize: 12.5, textAlign: "center", padding: 8 }}>Sin recursos despachados todavía.</div> :
          desp.map((d) => (
            <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 4px", borderBottom: "1px solid var(--sc-card-line)" }}>
              <span style={{ fontSize: 14 }}>{d.es_contacto ? "🚨" : d.recurso_tipo === "supervisor" ? "🎖️" : d.recurso_tipo === "recurso_propio" ? "🧰" : "👮"}</span>
              <div style={{ flex: 1, minWidth: 0 }}>{d.es_contacto && <span style={{ marginRight: 6, fontSize: 10.5, fontWeight: 800, color: "#e23b53" }}>Autoridad — Enterada</span>}<b style={{ fontSize: 13 }}>{d.recurso_nombre ?? "Recurso"}</b></div>
              {d.es_contacto ? <span style={{ fontSize: 12, color: "var(--sc-text-soft)" }}>autoridad</span> :
                <select value={d.estado} disabled={!editable} onChange={(e) => cambiarEstado(d.id, e.target.value)} style={{ fontSize: 12.5, padding: "3px 6px", borderRadius: 7, border: "1px solid var(--sc-card-line)", background: "var(--sc-content)", color: "var(--sc-text)" }}>
                  {EST_DESP.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>}
            </div>
          ))}
      </div>

      {editable && (
        <>
          <div style={{ ...box, marginBottom: 10 }}>
            {cabe("Recursos posibles a despachar", openR, () => setOpenR((v) => !v))}
            {openR && <div>
              {guardias.length + propios.length === 0 && <div style={{ fontSize: 12.5, color: "var(--sc-text-soft)" }}>Sin guardias del sitio en turno hoy.</div>}
              {guardias.map(item)}{propios.map(item)}
            </div>}
          </div>
          <div style={{ ...box, marginBottom: 10 }}>
            {cabe("Autoridades de seguridad", openA, () => setOpenA((v) => !v))}
            {openA && <div>
              {autoridades.length === 0 && <div style={{ fontSize: 12.5, color: "var(--sc-text-soft)" }}>Aún no hay autoridades en el <a href="/directorio" style={{ color: "var(--sc-btn,#f4a03f)" }}>Directorio</a>.</div>}
              {autoridades.map(item)}
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
