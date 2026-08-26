"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

const personaNombre = (r: any) => (r.persona
  ? `${r.persona.nombre ?? ""} ${r.persona.apellido_paterno ?? ""}`.trim()
  : (r.placa || r.vehiculo?.placas ? `🚚 ${r.placa ?? r.vehiculo?.placas}` : (r.visitante_nombre ?? "—")));

// Reporte imprimible (auditoría) de la bitácora de accesos. AppShell lo muestra a
// pantalla completa (ruta termina en /imprimir) y aquí se dispara window.print().
export default function AccesosImprimirPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [sitioNombre, setSitioNombre] = useState<string>("Todos los sitios");
  const [rango, setRango] = useState<string>("");
  const [listo, setListo] = useState(false);

  useEffect(() => {
    (async () => {
      const q = new URLSearchParams(window.location.search);
      const sitio = q.get("sitio");
      const desde = q.get("desde") || new Date().toISOString().slice(0, 10);
      const hasta = q.get("hasta") || desde;
      setRango(`${desde}${hasta !== desde ? ` a ${hasta}` : ""}`);
      let sel = supabase.from("accesos")
        .select("folio, tipo, visitante_nombre, tipo_persona, motivo, resultado, placa, anden, fecha_evento, sitio:sitios(nombre), persona:personas(nombre, apellido_paterno), vehiculo:vehiculos(placas)")
        .eq("estatus", "activo")
        .gte("fecha_evento", `${desde}T00:00:00`).lte("fecha_evento", `${hasta}T23:59:59`)
        .order("fecha_evento", { ascending: true });
      if (sitio) {
        sel = sel.eq("sitio_id", sitio);
        const { data: s } = await supabase.from("sitios").select("nombre").eq("id", sitio).maybeSingle();
        setSitioNombre((s as any)?.nombre ?? "Sitio");
      }
      const { data } = await sel;
      setRows((data as any[]) ?? []);
      setListo(true);
    })();
  }, []);

  useEffect(() => { if (listo) setTimeout(() => window.print(), 400); }, [listo]);

  const dentro = rows.filter((r) => r.resultado === "autorizado").length;
  const rech = rows.filter((r) => r.resultado === "rechazado").length;

  return (
    <div style={{ padding: 28, fontFamily: "Arial, sans-serif", color: "#111", maxWidth: 900, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, borderBottom: "2px solid #1F3A5F", paddingBottom: 10 }}>
        <img src="/escudo.png" alt="" style={{ width: 46, height: 46 }} />
        <div>
          <div style={{ fontWeight: 800, fontSize: 18, color: "#1F3A5F" }}>Bitácora de Control de Accesos</div>
          <div style={{ fontSize: 13, color: "#555" }}>{sitioNombre} · {rango}</div>
        </div>
      </div>

      <p style={{ fontSize: 13, margin: "10px 0" }}>
        Total: <b>{rows.length}</b> · Autorizados: <b>{dentro}</b> · Rechazados: <b>{rech}</b>
      </p>

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr style={{ background: "#1F3A5F", color: "#fff" }}>
            {["Folio", "Fecha / hora", "Mov.", "Persona / Vehículo", "Tipo", "Motivo", "Resultado"].map((h) => (
              <th key={h} style={{ textAlign: "left", padding: "5px 7px" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ background: i % 2 ? "#f2f5f8" : "#fff" }}>
              <td style={{ padding: "4px 7px" }}>{r.folio ?? "—"}</td>
              <td style={{ padding: "4px 7px" }}>{r.fecha_evento ? new Date(r.fecha_evento).toLocaleString() : "—"}</td>
              <td style={{ padding: "4px 7px" }}>{r.tipo === "salida" ? "Salida" : "Entrada"}</td>
              <td style={{ padding: "4px 7px" }}>{personaNombre(r)}</td>
              <td style={{ padding: "4px 7px" }}>{r.tipo_persona ?? "—"}</td>
              <td style={{ padding: "4px 7px" }}>{r.motivo ?? "—"}</td>
              <td style={{ padding: "4px 7px", fontWeight: 700, color: r.resultado === "rechazado" ? "#b00020" : r.resultado === "pendiente" ? "#b8860b" : "#0a7c2f" }}>{r.resultado}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={7} style={{ padding: 12, textAlign: "center", color: "#888" }}>Sin accesos en el periodo.</td></tr>}
        </tbody>
      </table>

      <p style={{ marginTop: 20, fontSize: 11, color: "#888" }}>
        Generado {new Date().toLocaleString()} · SGS — Sistema de Gestión de Seguridad
      </p>
    </div>
  );
}
