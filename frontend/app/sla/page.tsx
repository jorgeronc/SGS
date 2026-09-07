"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { SLA_CATALOGO } from "@/lib/sla";

// Metas de SLA como CATÁLOGO seleccionable por cliente (o global por defecto).
// Cada cliente elige qué metas aplican y su valor. Ver 0094_sla_catalogo.
interface Fila { clave: string; nombre: string; unidad: string; dir: string; modulo: string; activa: boolean; valor: number | null; }

export default function SlaPage() {
  const [clientes, setClientes] = useState<any[]>([]);
  const [scope, setScope] = useState("__global__"); // "__global__" o id de cliente
  const [filas, setFilas] = useState<Fila[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    supabase.from("clientes").select("id, razon_social").eq("estatus", "activo").order("razon_social").then(({ data }) => setClientes((data as any[]) ?? []));
  }, []);

  const cargar = useCallback(async () => {
    setCargando(true); setMsg(null);
    const cid = scope === "__global__" ? null : scope;
    let q = supabase.from("sla_metas_cliente").select("clave, valor, activa");
    q = cid ? q.eq("cliente_id", cid) : q.is("cliente_id", null);
    const { data } = await q;
    const by = new Map(((data as any[]) ?? []).map((r) => [r.clave, r]));
    setFilas(SLA_CATALOGO.map((c) => {
      const r = by.get(c.clave);
      return { clave: c.clave, nombre: c.nombre, unidad: c.unidad, dir: c.dir, modulo: c.modulo, activa: r?.activa ?? c.activaDefecto, valor: r?.valor ?? c.defecto };
    }));
    setCargando(false);
  }, [scope]);

  useEffect(() => { cargar(); }, [cargar]);

  function set(clave: string, campo: "activa" | "valor", v: any) {
    setFilas((p) => p.map((f) => (f.clave === clave ? { ...f, [campo]: v } : f)));
  }

  async function guardar() {
    setGuardando(true); setMsg(null);
    const cid = scope === "__global__" ? null : scope;
    for (const f of filas) {
      let sel = supabase.from("sla_metas_cliente").select("id");
      sel = cid ? sel.eq("cliente_id", cid) : sel.is("cliente_id", null);
      const { data: ex } = await sel.eq("clave", f.clave).maybeSingle();
      const payload = { cliente_id: cid, clave: f.clave, valor: f.valor, activa: f.activa, actualizado_en: new Date().toISOString() };
      const { error } = (ex as any)?.id
        ? await supabase.from("sla_metas_cliente").update(payload).eq("id", (ex as any).id)
        : await supabase.from("sla_metas_cliente").insert(payload);
      if (error) { setGuardando(false); setMsg(error.message); return; }
    }
    setGuardando(false);
    setMsg("Metas guardadas.");
  }

  const unidadLbl = (u: string) => (u === "%" ? "%" : u === "min" ? "min" : u === "h" ? "h" : "n.º");
  const scopeNombre = scope === "__global__" ? "Global (por defecto)" : (clientes.find((c) => c.id === scope)?.razon_social ?? "Cliente");

  return (
    <main className="contenedor">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div>
          <h2 style={{ margin: 0 }}>Metas de SLA</h2>
          <p className="dash-sub">Catálogo de metas: elige cuáles aplican por cliente y su valor. Alimentan el Índice de Seguridad y el reporte mensual.</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/reporte-sla" className="qbtn2">📄 Reporte mensual →</Link>
          <Link href="/reporte-horas" className="qbtn2">⏱ Horas trabajadas →</Link>
        </div>
      </div>

      <div className="form-fila" style={{ margin: "12px 0" }}>
        <label className="dash-sub" style={{ display: "flex", flexDirection: "column" }}>Metas de
          <select value={scope} onChange={(e) => setScope(e.target.value)} style={{ minWidth: 280 }}>
            <option value="__global__">Global (por defecto para todos)</option>
            {clientes.map((c) => <option key={c.id} value={c.id}>{c.razon_social}</option>)}
          </select>
        </label>
        <button className="qbtn2 primary" onClick={guardar} disabled={guardando || cargando} style={{ alignSelf: "flex-end" }}>{guardando ? "Guardando…" : "Guardar"}</button>
      </div>

      {msg && <p style={{ color: msg.includes("guardadas") ? "#0a7c2f" : "#b00020" }}>{msg}</p>}

      {cargando ? <p>Cargando…</p> : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "2px solid var(--sc-card-line)" }}>
              <th style={{ padding: "8px 10px" }}>Meta</th>
              <th style={{ padding: "8px 10px" }}>Módulo</th>
              <th style={{ padding: "8px 10px", textAlign: "center" }}>Aplica</th>
              <th style={{ padding: "8px 10px" }}>Objetivo</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.clave} style={{ borderBottom: "1px solid var(--sc-card-line)", opacity: f.activa ? 1 : 0.55 }}>
                <td style={{ padding: "8px 10px", fontWeight: 600 }}>{f.nombre}</td>
                <td style={{ padding: "8px 10px", color: "var(--sc-text-soft)", fontSize: 13 }}>{f.modulo}</td>
                <td style={{ padding: "8px 10px", textAlign: "center" }}>
                  <input type="checkbox" checked={f.activa} onChange={(e) => set(f.clave, "activa", e.target.checked)} />
                </td>
                <td style={{ padding: "8px 10px" }}>
                  <span style={{ color: "var(--sc-text-soft)", marginRight: 6 }}>{f.dir}</span>
                  <input type="number" value={f.valor ?? 0} onChange={(e) => set(f.clave, "valor", Number(e.target.value))} disabled={!f.activa} style={{ width: 80 }} />
                  <span style={{ color: "var(--sc-text-soft)", marginLeft: 6 }}>{unidadLbl(f.unidad)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="dash-sub" style={{ fontSize: 12, marginTop: 10 }}>
        Editando: <b>{scopeNombre}</b>. Logística (movimientos/inspecciones) se calcula por los sitios del cliente; <b>Tareas</b> es a nivel organización (aún sin liga a cliente).
      </p>
    </main>
  );
}
