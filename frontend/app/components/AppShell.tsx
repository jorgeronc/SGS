"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";

const PUBLICAS = ["/", "/login"];
// Rutas que se muestran a pantalla completa, sin el shell (menú/topbar), para
// abrirlas en una pestaña/monitor aparte (p. ej. el mapa de despacho).
const LIMPIAS: string[] = [];
// El 2FA se resuelve completo en /login (código o registro). El resto de rutas
// exige nivel aal2; si no, se manda a /login (que retoma el segundo factor).
const SIN_2FA = ["/login"];

const GRUPOS: { grupo: string; items: { href: string; label: string; ico: string }[] }[] = [
  {
    grupo: "Operaciones",
    items: [
      { href: "/tareas", label: "Tareas", ico: "✔" },
      { href: "/chat", label: "Chat", ico: "💬" },
    ],
  },
  {
    grupo: "Registros Maestros",
    items: [
      { href: "/personas", label: "Personas", ico: "☷" },
      { href: "/vehiculos", label: "Vehículos", ico: "▣" },
      { href: "/ubicaciones", label: "Sitios / Ubicaciones", ico: "◉" },
    ],
  },
  {
    grupo: "Bienes",
    items: [
      { href: "/evidencias", label: "Evidencias", ico: "◧" },
      { href: "/patrullas", label: "Unidades", ico: "▣" },
      { href: "/armamento", label: "Armamento", ico: "⚔" },
      { href: "/comunicacion", label: "Comunicación", ico: "📻" },
      { href: "/bodycams", label: "Bodycams", ico: "◉" },
      { href: "/otros", label: "Otros equipos", ico: "▨" },
    ],
  },
  {
    grupo: "Gestión",
    items: [
      { href: "/personal", label: "Guardias", ico: "★" },
      { href: "/kardex", label: "Kardex", ico: "▤" },
      { href: "/rol-servicio", label: "Rol de Turnos", ico: "▦" },
      { href: "/bitacora", label: "Bitácora", ico: "▥" },
      { href: "/admin", label: "Administración", ico: "⚙" },
      { href: "/configuracion", label: "Parámetros del sistema", ico: "❖" },
    ],
  },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [cargando, setCargando] = useState(true);
  const [colapsado, setColapsado] = useState(false);
  const [q, setQ] = useState("");
  const [chatNuevos, setChatNuevos] = useState(0);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setCargando(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!cargando && !session && !PUBLICAS.includes(pathname)) {
      router.replace("/login");
    }
  }, [cargando, session, pathname, router]);

  // Segundo factor OBLIGATORIO. Si hay sesión pero aún no se completó el 2FA
  // (nivel aal1), se envía a /login SIN cerrar sesión; ahí se retoma el paso del
  // código (o el registro la primera vez). En aal2, acceso normal.
  useEffect(() => {
    if (cargando || !session || SIN_2FA.includes(pathname)) return;
    let cancelado = false;
    supabase.auth.mfa.getAuthenticatorAssuranceLevel().then(({ data }) => {
      if (cancelado || !data) return;
      if (data.currentLevel === "aal1") {
        router.replace("/login");
      }
    });
    return () => { cancelado = true; };
  }, [cargando, session, pathname, router]);

  // Contador global de mensajes de chat no leídos, para avisar aunque el módulo
  // de chat no esté en primer plano. Se muestra solo fuera de /chat (dentro, el
  // propio módulo lleva los contadores por canal).
  useEffect(() => {
    if (!session) { setChatNuevos(0); return; }
    const uid = session.user.id;
    const refrescar = async () => {
      const { data } = await supabase.rpc("rpc_chat_no_leidos");
      setChatNuevos(((data as { n: number }[]) ?? []).reduce((a, r) => a + (r.n || 0), 0));
    };
    refrescar();
    const ch = supabase
      .channel("shell:chat")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_mensajes" }, (payload) => {
        if ((payload.new as { usuario_id?: string }).usuario_id !== uid) refrescar();
      })
      .subscribe();
    const onFocus = () => refrescar();
    window.addEventListener("focus", onFocus);
    return () => { supabase.removeChannel(ch); window.removeEventListener("focus", onFocus); };
  }, [session]);

  // Al navegar (p. ej. salir de /chat tras leer) se recalcula el contador.
  useEffect(() => {
    if (!session) return;
    supabase.rpc("rpc_chat_no_leidos").then(({ data }) =>
      setChatNuevos(((data as { n: number }[]) ?? []).reduce((a, r) => a + (r.n || 0), 0))
    );
  }, [pathname, session]);

  function buscar(e: React.FormEvent) {
    e.preventDefault();
    const t = q.trim();
    if (t.length < 2) return;
    router.push(`/buscar?q=${encodeURIComponent(t)}`);
  }

  async function salir() {
    await supabase.auth.signOut();
    router.replace("/");
  }

  // Sin sesión (o pantallas públicas): render limpio, sin shell.
  if (!session) {
    return <>{children}</>;
  }

  // Rutas a pantalla completa (mapa de despacho, vistas de impresión de PDF).
  if (LIMPIAS.includes(pathname) || pathname.endsWith("/imprimir")) {
    return <>{children}</>;
  }

  const correo = session.user?.email ?? "";
  const iniciales = correo.slice(0, 2).toUpperCase();

  return (
    <div className={`shell${colapsado ? " collapsed" : ""}`}>
      <aside className="shell-side">
        <Link href="/" className="shell-brand">
          <b className="brand-name">Sistema de Gestión de Seguridad</b>
          <span className="brand-row">
            <img src="/escudo.png" alt="Logo" className="brand-escudo" />
            <span className="brand-sub">Seguridad Privada</span>
          </span>
        </Link>
        <nav className="shell-nav">
          <Link href="/" className={pathname === "/" ? "on" : ""}>
            <span className="ico">◫</span>
            <span>Dashboard</span>
          </Link>
          <Link href="/copiloto" className={pathname.startsWith("/copiloto") ? "on" : ""}>
            <span className="ico">🔎</span>
            <span>Copiloto IA</span>
          </Link>
          {GRUPOS.map((g) => (
            <div key={g.grupo}>
              <div className="shell-group">{g.grupo}</div>
              {g.items.map((it) => (
                <Link key={it.href} href={it.href} className={pathname.startsWith(it.href) ? "on" : ""}>
                  <span className="ico">{it.ico}</span>
                  <span>{it.label}</span>
                  {it.href === "/chat" && !pathname.startsWith("/chat") && chatNuevos > 0 && (
                    <span style={{ marginLeft: "auto", background: "#e11d48", color: "#fff", fontSize: 11, fontWeight: 800, borderRadius: 999, padding: "0 7px" }}>{chatNuevos}</span>
                  )}
                </Link>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      <div className="shell-main">
        <header className="shell-top">
          <button className="shell-hamb" onClick={() => setColapsado((c) => !c)} title="Contraer menú">
            ☰
          </button>
          <form className="shell-search" onSubmit={buscar}>
            <span className="mag">⌕</span>
            <input
              type="search"
              placeholder="Buscar persona, CURP, alias, placas, folio, dirección…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </form>
          <div className="shell-quick">
            <Link href="/personas" className="qbtn2 primary">+ Persona</Link>
            <Link href="/evidencias" className="qbtn2">+ Evidencia</Link>
            <Link href="/tareas" className="qbtn2">+ Tarea</Link>
          </div>
          <div className="shell-user">
            <Link href="/perfil" className="shell-avatar" title="Mi cuenta · opciones">{iniciales}</Link>
            <button className="shell-salir" onClick={salir}>Salir</button>
          </div>
        </header>

        <main className="shell-content">{children}</main>
      </div>
    </div>
  );
}
