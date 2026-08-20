"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { primeraFoto } from "@/lib/fotos";

export interface ColumnaLM {
  header: string;
  celda: (r: any) => ReactNode;
  campo?: string;          // campo de la fila por el cual ordenar (para columnas con JSX/fechas)
  orden?: (r: any) => any; // valor alternativo para ordenar (columnas calculadas)
}
export interface FiltroLM {
  k: string;
  label: string;
  test?: (r: any) => boolean;
}
// Filtros avanzados (opcionales): controles de rango de fecha, select o texto
// que se aplican sobre un campo de la fila. Alimentan también el "Ver en mapa".
export interface FiltroAvanzadoLM {
  campo: string;
  label: string;
  tipo: "select" | "texto" | "fecha-desde" | "fecha-hasta";
  opciones?: string[];
  // Nombre del parámetro en la URL del mapa (por defecto: desde/hasta o el campo).
  param?: string;
}
export interface CampoEdit {
  campo: string;
  label: string;
  tipo?: "text" | "number" | "date" | "select" | "checkbox" | "textarea";
  opciones?: string[];
}
// Acciones en lote (opcional): habilita casillas de selección múltiple y una
// barra de acciones que se aplican a todos los registros marcados.
export interface LoteLM {
  acciones: { k: string; label: string; color?: string }[];
  onAplicar: (ids: string[], k: string) => Promise<void>;
  nombrePlural?: string;
}

