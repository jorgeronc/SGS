"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

interface Narrativa {
  id: number;
  texto: string;
  usuario_email: string | null;
  creado_en: string;
}

// Narrativas de una llamada/incidente del CAD: el oficial registra lo que
// reporta y cada narrativa queda con su fecha, hora y usuario (append-only).
export default function NarrativasCadPanel({ llamadaId }: { llamadaId: string }) {
  const [items, setItems] = useState<Narrativa[]>([]);
  const [texto, setTexto] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cargar() {
    const { data } = await supabase
      .from("narrativas_cad")
      .select("id, texto, usuario_email, creado_en")
      .eq("llamada_id", llamadaId)
      .order("creado_en", { ascending: false });
    setItems((data as Narrativa[]) ?? []);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [llamadaId]);

  async function registrar() {
    if (!texto.trim()) return;
    setGuardando(true); setError(null);
    const { error } = await supabase.rpc("rpc_registrar_narrativa_cad", { p_llamada: llamadaId, p_texto: texto.trim() });
    setGuardando(false);
    if (error) { setError(error.message); return; }
    setTexto("");
    cargar();
  }

  return (
    <div style={{ marginTop: 14 }}>
      <h3>Narrativas</h3>
      <p className="dash-sub">Lo que reporta el oficial que atiende el incidente. Cada narrativa queda con fecha, hora y usuario.</p>
      <textarea
        style={{ width: "100%", minHeight: 70 }}
        placeholder="Escribe la narrativa del oficial…"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
      />
      <div style={{ marginTop: 6 }}>
        <button onClick={registrar} disabled={guardando || !texto.trim()}>{guardando ? "Registrando…" : "Registrar"}</button>
        {error && <span style={{ color: "#b00020", marginLeft: 12 }}>{error}</span>}
      </div>

      {items.length > 0 ? (
        <table className="sc-table" style={{ marginTop: 12 }}>
          <thead><tr><th>Narrativa</th><th>Fecha</th><th>Hora</th><th>Usuario</th></tr></thead>
          <tbody>
            {items.map((n) => {
              const d = new Date(n.creado_en);
              return (
                <tr key={n.id}>
                  <td style={{ whiteSpace: "pre-wrap" }}>{n.texto}</td>
                  <td>{d.toLocaleDateString()}</td>
                  <td>{d.toLocaleTimeString()}</td>
                  <td>{n.usuario_email ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : <p className="dash-sub" style={{ marginTop: 10 }}>Aún no hay narrativas.</p>}
    </div>
  );
}
