"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import MapaReportes, { type ReporteMapa } from "@/app/components/MapaReportes";
import { getConfig } from "@/lib/config";

const conNovedad = (n: string | null) => !!n && n.trim() !== "" && n.trim().toLowerCase() !== "sin novedad";

interface Paso { id: string; fecha_hora: string; latitud: number | null; longitud: number | null; novedad: string | null; punto: string; sitio: string; }

function Reporte() {
  const params = useSearchParams();
  const guardiaId = params.get("guardia") ?? "";
  const fecha = params.get("fecha") ?? "";
  const [nombre, setNombre] = useState("");
  const [corp, setCorp] = useState("");
  const [pasos, setPasos] = useState<Paso[]>([]);
  const [ruta, setRuta] = useState<[number, number][]>([]);
  const [listo, setListo] = useState(false);

  useEffect(() => {
    if (!guardiaId || !fecha) return;
    (async () => {
      getConfig().then((c) => setCorp(c?.corporacion ?? ""));
      const { data: g } = await supabase.from("personal")
        .select("persona:personas(nombre, apellido_paterno, apellido_materno)")
        .eq("id", guardiaId).maybeSingle();
      const p = (g as any)?.persona;
      setNombre(p ? `${p.nombre ?? ""} ${p.apellido_paterno ?? ""} ${p.apellido_materno ?? ""}`.trim() : "Guardia");

      const desde = `${fecha}T00:00:00`; const hasta = `${fecha}T23:59:59.999`;
      const { data: rond } = await supabase.from("rondines")
        .select("id, fecha_hora, latitud, longitud, novedad, punto:puntos_control(nombre, sitio:sitios(nombre))")
        .eq("personal_id", guardiaId).eq("estatus", "activo")
        .gte("fecha_hora", desde).lte("fecha_hora", hasta).order("fecha_hora", { ascending: true });
      setPasos(((rond as any[]) ?? []).map((r) => ({
        id: r.id, fecha_hora: r.fecha_hora, latitud: r.latitud, longitud: r.longitud, novedad: r.novedad,
        punto: r.punto?.nombre ?? "Punto", sitio: r.punto?.sitio?.nombre ?? "—",
      })));
      const { data: rec } = await supabase.from("recorrido_gps")
        .select("latitud, longitud").eq("personal_id", guardiaId)
        .gte("fecha_hora", desde).lte("fecha_hora", hasta).order("fecha_hora", { ascending: true });
      setRuta(((rec as any[]) ?? []).filter((x) => x.latitud != null && x.longitud != null).map((x) => [Number(x.latitud), Number(x.longitud)] as [number, number]));
      setListo(true);
    })();
  }, [guardiaId, fecha]);

  // Auto-imprimir cuando los datos y el mapa tuvieron tiempo de cargar.
  useEffect(() => {
    if (!listo) return;
    const t = setTimeout(() => window.print(), 1800);
    return () => clearTimeout(t);
  }, [listo]);

  const reportes: ReporteMapa[] = pasos.filter((p) => p.latitud != null && p.longitud != null).map((p, i) => ({
    id: p.id, folio: `#${i + 1}`, titulo: `${i + 1}. ${p.punto}`, latitud: Number(p.latitud), longitud: Number(p.longitud), href: "#",
    color: conNovedad(p.novedad) ? "#d32f2f" : "#f4a03f",
  }));
  const novedades = pasos.filter((p) => conNovedad(p.novedad)).length;

  return (
    <div style={{ padding: 24, fontFamily: "Arial, sans-serif", color: "#111", maxWidth: 900, margin: "0 auto" }}>
      <style>{`@media print { .no-print { display:none } } table{width:100%;border-collapse:collapse;font-size:12px} th,td{border:1px solid #ccc;padding:6px 8px;text-align:left} th{background:#eef1f4}`}</style>
      <div style={{ display: "flex", alignItems: "center", gap: 12, borderBottom: "2px solid #0b3d66", paddingBottom: 10 }}>
        <img src="/escudo.png" alt="" style={{ width: 46, height: 46, objectFit: "contain" }} />
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#0b3d66" }}>Reporte de supervisión de rondín</div>
          <div style={{ fontSize: 12, color: "#555" }}>{corp || "Sistema de Gestión de Seguridad"}</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 24, margin: "14px 0", fontSize: 13 }}>
        <div><b>Guardia:</b> {nombre || "…"}</div>
        <div><b>Fecha:</b> {fecha}</div>
        <div><b>Lecturas:</b> {pasos.length}</div>
        <div><b>Con novedad:</b> {novedades}</div>
        <div><b>Puntos GPS:</b> {ruta.length}</div>
      </div>

      <div style={{ border: "1px solid #ccc", borderRadius: 6, overflow: "hidden", marginBottom: 16 }}>
        <MapaReportes reportes={reportes} ruta={ruta} className="mapbox-dash" />
      </div>

      <table>
        <thead><tr><th>#</th><th>Hora</th><th>Punto</th><th>Sitio</th><th>Novedad</th></tr></thead>
        <tbody>
          {pasos.map((p, i) => (
            <tr key={p.id}>
              <td>{i + 1}</td>
              <td>{new Date(p.fecha_hora).toLocaleTimeString()}</td>
              <td>{p.punto}</td>
              <td>{p.sitio}</td>
              <td>{conNovedad(p.novedad) ? p.novedad : "Sin novedad"}</td>
            </tr>
          ))}
          {pasos.length === 0 && <tr><td colSpan={5} style={{ color: "#777" }}>Sin lecturas en la fecha.</td></tr>}
        </tbody>
      </table>

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
