"use client";

import { useEffect, useState } from "react";
import MapaReportes, { type ReporteMapa } from "@/app/components/MapaReportes";
import { supabase } from "@/lib/supabaseClient";
import { useGuardiasEnLinea } from "@/lib/guardiasVivo";

// Monitoreo: mapa de sitios/puestos (pines naranja SGS) con los guardias que
// están reportando ubicación en vivo (puntos azules). Solo mandos ven guardias
// (la RLS de ubicaciones_guardias filtra por rol); a otros la capa llega vacía.
export default function MonitoreoPage() {
  const [sitios, setSitios] = useState<ReporteMapa[]>([]);
  const guardias = useGuardiasEnLinea();

  async function cargar() {
    const { data } = await supabase.from("sitios")
      .select("id, folio, nombre, direccion, latitud, longitud")
      .eq("estatus", "activo").not("latitud", "is", null).not("longitud", "is", null);
    setSitios(((data as any[]) ?? []).map((s) => ({
      id: s.id, folio: s.folio ?? null,
      titulo: `${s.nombre ?? "Sitio"}${s.direccion ? `<br>${s.direccion}` : ""}`,
      latitud: Number(s.latitud), longitud: Number(s.longitud),
      href: `/sitios/${s.id}`, color: "#f4a03f", // naranja SGS
    })));
  }

  useEffect(() => {
    cargar();
    const t = setInterval(cargar, 30000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="cadmapa">
      <header className="cadmapa-top">
        <div className="cadmapa-title">
          <div>
            <b>Monitoreo en vivo</b>
            <div className="cadmapa-meta">
              {sitios.length} sitio{sitios.length === 1 ? "" : "s"} · {guardias.length} guardia{guardias.length === 1 ? "" : "s"} en línea
            </div>
          </div>
        </div>
        <div className="cadmapa-legend">
          <span className="cadmapa-leg"><i style={{ background: "#f4a03f" }} /> Sitio / puesto</span>
          <span className="cadmapa-leg"><i style={{ background: "#1e88e5" }} /> Guardia en línea</span>
        </div>
      </header>
      <MapaReportes reportes={sitios} guardias={guardias} className="cadmapa-map" />
    </div>
  );
}
