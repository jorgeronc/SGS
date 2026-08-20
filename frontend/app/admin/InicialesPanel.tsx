"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { Foliador } from "@/lib/types";

// Panel de iniciales por módulo (parte del foliador). Solo administrador.
export default function InicialesPanel() {
  const [foliadores, setFoliadores] = useState<Foliador[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  async function cargar() {
    setCargando(true);
    setError(null);
    const { data, error } = await supabase.from("foliadores").select("*").order("modulo");
    if (error) setError(error.message);
    else setFoliadores(data as Foliador[]);
    setCargando(false);
  }

  useEffect(() => { cargar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  function editarIniciales(modulo: string, valor: string) {
    setFoliadores((prev) => prev.map((f) => (f.modulo === modulo ? { ...f, iniciales: valor.toUpperCase().slice(0, 2) } : f)));
  }

  async function guardar(f: Foliador) {
    setError(null); setMensaje(null);
    if (f.iniciales.length !== 2) { setError("Las iniciales deben ser exactamente 2 letras."); return; }
    const { error } = await supabase.from("foliadores").update({ iniciales: f.iniciales, activo: f.activo }).eq("modulo", f.modulo);
    if (error) { setError(error.message); return; }
    setMensaje(`Foliador de "${f.nombre}" actualizado.`);
    cargar();
  }

  return (
    <>
      <p style={{ fontSize: 13, color: "#555" }}>
        El folio se forma con <strong>AAAA</strong> (año) + <strong>II</strong> (iniciales del módulo) +
        <strong> NNNNNN</strong> (consecutivo de 6 dígitos). Solo administrador.
      </p>
      {error && <p style={{ color: "#b00020" }}>{error}</p>}
      {mensaje && <p style={{ color: "#0a7c2f" }}>{mensaje}</p>}
      {cargando ? (
        <p>Cargando...</p>
      ) : foliadores.length === 0 ? (
        <p style={{ color: "#555" }}>No hay foliadores visibles. Esta pantalla requiere rol <code>administrador</code>.</p>
      ) : (
        <table>
          <thead>
            <tr><th>Módulo</th><th>Iniciales</th><th>Ejemplo de folio</th><th></th></tr>
          </thead>
          <tbody>
            {foliadores.map((f) => (
              <tr key={f.modulo}>
                <td>{f.nombre}</td>
                <td><input style={{ width: 60, textTransform: "uppercase" }} value={f.iniciales} maxLength={2} onChange={(e) => editarIniciales(f.modulo, e.target.value)} /></td>
                <td>{new Date().getFullYear()}{f.iniciales}000001</td>
                <td><button onClick={() => guardar(f)}>Guardar</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
