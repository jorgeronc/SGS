"use client";

import { useCallback, useEffect, useState } from "react";
import MapaMonitoreo, { COL, type MSitio, type MPunto, type MIncidente, type MCamara } from "@/app/components/MapaMonitoreo";
import { supabase } from "@/lib/supabaseClient";
import { useGuardiasEnLinea } from "@/lib/guardiasVivo";

// Monitoreo: mapa con sitios, puntos de control, guardias en vivo (GPS) e
// incidencias/alertas abiertas — cada tipo con su color y puntero. Refresco
// automático cada minuto SIN mover el mapa (el operador conserva su foco/zoom).
export default function MonitoreoPage() {
  const [sitios, setSitios] = useState<MSitio[]>([]);
  const [puntos, setPuntos] = useState<MPunto[]>([]);
  const [incidentes, setIncidentes] = useState<MIncidente[]>([]);
  const [camaras, setCamaras] = useState<MCamara[]>([]);
  const [actualizado, setActualizado] = useState<Date | null>(null);
  const guardias = useGuardiasEnLinea();

  const cargar = useCallback(async () => {
    const [{ data: s }, { data: p }, { data: i }, { data: cam }] = await Promise.all([
      supabase.from("sitios").select("id, nombre, latitud, longitud, cliente:clientes(razon_social)")
        .eq("estatus", "activo").not("latitud", "is", null).not("longitud", "is", null),
      supabase.from("puntos_control").select("id, nombre, codigo, latitud, longitud, sitio:sitios(nombre)")
        .eq("estatus", "activo").not("latitud", "is", null).not("longitud", "is", null),
      supabase.from("llamadas_cad").select("id, folio, tipo, prioridad, direccion, estado_despacho, latitud, longitud")
        .eq("estatus", "activo").in("estado_despacho", ["recibida", "despachada", "en_atencion"])
        .not("latitud", "is", null).not("longitud", "is", null),
      supabase.from("camaras").select("id, nombre, estado_operativo, latitud, longitud, sitio:sitios(nombre)")
        .eq("estatus", "activo").not("latitud", "is", null).not("longitud", "is", null),
    ]);
    setSitios(((s as any[]) ?? []).map((x) => ({ id: x.id, nombre: x.nombre ?? "Sitio", cliente: x.cliente?.razon_social ?? null, latitud: Number(x.latitud), longitud: Number(x.longitud), href: `/sitios/${x.id}` })));
    setPuntos(((p as any[]) ?? []).map((x) => ({ id: x.id, nombre: x.nombre ?? "Punto", sitio: x.sitio?.nombre ?? null, codigo: x.codigo ?? null, latitud: Number(x.latitud), longitud: Number(x.longitud) })));
    setIncidentes(((i as any[]) ?? []).map((x) => ({ id: x.id, folio: x.folio, tipo: x.tipo, prioridad: x.prioridad, direccion: x.direccion, estado: x.estado_despacho, latitud: Number(x.latitud), longitud: Number(x.longitud), href: `/cad/${x.id}` })));
    setCamaras(((cam as any[]) ?? []).map((x) => ({ id: x.id, nombre: x.nombre ?? "Cámara", sitio: x.sitio?.nombre ?? null, estado_operativo: x.estado_operativo, latitud: Number(x.latitud), longitud: Number(x.longitud) })));
    setActualizado(new Date());
  }, []);

  useEffect(() => {
    cargar();
    const t = setInterval(cargar, 60000); // refresco automático cada minuto
    return () => clearInterval(t);
  }, [cargar]);

  return (
    <div className="cadmapa">
      <header className="cadmapa-top">
        <div className="cadmapa-title">
          <img src="/escudo.png" alt="" className="cadmapa-escudo" />
          <div>
            <b>Monitoreo en vivo</b>
            <div className="cadmapa-meta">
              {sitios.length} sitios · {puntos.length} puntos · {guardias.length} guardias en línea · {incidentes.length} incidencias · {camaras.length} cámaras
              {actualizado && ` · actualizado ${actualizado.toLocaleTimeString()}`}
            </div>
          </div>
        </div>
        <div className="cadmapa-legend">
          <span className="cadmapa-leg"><i style={{ background: COL.sitio, borderRadius: 2 }} /> Sitio</span>
          <span className="cadmapa-leg"><i style={{ background: COL.punto, borderRadius: 2, transform: "rotate(45deg)" }} /> Punto de control</span>
          <span className="cadmapa-leg"><i style={{ background: COL.guardia, borderRadius: "50%" }} /> Guardia (GPS)</span>
          <span className="cadmapa-leg"><i style={{ background: COL.incidente, clipPath: "polygon(50% 0, 100% 100%, 0 100%)" }} /> Incidencia / alerta</span>
          <span className="cadmapa-leg"><i style={{ background: COL.camara, borderRadius: "50%" }} /> Cámara</span>
          <button className="cadmapa-refresh" onClick={cargar}>↻ Actualizar</button>
        </div>
      </header>
      <MapaMonitoreo sitios={sitios} puntos={puntos} guardias={guardias} incidentes={incidentes} camaras={camaras} className="cadmapa-map" />
    </div>
  );
}
