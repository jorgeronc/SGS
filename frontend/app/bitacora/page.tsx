"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { BitacoraEntry } from "@/lib/types";

type OrdenCampo = "fecha" | "usuario" | "accion" | "entidad" | "modulo" | "ip" | "disp";
const COLS: { k: OrdenCampo; label: string }[] = [
  { k: "fecha", label: "Fecha" }, { k: "usuario", label: "Usuario" }, { k: "accion", label: "Acción" },
  { k: "entidad", label: "Entidad" }, { k: "modulo", label: "Módulo" }, { k: "ip", label: "IP" }, { k: "disp", label: "Dispositivo" },
];

const ACCIONES = [
  "INSERT",
  "UPDATE",
  "CANCELAR",
  "CONSULTAR",
  "EXPORTAR",
  "IMPRIMIR",
  "LOGIN",
  "LOGOUT",
];

function jsonFull(v: unknown): string {
  if (v == null) return "";
  try { return JSON.stringify(v, null, 2); } catch { return String(v); }
}

export default function BitacoraPage() {
  const [entradas, setEntradas] = useState<BitacoraEntry[]>([]);
  const [usuarios, setUsuarios] = useState<Record<string, string>>({});
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [miRol, setMiRol] = useState("");
  const esAdmin = miRol === "administrador";

  const [tipoAccion, setTipoAccion] = useState("");
  const [modulo, setModulo] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [usuarioF, setUsuarioF] = useState("");
  const [limite, setLimite] = useState(100);
  const [orden, setOrden] = useState<{ campo: OrdenCampo; dir: "asc" | "desc" }>({ campo: "fecha", dir: "desc" });

  async function cargarUsuarios() {
    // Como administrador se pueden leer todos los perfiles; se mapea id -> nombre.
    const { data } = await supabase.from("usuarios_perfil").select("id, nombre, rol");
    const mapa: Record<string, string> = {};
    const rolPorId: Record<string, string> = {};
    ((data as any[]) ?? []).forEach((u) => {
      mapa[u.id] = u.nombre ? `${u.nombre} (${u.rol})` : u.rol;
      rolPorId[u.id] = u.rol;
    });
    setUsuarios(mapa);
    const { data: au } = await supabase.auth.getUser();
    if (au?.user) setMiRol(rolPorId[au.user.id] ?? "");
  }

  // Descarga CSV/Excel de lo cargado (solo administrador). Registra EXPORTAR.
  async function exportarCSV() {
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const cab = ["Fecha", "Usuario", "Acción", "Entidad", "Entidad ID", "Módulo", "IP", "Dispositivo", "Antes", "Después"];
    const filas = visibles.map((e) => [
      new Date(e.creado_en).toLocaleString(), usuario(e.usuario_id), e.tipo_accion, e.entidad_tipo,
      e.entidad_id ?? "", e.modulo ?? "", e.ip_address ?? "", e.computadora_id ?? "",
      jsonFull(e.valores_anteriores), jsonFull(e.valores_nuevos),
    ]);
    const csv = [cab, ...filas].map((r) => r.map(esc).join(",")).join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `bitacora-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
    await supabase.rpc("rpc_registrar_bitacora", { p_tipo_accion: "EXPORTAR", p_entidad_tipo: "bitacora", p_entidad_id: null, p_modulo: "bitacora" });
  }

  async function cargarBitacora() {
    setCargando(true);
    setError(null);

    let q = supabase
      .from("bitacora")
      .select("*")
      .order("creado_en", { ascending: false })
      .limit(limite);

    if (tipoAccion) q = q.eq("tipo_accion", tipoAccion);
    if (modulo) q = q.ilike("modulo", `%${modulo}%`);
    if (desde) q = q.gte("creado_en", new Date(desde + "T00:00:00").toISOString());
    if (hasta) q = q.lte("creado_en", new Date(hasta + "T23:59:59").toISOString());

    const { data, error } = await q;

    if (error) {
      setError(error.message);
    } else {
      setEntradas(data as BitacoraEntry[]);
    }
    setCargando(false);
  }

  useEffect(() => {
    cargarUsuarios();
    cargarBitacora();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function usuario(id: string | null): string {
    if (!id) return "sistema";
    return usuarios[id] ?? id.slice(0, 8) + "…";
  }

  // Filtro de usuario (texto) + ordenamiento por columna, del lado del cliente.
  const visibles = useMemo(() => {
    const uf = usuarioF.trim().toLowerCase();
    let arr = uf ? entradas.filter((e) => usuario(e.usuario_id).toLowerCase().includes(uf)) : entradas;
    const val = (e: BitacoraEntry, c: OrdenCampo): string => {
      switch (c) {
        case "fecha": return e.creado_en ?? "";
        case "usuario": return usuario(e.usuario_id);
        case "accion": return e.tipo_accion ?? "";
        case "entidad": return e.entidad_tipo ?? "";
        case "modulo": return e.modulo ?? "";
        case "ip": return (e.ip_address as any) ?? "";
        case "disp": return (e.computadora_id as any) ?? "";
      }
    };
    const s = [...arr].sort((a, b) => val(a, orden.campo).localeCompare(val(b, orden.campo), "es", { numeric: true, sensitivity: "base" }));
    if (orden.dir === "desc") s.reverse();
    return s;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entradas, usuarioF, orden, usuarios]);

  function clickH(c: OrdenCampo) {
    setOrden((o) => (o.campo === c ? { campo: c, dir: o.dir === "asc" ? "desc" : "asc" } : { campo: c, dir: "asc" }));
  }

  return (
    <main className="contenedor">
      <h2>Bitácora de auditoría</h2>
      <p style={{ fontSize: 13, color: "#555" }}>
        Registro inmutable de todas las acciones del sistema (altas, cambios, cancelaciones y
        consultas). Solo visible para supervisor/administrador.
      </p>

      <div className="form-fila" style={{ alignItems: "center", gap: 12, flexWrap: "wrap", margin: "6px 0 4px" }}>
        <span style={{ flex: 1 }} />
        {esAdmin ? (
          <button type="button" className="qbtn2 primary" onClick={exportarCSV} disabled={visibles.length === 0}>⬇️ Descargar CSV / Excel</button>
        ) : (
          <span className="dash-sub" style={{ fontSize: 12 }}>Solo el administrador puede descargar.</span>
        )}
      </div>

      <div className="form-fila" style={{ flexWrap: "wrap", alignItems: "flex-end", gap: 10 }}>
        <label className="dash-sub" style={{ display: "flex", flexDirection: "column", gap: 2 }}>Desde
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </label>
        <label className="dash-sub" style={{ display: "flex", flexDirection: "column", gap: 2 }}>Hasta
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </label>
        <label className="dash-sub" style={{ display: "flex", flexDirection: "column", gap: 2 }}>Acción
          <select value={tipoAccion} onChange={(e) => setTipoAccion(e.target.value)}>
            <option value="">(todas)</option>
            {ACCIONES.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        <label className="dash-sub" style={{ display: "flex", flexDirection: "column", gap: 2 }}>Módulo
          <input placeholder="Filtrar por módulo" value={modulo} onChange={(e) => setModulo(e.target.value)} />
        </label>
        <label className="dash-sub" style={{ display: "flex", flexDirection: "column", gap: 2 }}>Usuario
          <input placeholder="Buscar por usuario" value={usuarioF} onChange={(e) => setUsuarioF(e.target.value)} />
        </label>
        <label className="dash-sub" style={{ display: "flex", flexDirection: "column", gap: 2 }}>Registros
          <select value={limite} onChange={(e) => setLimite(Number(e.target.value))}>
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={250}>250</option>
            <option value={500}>500</option>
          </select>
        </label>
        <button type="button" onClick={cargarBitacora}>Aplicar filtros</button>
      </div>
      <p className="dash-sub">Fecha, módulo y acción filtran en la base; usuario y el orden de columnas se aplican sobre lo cargado. La retención de la bitácora se configura en Configuración → Parámetros.</p>

      {error && <p style={{ color: "#b00020" }}>{error}</p>}

      {cargando ? (
        <p>Cargando...</p>
      ) : entradas.length === 0 ? (
        <p style={{ color: "#555" }}>
          Sin registros visibles. La bitácora requiere rol <code>supervisor</code> o{" "}
          <code>administrador</code>.
        </p>
      ) : (
        <>
          <p style={{ fontSize: 13, color: "#555" }}>{visibles.length} registros</p>
          <table>
            <thead>
              <tr>
                {COLS.map((c) => (
                  <th key={c.k} className="sortable" style={{ cursor: "pointer", userSelect: "none" }} onClick={() => clickH(c.k)}>
                    {c.label}
                    <span className="sc-sort">{orden.campo === c.k ? (orden.dir === "asc" ? " ▲" : " ▼") : " ⇅"}</span>
                  </th>
                ))}
                <th>Detalle</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((e) => (
                <tr key={e.id}>
                  <td>{new Date(e.creado_en).toLocaleString()}</td>
                  <td>{usuario(e.usuario_id)}</td>
                  <td>{e.tipo_accion}</td>
                  <td>
                    {e.entidad_tipo}
                    {e.entidad_id ? (
                      <span style={{ color: "#888" }}> · {e.entidad_id.slice(0, 8)}…</span>
                    ) : null}
                  </td>
                  <td>{e.modulo ?? "—"}</td>
                  <td>{e.ip_address ?? "—"}</td>
                  <td>{e.computadora_id ? e.computadora_id.slice(0, 12) : "—"}</td>
                  <td>
                    {e.valores_nuevos || e.valores_anteriores ? (
                      <details>
                        <summary style={{ cursor: "pointer" }}>ver</summary>
                        {e.valores_anteriores ? (
                          <div style={{ fontSize: 11 }}>
                            <div style={{ fontWeight: 700, marginTop: 4 }}>Antes</div>
                            <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 280, overflow: "auto", margin: 0, background: "var(--sc-btn-soft,#f6ede1)", padding: 6, borderRadius: 6 }}>{jsonFull(e.valores_anteriores)}</pre>
                          </div>
                        ) : null}
                        {e.valores_nuevos ? (
                          <div style={{ fontSize: 11 }}>
                            <div style={{ fontWeight: 700, marginTop: 4 }}>Después</div>
                            <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 280, overflow: "auto", margin: 0, background: "var(--sc-btn-soft,#f6ede1)", padding: 6, borderRadius: 6 }}>{jsonFull(e.valores_nuevos)}</pre>
                          </div>
                        ) : null}
                      </details>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </main>
  );
}
