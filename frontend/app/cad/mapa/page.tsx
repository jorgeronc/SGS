"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import MapaReportes, { type ReporteMapa } from "@/app/components/MapaReportes";
import { supabase } from "@/lib/supabaseClient";
import { unidadesPorLlamada, DESPACHO_LABEL } from "@/lib/despachos";
import { useGuardiasEnLinea } from "@/lib/guardiasVivo";

// Color del pin según el estado de despacho (coincide con las píldoras del CAD).
const DESP_COLOR: Record<string, string> = {
  recibida: "#546e7a",
  despachada: "#1565c0",
  en_atencion: "#e65100",
  resuelta: "#2e7d32",
};
const DESP_LABEL: Record<string, string> = {
  recibida: "Recibida",
  despachada: "Despachado",
  en_atencion: "En atención",
  resuelta: "Resuelta",
};

function Mapa() {
  const params = useSearchParams();
  const fEstatus = params.get("estatus") ?? "";
  const fPrioridad = params.get("prioridad") ?? "";
  const fDespacho = params.get("despacho") ?? "";
  const hayFiltro = !!(fEstatus || fPrioridad || fDespacho);

  const [reportes, setReportes] = useState<ReporteMapa[]>([]);
  const [actualizado, setActualizado] = useState<Date | null>(null);
  const [cargando, setCargando] = useState(true);
  const guardias = useGuardiasEnLinea();

  async function cargar() {
    // Incidencias con los MISMOS filtros de la lista (estatus por defecto: activo).
    let q = supabase
      .from("llamadas_cad")
      .select("id, folio, tipo, direccion, prioridad, estado_despacho, estatus, latitud, longitud")
      .not("latitud", "is", null).not("longitud", "is", null)
      .eq("estatus", fEstatus || "activo");
    if (fPrioridad) q = q.eq("prioridad", fPrioridad);
    if (fDespacho) q = q.eq("estado_despacho", fDespacho);
    const { data: cad } = await q;

    // Guardia/unidad que atiende cada incidencia (para el popup del pin).
    const cadRows = (cad as any[]) ?? [];
    const uni = await unidadesPorLlamada(cadRows.map((l) => l.id));

    const reportesCad: ReporteMapa[] = cadRows.map((l) => {
      const u = uni[l.id];
      const unidadTxt = u ? `<br>📍 ${u.numero ? `#${u.numero}` : "Unidad"} · ${DESPACHO_LABEL[u.estado] ?? u.estado}` : "";
      return {
        id: l.id,
        folio: l.folio ?? null,
        titulo: `${l.tipo ?? "Incidencia"} · ${DESP_LABEL[l.estado_despacho] ?? l.estado_despacho} · prioridad ${l.prioridad ?? "—"}${l.direccion ? `<br>${l.direccion}` : ""}${unidadTxt}`,
        latitud: Number(l.latitud), longitud: Number(l.longitud),
        href: `/cad/${l.id}`,
        color: DESP_COLOR[l.estado_despacho] ?? "#1565c0",
      };
    });

    setReportes(reportesCad);
    setActualizado(new Date());
    setCargando(false);
  }

  useEffect(() => {
    cargar();
    const t = setInterval(cargar, 20000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fEstatus, fPrioridad, fDespacho]);

  const resumen = hayFiltro
    ? [fEstatus && `estatus ${fEstatus}`, fPrioridad && `prioridad ${fPrioridad}`, fDespacho && `despacho ${DESP_LABEL[fDespacho] ?? fDespacho}`].filter(Boolean).join(" · ")
    : "vista general (incidencias activas)";

  return (
    <div className="cadmapa">
      <header className="cadmapa-top">
        <div className="cadmapa-title">
          <img src="/escudo.png" alt="" className="cadmapa-escudo" />
          <div>
            <b>Central / Despacho — Mapa</b>
            <div className="cadmapa-meta">
              {cargando ? "Cargando…" : `${reportes.length} en el mapa`}
              {guardias.length > 0 && ` · ${guardias.length} guardia${guardias.length === 1 ? "" : "s"} en línea`}
              {" · "}{resumen}
              {actualizado && ` · actualizado ${actualizado.toLocaleTimeString()}`}
            </div>
          </div>
        </div>
        <div className="cadmapa-legend">
          {Object.keys(DESP_COLOR).map((k) => (
            <span key={k} className="cadmapa-leg"><i style={{ background: DESP_COLOR[k] }} />{DESP_LABEL[k]}</span>
          ))}
          <span className="cadmapa-leg"><i style={{ background: "#1e88e5", borderRadius: "50%" }} />Guardia en línea</span>
          <button className="cadmapa-refresh" onClick={cargar}>↻ Actualizar</button>
        </div>
      </header>
      <MapaReportes reportes={reportes} guardias={guardias} className="cadmapa-map" />
    </div>
  );
}

export default function CentralDespachoMapaPage() {
  return (
    <Suspense fallback={<div className="contenedor"><p>Cargando…</p></div>}>
      <Mapa />
    </Suspense>
  );
}
