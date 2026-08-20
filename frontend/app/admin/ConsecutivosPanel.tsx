"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { FolioConsecutivo } from "@/lib/types";

// Panel de consecutivos por año (ajuste del próximo folio). Solo administrador.
export default function ConsecutivosPanel() {
  const [consecutivos, setConsecutivos] = useState<FolioConsecutivo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  async function cargar() {
    setCargando(true);
    setError(null);
    const { data, error } = await supabase.from("folios_consecutivos").select("*").order("anio", { ascending: false });
    if (error) setError(error.message);
    else setConsecutivos(data as FolioConsecutivo[]);
    setCargando(false);
  }

  useEffect(() => { cargar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  function editar(modulo: string, anio: number, valor: string) {
    const n = Number(valor);
    setConsecutivos((prev) => prev.map((c) => (c.modulo === modulo && c.anio === anio ? { ...c, ultimo: isNaN(n) ? 0 : n } : c)));
  }

  async function guardar(c: FolioConsecutivo) {
    setError(null); setMensaje(null);
    const { error } = await supabase.from("folios_consecutivos").update({ ultimo: c.ultimo }).eq("modulo", c.modulo).eq("anio", c.anio);
    if (error) { setError(error.message); return; }
    setMensaje(`Consecutivo de ${c.modulo} (${c.anio}) ajustado a ${c.ultimo}.`);
    cargar();
  }

  return (
    <>
      <p style={{ fontSize: 13, color: "#555" }}>
        Ajustar el consecutivo cambia el número del <em>próximo</em> folio (el siguiente será este valor + 1).
        El consecutivo se reinicia cada año. Úsalo con cuidado. Solo administrador.
      </p>
      {error && <p style={{ color: "#b00020" }}>{error}</p>}
      {mensaje && <p style={{ color: "#0a7c2f" }}>{mensaje}</p>}
      {cargando ? (
        <p>Cargando...</p>
      ) : consecutivos.length === 0 ? (
        <p style={{ color: "#555" }}>Aún no se ha generado ningún folio.</p>
      ) : (
        <table>
          <thead>
            <tr><th>Módulo</th><th>Año</th><th>Último consecutivo</th><th></th></tr>
          </thead>
          <tbody>
            {consecutivos.map((c) => (
              <tr key={`${c.modulo}-${c.anio}`}>
                <td>{c.modulo}</td>
                <td>{c.anio}</td>
                <td><input type="number" style={{ width: 90 }} value={c.ultimo} onChange={(e) => editar(c.modulo, c.anio, e.target.value)} /></td>
                <td><button onClick={() => guardar(c)}>Ajustar</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
