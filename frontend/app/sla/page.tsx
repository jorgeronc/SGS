"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

// Administración de metas de SLA por cliente (o global). Ver migración 0066.
interface Fila { key: string; cliente_id: string | null; nombre: string; metaId: string | null; cobertura_pct: number; rondines_pct: number; tiempo_resp_min: number; incidentes_criticos_max: number; }

export default function SlaPage() {
  const [filas, setFilas] = useState<Fila[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    const [{ data: cli }, { data: metas }] = await Promise.all([
      supabase.from("clientes").select("id, razon_social").eq("estatus", "activo").order("razon_social"),
      supabase.from("sla_metas").select("id, cliente_id, cobertura_pct, rondines_pct, tiempo_resp_min, incidentes_criticos_max").eq("estatus", "activo"),
    ]);
    const metaBy = new Map<string, any>();
    ((metas as any[]) ?? []).forEach((m) => metaBy.set(m.cliente_id ?? "__global__", m));
    const g = metaBy.get("__global__") ?? {};
    const out: Fila[] = [{
      key: "__global__", cliente_id: null, nombre: "▸ Meta global (por defecto)", metaId: g.id ?? null,
      cobertura_pct: g.cobertura_pct ?? 95, rondines_pct: g.rondines_pct ?? 90, tiempo_resp_min: g.tiempo_resp_min ?? 10, incidentes_criticos_max: g.incidentes_criticos_max ?? 0,
    }];
    ((cli as any[]) ?? []).forEach((c) => {
      const m = metaBy.get(c.id) ?? {};
      out.push({ key: c.id, cliente_id: c.id, nombre: c.razon_social, metaId: m.id ?? null,
        cobertura_pct: m.cobertura_pct ?? 95, rondines_pct: m.rondines_pct ?? 90, tiempo_resp_min: m.tiempo_resp_min ?? 10, incidentes_criticos_max: m.incidentes_criticos_max ?? 0 });
    });
    setFilas(out);
    setCargando(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  function set(k: string, campo: keyof Fila, v: number) {
    setFilas((p) => p.map((f) => (f.key === k ? { ...f, [campo]: v } : f)));
  }

  async function guardar(f: Fila) {
    setGuardando(f.key); setMsg(null);
    const payload = { cliente_id: f.cliente_id, cobertura_pct: f.cobertura_pct, rondines_pct: f.rondines_pct, tiempo_resp_min: f.tiempo_resp_min, incidentes_criticos_max: f.incidentes_criticos_max, actualizado_en: new Date().toISOString() };
    const { error } = f.metaId
      ? await supabase.from("sla_metas").update(payload).eq("id", f.metaId)
      : await supabase.from("sla_metas").insert(payload);
    setGuardando(null);
    if (error) { setMsg(error.message); return; }
    setMsg(`Metas de "${f.nombre}" guardadas.`);
    cargar();
  }

  return (
    <main className="contenedor">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div>
          <h2 style={{ margin: 0 }}>Metas de SLA</h2>
          <p className="dash-sub">Define los compromisos por cliente (o global). Alimentan el cumplimiento SLA, el Índice de Seguridad y el reporte mensual.</p>
        </div>
        <Link href="/reporte-sla" className="qbtn2">📄 Reporte mensual →</Link>
      </div>

      {msg && <p style={{ color: msg.includes("guardadas") ? "#0a7c2f" : "#b00020" }}>{msg}</p>}

      {cargando ? <p>Cargando…</p> : (
        <table>
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Cobertura ≥ %</th>
              <th>Rondines ≥ %</th>
              <th>Resp. ≤ min</th>
              <th>Críticos ≤</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.key} style={f.cliente_id === null ? { background: "var(--sc-surface-2, #f3f6f9)", fontWeight: 600 } : undefined}>
                <td>{f.nombre}</td>
                <td><input type="number" min={0} max={100} value={f.cobertura_pct} onChange={(e) => set(f.key, "cobertura_pct", Number(e.target.value))} style={{ width: 70 }} /></td>
                <td><input type="number" min={0} max={100} value={f.rondines_pct} onChange={(e) => set(f.key, "rondines_pct", Number(e.target.value))} style={{ width: 70 }} /></td>
                <td><input type="number" min={0} value={f.tiempo_resp_min} onChange={(e) => set(f.key, "tiempo_resp_min", Number(e.target.value))} style={{ width: 70 }} /></td>
                <td><input type="number" min={0} value={f.incidentes_criticos_max} onChange={(e) => set(f.key, "incidentes_criticos_max", Number(e.target.value))} style={{ width: 60 }} /></td>
                <td><button className="qbtn2" onClick={() => guardar(f)} disabled={guardando === f.key}>{guardando === f.key ? "…" : "Guardar"}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
