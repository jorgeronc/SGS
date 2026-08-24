"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import MapaUbicacion from "@/app/components/MapaUbicacion";

const conNovedad = (n: string | null) => !!n && n.trim() !== "" && n.trim().toLowerCase() !== "sin novedad";
function nombreGuardia(p: any): string {
  const x = p?.persona;
  return x ? `${x.nombre ?? ""} ${x.apellido_paterno ?? ""} ${x.apellido_materno ?? ""}`.trim() : "—";
}

// Detalle de un rondín (lectura de un punto de control): guardia, punto, sitio,
// fecha/hora, novedad, ubicación y foto (si la hay).
export default function RondinDetallePage() {
  const params = useParams<{ id: string }>();
  const [r, setR] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.from("rondines")
      .select("id, fecha_hora, latitud, longitud, novedad, foto, estatus, distancia_m, dentro_geocerca, tipo_evento, metodo, punto:puntos_control(nombre, codigo, radio_m, latitud, longitud, sitio:sitios(nombre, cliente:clientes(razon_social))), guardia:personal(persona:personas(nombre, apellido_paterno, apellido_materno))")
      .eq("id", params.id).maybeSingle()
      .then(({ data, error }) => { if (error) setError(error.message); setR(data); });
  }, [params.id]);

  if (error) return <main className="contenedor"><p style={{ color: "#b00020" }}>{error}</p></main>;
  if (!r) return <main className="contenedor"><p>Cargando…</p></main>;

  const novedad = conNovedad(r.novedad);
  return (
    <main className="contenedor">
      <p style={{ marginBottom: 4 }}><Link href="/supervision">← Supervisión de rondín</Link></p>
      <h2 style={{ marginBottom: 6 }}>
        Rondín · {r.punto?.nombre ?? "Punto"}
        <span className="cad-pill" style={{ marginLeft: 10, background: novedad ? "#d32f2f" : "#0a7c2f", color: "#fff" }}>{novedad ? "Con novedad" : "Sin novedad"}</span>
      </h2>

      <div className="cad-status">
        <div className="cad-stat"><span className="cad-stat-lbl">Guardia</span><b>{nombreGuardia(r.guardia)}</b></div>
        <div className="cad-stat"><span className="cad-stat-lbl">Sitio</span><b>{r.punto?.sitio?.nombre ?? "—"}</b></div>
        <div className="cad-stat"><span className="cad-stat-lbl">Cliente</span><b>{r.punto?.sitio?.cliente?.razon_social ?? "—"}</b></div>
        <div className="cad-stat"><span className="cad-stat-lbl">Fecha y hora</span><b>{new Date(r.fecha_hora).toLocaleString()}</b></div>
      </div>

      <dl className="sc-kv" style={{ marginTop: 12 }}>
        <dt>Punto</dt><dd>{r.punto?.nombre ?? "—"}</dd>
        <dt>Código</dt><dd><code>{r.punto?.codigo ?? "—"}</code></dd>
        <dt>Método</dt><dd>{r.metodo === "nfc" ? "NFC" : r.metodo === "manual" ? "Manual" : "QR"}</dd>
        <dt>Tipo de evento</dt><dd>{r.tipo_evento ?? "control"}</dd>
        <dt>Geocerca</dt><dd>
          {r.dentro_geocerca == null ? "Sin dato (sin GPS)" : r.dentro_geocerca
            ? <span style={{ color: "#0a7c2f", fontWeight: 600 }}>Dentro de rango</span>
            : <span style={{ color: "#b00020", fontWeight: 700 }}>FUERA DE RANGO</span>}
          {r.distancia_m != null && ` · a ${r.distancia_m} m del punto${r.punto?.radio_m != null ? ` (radio ${r.punto.radio_m} m)` : ""}`}
        </dd>
        <dt>Novedad</dt><dd style={novedad ? { color: "#b00020", fontWeight: 600 } : undefined}>{r.novedad ?? "Sin novedad"}</dd>
        <dt>Coordenadas del guardia</dt><dd>{r.latitud != null && r.longitud != null ? `${r.latitud}, ${r.longitud}` : "Sin GPS"}</dd>
        <dt>Ubicación de la etiqueta</dt><dd>{r.punto?.latitud != null && r.punto?.longitud != null ? `${r.punto.latitud}, ${r.punto.longitud}` : "—"}</dd>
      </dl>

      {r.latitud != null && r.longitud != null && (
        <div style={{ marginTop: 12 }}>
          <h3>Ubicación</h3>
          <MapaUbicacion latitud={r.latitud} longitud={r.longitud} />
        </div>
      )}

      <p style={{ marginTop: 14 }}><Link href="/rondines" className="qbtn2">▤ Ver todos los rondines →</Link></p>
    </main>
  );
}
