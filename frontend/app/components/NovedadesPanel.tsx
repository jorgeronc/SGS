"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { Novedad } from "@/lib/types";

// Novedades de un incidente: registro append-only (no se edita ni se borra).
// Lo usan tanto la web como la app móvil del policía.
export default function NovedadesPanel({ incidenteId }: { incidenteId: string }) {
  const [novedades, setNovedades] = useState<Novedad[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [reportadoPor, setReportadoPor] = useState("");
  const [guardando, setGuardando] = useState(false);

  async function cargar() {
    const { data, error } = await supabase
      .from("novedades")
      .select("*")
      .eq("incidente_id", incidenteId)
      .order("fecha", { ascending: true });
    if (error) {
      setError(error.message);
      return;
    }
    setNovedades(data as Novedad[]);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incidenteId]);

  async function agregar(e: React.FormEvent) {
    e.preventDefault();
    if (!texto.trim()) return;
    setGuardando(true);
    setError(null);
    const { error } = await supabase.from("novedades").insert({
      incidente_id: incidenteId,
      texto,
      reportado_por: reportadoPor || null,
    });
    setGuardando(false);
    if (error) {
      setError(error.message);
      return;
    }
    setTexto("");
    cargar();
  }

  return (
    <>
      <h3>Novedades</h3>
      <p style={{ fontSize: 12, color: "#888" }}>
        Registro inmutable (append-only) de las novedades reportadas.
      </p>

      <table>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Novedad</th>
            <th>Reporta</th>
          </tr>
        </thead>
        <tbody>
          {novedades.map((n) => (
            <tr key={n.id}>
              <td>{new Date(n.fecha).toLocaleString()}</td>
              <td>{n.texto}</td>
              <td>{n.reportado_por ?? "—"}</td>
            </tr>
          ))}
          {novedades.length === 0 && (
            <tr>
              <td colSpan={3} style={{ color: "#555" }}>
                Sin novedades todavía.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <form onSubmit={agregar}>
        <div className="form-fila">
          <input
            placeholder="Nueva novedad"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            style={{ flex: 1, minWidth: 220 }}
          />
          <input
            placeholder="Reporta (opcional)"
            value={reportadoPor}
            onChange={(e) => setReportadoPor(e.target.value)}
          />
          <button type="submit" disabled={guardando}>
            {guardando ? "Guardando..." : "Agregar novedad"}
          </button>
        </div>
      </form>

      {error && <p style={{ color: "#b00020" }}>{error}</p>}
    </>
  );
}
