"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import MapaReportes, { type ReporteMapa } from "@/app/components/MapaReportes";

const hoyISO = () => new Date().toISOString().slice(0, 10);

function nombreGuardia(g: any): string {
  const p = g?.persona;
  return p ? `${p.nombre ?? ""} ${p.apellido_paterno ?? ""} ${p.apellido_materno ?? ""}`.trim() : "—";
}
const conNovedad = (n: string | null) => !!n && n.trim() !== "" && n.trim().toLowerCase() !== "sin novedad";

interface Paso {
  id: string;
  fecha_hora: string;
  latitud: number | null;
  longitud: number | null;
  novedad: string | null;
  punto: string;
  sitio: string;
}

// Supervisión de rondín: para un guardia y fecha, muestra el trayecto GPS y el
// punto de lectura de cada código QR, con lista en pantalla y exportación a PDF.
export default function SupervisionPage() {
  const [guardias, setGuardias] = useState<any[]>([]);
  const [guardiaId, setGuardiaId] = useState("");
  const [fecha, setFecha] = useState(hoyISO());
  const [pasos, setPasos] = useState<Paso[]>([]);
  const [ruta, setRuta] = useState<[number, number][]>([]);
  const [cargando, setCargando] = useState(false);
  const [buscado, setBuscado] = useState(false);

  useEffect(() => {
    supabase.from("personal")
      .select("id, persona:personas(nombre, apellido_paterno, apellido_materno)")
      .eq("estatus", "activo").eq("estado_laboral", "activo")
      .then(({ data }) => setGuardias((data as any[]) ?? []));
  }, []);

  async function cargar() {
    if (!guardiaId) return;
    setCargando(true);
    setBuscado(true);
    const desde = `${fecha}T00:00:00`;
    const hasta = `${fecha}T23:59:59.999`;

    const { data: rond } = await supabase.from("rondines")
      .select("id, fecha_hora, latitud, longitud, novedad, punto:puntos_control(nombre, codigo, sitio:sitios(nombre))")
      .eq("personal_id", guardiaId).eq("estatus", "activo")
      .gte("fecha_hora", desde).lte("fecha_hora", hasta)
      .order("fecha_hora", { ascending: true });
    setPasos(((rond as any[]) ?? []).map((r) => ({
      id: r.id, fecha_hora: r.fecha_hora, latitud: r.latitud, longitud: r.longitud, novedad: r.novedad,
      punto: r.punto?.nombre ?? "Punto", sitio: r.punto?.sitio?.nombre ?? "—",
    })));

    const { data: rec } = await supabase.from("recorrido_gps")
      .select("latitud, longitud, fecha_hora")
      .eq("personal_id", guardiaId)
      .gte("fecha_hora", desde).lte("fecha_hora", hasta)
      .order("fecha_hora", { ascending: true });
    setRuta(((rec as any[]) ?? []).filter((p) => p.latitud != null && p.longitud != null).map((p) => [Number(p.latitud), Number(p.longitud)] as [number, number]));

    setCargando(false);
  }

  // Puntos de lectura de QR como pines numerados por orden cronológico.
  const reportes = useMemo<ReporteMapa[]>(() => pasos.filter((p) => p.latitud != null && p.longitud != null).map((p, i) => ({
    id: p.id, folio: `#${i + 1}`,
    titulo: `${i + 1}. ${p.punto} · ${new Date(p.fecha_hora).toLocaleTimeString()}${conNovedad(p.novedad) ? `<br>⚠ ${p.novedad}` : ""}`,
    latitud: Number(p.latitud), longitud: Number(p.longitud), href: "#",
    color: conNovedad(p.novedad) ? "#d32f2f" : "#f4a03f",
  })), [pasos]);

  const novedades = pasos.filter((p) => conNovedad(p.novedad)).length;
  const guardiaNom = useMemo(() => nombreGuardia(guardias.find((g) => g.id === guardiaId)), [guardias, guardiaId]);
  const pdfHref = guardiaId ? `/supervision/imprimir?guardia=${guardiaId}&fecha=${fecha}` : "#";

  return (
    <main className="contenedor">
      <h2>Supervisión de rondín</h2>
      <p style={{ fontSize: 13, color: "#555" }}>Trayecto GPS y lecturas de puntos de control de un guardia en una fecha.</p>

      <div className="form-fila" style={{ marginTop: 8, alignItems: "flex-end" }}>
        <label className="dash-sub" style={{ display: "flex", flexDirection: "column", flex: 2 }}>Guardia
          <select value={guardiaId} onChange={(e) => setGuardiaId(e.target.value)}>
            <option value="">— Selecciona guardia —</option>
            {guardias.map((g) => <option key={g.id} value={g.id}>{nombreGuardia(g)}</option>)}
          </select>
        </label>
        <label className="dash-sub" style={{ display: "flex", flexDirection: "column" }}>Fecha
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </label>
        <button onClick={cargar} disabled={!guardiaId || cargando}>{cargando ? "Cargando…" : "Ver recorrido"}</button>
        <a
          href={pdfHref}
          target="_blank"
          rel="noopener noreferrer"
          className="cad-mapbtn"
          style={{ pointerEvents: guardiaId && buscado ? "auto" : "none", opacity: guardiaId && buscado ? 1 : 0.5 }}
        >🖨️ Exportar PDF ↗</a>
      </div>

      {buscado && (
        <>
          <div className="cad-status" style={{ marginTop: 14 }}>
            <div className="cad-stat"><span className="cad-stat-lbl">Lecturas</span><b>{pasos.length}</b></div>
            <div className="cad-stat"><span className="cad-stat-lbl">Con novedad</span><b style={{ color: novedades ? "#d32f2f" : undefined }}>{novedades}</b></div>
            <div className="cad-stat"><span className="cad-stat-lbl">Puntos GPS (trayecto)</span><b>{ruta.length}</b></div>
          </div>

          <div className="mapcard" style={{ marginTop: 12 }}>
            <div className="maphead">
              <span className="t">Recorrido</span>
              <span className="maplegend">
                <span className="lg"><span className="mdot" style={{ background: "#1e88e5" }}></span>Trayecto GPS</span>
                <span className="lg"><span className="mdot" style={{ background: "#f4a03f" }}></span>Lectura QR</span>
                <span className="lg"><span className="mdot" style={{ background: "#d32f2f" }}></span>Con novedad</span>
              </span>
            </div>
            <MapaReportes reportes={reportes} ruta={ruta} className="mapbox-dash" />
          </div>

          {/* Historial del recorrido en línea de tiempo (mismo estilo que el
              historial de atención de un despacho en Central/Despacho). */}
          <section style={{ marginTop: 18 }}>
            <h3>🕓 Historial del recorrido{guardiaNom && guardiaNom !== "—" ? ` — ${guardiaNom}` : ""}</h3>
            {pasos.length === 0 ? (
              <p className="dash-sub">Sin lecturas de rondín para este guardia en la fecha seleccionada.</p>
            ) : (
              <ol className="cad-timeline">
                {pasos.map((p, i) => (
                  <li key={p.id} className="cad-tl-item">
                    <span className="cad-tl-dot" style={conNovedad(p.novedad) ? { background: "#d32f2f" } : undefined} />
                    <div className="cad-tl-body">
                      <span className="cad-tl-estado">{i + 1}. {p.punto}{p.sitio ? ` · ${p.sitio}` : ""}</span>
                      <span className="cad-tl-meta">
                        {new Date(p.fecha_hora).toLocaleString()}
                        {conNovedad(p.novedad) ? ` · ⚠ ${p.novedad}` : " · Sin novedad"}
                      </span>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </>
      )}
    </main>
  );
}
