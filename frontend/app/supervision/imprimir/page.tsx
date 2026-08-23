"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import MapaReportes, { type ReporteMapa } from "@/app/components/MapaReportes";
import { getConfig } from "@/lib/config";

const conNovedad = (n: string | null) => !!n && n.trim() !== "" && n.trim().toLowerCase() !== "sin novedad";
const PAL = ["#1e88e5", "#8e24aa", "#00897b", "#f4511e", "#3949ab", "#c0ca33", "#00acc1", "#6d4c41"];
function nombreGuardia(p: any): string {
  const x = p?.persona ?? p;
  return x ? `${x.nombre ?? ""} ${x.apellido_paterno ?? ""} ${x.apellido_materno ?? ""}`.trim() : "—";
}

interface Paso {
  id: string; fecha_hora: string; latitud: number | null; longitud: number | null; novedad: string | null;
  personalId: string; guardia: string; punto: string; sitio: string;
}

function Reporte() {
  const params = useSearchParams();
  const guardiaId = params.get("guardia") ?? "";
  const sitioId = params.get("sitio") ?? "";
  const fecha = params.get("fecha") ?? "";
  const modo: "guardia" | "sitio" = sitioId ? "sitio" : "guardia";

  const [corp, setCorp] = useState("");
  const [titular, setTitular] = useState(""); // nombre del guardia o del sitio
  const [subtitulo, setSubtitulo] = useState("");
  const [pasos, setPasos] = useState<Paso[]>([]);
  const [ruta, setRuta] = useState<[number, number][]>([]);
  const [listo, setListo] = useState(false);

  useEffect(() => {
    if (!fecha || (!guardiaId && !sitioId)) return;
    (async () => {
      getConfig().then((c) => setCorp(c?.corporacion ?? ""));
      const desde = `${fecha}T00:00:00`, hasta = `${fecha}T23:59:59.999`;

      // Puntos a considerar + encabezado según el modo.
      let puntoIds: string[] = [];
      if (modo === "sitio") {
        const { data: s } = await supabase.from("sitios").select("nombre, cliente:clientes(razon_social)").eq("id", sitioId).maybeSingle();
        setTitular((s as any)?.nombre ?? "Sitio");
        setSubtitulo((s as any)?.cliente?.razon_social ?? "");
        const { data: pts } = await supabase.from("puntos_control").select("id").eq("sitio_id", sitioId).eq("estatus", "activo");
        puntoIds = ((pts as any[]) ?? []).map((p) => p.id);
      } else {
        const { data: g } = await supabase.from("personal").select("persona:personas(nombre, apellido_paterno, apellido_materno)").eq("id", guardiaId).maybeSingle();
        setTitular(nombreGuardia((g as any)));
        setSubtitulo("Recorrido del guardia");
      }

      let q = supabase.from("rondines")
        .select("id, fecha_hora, latitud, longitud, novedad, personal_id, punto:puntos_control(nombre, sitio:sitios(nombre)), guardia:personal(persona:personas(nombre, apellido_paterno, apellido_materno))")
        .eq("estatus", "activo").gte("fecha_hora", desde).lte("fecha_hora", hasta).order("fecha_hora", { ascending: true });
      if (modo === "sitio") { if (puntoIds.length) q = q.in("punto_id", puntoIds); else { setPasos([]); setListo(true); return; } }
      else q = q.eq("personal_id", guardiaId);
      const { data } = await q;
      setPasos(((data as any[]) ?? []).map((r) => ({
        id: r.id, fecha_hora: r.fecha_hora, latitud: r.latitud, longitud: r.longitud, novedad: r.novedad,
        personalId: r.personal_id, guardia: nombreGuardia(r.guardia), punto: r.punto?.nombre ?? "Punto", sitio: r.punto?.sitio?.nombre ?? "—",
      })));

      // Trayecto GPS solo en modo guardia.
      if (modo === "guardia") {
        const { data: rec } = await supabase.from("recorrido_gps").select("latitud, longitud")
          .eq("personal_id", guardiaId).gte("fecha_hora", desde).lte("fecha_hora", hasta).order("fecha_hora", { ascending: true });
        setRuta(((rec as any[]) ?? []).filter((p) => p.latitud != null && p.longitud != null).map((p) => [Number(p.latitud), Number(p.longitud)] as [number, number]));
      }
      setListo(true);
    })();
  }, [guardiaId, sitioId, fecha, modo]);

  useEffect(() => { if (listo) { const t = setTimeout(() => window.print(), 1800); return () => clearTimeout(t); } }, [listo]);

  const colorGuardia = useMemo(() => {
    const ids = Array.from(new Set(pasos.map((p) => p.personalId)));
    const m: Record<string, string> = {}; ids.forEach((id, i) => { m[id] = PAL[i % PAL.length]; }); return m;
  }, [pasos]);
  const reportes: ReporteMapa[] = pasos.filter((p) => p.latitud != null && p.longitud != null).map((p, i) => ({
    id: p.id, folio: `#${i + 1}`, titulo: `${p.guardia} · ${p.punto}`, latitud: Number(p.latitud), longitud: Number(p.longitud), href: "#",
    color: conNovedad(p.novedad) ? "#d32f2f" : (colorGuardia[p.personalId] ?? "#f4a03f"),
  }));
  const novedades = pasos.filter((p) => conNovedad(p.novedad)).length;

  // Agrupado por guardia (para modo sitio).
  const porGuardia = useMemo(() => {
    const g: Record<string, Paso[]> = {}; for (const p of pasos) (g[p.guardia] ??= []).push(p); return g;
  }, [pasos]);
  const nGuardias = Object.keys(porGuardia).length;

  return (
    <div style={{ padding: 24, fontFamily: "Arial, sans-serif", color: "#111", maxWidth: 940, margin: "0 auto" }}>
      <style>{`@media print { .no-print { display:none } } table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:12px} th,td{border:1px solid #ccc;padding:6px 8px;text-align:left} th{background:#eef1f4}`}</style>
      <div style={{ display: "flex", alignItems: "center", gap: 12, borderBottom: "2px solid #11223C", paddingBottom: 10 }}>
        <img src="/escudo.png" alt="" style={{ width: 46, height: 46, objectFit: "contain" }} />
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#11223C" }}>Reporte de supervisión de rondín</div>
          <div style={{ fontSize: 12, color: "#555" }}>{corp || "Sistema de Gestión de Seguridad"}</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 22, flexWrap: "wrap", margin: "14px 0", fontSize: 13 }}>
        <div><b>{modo === "sitio" ? "Sitio" : "Guardia"}:</b> {titular || "…"}</div>
        {subtitulo && <div><b>{modo === "sitio" ? "Cliente" : ""}:</b> {subtitulo}</div>}
        <div><b>Fecha:</b> {fecha}</div>
        {modo === "sitio" && <div><b>Guardias:</b> {nGuardias}</div>}
        <div><b>Lecturas:</b> {pasos.length}</div>
        <div><b>Con novedad:</b> {novedades}</div>
        {modo === "guardia" && <div><b>Puntos GPS:</b> {ruta.length}</div>}
      </div>

      <div style={{ border: "1px solid #ccc", borderRadius: 6, overflow: "hidden", marginBottom: 16 }}>
        <MapaReportes reportes={reportes} ruta={ruta} className="mapbox-dash" />
      </div>

      {modo === "sitio" ? (
        Object.entries(porGuardia).map(([g, items]) => (
          <div key={g}>
            <div style={{ fontWeight: 800, color: "#11223C", margin: "10px 0 4px" }}>👷 {g} — {items.length} lecturas</div>
            <table>
              <thead><tr><th>#</th><th>Hora</th><th>Punto</th><th>Novedad</th></tr></thead>
              <tbody>
                {items.map((p, i) => (
                  <tr key={p.id}><td>{i + 1}</td><td>{new Date(p.fecha_hora).toLocaleTimeString()}</td><td>{p.punto}</td><td>{conNovedad(p.novedad) ? p.novedad : "Sin novedad"}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        ))
      ) : (
        <table>
          <thead><tr><th>#</th><th>Hora</th><th>Punto</th><th>Sitio</th><th>Novedad</th></tr></thead>
          <tbody>
            {pasos.map((p, i) => (
              <tr key={p.id}><td>{i + 1}</td><td>{new Date(p.fecha_hora).toLocaleTimeString()}</td><td>{p.punto}</td><td>{p.sitio}</td><td>{conNovedad(p.novedad) ? p.novedad : "Sin novedad"}</td></tr>
            ))}
          </tbody>
        </table>
      )}
      {listo && pasos.length === 0 && <p style={{ color: "#777" }}>Sin lecturas en la fecha.</p>}

      <div className="no-print" style={{ marginTop: 16 }}>
        <button onClick={() => window.print()}>Imprimir / Guardar PDF</button>
      </div>
    </div>
  );
}

export default function SupervisionImprimirPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24 }}>Cargando…</div>}>
      <Reporte />
    </Suspense>
  );
}
