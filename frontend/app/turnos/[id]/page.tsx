"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

const hoyISO = () => new Date().toISOString().slice(0, 10);
function nombre(p: any) {
  const x = p?.persona;
  return x ? `${x.nombre ?? ""} ${x.apellido_paterno ?? ""} ${x.apellido_materno ?? ""}`.trim() : "—";
}
interface Sel { checked: boolean; sitio_id: string }

// Detalle de turno: se agregan los guardias (checkbox) y a cada uno su sitio.
// Se guarda, se activa (borrador -> activo) y se puede copiar a otra fecha.
export default function TurnoDetallePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [turno, setTurno] = useState<any>(null);
  const [guardias, setGuardias] = useState<any[]>([]);
  const [sitios, setSitios] = useState<any[]>([]);
  const [sel, setSel] = useState<Record<string, Sel>>({});
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [copiaFecha, setCopiaFecha] = useState(hoyISO());
  const [filtro, setFiltro] = useState("");

  async function cargar() {
    const { data: t } = await supabase.from("turnos")
      .select("id, folio, fecha, tipo_turno, hora_inicio, hora_fin, estado, supervisor_id, supervisor:personal!turnos_supervisor_id_fkey(persona:personas(nombre, apellido_paterno, apellido_materno))")
      .eq("id", params.id).maybeSingle();
    setTurno(t);

    const [{ data: gs }, { data: ss }, { data: tg }] = await Promise.all([
      supabase.from("personal").select("id, categoria, persona:personas(nombre, apellido_paterno, apellido_materno)")
        .eq("estatus", "activo").eq("estado_laboral", "activo"),
      supabase.from("sitios").select("id, nombre, cliente:clientes(razon_social)").eq("estatus", "activo").order("nombre"),
      supabase.from("turno_guardias").select("personal_id, sitio_id").eq("turno_id", params.id),
    ]);
    setGuardias((gs as any[]) ?? []);
    setSitios((ss as any[]) ?? []);
    const inicial: Record<string, Sel> = {};
    ((gs as any[]) ?? []).forEach((g) => { inicial[g.id] = { checked: false, sitio_id: "" }; });
    ((tg as any[]) ?? []).forEach((r) => { inicial[r.personal_id] = { checked: true, sitio_id: r.sitio_id ?? "" }; });
    setSel(inicial);
  }

  useEffect(() => { cargar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [params.id]);

  function toggle(pid: string) {
    setSel((s) => ({ ...s, [pid]: { ...s[pid], checked: !s[pid]?.checked } }));
  }
  function setSitio(pid: string, sitio_id: string) {
    setSel((s) => ({ ...s, [pid]: { ...s[pid], sitio_id } }));
  }

  async function guardar() {
    setGuardando(true); setError(null); setMensaje(null);
    // Estado actual en BD.
    const { data: actualDb } = await supabase.from("turno_guardias").select("personal_id, sitio_id").eq("turno_id", params.id);
    const enDb = new Map<string, string | null>(((actualDb as any[]) ?? []).map((r) => [r.personal_id, r.sitio_id]));
    const deseados = Object.entries(sel).filter(([, v]) => v.checked);

    const inserts: any[] = [];
    for (const [pid, v] of deseados) {
      const nuevoSitio = v.sitio_id || null;
      if (!enDb.has(pid)) {
        inserts.push({ turno_id: params.id, personal_id: pid, sitio_id: nuevoSitio });
      } else if ((enDb.get(pid) ?? null) !== nuevoSitio) {
        await supabase.from("turno_guardias").update({ sitio_id: nuevoSitio, actualizado_en: new Date().toISOString() })
          .eq("turno_id", params.id).eq("personal_id", pid);
      }
    }
    if (inserts.length) {
      const { error } = await supabase.from("turno_guardias").insert(inserts);
      if (error) { setError(error.message); setGuardando(false); return; }
    }
    // Quitar los que ya no están marcados.
    const quitar = [...enDb.keys()].filter((pid) => !sel[pid]?.checked);
    if (quitar.length) {
      await supabase.from("turno_guardias").delete().eq("turno_id", params.id).in("personal_id", quitar);
    }
    setGuardando(false);
    setMensaje("Guardias del turno guardados.");
    cargar();
  }

  async function activar() {
    setGuardando(true); setError(null);
    const { error } = await supabase.from("turnos").update({ estado: "activo", actualizado_en: new Date().toISOString() }).eq("id", params.id);
    setGuardando(false);
    if (error) { setError(error.message); return; }
    setMensaje("Turno activado."); cargar();
  }

  async function copiar() {
    if (!copiaFecha) { setError("Indica la fecha de destino."); return; }
    setGuardando(true); setError(null);
    // Cabecera nueva (borrador) con los mismos datos y nueva fecha.
    const { data: nuevo, error } = await supabase.from("turnos").insert({
      supervisor_id: turno.supervisor_id, fecha: copiaFecha, estado: "borrador",
      tipo_turno: turno.tipo_turno ?? null, hora_inicio: turno.hora_inicio ?? null, hora_fin: turno.hora_fin ?? null,
    }).select("id").single();
    if (error) { setError(error.message); setGuardando(false); return; }
    // Copiar guardias (los guardados en BD).
    const { data: tg } = await supabase.from("turno_guardias").select("personal_id, sitio_id").eq("turno_id", params.id);
    const filas = ((tg as any[]) ?? []).map((r) => ({ turno_id: (nuevo as any).id, personal_id: r.personal_id, sitio_id: r.sitio_id }));
    if (filas.length) await supabase.from("turno_guardias").insert(filas);
    setGuardando(false);
    router.push(`/turnos/${(nuevo as any).id}`);
  }

  if (!turno) return <main className="contenedor">{error ? <p style={{ color: "#b00020" }}>{error}</p> : <p>Cargando…</p>}</main>;

  const seleccionados = Object.values(sel).filter((v) => v.checked).length;
  const lista = guardias.filter((g) => {
    const t = filtro.trim().toLowerCase();
    return !t || nombre(g).toLowerCase().includes(t) || (g.categoria ?? "").toLowerCase().includes(t);
  });

  return (
    <main className="contenedor">
      <p style={{ marginBottom: 4 }}><Link href="/turnos">← Rol de turnos</Link></p>
      <h2 style={{ marginBottom: 6 }}>
        {turno.folio ? `[${turno.folio}] ` : ""}Turno · {turno.fecha ? new Date(turno.fecha + "T00:00:00").toLocaleDateString() : ""}
        <span className="cad-pill" style={{ marginLeft: 10, background: turno.estado === "activo" ? "#0a7c2f" : turno.estado === "cerrado" ? "#555" : "#7a5c00", color: "#fff" }}>{turno.estado}</span>
      </h2>
      <div className="cad-status">
        <div className="cad-stat"><span className="cad-stat-lbl">Supervisor</span><b>{nombre(turno.supervisor)}</b></div>
        <div className="cad-stat"><span className="cad-stat-lbl">Tipo</span><b>{turno.tipo_turno ?? "—"}</b></div>
        <div className="cad-stat"><span className="cad-stat-lbl">Horario</span><b>{turno.hora_inicio ? `${String(turno.hora_inicio).slice(0, 5)}–${String(turno.hora_fin ?? "").slice(0, 5)}` : "—"}</b></div>
        <div className="cad-stat"><span className="cad-stat-lbl">Guardias marcados</span><b>{seleccionados}</b></div>
      </div>

      <div className="form-fila" style={{ marginTop: 12, gap: 10, flexWrap: "wrap" }}>
        <button onClick={guardar} disabled={guardando}>{guardando ? "Guardando…" : "💾 Guardar guardias"}</button>
        {turno.estado === "borrador" && <button className="cad-guardar" onClick={activar} disabled={guardando}>✔ Activar turno</button>}
        <span style={{ flex: 1 }} />
        <label className="dash-sub" style={{ display: "flex", alignItems: "center", gap: 6 }}>Copiar a
          <input type="date" value={copiaFecha} onChange={(e) => setCopiaFecha(e.target.value)} />
        </label>
        <button className="secundario" onClick={copiar} disabled={guardando}>⧉ Copiar turno</button>
      </div>
      {mensaje && <p style={{ color: "#0a7c2f" }}>{mensaje}</p>}
      {error && <p style={{ color: "#b00020" }}>{error}</p>}

      <h3 style={{ marginTop: 16 }}>Guardias del turno</h3>
      <p className="dash-sub">Marca los guardias que integran el turno y asigna a cada uno su sitio/puesto.</p>
      <input placeholder="Filtrar guardia…" value={filtro} onChange={(e) => setFiltro(e.target.value)} style={{ maxWidth: 320, marginBottom: 10 }} />
      <table>
        <thead><tr><th style={{ width: 40 }}></th><th>Guardia</th><th>Categoría</th><th>Sitio / puesto</th></tr></thead>
        <tbody>
          {lista.map((g) => {
            const s = sel[g.id] ?? { checked: false, sitio_id: "" };
            return (
              <tr key={g.id} style={s.checked ? { background: "rgba(62,116,112,.08)" } : undefined}>
                <td><input type="checkbox" checked={s.checked} onChange={() => toggle(g.id)} /></td>
                <td>{nombre(g)}</td>
                <td>{g.categoria ?? "—"}</td>
                <td>
                  <select value={s.sitio_id} disabled={!s.checked} onChange={(e) => setSitio(g.id, e.target.value)}>
                    <option value="">— Sitio —</option>
                    {sitios.map((si) => <option key={si.id} value={si.id}>{si.nombre}{si.cliente?.razon_social ? ` · ${si.cliente.razon_social}` : ""}</option>)}
                  </select>
                </td>
              </tr>
            );
          })}
          {lista.length === 0 && <tr><td colSpan={4} className="dash-sub">Sin guardias.</td></tr>}
        </tbody>
      </table>
    </main>
  );
}
