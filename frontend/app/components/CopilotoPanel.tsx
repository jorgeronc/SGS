"use client";

import { useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

interface Fuente {
  fuente_tabla: string;
  fuente_id: string;
  folio: string | null;
  titulo: string | null;
  similitud: number;
  href: string | null;
}
interface Turno {
  pregunta: string;
  respuesta: string;
  nivel: string;
  folios: string[];
  fuentes: Fuente[];
}

const NIVEL: Record<string, { label: string; bg: string }> = {
  alta: { label: "Confianza alta", bg: "#2e7d32" },
  media: { label: "Confianza media", bg: "#f9a825" },
  baja: { label: "Confianza baja", bg: "#e65100" },
  sin_evidencia: { label: "Sin evidencia suficiente", bg: "#616161" },
};

// Copiloto de investigación (RAG): responde citando folios verificables y se
// abstiene cuando no hay evidencia. Toda respuesta lleva sus fuentes enlazadas.
export default function CopilotoPanel({ contextoTipo, contextoId }: { contextoTipo?: string; contextoId?: string }) {
  const [pregunta, setPregunta] = useState("");
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function preguntar(e: React.FormEvent) {
    e.preventDefault();
    const q = pregunta.trim();
    if (!q || cargando) return;
    setError(null);
    setCargando(true);
    const { data, error } = await supabase.functions.invoke("copiloto", {
      body: { pregunta: q, contexto_tipo: contextoTipo ?? null, contexto_id: contextoId ?? null },
    });
    setCargando(false);
    if (error || (data as any)?.error) {
      // supabase-js oculta el cuerpo del 500 tras un mensaje genérico; lo leemos
      // del Response para mostrar el error real de la función (ej. Anthropic: ...).
      let msg = (data as any)?.error ?? error?.message ?? "No se pudo consultar el copiloto.";
      try {
        const ctx = (error as any)?.context;
        if (ctx && typeof ctx.json === "function") {
          const body = await ctx.json();
          if (body?.error) msg = body.error;
        }
      } catch { /* se conserva el mensaje anterior */ }
      setError(msg);
      return;
    }
    const d = data as any;
    setTurnos((t) => [...t, { pregunta: q, respuesta: d.respuesta, nivel: d.nivel_confianza, folios: d.folios_citados ?? [], fuentes: d.fuentes ?? [] }]);
    setPregunta("");
  }

  return (
    <div className="copiloto">
      <p className="dash-sub">
        Pregunta en lenguaje natural. El copiloto responde <b>sólo con lo registrado en el sistema</b>, cita el folio de cada fuente y se abstiene si no hay evidencia. Verifica siempre en el expediente original.
      </p>

      <div className="copiloto-hist">
        {turnos.map((t, i) => {
          const n = NIVEL[t.nivel] ?? NIVEL.media;
          return (
            <div key={i} className="copiloto-turno">
              <div className="copiloto-q">🔎 {t.pregunta}</div>
              <div className="copiloto-a">
                <span className="copiloto-nivel" style={{ background: n.bg }}>{n.label}</span>
                <p style={{ whiteSpace: "pre-wrap", margin: "6px 0" }}>{t.respuesta}</p>
                {t.fuentes.length > 0 && (
                  <div className="copiloto-fuentes">
                    <span className="dash-sub">Fuentes:</span>
                    {t.fuentes.map((f, j) => {
                      const etq = `${f.folio ?? f.titulo ?? f.fuente_tabla}`;
                      const citada = t.folios.some((c) => f.folio && c.includes(f.folio));
                      return f.href ? (
                        <Link key={j} href={f.href} className={`copiloto-cita${citada ? " on" : ""}`}>{etq}</Link>
                      ) : (
                        <span key={j} className={`copiloto-cita${citada ? " on" : ""}`}>{etq}</span>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {cargando && <div className="copiloto-turno"><div className="dash-sub">Consultando expedientes y redactando…</div></div>}
      </div>

      <form onSubmit={preguntar} className="copiloto-form">
        <input
          placeholder="Ej. ¿Qué antecedentes hay del vehículo con placas ABC-123?"
          value={pregunta}
          onChange={(e) => setPregunta(e.target.value)}
        />
        <button type="submit" disabled={cargando || !pregunta.trim()}>{cargando ? "…" : "Preguntar"}</button>
      </form>
      {error && <p style={{ color: "#b00020" }}>{error}</p>}
    </div>
  );
}
