"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { temaGuardado, aplicarTema, type Tema } from "@/lib/theme";

const BUCKET = "fotos";

interface Enrol { factorId: string; qr: string; secret: string; }

// Opciones del usuario (se abre al hacer clic en el círculo de iniciales):
// foto, datos de contacto, cambio de contraseña y verificación en dos pasos.
export default function PerfilPage() {
  const [uid, setUid] = useState("");
  const [correo, setCorreo] = useState("");
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [puesto, setPuesto] = useState("");
  const [fotoPath, setFotoPath] = useState<string | null>(null);
  const [tema, setTema] = useState<Tema>("system");
  const [cargando, setCargando] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Contraseña
  const [pass1, setPass1] = useState("");
  const [pass2, setPass2] = useState("");

  // 2FA
  const [dosFa, setDosFa] = useState(false);
  const [enrol, setEnrol] = useState<Enrol | null>(null);
  const [codigo, setCodigo] = useState("");

  async function cargar() {
    setCargando(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setUid(user.id);
      setCorreo(user.email ?? "");
      const m = (user.user_metadata ?? {}) as any;
      setNombre(m.nombre ?? "");
      setTelefono(m.telefono ?? "");
      setPuesto(m.puesto ?? "");
      setFotoPath(m.foto ?? null);
    }
    const { data: f } = await supabase.auth.mfa.listFactors();
    setDosFa(!!(f?.totp && f.totp.length > 0));
    setCargando(false);
  }
  useEffect(() => { cargar(); }, []);

  function urlFoto(path: string | null): string | null {
    return path ? supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl : null;
  }

  async function guardarContacto(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setMsg(null); setGuardando(true);
    const { error } = await supabase.auth.updateUser({ data: { nombre: nombre.trim(), telefono: telefono.trim(), puesto: puesto.trim(), foto: fotoPath } });
    setGuardando(false);
    if (error) { setError(error.message); return; }
    setMsg("Datos de contacto guardados.");
  }

  async function subirFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !uid) return;
    setError(null); setMsg(null); setGuardando(true);
    const ext = (file.name.split(".").pop() || "jpg").replace(/[^a-z0-9]/gi, "").toLowerCase() || "jpg";
    const path = `usuarios/${uid}/${Date.now()}.${ext}`;
    const { error: eUp } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined });
    if (eUp) { setError(eUp.message); setGuardando(false); return; }
    const { error: eMeta } = await supabase.auth.updateUser({ data: { foto: path } });
    setGuardando(false);
    if (fileRef.current) fileRef.current.value = "";
    if (eMeta) { setError(eMeta.message); return; }
    setFotoPath(path);
    setMsg("Foto actualizada.");
  }

  async function cambiarPassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setMsg(null);
    if (pass1.length < 8) { setError("La contraseña debe tener al menos 8 caracteres."); return; }
    if (pass1 !== pass2) { setError("Las contraseñas no coinciden."); return; }
    setGuardando(true);
    const { error } = await supabase.auth.updateUser({ password: pass1 });
    setGuardando(false);
    if (error) { setError(error.message); return; }
    setPass1(""); setPass2("");
    setMsg("Contraseña actualizada.");
  }

  // ---- 2FA ----
  async function activar2fa() {
    setError(null); setMsg(null); setGuardando(true);
    try {
      const { data: f } = await supabase.auth.mfa.listFactors();
      for (const x of (f?.all ?? []).filter((a) => a.factor_type === "totp" && a.status !== "verified")) await supabase.auth.mfa.unenroll({ factorId: x.id });
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", issuer: "SGS - Sistema de Gestión de Seguridad", friendlyName: `SGS ${Date.now()}` });
      if (error || !data) { setError(error?.message ?? "No se pudo iniciar el registro 2FA."); return; }
      setEnrol({ factorId: data.id, qr: (data as any).totp.qr_code, secret: (data as any).totp.secret });
    } finally { setGuardando(false); }
  }
  async function confirmar2fa(e: React.FormEvent) {
    e.preventDefault();
    if (!enrol) return;
    setError(null); setMsg(null); setGuardando(true);
    try {
      const { data: ch, error: e1 } = await supabase.auth.mfa.challenge({ factorId: enrol.factorId });
      if (e1 || !ch) { setError(e1?.message ?? "No se pudo verificar."); return; }
      const { error: e2 } = await supabase.auth.mfa.verify({ factorId: enrol.factorId, challengeId: ch.id, code: codigo.trim() });
      if (e2) { setError("Código incorrecto o expirado."); return; }
      setEnrol(null); setCodigo(""); setMsg("Verificación en dos pasos activada."); cargar();
    } finally { setGuardando(false); }
  }
  async function desactivar2fa() {
    if (!window.confirm("¿Desactivar la verificación en dos pasos? Se te pedirá activarla de nuevo en el próximo inicio de sesión (es obligatoria).")) return;
    setError(null); setMsg(null); setGuardando(true);
    try {
      const { data } = await supabase.auth.mfa.listFactors();
      for (const f of data?.totp ?? []) await supabase.auth.mfa.unenroll({ factorId: f.id });
      setMsg("Verificación en dos pasos desactivada."); cargar();
    } finally { setGuardando(false); }
  }

  const fotoUrl = urlFoto(fotoPath);

  useEffect(() => { setTema(temaGuardado()); }, []);
  function elegirTema(t: Tema) { setTema(t); aplicarTema(t); }

  return (
    <main className="contenedor">
      <h2>Mi cuenta</h2>
      <p className="dash-sub">{correo}</p>

      <div className="dash-eyebrow">Apariencia</div>
      <div className="sc-subcard" style={{ maxWidth: 620 }}>
        <p className="dash-sub" style={{ marginTop: 0 }}>Elige el tema de la interfaz. «Automático» sigue la preferencia de tu sistema.</p>
        <div className="form-fila">
          {(([["light", "☀ Claro"], ["dark", "🌙 Oscuro"], ["system", "🖥 Automático"]]) as [Tema, string][]).map(([k, l]) => (
            <button key={k} type="button" className="qbtn2" onClick={() => elegirTema(k)}
              style={tema === k ? { borderColor: "var(--sc-btn)", color: "var(--sc-btn)", fontWeight: 800 } : undefined}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {cargando ? <p>Cargando...</p> : (
        <>
          <div className="dash-eyebrow">Foto y datos de contacto</div>
          <div className="sc-subcard" style={{ maxWidth: 620 }}>
            <div className="foto-entidad">
              <div className="foto-entidad-thumbs">
                {fotoUrl ? <figure className="foto-entidad-item"><img src={fotoUrl} alt="Mi foto" /></figure> : <div className="foto-entidad-vacia">Sin foto</div>}
              </div>
              <div className="form-fila" style={{ marginTop: 6 }}>
                <input ref={fileRef} type="file" accept="image/*" onChange={subirFoto} disabled={guardando} />
              </div>
            </div>
            <form onSubmit={guardarContacto}>
              <div className="form-grid">
                <label>Nombre<input value={nombre} onChange={(e) => setNombre(e.target.value)} /></label>
                <label>Teléfono<input value={telefono} onChange={(e) => setTelefono(e.target.value)} /></label>
                <label>Puesto / cargo<input value={puesto} onChange={(e) => setPuesto(e.target.value)} /></label>
                <label>Correo<input value={correo} disabled /></label>
              </div>
              <div className="form-fila" style={{ marginTop: 8 }}>
                <button type="submit" disabled={guardando}>Guardar datos</button>
              </div>
            </form>
          </div>

          <div className="dash-eyebrow">Cambiar contraseña</div>
          <div className="sc-subcard" style={{ maxWidth: 620 }}>
            <form onSubmit={cambiarPassword}>
              <div className="form-grid">
                <label>Nueva contraseña<input type="password" autoComplete="new-password" value={pass1} onChange={(e) => setPass1(e.target.value)} /></label>
                <label>Confirmar contraseña<input type="password" autoComplete="new-password" value={pass2} onChange={(e) => setPass2(e.target.value)} /></label>
              </div>
              <div className="form-fila" style={{ marginTop: 8 }}>
                <button type="submit" disabled={guardando || !pass1}>Actualizar contraseña</button>
              </div>
            </form>
          </div>

          <div className="dash-eyebrow">Verificación en dos pasos (2FA)</div>
          <div className="sc-subcard" style={{ maxWidth: 620 }}>
            {enrol ? (
              <>
                <p style={{ fontSize: 13, color: "#555" }}>Escanea el QR con tu app de autenticación y confirma con el código.</p>
                <div style={{ background: "#fff", padding: 12, borderRadius: 8, display: "inline-block" }}
                     dangerouslySetInnerHTML={{ __html: enrol.qr.startsWith("<svg") ? enrol.qr : `<img src="${enrol.qr}" alt="QR 2FA" />` }} />
                <p style={{ fontSize: 12, color: "#667", marginTop: 8 }}>Clave manual:</p>
                <code style={{ userSelect: "all", fontSize: 13, wordBreak: "break-all" }}>{enrol.secret}</code>
                <form onSubmit={confirmar2fa} style={{ marginTop: 10 }}>
                  <div className="form-fila">
                    <input type="text" inputMode="numeric" autoComplete="one-time-code" placeholder="Código" value={codigo}
                           onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))} required autoFocus />
                    <button type="submit" disabled={guardando || codigo.length < 6}>Activar</button>
                    <button type="button" className="secundario" onClick={() => { setEnrol(null); setCodigo(""); }}>Cancelar</button>
                  </div>
                </form>
              </>
            ) : dosFa ? (
              <>
                <p><span className="badge-activo">Activado</span> Tu cuenta usa verificación en dos pasos.</p>
                <button className="cad-pill cad-pill-btn act-cancelar" onClick={desactivar2fa} disabled={guardando}>Desactivar 2FA</button>
              </>
            ) : (
              <>
                <p><span className="badge-cancelado">Desactivado</span> Agrega un segundo factor con tu app de autenticación.</p>
                <button onClick={activar2fa} disabled={guardando}>{guardando ? "Generando…" : "Activar 2FA"}</button>
              </>
            )}
          </div>

          {msg && <p style={{ color: "#0a7c2f" }}>{msg}</p>}
          {error && <p style={{ color: "#b00020" }}>{error}</p>}
        </>
      )}
    </main>
  );
}
