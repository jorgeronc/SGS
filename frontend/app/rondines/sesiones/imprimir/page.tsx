"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { getConfig } from "@/lib/config";
import { detectarParadas, metricasRuta, distM, type PtoGps, type MetricasRuta } from "@/lib/rondinMetricas";

const nombreGuardia = (p: any): string => {
  const x = p?.persona ?? p;
  return x ? `${x.nombre ?? ""} ${x.apellido_paterno ?? ""} ${x.apellido_materno ?? ""}`.trim() : "—";
};
const conNovedad = (n: string | null) => !!n && n.trim() !== "" && n.trim().toLowerCase() !== "sin novedad";
const km = (m: number | null) => (m == null ? "—" : m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`);
const fhora = (iso?: string | null) => (iso ? new Date(iso).toLocaleString() : "—");
const hhmm = (iso?: string | null) => (iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—");
const EST_T: Record<string, string> = { en_progreso: "En curso", completado: "Completado", incompleto: "Incompleto", cancelado: "Cancelado" };

function Reporte() {
  const params = useSearchParams();
  const sesionId = params.get("sesion") ?? "";
  const [corp, setCorp] = useState("");
  const [ses, setSes] = useState<any>(null);
  const [checks, setChecks] = useState<any[]>([]);
  const [recorrido, setRecorrido] = useState<PtoGps[]>([]);
  const [rutaEsp, setRutaEsp] = useState<[number, number][]>([]);
  const [inc, setInc] = useState<any[]>([]);
  const [ev, setEv] = useState<any[]>([]);
  const [listo, setListo] = useState(false);

  useEffect(() => {
    if (!sesionId) return;
    (async () => {
      getConfig().then((c) => setCorp(c?.corporacion ?? ""));
      const { data: s } = await supabase.from("sesiones_rondin")
        .select("id, folio, estado, iniciada_en, finalizada_en, cumplimiento_pct, checkpoints_esperados, checkpoints_visitados, distancia_m, duracion_min, sitio_id, sitio:sitios(nombre, rondin_corredor_m, cliente:clientes(razon_social)), guardia:personal(persona:personas(nombre, apellido_paterno, apellido_materno))")
        .eq("id", sesionId).maybeSingle();
      setSes(s);
      const [{ data: rec }, { data: chk }, { data: incs }, { data: evs }] = await Promise.all([
        supabase.from("recorrido_gps").select("latitud, longitud, fecha_hora").eq("sesion_id", sesionId).order("fecha_hora", { ascending: true }),
        supabase.from("rondines").select("id, fecha_hora, novedad, dentro_geocerca, distancia_m, metodo, punto:puntos_control(nombre)").eq("sesion_id", sesionId).eq("estatus", "activo").order("fecha_hora", { ascending: true }),
        supabase.from("llamadas_cad").select("id, folio, tipo, prioridad, direccion").eq("sesion_id", sesionId),
        supabase.from("evidencias").select("id, folio, tipo, descripcion").eq("sesion_id", sesionId),
      ]);
      setRecorrido(((rec as any[]) ?? []).filter((p) => p.latitud != null).map((p) => ({ lat: Number(p.latitud), lng: Number(p.longitud), t: p.fecha_hora })));
      setChecks((chk as any[]) ?? []);
      setInc((incs as any[]) ?? []);
      setEv((evs as any[]) ?? []);
      if ((s as any)?.sitio_id) {
        const { data: pts } = await supabase.from("puntos_control").select("latitud, longitud, orden, creado_en")
          .eq("sitio_id", (s as any).sitio_id).eq("estatus", "activo").not("latitud", "is", null)
          .order("orden", { ascending: true, nullsFirst: false }).order("creado_en", { ascending: true });
        setRutaEsp(((pts as any[]) ?? []).map((p) => [Number(p.latitud), Number(p.longitud)] as [number, number]));
      }
      setListo(true);
    })();
  }, [sesionId]);

  useEffect(() => { if (listo) { const t = setTimeout(() => window.print(), 1200); return () => clearTimeout(t); } }, [listo]);

  if (!ses) return <div style={{ padding: 24 }}>Cargando reporte…</div>;

  const corredor = ses.sitio?.rondin_corredor_m ?? 30;
  const paradas = detectarParadas(recorrido);
  const mr: MetricasRuta | null = metricasRuta(recorrido, rutaEsp, corredor);
  const comp = ses.cumplimiento_pct ?? 0;
  const cob = mr ? mr.cobertura : comp;
  const score = Math.max(0, Math.min(100, Math.round(0.55 * comp + 0.45 * cob - (mr ? Math.min(20, mr.tFueraMin) : 0) - Math.min(15, paradas.length * 5))));

  const anomalias: { tipo: string; detalle: string }[] = [];
  const om = ses.checkpoints_esperados - ses.checkpoints_visitados;
  if (om > 0) anomalias.push({ tipo: "Checkpoints omitidos", detalle: `${om} de ${ses.checkpoints_esperados}` });
  if (ses.estado === "incompleto") anomalias.push({ tipo: "Rondín incompleto", detalle: "finalizó sin completar los checkpoints" });
  if (mr && mr.desvMax > corredor) anomalias.push({ tipo: "Desviación de ruta", detalle: `máx ${mr.desvMax} m (corredor ±${corredor} m) · ${mr.tFueraMin} min fuera` });
  paradas.forEach((p) => anomalias.push({ tipo: "Parada prolongada", detalle: `${p.durMin} min desde ${hhmm(p.desde)}` }));
  for (let i = 1; i < recorrido.length; i++) {
    const dts = (new Date(recorrido[i].t).getTime() - new Date(recorrido[i - 1].t).getTime()) / 1000;
    if (dts / 60 > 5) anomalias.push({ tipo: "Sin señal GPS", detalle: `${Math.round(dts / 60)} min (${hhmm(recorrido[i - 1].t)}–${hhmm(recorrido[i].t)})` });
    if (dts > 0) { const v = distM(recorrido[i - 1].lat, recorrido[i - 1].lng, recorrido[i].lat, recorrido[i].lng) / dts; if (v > 40) anomalias.push({ tipo: "Velocidad imposible", detalle: `${Math.round(v * 3.6)} km/h a las ${hhmm(recorrido[i].t)} (posible GPS falso)` }); }
  }

  const ind: [string, string][] = [
    ["Puntaje", `${score} / 100`], ["Cumplimiento", `${comp}%`], ["Cobertura ruta", mr ? `${mr.cobertura}%` : "—"],
    ["Checkpoints", `${ses.checkpoints_visitados}/${ses.checkpoints_esperados}`], ["Distancia", km(ses.distancia_m)], ["Duración", ses.duracion_min != null ? `${ses.duracion_min} min` : "—"],
    ["Paradas >5min", `${paradas.length}`], ["Desv. máx", mr ? `${mr.desvMax} m` : "—"], ["Fuera de ruta", mr ? `${mr.tFueraMin} min · ${km(mr.distFueraM)}` : "—"],
  ];

  return (
    <div style={{ padding: "24px 28px", maxWidth: 820, margin: "0 auto", color: "#111", fontSize: 13 }}>
      <style>{`@media print { .no-print { display:none } } table{width:100%;border-collapse:collapse;font-size:12px;margin:6px 0 14px} th,td{border:1px solid #ccc;padding:5px 8px;text-align:left} th{background:#eef1f4}`}</style>
      <div style={{ display: "flex", alignItems: "center", gap: 14, borderBottom: "2px solid #1F3A5F", paddingBottom: 10 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/escudo.png" alt="" style={{ width: 46, height: 46, objectFit: "contain" }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 18, color: "#1F3A5F" }}>Reporte de rondín · {ses.folio ?? "—"}</div>
          <div style={{ fontSize: 13, color: "#555" }}>{corp}{corp ? " · " : ""}{EST_T[ses.estado] ?? ses.estado}</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 30, fontWeight: 900, color: score >= 90 ? "#1f9d5c" : score >= 75 ? "#d98a2b" : "#d32f2f", lineHeight: 1 }}>{score}</div>
          <div style={{ fontSize: 10, color: "#888" }}>PUNTAJE / 100</div>
        </div>
      </div>

      <table>
        <tbody>
          <tr><th style={{ width: 130 }}>Guardia</th><td>{nombreGuardia(ses.guardia)}</td><th style={{ width: 90 }}>Sitio</th><td>{ses.sitio?.nombre ?? "—"}</td></tr>
          <tr><th>Cliente</th><td>{ses.sitio?.cliente?.razon_social ?? "—"}</td><th>Horario</th><td>{hhmm(ses.iniciada_en)}{ses.finalizada_en ? ` – ${hhmm(ses.finalizada_en)}` : " (en curso)"}</td></tr>
          <tr><th>Inicio</th><td>{fhora(ses.iniciada_en)}</td><th>Fin</th><td>{ses.finalizada_en ? fhora(ses.finalizada_en) : "—"}</td></tr>
        </tbody>
      </table>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, margin: "8px 0 14px" }}>
        {ind.map(([l, v]) => (
          <div key={l} style={{ border: "1px solid #e2e6ec", borderRadius: 8, padding: "6px 10px" }}>
            <div style={{ fontSize: 11, color: "#888" }}>{l}</div>
            <div style={{ fontSize: 16, fontWeight: 800 }}>{v}</div>
          </div>
        ))}
      </div>

      <h3 style={{ margin: "8px 0 2px", fontSize: 14, color: "#1F3A5F" }}>Anomalías ({anomalias.length})</h3>
      {anomalias.length === 0 ? <p style={{ color: "#666" }}>Sin anomalías detectadas.</p> : (
        <table><thead><tr><th style={{ width: 200 }}>Tipo</th><th>Detalle</th></tr></thead>
          <tbody>{anomalias.map((a, i) => <tr key={i}><td>{a.tipo}</td><td>{a.detalle}</td></tr>)}</tbody></table>
      )}

      <h3 style={{ margin: "8px 0 2px", fontSize: 14, color: "#1F3A5F" }}>Checks ({checks.length})</h3>
      {checks.length === 0 ? <p style={{ color: "#666" }}>Sin checks registrados.</p> : (
        <table><thead><tr><th style={{ width: 44 }}>#</th><th>Punto</th><th style={{ width: 70 }}>Hora</th><th style={{ width: 60 }}>Método</th><th>Novedad</th></tr></thead>
          <tbody>{checks.map((p, i) => (
            <tr key={p.id}><td>{i + 1}</td><td>{p.punto?.nombre ?? "Punto"}{p.dentro_geocerca === false ? ` (fuera ${p.distancia_m ?? "?"} m)` : ""}</td><td>{hhmm(p.fecha_hora)}</td><td>{p.metodo === "nfc" ? "NFC" : p.metodo === "manual" ? "Manual" : "QR"}</td><td>{conNovedad(p.novedad) ? p.novedad : "Sin novedad"}</td></tr>
          ))}</tbody></table>
      )}

      {inc.length > 0 && (<>
        <h3 style={{ margin: "8px 0 2px", fontSize: 14, color: "#1F3A5F" }}>Incidentes ({inc.length})</h3>
        <table><tbody>{inc.map((it) => <tr key={it.id}><th style={{ width: 120 }}>{it.folio ?? "s/folio"}</th><td>{it.tipo ?? "Incidente"}{it.prioridad ? ` · prioridad ${it.prioridad}` : ""}{it.direccion ? ` · ${it.direccion}` : ""}</td></tr>)}</tbody></table>
      </>)}
      {ev.length > 0 && (<>
        <h3 style={{ margin: "8px 0 2px", fontSize: 14, color: "#1F3A5F" }}>Evidencias ({ev.length})</h3>
        <table><tbody>{ev.map((e) => <tr key={e.id}><th style={{ width: 120 }}>{e.folio ?? "s/folio"}</th><td>{e.tipo ?? "Evidencia"}{e.descripcion ? ` · ${e.descripcion}` : ""}</td></tr>)}</tbody></table>
      </>)}

      <p style={{ marginTop: 16 }} className="no-print"><button onClick={() => window.print()}>Imprimir / Guardar PDF</button></p>
    </div>
  );
}

export default function ReporteRondinPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24 }}>Cargando…</div>}>
      <Reporte />
    </Suspense>
  );
}
