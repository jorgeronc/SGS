"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

interface Opcion { categoria: string; valor: string; orden: number; activo: boolean; }

function humanizar(cat: string): string {
  const s = cat.replace(/_/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Panel de administración de catálogos (cat_opciones): una sub-pestaña por
// categoría. Agregar opciones, activar/desactivar (sin borrar) y reordenar.
export default function CatalogosPanel() {
  const [filas, setFilas] = useState<Opcion[]>([]);
  const [activa, setActiva] = useState<string>("");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const [nuevoValor, setNuevoValor] = useState("");
  const [nvoCat, setNvoCat] = useState("");
  const [nvoCatValor, setNvoCatValor] = useState("");

  async function cargar() {
    setCargando(true);
    setError(null);
    const { data, error } = await supabase
      .from("cat_opciones")
      .select("categoria, valor, orden, activo")
      .order("categoria")
      .order("orden");
    if (error) { setError(error.message); setCargando(false); return; }
    const rows = (data as Opcion[]) ?? [];
    setFilas(rows);
    setActiva((prev) => prev || rows[0]?.categoria || "");
    setCargando(false);
  }

  useEffect(() => {
    cargar();
    supabase.rpc("rpc_registrar_bitacora", {
      p_tipo_accion: "CONSULTAR", p_entidad_tipo: "cat_opciones", p_entidad_id: null, p_modulo: "administracion",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const categorias = useMemo(
    () => Array.from(new Set(filas.map((f) => f.categoria))).sort((a, b) => a.localeCompare(b)),
    [filas],
  );
  const opcionesActiva = useMemo(
    () => filas.filter((f) => f.categoria === activa).sort((a, b) => a.orden - b.orden || a.valor.localeCompare(b.valor)),
    [filas, activa],
  );

  function flash(msg: string) { setMensaje(msg); setError(null); setTimeout(() => setMensaje(null), 2500); }

  async function agregarOpcion(e: React.FormEvent) {
    e.preventDefault();
    const valor = nuevoValor.trim();
    if (!valor || !activa) return;
    const maxOrden = opcionesActiva.reduce((m, o) => Math.max(m, o.orden), 0);
    const { error } = await supabase.from("cat_opciones").insert({ categoria: activa, valor, orden: maxOrden + 1, activo: true });
    if (error) { setError(error.message.includes("duplicate") ? `La opción "${valor}" ya existe en este catálogo.` : error.message); return; }
    setNuevoValor("");
    flash(`Opción "${valor}" agregada.`);
    cargar();
  }

  async function toggleActivo(o: Opcion) {
    const { error } = await supabase.from("cat_opciones").update({ activo: !o.activo }).eq("categoria", o.categoria).eq("valor", o.valor);
    if (error) { setError(error.message); return; }
    setFilas((prev) => prev.map((f) => (f.categoria === o.categoria && f.valor === o.valor ? { ...f, activo: !o.activo } : f)));
  }

  function editarOrdenLocal(o: Opcion, valor: string) {
    const n = Number(valor);
    setFilas((prev) => prev.map((f) => (f.categoria === o.categoria && f.valor === o.valor ? { ...f, orden: isNaN(n) ? 0 : n } : f)));
  }
  async function guardarOrden(o: Opcion) {
    const { error } = await supabase.from("cat_opciones").update({ orden: o.orden }).eq("categoria", o.categoria).eq("valor", o.valor);
    if (error) { setError(error.message); return; }
    flash(`Orden de "${o.valor}" guardado.`);
  }

  async function crearCatalogo(e: React.FormEvent) {
    e.preventDefault();
    const categoria = nvoCat.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
    const valor = nvoCatValor.trim();
    if (!categoria || !valor) { setError("Indica el nombre del catálogo y su primera opción."); return; }
    const { error } = await supabase.from("cat_opciones").insert({ categoria, valor, orden: 1, activo: true });
    if (error) { setError(error.message); return; }
    setNvoCat(""); setNvoCatValor("");
    flash(`Catálogo "${categoria}" creado.`);
    await cargar();
    setActiva(categoria);
  }

  return (
    <>
      <p style={{ fontSize: 13, color: "#555" }}>
        Catálogos de opciones que usan los formularios (los campos donde se elige una opción de una lista).
        Puedes <strong>agregar</strong> opciones, <strong>activarlas/desactivarlas</strong> y cambiar su
        <strong> orden</strong>. Solo administrador.
      </p>

      {error && <p style={{ color: "#b00020" }}>{error}</p>}
      {mensaje && <p style={{ color: "#0a7c2f" }}>{mensaje}</p>}

      {cargando ? (
        <p>Cargando...</p>
      ) : categorias.length === 0 ? (
        <p style={{ color: "#555" }}>No hay catálogos visibles. Esta pantalla requiere rol <code>administrador</code>.</p>
      ) : (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "6px 0 14px", borderBottom: "1px solid var(--sc-border, #d5dae2)", paddingBottom: 10 }}>
            {categorias.map((c) => {
              const on = c === activa;
              return (
                <button key={c} onClick={() => setActiva(c)} title={c} style={{
                  cursor: "pointer", padding: "5px 11px", borderRadius: 20, fontSize: 12.5, fontWeight: 600,
                  border: on ? "1px solid var(--sc-accent, #2E75B6)" : "1px solid var(--sc-border, #d5dae2)",
                  background: on ? "var(--sc-accent, #2E75B6)" : "var(--sc-surface, #fff)",
                  color: on ? "#fff" : "var(--sc-text, #1f2937)",
                }}>
                  {humanizar(c)}
                </button>
              );
            })}
          </div>

          <h3 style={{ marginTop: 0 }}>{humanizar(activa)} <span style={{ fontSize: 12, color: "#888", fontWeight: 400 }}>({activa})</span></h3>
          <table>
            <thead>
              <tr><th>Opción</th><th style={{ width: 90 }}>Orden</th><th style={{ width: 110 }}>Estado</th><th style={{ width: 180 }}></th></tr>
            </thead>
            <tbody>
              {opcionesActiva.map((o) => (
                <tr key={o.valor} style={{ opacity: o.activo ? 1 : 0.55 }}>
                  <td>{o.valor}</td>
                  <td><input type="number" style={{ width: 70 }} value={o.orden} onChange={(e) => editarOrdenLocal(o, e.target.value)} /></td>
                  <td><span className={o.activo ? "badge-activo" : "badge-cancelado"}>{o.activo ? "activo" : "inactivo"}</span></td>
                  <td style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => guardarOrden(o)}>Guardar orden</button>
                    <button onClick={() => toggleActivo(o)}>{o.activo ? "Desactivar" : "Activar"}</button>
                  </td>
                </tr>
              ))}
              {opcionesActiva.length === 0 && (<tr><td colSpan={4} style={{ color: "#555" }}>Este catálogo no tiene opciones.</td></tr>)}
            </tbody>
          </table>

          <form onSubmit={agregarOpcion} style={{ marginTop: 10 }}>
            <div className="form-fila">
              <input placeholder={`Nueva opción para "${humanizar(activa)}"`} value={nuevoValor} onChange={(e) => setNuevoValor(e.target.value)} style={{ minWidth: 280 }} />
              <button type="submit">Agregar opción</button>
            </div>
          </form>

          <p style={{ fontSize: 12, color: "#888", marginTop: 8 }}>
            Desactivar una opción la oculta de los formularios sin afectar los registros que ya la usan
            (por eso no se borran: se desactivan). El orden controla cómo aparecen en las listas desplegables.
          </p>

          <details style={{ marginTop: 20 }}>
            <summary style={{ cursor: "pointer", fontWeight: 600 }}>Crear un catálogo nuevo</summary>
            <p style={{ fontSize: 12, color: "#888", margin: "6px 0" }}>
              Úsalo solo si vas a preparar un catálogo que un formulario leerá por su nombre de categoría
              (por ejemplo <code>motivo_traslado</code>). El nombre se normaliza a minúsculas con guiones bajos.
            </p>
            <form onSubmit={crearCatalogo}>
              <div className="form-fila">
                <input placeholder="Nombre del catálogo (ej. motivo_traslado)" value={nvoCat} onChange={(e) => setNvoCat(e.target.value)} />
                <input placeholder="Primera opción" value={nvoCatValor} onChange={(e) => setNvoCatValor(e.target.value)} />
                <button type="submit">Crear catálogo</button>
              </div>
            </form>
          </details>
        </>
      )}
    </>
  );
}
