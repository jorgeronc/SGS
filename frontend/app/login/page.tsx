"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Fase = "cred" | "code" | "enroll";
interface Enrol { factorId: string; qr: string; secret: string; }

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [fase, setFase] = useState<Fase>("cred");
  const [factorId, setFactorId] = useState("");
  const [enrol, setEnrol] = useState<Enrol | null>(null);
  const [codigo, setCodigo] = useState("");

  // Si ya hay una sesión (aal1) que aterrizó en /login, retomar el 2FA sin pedir
  // usuario/contraseña de nuevo. Si ya está en aal2, entrar.
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal?.currentLevel === "aal2") { router.replace("/"); return; }
      await continuarTras2FA();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tras validar contraseña (o al retomar sesión): si hay factor verificado se
  // pide el código; si no, se inicia el registro (2FA obligatorio, 1ª vez).
  async function continuarTras2FA() {
    const { data: factors } = await supabase.auth.mfa.listFactors();
    const totp = factors?.totp?.[0];
    if (totp) {
      setFactorId(totp.id);
      setFase("code");
      return;
    }
    await iniciarRegistro();
  }

  async function iniciarRegistro() {
    setError(null);
    // Limpia factores TOTP sin verificar de intentos previos.
    const { data: f } = await supabase.auth.mfa.listFactors();
    for (const x of (f?.all ?? []).filter((a) => a.factor_type === "totp" && a.status !== "verified")) {
      await supabase.auth.mfa.unenroll({ factorId: x.id });
    }
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `SCP ${Date.now()}` });
    if (error || !data) { setError(error?.message ?? "No se pudo iniciar el registro 2FA."); return; }
    setEnrol({ factorId: data.id, qr: (data as any).totp.qr_code, secret: (data as any).totp.secret });
    setFase("enroll");
  }

  async function iniciarSesion(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCargando(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setError(error.message); setCargando(false); return; }
    await continuarTras2FA();
    setCargando(false);
  }

  async function verificar(e: React.FormEvent, fId: string) {
    e.preventDefault();
    setError(null);
    setCargando(true);
    const { data: ch, error: e1 } = await supabase.auth.mfa.challenge({ factorId: fId });
    if (e1 || !ch) { setError(e1?.message ?? "No se pudo iniciar el desafío 2FA."); setCargando(false); return; }
    const { error: e2 } = await supabase.auth.mfa.verify({ factorId: fId, challengeId: ch.id, code: codigo.trim() });
    setCargando(false);
    if (e2) { setError("Código incorrecto o expirado. Intenta de nuevo."); return; }
    router.push("/");
  }

  async function cancelar() {
    await supabase.auth.signOut();
    setFase("cred"); setCodigo(""); setFactorId(""); setEnrol(null); setError(null);
  }

  return (
    <main className="contenedor acceso">
      <img src="/escudo.png" alt="Escudo de la policía" className="escudo-acceso" />
      <h1 className="bienvenida-titulo">Bienvenido al Sistema Central Policial</h1>
      <p className="bienvenida-secretaria">Secretaría de Seguridad Metropolitana</p>

      {fase === "cred" && (
        <>
          <h2>Iniciar sesión</h2>
          <form onSubmit={iniciarSesion}>
            <div className="form-fila">
              <input type="email" placeholder="Correo" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
              <input type="password" placeholder="Contraseña" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              <button type="submit" disabled={cargando}>{cargando ? "Validando..." : "Entrar"}</button>
            </div>
          </form>
        </>
      )}

      {fase === "code" && (
        <>
          <h2>Verificación en dos pasos</h2>
          <p style={{ fontSize: 13, color: "#555" }}>Ingresa el código de 6 dígitos de tu app de autenticación.</p>
          <form onSubmit={(e) => verificar(e, factorId)}>
            <div className="form-fila">
              <input type="text" inputMode="numeric" autoComplete="one-time-code" placeholder="Código 2FA" value={codigo}
                     onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))} required autoFocus />
              <button type="submit" disabled={cargando || codigo.length < 6}>{cargando ? "Verificando..." : "Verificar"}</button>
              <button type="button" className="secundario" onClick={cancelar} disabled={cargando}>Cancelar</button>
            </div>
          </form>
        </>
      )}

      {fase === "enroll" && enrol && (
        <>
          <h2>Activa la verificación en dos pasos</h2>
          <p style={{ fontSize: 13, color: "#555" }}>
            Es obligatoria. Escanea el código QR con tu app de autenticación (Google Authenticator, Authy…) y confirma con el código.
          </p>
          <div style={{ background: "#fff", padding: 12, borderRadius: 8, display: "inline-block" }}
               dangerouslySetInnerHTML={{ __html: enrol.qr.startsWith("<svg") ? enrol.qr : `<img src="${enrol.qr}" alt="QR 2FA" />` }} />
          <p style={{ fontSize: 12, color: "#667", marginTop: 8 }}>¿No puedes escanear? Clave manual:</p>
          <code style={{ userSelect: "all", fontSize: 13, wordBreak: "break-all" }}>{enrol.secret}</code>
          <form onSubmit={(e) => verificar(e, enrol.factorId)} style={{ marginTop: 12 }}>
            <div className="form-fila">
              <input type="text" inputMode="numeric" autoComplete="one-time-code" placeholder="Código de 6 dígitos" value={codigo}
                     onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))} required autoFocus />
              <button type="submit" disabled={cargando || codigo.length < 6}>{cargando ? "Activando..." : "Activar y entrar"}</button>
              <button type="button" className="secundario" onClick={cancelar} disabled={cargando}>Cancelar</button>
            </div>
          </form>
        </>
      )}

      {error && <p style={{ color: "#b00020" }}>{error}</p>}
    </main>
  );
}