function EdInput({ campo, value, onChange }: { campo: CampoEdit; value: any; onChange: (v: any) => void }) {
  const t = campo.tipo ?? "text";
  return (
    <label className="sc-edit-l">
      <span>{campo.label}</span>
      {t === "textarea" ? (
        <textarea value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
      ) : t === "select" ? (
        <select value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
          <option value="">—</option>
          {(campo.opciones ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : t === "checkbox" ? (
        <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />
      ) : (
        <input
          type={t === "date" ? "date" : t === "number" ? "number" : "text"}
          value={t === "date" ? (value ? String(value).slice(0, 10) : "") : (value ?? "")}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </label>
  );
}

// Lista maestra a 3 paneles (con el sidebar del shell): tabla con filtros +
// panel derecho de vista rápida. Reutilizable por cualquier módulo de listado.
export default function ListaMaestra({
  titulo,
  subtitulo,
  tabla,
  select,
  orderBy = "creado_en",
  modulo,
  columnas,
  textoBusqueda,
  quickView,
  detalleHref,
  filtros = [],
  placeholderBuscar = "Buscar…",
  cancelable = true,
  nuevo,
  nuevoAbierto = false,
  vacioMensaje,
  editar,
  lote,
  filtrosAvanzados,
  mapaBase,
  miniatura,
  sinToggleCancelados = false,
}: {
  titulo: string;
  subtitulo?: string;
  tabla: string;
  select: string;
  orderBy?: string;
  modulo: string;
  columnas: ColumnaLM[];
  textoBusqueda: (r: any) => string;
  quickView: (r: any) => ReactNode;
  detalleHref: (r: any) => string;
  filtros?: FiltroLM[];
  placeholderBuscar?: string;
  cancelable?: boolean;
  nuevo?: (onCreado: () => void) => ReactNode;
  nuevoAbierto?: boolean;
  vacioMensaje?: string;
  editar?: CampoEdit[];
  lote?: LoteLM;
  filtrosAvanzados?: FiltroAvanzadoLM[];
  mapaBase?: string;   // si se define, muestra "Ver en mapa" (nueva pestaña) con los filtros
  miniatura?: (r: any) => unknown;  // devuelve el arreglo `fotografias`; muestra columna de miniatura
  sinToggleCancelados?: boolean;    // oculta el checkbox "Mostrar cancelados" (cancelados siempre ocultos)
}) {
  const [filas, setFilas] = useState<any[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sel, setSel] = useState<any | null>(null);
  const [filtro, setFiltro] = useState(filtros[0]?.k ?? "todos");
  const [q, setQ] = useState("");
  const [mostrarCancelados, setMostrarCancelados] = useState(false);
  const [mostrarNuevo, setMostrarNuevo] = useState(nuevoAbierto);
  const [orden, setOrden] = useState<{ i: number; dir: "asc" | "desc" } | null>(null);
  const [limite, setLimite] = useState(50);
  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState<any>({});
  const [guardandoEd, setGuardandoEd] = useState(false);
  const [errEd, setErrEd] = useState<string | null>(null);
  const [marcados, setMarcados] = useState<string[]>([]);
  const [aplicandoLote, setAplicandoLote] = useState(false);
  const [avz, setAvz] = useState<Record<number, string>>({});

  // Al cambiar el registro seleccionado, salir del modo edición.
  useEffect(() => { setEditando(false); setErrEd(null); }, [sel?.id]);

  function iniciarEdicion() {
    if (!sel) return;
    setBorrador({ ...sel });
    setErrEd(null);
    setEditando(true);
  }

  async function guardarEdicion() {
    if (!sel || !editar) return;
    setGuardandoEd(true); setErrEd(null);
    const upd: Record<string, any> = {};
    for (const c of editar) {
      let v = borrador[c.campo];
      if (c.tipo === "number") v = v === "" || v == null ? null : Number(v);
      else if (c.tipo === "checkbox") v = !!v;
      else if (v === "") v = null;
      upd[c.campo] = v;
    }
    upd.actualizado_en = new Date().toISOString();
    const { error } = await supabase.from(tabla).update(upd).eq("id", sel.id);
    setGuardandoEd(false);
    if (error) { setErrEd(error.message); return; }
    setEditando(false);
    cargar();
  }

  async function cargar() {
    setCargando(true);
    // Se asegura de traer `estatus` (para poder ocultar cancelados). Si la tabla
    // no tiene esa columna, se reintenta con el select original.
    const tieneEstatus = /(^|,)\s*estatus\s*(,|$)/.test(select);
    const selConEstatus = tieneEstatus ? select : `${select}, estatus`;
    let { data, error } = await supabase.from(tabla).select(selConEstatus).order(orderBy, { ascending: false });
    if (error && !tieneEstatus && /estatus/i.test(error.message)) {
      ({ data, error } = await supabase.from(tabla).select(select).order(orderBy, { ascending: false }));
    }
    if (error) {
      setError(error.message);
    } else {
      const f = (data as any[]) ?? [];
      setFilas(f);
      setSel((prev: any) => f.find((x) => x.id === prev?.id) ?? f[0] ?? null);
      await supabase.rpc("rpc_registrar_bitacora", {
        p_tipo_accion: "CONSULTAR",
        p_entidad_tipo: tabla,
        p_entidad_id: null,
        p_modulo: modulo,
      });
    }
    setCargando(false);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtrados = useMemo(() => {
    const t = q.trim().toLowerCase();
    const fdef = filtros.find((x) => x.k === filtro);
    const fav = filtrosAvanzados ?? [];
    return filas.filter((r) => {
      // Por defecto se ocultan los cancelados; el checkbox los muestra.
      if (!mostrarCancelados && r.estatus === "cancelado") return false;
      if (fdef?.test && !fdef.test(r)) return false;
      if (t && !textoBusqueda(r).toLowerCase().includes(t)) return false;
      for (let i = 0; i < fav.length; i++) {
        const v = (avz[i] ?? "").trim();
        if (!v) continue;
        const f = fav[i];
        const cell = r[f.campo];
        if (f.tipo === "select") { if (String(cell ?? "") !== v) return false; }
        else if (f.tipo === "texto") { if (!String(cell ?? "").toLowerCase().includes(v.toLowerCase())) return false; }
        else if (f.tipo === "fecha-desde") { if (!cell || String(cell).slice(0, 10) < v) return false; }
        else if (f.tipo === "fecha-hasta") { if (!cell || String(cell).slice(0, 10) > v) return false; }
      }
      return true;
    });
  }, [filas, filtro, q, filtros, textoBusqueda, filtrosAvanzados, avz, mostrarCancelados]);

  // URL del mapa (nueva pestaña) con los filtros avanzados aplicados.
  function mapaHref(): string {
    const p = new URLSearchParams();
    (filtrosAvanzados ?? []).forEach((f, i) => {
      const v = (avz[i] ?? "").trim();
      if (!v) return;
      const name = f.param ?? (f.tipo === "fecha-desde" ? "desde" : f.tipo === "fecha-hasta" ? "hasta" : f.campo);
      p.set(name, v);
    });
    const qs = p.toString();
    return qs ? `${mapaBase}?${qs}` : (mapaBase ?? "#");
  }

  // Valor ordenable de una columna: explícito (orden/campo) o el texto/número de la celda.
  function valorOrden(col: ColumnaLM, r: any): any {
    if (col.orden) return col.orden(r);
    if (col.campo) return r[col.campo];
    const v = col.celda(r);
    return typeof v === "string" || typeof v === "number" ? v : null;
  }
  function esOrdenable(col: ColumnaLM): boolean {
    if (col.campo || col.orden) return true;
    const primer = filas[0];
    if (!primer) return false;
    const v = col.celda(primer);
    return typeof v === "string" || typeof v === "number";
  }

  const ordenados = useMemo(() => {
    if (!orden) return filtrados;
    const col = columnas[orden.i];
    if (!col) return filtrados;
    const arr = [...filtrados].sort((a, b) => {
      const va = valorOrden(col, a), vb = valorOrden(col, b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === "number" && typeof vb === "number") return va - vb;
      return String(va).localeCompare(String(vb), "es", { numeric: true, sensitivity: "base" });
    });
    if (orden.dir === "desc") arr.reverse();
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtrados, orden, columnas]);

  const visibles = ordenados.slice(0, limite);

  // Selección múltiple (sólo si el módulo habilitó acciones en lote).
  const idsVisibles = visibles.map((r) => r.id as string);
  const todosMarcados = idsVisibles.length > 0 && idsVisibles.every((id) => marcados.includes(id));
  function toggleMarcado(id: string) {
    setMarcados((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]));
  }
  function toggleTodos() {
    setMarcados(todosMarcados ? [] : idsVisibles);
  }
  async function aplicarLote(k: string) {
    if (!lote || marcados.length === 0) return;
    setAplicandoLote(true);
    setError(null);
    try {
      await lote.onAplicar(marcados, k);
      setMarcados([]);
      await cargar();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setAplicandoLote(false);
    }
  }

  function clickHeader(i: number) {
    if (!esOrdenable(columnas[i])) return;
    setOrden((o) => (o?.i === i ? { i, dir: o.dir === "asc" ? "desc" : "asc" } : { i, dir: "asc" }));
  }

  async function cancelar(id: string) {
    const motivo = window.prompt("Motivo de la cancelación:");
    if (motivo === null) return;
    const { error } = await supabase.rpc("rpc_cancelar_registro", { p_tabla: tabla, p_id: id, p_motivo: motivo });
    if (error) {
      setError(error.message);
      return;
    }
    cargar();
  }

  return (
    <div className="contenedor">
      <h1 className="dash-h1">{titulo}</h1>
      <p className="dash-sub">{subtitulo ?? `${filas.length} registros`}</p>

      <div className="sc-toolbar">
        <div className="sc-search">
          <span className="mag">⌕</span>
          <input placeholder={placeholderBuscar} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {filtros.map((f) => (
          <span key={f.k} className={`sc-chip${filtro === f.k ? " on" : ""}`} onClick={() => setFiltro(f.k)}>
            {f.label}
          </span>
        ))}
        {!sinToggleCancelados && (
          <label className="sc-mostrar-cancelados">
            <input type="checkbox" checked={mostrarCancelados} onChange={(e) => setMostrarCancelados(e.target.checked)} />
            Mostrar cancelados
          </label>
        )}
        {nuevo && (
          <span className="sc-chip nuevo" onClick={() => setMostrarNuevo((v) => !v)}>
            {mostrarNuevo ? "Cerrar" : "+ Nuevo"}
          </span>
        )}
      </div>

      {mostrarNuevo && nuevo && (
        <div className="sc-nuevo">
          {nuevo(() => {
            setMostrarNuevo(false);
            cargar();
          })}
        </div>
      )}

      {(filtrosAvanzados?.length || mapaBase) && (
        <div className="cad-toolbar">
          {filtrosAvanzados?.length ? (
            <fieldset className="cad-filtros-box">
              <legend>Filtros</legend>
              <div className="cad-filtros-row">
                {filtrosAvanzados.map((f, i) => (
                  <label key={i} className="lm-favz">
                    <span>{f.label}</span>
                    {f.tipo === "select" ? (
                      <select value={avz[i] ?? ""} onChange={(e) => setAvz((a) => ({ ...a, [i]: e.target.value }))}>
                        <option value="">Todos</option>
                        {(f.opciones ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : f.tipo === "texto" ? (
                      <input value={avz[i] ?? ""} onChange={(e) => setAvz((a) => ({ ...a, [i]: e.target.value }))} />
                    ) : (
                      <input type="date" value={avz[i] ?? ""} onChange={(e) => setAvz((a) => ({ ...a, [i]: e.target.value }))} />
                    )}
                  </label>
                ))}
                {Object.values(avz).some(Boolean) && (
                  <button type="button" className="lm-favz-clear" onClick={() => setAvz({})}>Limpiar</button>
                )}
              </div>
            </fieldset>
          ) : null}
          {mapaBase && (
            <a className="cad-mapbtn" href={mapaHref()} target="_blank" rel="noopener noreferrer">🗺️ Ver en mapa ↗</a>
          )}
        </div>
      )}

      {error && <p style={{ color: "#b00020" }}>{error}</p>}

      <div className="sc-listbar">
        <span className="dash-sub">
          Mostrando {Math.min(limite, ordenados.length)} de {filtrados.length}
          {filas.length !== filtrados.length ? ` (${filas.length} en total)` : ""}
        </span>
        <label className="sc-limite">
          Máx.
          <input
            type="number"
            min={1}
            value={limite}
            onChange={(e) => setLimite(Math.max(1, Number(e.target.value) || 1))}
          />
          registros
        </label>
      </div>

      {lote && marcados.length > 0 && (
        <div className="sc-lote">
          <b>{marcados.length}</b>
          <span>{lote.nombrePlural ?? "registros"} seleccionados →</span>
          {lote.acciones.map((a) => (
            <button
              key={a.k}
              className="sc-lote-btn"
              style={a.color ? { background: a.color, borderColor: a.color, color: "#fff" } : undefined}
              disabled={aplicandoLote}
              onClick={() => aplicarLote(a.k)}
            >
              {a.label}
            </button>
          ))}
          <button className="sc-lote-limpiar" onClick={() => setMarcados([])} disabled={aplicandoLote}>
            Limpiar
          </button>
          {aplicandoLote && <span className="dash-sub">aplicando…</span>}
        </div>
      )}

      <div className="sc-split">
        <table className="sc-table">
          <thead>
            <tr>
              {lote && (
                <th style={{ width: 34 }} onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" checked={todosMarcados} onChange={toggleTodos} title="Seleccionar todos los visibles" />
                </th>
              )}
              {miniatura && <th style={{ width: 48 }}></th>}
              {columnas.map((c, i) => {
                const ord = esOrdenable(c);
                return (
                  <th
                    key={i}
                    onClick={() => clickHeader(i)}
                    className={ord ? "sortable" : ""}
                    style={{ cursor: ord ? "pointer" : "default", userSelect: "none" }}
                  >
                    {c.header}
                    {ord && <span className="sc-sort">{orden?.i === i ? (orden.dir === "asc" ? " ▲" : " ▼") : " ⇅"}</span>}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visibles.map((r) => (
              <tr key={r.id} className={sel?.id === r.id ? "sel" : ""} onClick={() => setSel(r)}>
                {lote && (
                  <td onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={marcados.includes(r.id)} onChange={() => toggleMarcado(r.id)} />
                  </td>
                )}
                {miniatura && (
                  <td>
                    {primeraFoto(miniatura(r))
                      ? <img src={primeraFoto(miniatura(r))!} alt="" className="sc-foto-mini" />
                      : <span className="sc-foto-mini vacio" />}
                  </td>
                )}
                {columnas.map((c, i) => (
                  <td key={i}>
                    {c.campo === "folio"
                      ? <Link href={detalleHref(r)} className="lm-folio-link" onClick={(e) => e.stopPropagation()}>{c.celda(r)}</Link>
                      : c.celda(r)}
                  </td>
                ))}
              </tr>
            ))}
            {!cargando && filtrados.length === 0 && (
              <tr>
                <td colSpan={columnas.length + (lote ? 1 : 0) + (miniatura ? 1 : 0)} style={{ color: "#555" }}>
                  {vacioMensaje ?? "Sin registros que coincidan."}
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {sel && (
          <aside className="sc-qv">
            <div className="sc-qv-body">
              {primeraFoto(sel.fotografias) && (
                <img src={primeraFoto(sel.fotografias)!} alt="Fotografía" className="sc-qv-foto" />
              )}
              {editando && editar ? (
                <div className="sc-edit">
                  {editar.map((c) => (
                    <EdInput key={c.campo} campo={c} value={borrador[c.campo]} onChange={(v) => setBorrador((p: any) => ({ ...p, [c.campo]: v }))} />
                  ))}
                  {errEd && <p style={{ color: "#b00020", fontSize: 12 }}>{errEd}</p>}
                </div>
              ) : (
                quickView(sel)
              )}
            </div>
            <div className="sc-qv-actions">
              {editando ? (
                <>
                  <button className="qbtn2 primary" style={{ flex: 1 }} disabled={guardandoEd} onClick={guardarEdicion}>
                    {guardandoEd ? "Guardando…" : "Guardar cambios"}
                  </button>
                  <button className="qbtn2" onClick={() => setEditando(false)}>Cancelar</button>
                </>
              ) : (
                <>
                  <Link href={detalleHref(sel)} className="qbtn2 primary" style={{ flex: 1, textAlign: "center" }}>
                    Abrir
                  </Link>
                  {editar && sel.estatus === "activo" && (
                    <button className="qbtn2" onClick={iniciarEdicion}>Editar</button>
                  )}
                  {cancelable && sel.estatus === "activo" && (
                    <button className="qbtn2" onClick={() => cancelar(sel.id)}>Cancelar</button>
                  )}
                </>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
