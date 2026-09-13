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
  const [coordinadorId, setCoordinadorId] = useState<string>("");        // personal del coordinador del turno
  const [superv, setSuperv] = useState<Record<string, string>>({});      // sitio_id -> personal del supervisor
  const [rolPorPersonal, setRolPorPersonal] = useState<Record<string, string>>({}); // personal.id -> rol de su cuenta
  const [editando, setEditando] = useState(false);                       // vista (roster) vs. edición

  async function cargar() {
    const { data: t } = await supabase.from("turnos")
      .select("id, folio, fecha, tipo_turno, hora_inicio, hora_fin, estado, supervisor_id, coordinador_id, sitio_id, sitio:sitios(nombre), supervisor:personal!turnos_supervisor_id_fkey(persona:personas(nombre, apellido_paterno, apellido_materno))")
      .eq("id", params.id).maybeSingle();
    setTurno(t);
    setCoordinadorId((t as any)?.coordinador_id ?? "");
    // Borrador abre en edición; activo/cerrado abren en vista (solo el roster).
    setEditando((t as any)?.estado === "borrador");

    const [{ data: gs }, { data: ss }, { data: tg }, { data: ts }, { data: perfiles }] = await Promise.all([
      supabase.from("personal").select("id, categoria, usuario_id, persona:personas(nombre, apellido_paterno, apellido_materno)")
        .eq("estatus", "activo").eq("estado_laboral", "activo"),
      supabase.from("sitios").select("id, nombre, cliente:clientes(razon_social)").eq("estatus", "activo").order("nombre"),
      supabase.from("turno_guardias").select("personal_id, sitio_id").eq("turno_id", params.id),
      supabase.from("turno_supervisores").select("sitio_id, supervisor_personal_id").eq("turno_id", params.id).eq("estatus", "activo"),
      supabase.from("usuarios_perfil").select("id, rol"),
    ]);
    setGuardias((gs as any[]) ?? []);
    setSitios((ss as any[]) ?? []);
    // Rol de cada personal (por su cuenta ligada) para filtrar coordinador/supervisor.
    const rolPorUsuario = new Map<string, string>(((perfiles as any[]) ?? []).map((p) => [p.id, p.rol]));
    const rmap: Record<string, string> = {};
    ((gs as any[]) ?? []).forEach((g) => { if (g.usuario_id && rolPorUsuario.has(g.usuario_id)) rmap[g.id] = rolPorUsuario.get(g.usuario_id)!; });
    setRolPorPersonal(rmap);
    const inicial: Record<string, Sel> = {};
    ((gs as any[]) ?? []).forEach((g) => { inicial[g.id] = { checked: false, sitio_id: "" }; });
    ((tg as any[]) ?? []).forEach((r) => { inicial[r.personal_id] = { checked: true, sitio_id: r.sitio_id ?? "" }; });
    setSel(inicial);
    const sm: Record<string, string> = {};
    ((ts as any[]) ?? []).forEach((r) => { if (r.sitio_id) sm[r.sitio_id] = r.supervisor_personal_id; });
    setSuperv(sm);
  }

  useEffect(() => { cargar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [params.id]);

  function toggle(pid: string) {
    setSel((s) => {
      const cur = s[pid] ?? { checked: false, sitio_id: "" };
      const nextChecked = !cur.checked;
      // Rol de servicio por sitio: al marcar, prellena el sitio del turno.
      const sitio_id = nextChecked && !cur.sitio_id && turno?.sitio_id ? turno.sitio_id : cur.sitio_id;
      return { ...s, [pid]: { checked: nextChecked, sitio_id } };
    });
  }
  function setSitio(pid: string, sitio_id: string) {
    setSel((s) => ({ ...s, [pid]: { ...s[pid], sitio_id } }));
  }

  async function guardar() {
    setGuardando(true); setError(null); setMensaje(null);

    // Sitios con supervisor asignado. El supervisor forma parte del turno vía
    // turno_supervisores (abajo) + la cabecera; NO se mete en turno_guardias (no es
    // guardia de posición y dispararía el anti-fatiga).
    const sitiosSel = Array.from(new Set(Object.values(sel).filter((v) => v.checked && v.sitio_id).map((v) => v.sitio_id)));
    const conSup = sitiosSel.filter((sid) => superv[sid]);

    // Deseados = guardias marcados (por checkbox), cada uno con su sitio.
    const deseados = new Map<string, string | null>();
    for (const [pid, v] of Object.entries(sel)) if (v.checked) deseados.set(pid, v.sitio_id || null);

    // Estado actual en BD.
    const { data: actualDb } = await supabase.from("turno_guardias").select("personal_id, sitio_id").eq("turno_id", params.id);
    const enDb = new Map<string, string | null>(((actualDb as any[]) ?? []).map((r) => [r.personal_id, r.sitio_id]));

    const inserts: any[] = [];
    for (const [pid, nuevoSitio] of deseados) {
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
    // Quitar los que ya no están (ni marcados ni supervisores).
    const quitar = [...enDb.keys()].filter((pid) => !deseados.has(pid));
    if (quitar.length) {
      await supabase.from("turno_guardias").delete().eq("turno_id", params.id).in("personal_id", quitar);
    }

    // Coordinador + supervisor principal en la cabecera (para que el supervisor se
    // muestre como parte del turno) + supervisor por sitio (turno_supervisores).
    const supPrincipal = conSup.length ? superv[conSup[0]] : null;
    await supabase.from("turnos").update({ coordinador_id: coordinadorId || null, supervisor_id: supPrincipal, actualizado_en: new Date().toISOString() }).eq("id", params.id);
    if (conSup.length) {
      const filas = conSup.map((sid) => ({ turno_id: params.id, sitio_id: sid, supervisor_personal_id: superv[sid], estatus: "activo", actualizado_en: new Date().toISOString() }));
      const { error: eSup } = await supabase.from("turno_supervisores").upsert(filas, { onConflict: "turno_id,sitio_id" });
      if (eSup) { setError(eSup.message); setGuardando(false); return; }
    }
    const { data: curSup } = await supabase.from("turno_supervisores").select("sitio_id").eq("turno_id", params.id);
    const borrarSup = ((curSup as any[]) ?? []).map((r) => r.sitio_id).filter((sid) => !conSup.includes(sid));
    if (borrarSup.length) await supabase.from("turno_supervisores").delete().eq("turno_id", params.id).in("sitio_id", borrarSup);

    setGuardando(false);
    setMensaje("Turno guardado (guardias y supervisión).");
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

  // Se puede editar (agregar/quitar guardias) en borrador y en activo; al cerrar
  // el turno queda bloqueado.
  const puedeEditar = turno.estado === "borrador" || turno.estado === "activo";
  const seleccionados = Object.values(sel).filter((v) => v.checked).length;
  const sitiosActivos = Array.from(new Set(Object.values(sel).filter((v) => v.checked && v.sitio_id).map((v) => v.sitio_id)));
  const sitioNombre = (sid: string) => sitios.find((s) => s.id === sid)?.nombre ?? sid;
  // Solo personal con cuenta de rol coordinador / supervisor.
  const coordinadores = guardias.filter((g) => rolPorPersonal[g.id] === "coordinador");
  const supervisores = guardias.filter((g) => rolPorPersonal[g.id] === "supervisor");
  const lista = guardias.filter((g) => {
    const t = filtro.trim().toLowerCase();
    return !t || nombre(g).toLowerCase().includes(t) || (g.categoria ?? "").toLowerCase().includes(t);
  });

  // Roster para el modo VISTA: agrupado por sitio, supervisor arriba y guardias debajo.
  const guardiaPorId = new Map(guardias.map((g) => [g.id, g]));
  const asignados = Object.entries(sel).filter(([, v]) => v.checked); // [pid, {sitio_id}]
  const sitiosRoster = Array.from(new Set([
    ...asignados.map(([, v]) => v.sitio_id || "__sin__"),
    ...Object.keys(superv).filter((sid) => superv[sid]),
  ])).sort((a, b) => (a === "__sin__" ? 1 : b === "__sin__" ? -1 : sitioNombre(a).localeCompare(sitioNombre(b))));
  const rosterSitio = (sid: string) => ({
    supervisor: sid !== "__sin__" && superv[sid] ? guardiaPorId.get(superv[sid]) : null,
    guardias: asignados.filter(([, v]) => (v.sitio_id || "__sin__") === sid).map(([pid]) => guardiaPorId.get(pid)).filter(Boolean),
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
        <div className="cad-stat"><span className="cad-stat-lbl">Sitio</span><b>{turno.sitio?.nombre ?? "Varios / por guardia"}</b></div>
        <div className="cad-stat"><span className="cad-stat-lbl">Tipo</span><b>{turno.tipo_turno ?? "—"}</b></div>
        <div className="cad-stat"><span className="cad-stat-lbl">Horario</span><b>{turno.hora_inicio ? `${String(turno.hora_inicio).slice(0, 5)}–${String(turno.hora_fin ?? "").slice(0, 5)}` : "—"}</b></div>
        <div className="cad-stat"><span className="cad-stat-lbl">Guardias marcados</span><b>{seleccionados}</b></div>
      </div>

      <div className="form-fila" style={{ marginTop: 12, gap: 10, flexWrap: "wrap" }}>
        {editando ? (
          <>
            <button onClick={guardar} disabled={guardando || !puedeEditar}>{guardando ? "Guardando…" : "💾 Guardar turno"}</button>
            {turno.estado === "borrador" && <button className="cad-guardar" onClick={activar} disabled={guardando}>✔ Activar turno</button>}
            <button className="secundario" onClick={() => { cargar(); }} disabled={guardando}>👁 Ver roster</button>
          </>
        ) : (
          <button onClick={() => setEditando(true)} disabled={!puedeEditar}>✏️ Editar turno</button>
        )}
        {!puedeEditar && <span className="dash-sub" style={{ color: "#8a1220" }}>Turno cerrado: no admite cambios.</span>}
        <span style={{ flex: 1 }} />
        <label className="dash-sub" style={{ display: "flex", alignItems: "center", gap: 6 }}>Copiar a
          <input type="date" value={copiaFecha} onChange={(e) => setCopiaFecha(e.target.value)} />
        </label>
        <button className="secundario" onClick={copiar} disabled={guardando}>⧉ Copiar turno</button>
      </div>
      {mensaje && <p style={{ color: "#0a7c2f" }}>{mensaje}</p>}
      {error && <p style={{ color: "#b00020" }}>{error}</p>}

      {!editando && (
        <div style={{ marginTop: 16 }}>
          <h3 style={{ marginBottom: 6 }}>Personal del turno</h3>
          {sitiosRoster.length === 0 ? (
            <p className="dash-sub">Este turno aún no tiene personal asignado. Usa “✏️ Editar turno”.</p>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {sitiosRoster.map((sid) => {
                const { supervisor, guardias: gs } = rosterSitio(sid);
                return (
                  <div key={sid} style={{ border: "1px solid var(--sc-card-line)", borderRadius: 10, overflow: "hidden" }}>
                    <div style={{ background: "var(--sc-btn-soft,#f6ede1)", padding: "7px 12px", fontWeight: 700 }}>
                      {sid === "__sin__" ? "Sin sitio asignado" : sitioNombre(sid)}
                      <span className="dash-sub" style={{ fontWeight: 400, marginLeft: 8 }}>({gs.length} guardia{gs.length === 1 ? "" : "s"})</span>
                    </div>
                    <div style={{ padding: "8px 12px" }}>
                      <div style={{ marginBottom: gs.length ? 8 : 0 }}>
                        <span className="dash-sub" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em" }}>Supervisor</span><br />
                        <b>{supervisor ? nombre(supervisor) : "— Sin supervisor —"}</b>
                      </div>
                      {gs.length > 0 && (
                        <>
                          <span className="dash-sub" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em" }}>Guardias</span>
                          <ul style={{ margin: "2px 0 0", paddingLeft: 18 }}>
                            {gs.map((g: any) => <li key={g.id}>{nombre(g)}{g.categoria ? <span className="dash-sub"> · {g.categoria}</span> : null}</li>)}
                          </ul>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {editando && (<>
      <h3 style={{ marginTop: 16 }}>Supervisión del turno</h3>
      <p className="dash-sub">El <b>coordinador</b> cubre todo el turno; cada <b>sitio</b> tiene su supervisor (una misma persona puede cubrir varios). Deben ser personal con <b>cuenta ligada</b> (Gestión del sistema → Usuarios y roles → “Guardia (app)”) para integrarse a las alertas de relevo.</p>
      <div className="form-grid" style={{ maxWidth: 520 }}>
        <label>Coordinador del turno
          <select value={coordinadorId} disabled={!puedeEditar} onChange={(e) => setCoordinadorId(e.target.value)}>
            <option value="">— Sin coordinador —</option>
            {coordinadores.map((g) => <option key={g.id} value={g.id}>{nombre(g)}</option>)}
          </select>
          {coordinadores.length === 0 && <span className="dash-sub" style={{ color: "#8a1220" }}>No hay personal con rol coordinador y cuenta ligada.</span>}
        </label>
      </div>
      {sitiosActivos.length > 0 ? (
        <table style={{ maxWidth: 640, marginTop: 8 }}>
          <thead><tr><th>Sitio</th><th>Supervisor</th></tr></thead>
          <tbody>
            {sitiosActivos.map((sid) => (
              <tr key={sid}>
                <td>{sitioNombre(sid)}</td>
                <td>
                  <select value={superv[sid] ?? ""} disabled={!puedeEditar} onChange={(e) => setSuperv((s) => ({ ...s, [sid]: e.target.value }))}>
                    <option value="">— Supervisor —</option>
                    {supervisores.map((g) => <option key={g.id} value={g.id}>{nombre(g)}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="dash-sub">Marca guardias y asígnales sitio (abajo) para definir el supervisor de cada sitio.</p>
      )}

      <h3 style={{ marginTop: 16 }}>Guardias del turno</h3>
      <p className="dash-sub">Marca los guardias que integran el turno y asigna a cada uno su sitio/puesto{turno.sitio?.nombre ? ` (por defecto: ${turno.sitio.nombre})` : ""}. Se pueden agregar o quitar guardias mientras el turno esté en borrador o activo.</p>
      <input placeholder="Filtrar guardia…" value={filtro} onChange={(e) => setFiltro(e.target.value)} style={{ maxWidth: 320, marginBottom: 10 }} />
      <table>
        <thead><tr><th style={{ width: 40 }}></th><th>Guardia</th><th>Categoría</th><th>Sitio / puesto</th></tr></thead>
        <tbody>
          {lista.map((g) => {
            const s = sel[g.id] ?? { checked: false, sitio_id: "" };
            return (
              <tr key={g.id} style={s.checked ? { background: "rgba(62,116,112,.08)" } : undefined}>
                <td><input type="checkbox" checked={s.checked} disabled={!puedeEditar} onChange={() => toggle(g.id)} /></td>
                <td>{nombre(g)}</td>
                <td>{g.categoria ?? "—"}</td>
                <td>
                  <select value={s.sitio_id} disabled={!s.checked || !puedeEditar} onChange={(e) => setSitio(g.id, e.target.value)}>
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
      </>)}
    </main>
  );
}
