"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

// Zonas internas de un sitio (patio, almacén, andenes, valores, servidores…) y
// sus permisos por persona/credencial con horario y vigencia. Ver migración 0065.
export default function ZonasPage() {
  const [sitios, setSitios] = useState<any[]>([]);
  const [sitioId, setSitioId] = useState("");
  const [zonas, setZonas] = useState<any[]>([]);
  const [zonaSel, setZonaSel] = useState<any>(null);
  const [permisos, setPermisos] = useState<any[]>([]);
  const [personas, setPersonas] = useState<any[]>([]);
  const [credenciales, setCredenciales] = useState<any[]>([]);

  const [nz, setNz] = useState({ nombre: "", descripcion: "", restringida: true });
  const [np, setNp] = useState({ persona_id: "", credencial_id: "", hora_inicio: "", hora_fin: "", dias: "L-V", vigencia_fin: "" });
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    supabase.from("sitios").select("id, nombre").eq("estatus", "activo").order("nombre").then(({ data }) => setSitios((data as any[]) ?? []));
    supabase.from("personas").select("id, nombre, apellido_paterno, apellido_materno").order("nombre").limit(500).then(({ data }) => setPersonas((data as any[]) ?? []));
    supabase.from("credenciales").select("id, codigo, descripcion, persona:personas(nombre, apellido_paterno)").eq("estatus", "activo").order("creado_en", { ascending: false }).limit(500).then(({ data }) => setCredenciales((data as any[]) ?? []));
  }, []);

  const cargarZonas = useCallback(async (sid: string) => {
    const { data } = await supabase.from("zonas").select("id, nombre, descripcion, restringida, estatus").eq("estatus", "activo").eq("sitio_id", sid).order("nombre");
    setZonas((data as any[]) ?? []);
  }, []);

  useEffect(() => { if (sitioId) { cargarZonas(sitioId); setZonaSel(null); setPermisos([]); } else { setZonas([]); } }, [sitioId, cargarZonas]);

  const cargarPermisos = useCallback(async (zid: string) => {
    const { data } = await supabase.from("zona_permisos")
      .select("id, hora_inicio, hora_fin, dias, vigencia_fin, estatus, persona:personas(nombre, apellido_paterno), credencial:credenciales(codigo, descripcion)")
      .eq("estatus", "activo").eq("zona_id", zid).order("creado_en", { ascending: false });
    setPermisos((data as any[]) ?? []);
  }, []);

  async function crearZona(e: React.FormEvent) {
    e.preventDefault(); setMsg(null);
    if (!sitioId) { setMsg("Elige el sitio."); return; }
    if (!nz.nombre.trim()) { setMsg("El nombre de la zona es obligatorio."); return; }
    const { error } = await supabase.from("zonas").insert({ sitio_id: sitioId, nombre: nz.nombre.trim(), descripcion: nz.descripcion.trim() || null, restringida: nz.restringida });
    if (error) { setMsg(error.message); return; }
    setNz({ nombre: "", descripcion: "", restringida: true });
    cargarZonas(sitioId);
  }

  function abrirZona(z: any) { setZonaSel(z); cargarPermisos(z.id); }

  async function agregarPermiso(e: React.FormEvent) {
    e.preventDefault(); setMsg(null);
    if (!zonaSel) return;
    if (!np.persona_id && !np.credencial_id) { setMsg("Elige una persona o una credencial."); return; }
    const { error } = await supabase.from("zona_permisos").insert({
      zona_id: zonaSel.id,
      persona_id: np.persona_id || null,
      credencial_id: np.credencial_id || null,
      hora_inicio: np.hora_inicio || null,
      hora_fin: np.hora_fin || null,
      dias: np.dias || null,
      vigencia_fin: np.vigencia_fin || null,
    });
    if (error) { setMsg(error.message); return; }
    setNp({ persona_id: "", credencial_id: "", hora_inicio: "", hora_fin: "", dias: "L-V", vigencia_fin: "" });
    cargarPermisos(zonaSel.id);
  }

  async function cancelarPermiso(id: string) {
    await supabase.rpc("rpc_cancelar_registro", { p_tabla: "zona_permisos", p_id: id, p_motivo: "Baja de permiso" });
    if (zonaSel) cargarPermisos(zonaSel.id);
  }

  const persNombre = (p: any) => (p ? `${p.nombre ?? ""} ${p.apellido_paterno ?? ""}`.trim() : "");

  return (
    <main className="contenedor">
      <h2>Zonas internas</h2>
      <p className="dash-sub">Define las zonas de cada sitio y quién puede entrar, con horario y vigencia.</p>

      <div className="form-fila" style={{ marginBottom: 12 }}>
        <select value={sitioId} onChange={(e) => setSitioId(e.target.value)} style={{ maxWidth: 340 }}>
          <option value="">— Elige el sitio —</option>
          {sitios.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
        </select>
      </div>

      {msg && <p style={{ color: "#b00020" }}>{msg}</p>}

      {sitioId && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16, alignItems: "start" }}>
          {/* Zonas */}
          <div>
            <h3>Zonas del sitio</h3>
            <form onSubmit={crearZona} style={{ border: "1px solid var(--sc-card-line)", borderRadius: 8, padding: 10, marginBottom: 10 }}>
              <div className="form-fila">
                <input placeholder="Nombre (ej. Almacén, Andenes, Valores)" value={nz.nombre} onChange={(e) => setNz({ ...nz, nombre: e.target.value })} style={{ flex: 2 }} />
                <label className="dash-sub" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input type="checkbox" checked={nz.restringida} onChange={(e) => setNz({ ...nz, restringida: e.target.checked })} /> Restringida
                </label>
                <button type="submit">Agregar</button>
              </div>
              <input placeholder="Descripción (opcional)" value={nz.descripcion} onChange={(e) => setNz({ ...nz, descripcion: e.target.value })} style={{ width: "100%", marginTop: 6 }} />
            </form>
            {zonas.length === 0 ? <p className="dash-sub">Sin zonas todavía.</p> : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {zonas.map((z) => (
                  <button key={z.id} onClick={() => abrirZona(z)} className="qbtn2" style={{ textAlign: "left", borderColor: zonaSel?.id === z.id ? "#6a1b9a" : undefined, fontWeight: zonaSel?.id === z.id ? 700 : 400 }}>
                    {z.restringida ? "🔒" : "🔓"} {z.nombre}{z.descripcion ? <span className="dash-sub"> · {z.descripcion}</span> : null}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Permisos de la zona seleccionada */}
          <div>
            <h3>{zonaSel ? `Permisos — ${zonaSel.nombre}` : "Permisos"}</h3>
            {!zonaSel ? <p className="dash-sub">Elige una zona para ver/editar sus permisos.</p> : (
              <>
                <form onSubmit={agregarPermiso} style={{ border: "1px solid var(--sc-card-line)", borderRadius: 8, padding: 10, marginBottom: 10 }}>
                  <div className="form-fila">
                    <select value={np.persona_id} onChange={(e) => setNp({ ...np, persona_id: e.target.value, credencial_id: "" })} style={{ flex: 2 }}>
                      <option value="">— Persona —</option>
                      {personas.map((p) => <option key={p.id} value={p.id}>{persNombre(p)}</option>)}
                    </select>
                    <select value={np.credencial_id} onChange={(e) => setNp({ ...np, credencial_id: e.target.value, persona_id: "" })} style={{ flex: 2 }}>
                      <option value="">— o Credencial —</option>
                      {credenciales.map((c) => <option key={c.id} value={c.id}>{c.codigo}{c.descripcion ? ` · ${c.descripcion}` : (c.persona ? ` · ${persNombre(c.persona)}` : "")}</option>)}
                    </select>
                  </div>
                  <div className="form-fila" style={{ marginTop: 6 }}>
                    <label className="dash-sub" style={{ display: "flex", flexDirection: "column" }}>Desde<input type="time" value={np.hora_inicio} onChange={(e) => setNp({ ...np, hora_inicio: e.target.value })} /></label>
                    <label className="dash-sub" style={{ display: "flex", flexDirection: "column" }}>Hasta<input type="time" value={np.hora_fin} onChange={(e) => setNp({ ...np, hora_fin: e.target.value })} /></label>
                    <input placeholder="Días (ej. L-V)" value={np.dias} onChange={(e) => setNp({ ...np, dias: e.target.value })} style={{ maxWidth: 110 }} />
                    <label className="dash-sub" style={{ display: "flex", flexDirection: "column" }}>Vence<input type="date" value={np.vigencia_fin} onChange={(e) => setNp({ ...np, vigencia_fin: e.target.value })} /></label>
                    <button type="submit">Dar permiso</button>
                  </div>
                </form>
                {permisos.length === 0 ? <p className="dash-sub">Sin permisos en esta zona.</p> : (
                  <table>
                    <thead><tr><th>Quién</th><th>Horario</th><th>Días</th><th>Vence</th><th></th></tr></thead>
                    <tbody>
                      {permisos.map((p) => (
                        <tr key={p.id}>
                          <td>{p.persona ? persNombre(p.persona) : (p.credencial ? `🎫 ${p.credencial.codigo}` : "—")}</td>
                          <td>{p.hora_inicio && p.hora_fin ? `${p.hora_inicio}–${p.hora_fin}` : "24 h"}</td>
                          <td>{p.dias ?? "—"}</td>
                          <td>{p.vigencia_fin ?? "sin límite"}</td>
                          <td><button className="qbtn2" onClick={() => cancelarPermiso(p.id)}>Quitar</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
