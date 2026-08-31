"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { UsuarioAdmin, Rol } from "@/lib/types";

// Roles SGS relevantes primero; los heredados de SCP (dormidos) al final.
const ROLES: Rol[] = ["guardia", "operador", "coordinador", "supervisor", "administrador", "oficial", "investigador", "asuntos_internos"];

// Panel de Usuarios y roles (alta, rol y estado). Solo administrador.
export default function UsuariosPanel() {
  const [usuarios, setUsuarios] = useState<UsuarioAdmin[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const [nEmail, setNEmail] = useState("");
  const [nNombre, setNNombre] = useState("");
  const [nPass, setNPass] = useState("");
  const [nRol, setNRol] = useState<Rol>("oficial");
  const [creando, setCreando] = useState(false);
  // Vínculo usuario ↔ guardia (para que la app móvil auto-resuelva "Mi elemento").
  const [guardias, setGuardias] = useState<any[]>([]);
  const [ligas, setLigas] = useState<Record<string, string>>({});

  async function cargarGuardias() {
    const { data } = await supabase.from("personal")
      .select("id, usuario_id, numero_placa, rango, persona:personas(nombre, apellido_paterno)")
      .eq("estatus", "activo").limit(1000);
    const list = ((data as any[]) ?? []).map((p) => ({
      id: p.id as string,
      usuario_id: p.usuario_id as string | null,
      etiqueta: `${p.persona ? `${p.persona.nombre ?? ""} ${p.persona.apellido_paterno ?? ""}`.trim() : ""}${p.numero_placa ? ` #${p.numero_placa}` : ""}`.trim() || (p.id as string),
    }));
    list.sort((a, b) => a.etiqueta.localeCompare(b.etiqueta));
    setGuardias(list);
    const m: Record<string, string> = {};
    list.forEach((p) => { if (p.usuario_id) m[p.usuario_id] = p.id; });
    setLigas(m);
  }

  async function ligarGuardia(userId: string, personalId: string) {
    setError(null); setMensaje(null);
    const { error } = await supabase.rpc("rpc_ligar_usuario_guardia", { p_usuario: userId, p_personal: personalId || null });
    if (error) { setError(error.message); return; }
    setMensaje("Vínculo usuario ↔ guardia actualizado.");
    cargarGuardias();
  }

  async function cargar() {
    setCargando(true);
    setError(null);
    const { data, error } = await supabase.rpc("rpc_listar_usuarios");
    if (error) {
      setError(error.message);
    } else {
      setUsuarios(data as UsuarioAdmin[]);
      await supabase.rpc("rpc_registrar_bitacora", {
        p_tipo_accion: "CONSULTAR", p_entidad_tipo: "usuarios_perfil", p_entidad_id: null, p_modulo: "administracion",
      });
    }
    setCargando(false);
  }

  useEffect(() => { cargar(); cargarGuardias(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  function editar(id: string, campo: "nombre" | "rol" | "activo", valor: string | boolean) {
    setUsuarios((prev) => prev.map((u) => (u.id === id ? { ...u, [campo]: valor } : u)));
  }

  async function crearUsuario(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setMensaje(null);
    if (!nEmail.trim() || !nEmail.includes("@")) { setError("Indica un correo válido."); return; }
    if (nPass.length < 6) { setError("La contraseña debe tener al menos 6 caracteres."); return; }
    setCreando(true);
    const { data, error } = await supabase.functions.invoke("crear_usuario", {
      body: { email: nEmail.trim(), nombre: nNombre.trim(), password: nPass, rol: nRol },
    });
    setCreando(false);
    if (error || (data as any)?.error) {
      let msg = (data as any)?.error ?? error?.message ?? "No se pudo crear el usuario.";
      try {
        const ctx = (error as any)?.context;
        if (ctx && typeof ctx.json === "function") { const b = await ctx.json(); if (b?.error) msg = b.error; }
      } catch { /* se conserva el mensaje */ }
      setError(msg);
      return;
    }
    setMensaje(`Usuario ${nEmail.trim()} creado con rol ${nRol}.${(data as any)?.aviso ? ` (${(data as any).aviso})` : ""}`);
    setNEmail(""); setNNombre(""); setNPass(""); setNRol("oficial");
    cargar();
  }

  async function guardar(u: UsuarioAdmin) {
    setError(null); setMensaje(null);
    const { error } = await supabase.rpc("rpc_admin_actualizar_usuario", {
      p_user: u.id, p_nombre: u.nombre, p_rol: u.rol, p_activo: u.activo,
    });
    if (error) { setError(error.message); return; }
    setMensaje(`Usuario ${u.email ?? u.id} actualizado.`);
    cargar();
  }

  return (
    <>
      <p style={{ fontSize: 13, color: "#555" }}>Alta de usuarios, roles y estado. Solo administrador.</p>

      <form onSubmit={crearUsuario} className="sc-subcard" style={{ maxWidth: 720 }}>
        <div className="dash-eyebrow">Crear usuario nuevo</div>
        <div className="form-grid">
          <label>Correo<input type="email" value={nEmail} onChange={(e) => setNEmail(e.target.value)} placeholder="correo@dominio.com" autoComplete="off" /></label>
          <label>Nombre<input value={nNombre} onChange={(e) => setNNombre(e.target.value)} placeholder="Nombre y apellidos" /></label>
          <label>Contraseña inicial<input type="password" value={nPass} onChange={(e) => setNPass(e.target.value)} placeholder="mínimo 6 caracteres" autoComplete="new-password" /></label>
          <label>Rol
            <select value={nRol} onChange={(e) => setNRol(e.target.value as Rol)}>
              {ROLES.map((r) => (<option key={r} value={r}>{r}</option>))}
            </select>
          </label>
        </div>
        <div style={{ marginTop: 10 }}>
          <button type="submit" disabled={creando}>{creando ? "Creando…" : "Crear usuario"}</button>
        </div>
        <p style={{ fontSize: 12, color: "#777", marginTop: 6 }}>
          La cuenta se crea confirmada y sirve para web y móvil. En el primer acceso web se activa el 2FA.
        </p>
      </form>

      {error && <p style={{ color: "#b00020" }}>{error}</p>}
      {mensaje && <p style={{ color: "#0a7c2f" }}>{mensaje}</p>}

      {cargando ? (
        <p>Cargando...</p>
      ) : usuarios.length === 0 ? (
        <p style={{ color: "#555" }}>Sin usuarios visibles. Esta pantalla requiere rol <code>administrador</code>.</p>
      ) : (
        <table>
          <thead>
            <tr><th>Correo</th><th>Nombre</th><th>Rol</th><th>Guardia (app)</th><th>Activo</th><th>Alta</th><th></th></tr>
          </thead>
          <tbody>
            {usuarios.map((u) => (
              <tr key={u.id}>
                <td>{u.email ?? "—"}</td>
                <td><input value={u.nombre ?? ""} onChange={(e) => editar(u.id, "nombre", e.target.value)} /></td>
                <td>
                  <select value={u.rol} onChange={(e) => editar(u.id, "rol", e.target.value)}>
                    {ROLES.map((r) => (<option key={r} value={r}>{r}</option>))}
                  </select>
                </td>
                <td>
                  <select value={ligas[u.id] ?? ""} onChange={(e) => ligarGuardia(u.id, e.target.value)}>
                    <option value="">— Sin guardia —</option>
                    {guardias.filter((g) => !g.usuario_id || g.usuario_id === u.id).map((g) => (
                      <option key={g.id} value={g.id}>{g.etiqueta}</option>
                    ))}
                  </select>
                </td>
                <td><input type="checkbox" checked={u.activo} onChange={(e) => editar(u.id, "activo", e.target.checked)} /></td>
                <td>{new Date(u.creado_en).toLocaleDateString()}</td>
                <td><button onClick={() => guardar(u)}>Guardar</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
