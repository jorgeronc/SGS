"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { CadenaCustodia, TipoEventoCustodia } from "@/lib/types";

const TIPOS: TipoEventoCustodia[] = [
  "recoleccion",
  "traslado",
  "resguardo",
  "analisis",
  "entrega",
  "devolucion",
  "destruccion",
];

// Panel de cadena de custodia: registro append-only de los movimientos de
// una evidencia. Solo permite AGREGAR eventos (la tabla es inmutable a nivel
// de base de datos: no se puede editar ni borrar un evento ya registrado).
export default function CadenaCustodiaPanel({ evidenciaId }: { evidenciaId: string }) {
  const [eventos, setEventos] = useState<CadenaCustodia[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const [tipoEvento, setTipoEvento] = useState<TipoEventoCustodia>("traslado");
  const [responsable, setResponsable] = useState("");
  const [ubicacion, setUbicacion] = useState("");
  const [notas, setNotas] = useState("");
  // Responsable por defecto = usuario que está usando el sistema (quien registra).
  const [usuarioActual, setUsuarioActual] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const u = data.user;
      const nombre = (u?.user_metadata?.nombre as string) || u?.email || "";
      setUsuarioActual(nombre);
      setResponsable((prev) => prev || nombre);
    });
  }, []);

  async function cargarEventos() {
    const { data, error } = await supabase
      .from("cadena_custodia")
      .select("*")
      .eq("evidencia_id", evidenciaId)
      .order("fecha_evento", { ascending: true });

    if (error) {
      setError(error.message);
      return;
    }
    setEventos(data as CadenaCustodia[]);
  }

  useEffect(() => {
    cargarEventos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evidenciaId]);

  async function registrarEvento(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setGuardando(true);

    const { error } = await supabase.from("cadena_custodia").insert({
      evidencia_id: evidenciaId,
      tipo_evento: tipoEvento,
      responsable: responsable || null,
      ubicacion: ubicacion || null,
      notas: notas || null,
    });

    setGuardando(false);
    if (error) {
      setError(error.message);
      return;
    }

    setResponsable(usuarioActual);
    setUbicacion("");
    setNotas("");
    cargarEventos();
  }

  return (
    <>
      <h3>Cadena de custodia</h3>
      <p style={{ fontSize: 12, color: "#888" }}>
        Registro inmutable (append-only): los eventos no se pueden editar ni borrar una vez
        guardados.
      </p>

      <table>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Evento</th>
            <th>Responsable</th>
            <th>Ubicación</th>
            <th>Notas</th>
          </tr>
        </thead>
        <tbody>
          {eventos.map((ev) => (
            <tr key={ev.id}>
              <td>{new Date(ev.fecha_evento).toLocaleString()}</td>
              <td>{ev.tipo_evento}</td>
              <td>{ev.responsable ?? "—"}</td>
              <td>{ev.ubicacion ?? "—"}</td>
              <td>{ev.notas ?? "—"}</td>
            </tr>
          ))}
          {eventos.length === 0 && (
            <tr>
              <td colSpan={5} style={{ color: "#555" }}>
                Sin eventos de custodia todavía.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <h4>Registrar evento</h4>
      <form onSubmit={registrarEvento}>
        <div className="form-fila">
          <select
            value={tipoEvento}
            onChange={(e) => setTipoEvento(e.target.value as TipoEventoCustodia)}
          >
            {TIPOS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <input
            placeholder="Responsable"
            value={responsable}
            onChange={(e) => setResponsable(e.target.value)}
          />
          <input
            placeholder="Ubicación"
            value={ubicacion}
            onChange={(e) => setUbicacion(e.target.value)}
          />
          <input placeholder="Notas" value={notas} onChange={(e) => setNotas(e.target.value)} />
          <button type="submit" disabled={guardando}>
            {guardando ? "Guardando..." : "Registrar"}
          </button>
        </div>
      </form>

      {error && <p style={{ color: "#b00020" }}>{error}</p>}
    </>
  );
}
