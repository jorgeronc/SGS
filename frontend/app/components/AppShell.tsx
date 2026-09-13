"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";

const PUBLICAS = ["/", "/login"];
// Rutas que se muestran a pantalla completa, sin el shell (menú/topbar), para
// abrirlas en una pestaña/monitor aparte (p. ej. el mapa de despacho).
const LIMPIAS: string[] = ["/monitoreo", "/cad/mapa"];
// El 2FA se resuelve completo en /login (código o registro). El resto de rutas
// exige nivel aal2; si no, se manda a /login (que retoma el segundo factor).
const SIN_2FA = ["/login"];
// Rutas con topbar de "consola": muestran título + fecha/hora (sin el buscador
// global ni los accesos rápidos, porque la consola tiene los suyos).
const TITULOS_TOP: Record<string, string> = {
  "/cad": "Central de Despacho — Incidentes",
  "/vista-operativa": "Vista Operativa — Seguridad Logística",
};

// Módulos que NO se pueden ocultar (para no dejar al usuario sin forma de volver a
// mostrar los demás): inicio y la propia Configuración.
export const SIEMPRE_VISIBLE = ["/", "/configuracion", "/admin"];

export const GRUPOS: { grupo: string; items: { href: string; label: string; ico: string; nueva?: boolean }[] }[] = [
  {
    grupo: "Panel de Información",
    items: [
      { href: "/", label: "Panel Operativo", ico: "📊" },
      { href: "/copiloto", label: "Copiloto IA", ico: "🤖" },
    ],
  },
  {
    grupo: "Central de Operaciones",
    items: [
      { href: "/cad", label: "Central / Despacho", ico: "🎧" },
      { href: "/mapa-operacional", label: "Mapa Operativo", ico: "🗺" },
      { href: "/videovigilancia", label: "Videovigilancia", ico: "📹" },
      { href: "/chat", label: "Chats", ico: "💬" },
      { href: "/directorio", label: "Directorio de autoridades", ico: "📇" },
      { href: "/evidencias", label: "Evidencias", ico: "📎" },
      { href: "/alertas", label: "Alerta general", ico: "🚨" },
    ],
  },
  {
    grupo: "Vigilancia en sitio",
    items: [
      { href: "/sitios", label: "Sitios", ico: "📍" },
      { href: "/puntos-control", label: "Puntos de control", ico: "🚩" },
      { href: "/rondines/programados", label: "Programar rondín", ico: "🗓" },
      { href: "/tareas", label: "Tareas", ico: "✔" },
      { href: "/rondines", label: "Bitácora de seguridad", ico: "🔁" },
      { href: "/supervision", label: "Supervisión rondines", ico: "🛰" },
      { href: "/turnos", label: "Rol de turnos", ico: "🗂" },
    ],
  },
  {
    grupo: "Control de Acceso",
    items: [
      { href: "/accesos", label: "Bitácora de accesos", ico: "🚧" },
      { href: "/citas", label: "Citas", ico: "📅" },
      { href: "/credenciales", label: "Credenciales", ico: "🎫" },
      { href: "/transportistas", label: "Proveedores", ico: "🚚" },
      { href: "/zonas", label: "Zonas de control", ico: "🚷" },
    ],
  },
  {
    grupo: "Seguridad logística",
    items: [
      { href: "/vista-operativa", label: "Vista operativa", ico: "🧭" },
      { href: "/logistica/inspecciones", label: "Inspecciones", ico: "🔎" },
      { href: "/logistica/movimientos", label: "Transportación", ico: "🚛" },
      { href: "/logistica/activos", label: "Activos de transporte", ico: "🚆" },
      { href: "/logistica/unidades-carga", label: "Unidades de carga", ico: "📦" },
      { href: "/logistica/sellos", label: "Sellos", ico: "🔒" },
    ],
  },
  {
    grupo: "Administración",
    items: [
      { href: "/clientes", label: "Clientes", ico: "🏢" },
      { href: "/sla", label: "Metas de SLA", ico: "🎯" },
      { href: "/personal", label: "Guardias", ico: "★" },
      { href: "/patrullas", label: "Unidades", ico: "▣" },
      { href: "/armamento", label: "Armamento", ico: "⚔" },
      { href: "/comunicacion", label: "Comunicación", ico: "📻" },
      { href: "/bodycams", label: "Smartphones", ico: "📱" },
      { href: "/otros", label: "Otros equipos", ico: "🧰" },
      { href: "/bitacora", label: "Auditoría", ico: "📋" },
    ],
  },
  {
    grupo: "Reportes",
    items: [
      { href: "/reporte-horas", label: "Horas trabajadas", ico: "⏱" },
      { href: "/reporte-sla", label: "Reporte mensual", ico: "📄" },
    ],
  },
  {
    grupo: "Configuración",
    items: [
      { href: "/admin", label: "Gestión del sistema", ico: "🛠" },
      { href: "/configuracion", label: "Parámetros", ico: "⚙" },
      { href: "/configuracion", label: "Mi empresa", ico: "🏛" },
      { href: "/configuracion", label: "Versión del sistema", ico: "ℹ" },
    ],
  },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [cargando, setCargando] = useState(true);
  const [colapsado, setColapsado] = useState(false);
  const [q, setQ] = useState("");
  const [chatNuevos, setChatNuevos] = useState(0);
  const [ahora, setAhora] = useState<Date | null>(null);
  const [oculto, setOculto] = useState<string[]>([]); // módulos que el usuario ocultó (por cuenta)
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => { const t = setInterval(() => setAhora(new Date()), 1000); setAhora(new Date()); return () => clearInterval(t); }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setCargando(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  // Preferencia de módulos ocultos (por cuenta). Se relee al navegar para reflejar
  // cambios guardados en Configuración sin recargar toda la app.
  useEffect(() => {
    if (!session) { setOculto([]); return; }
    supabase.from("usuarios_perfil").select("menu_oculto").eq("id", session.user.id).maybeSingle()
      .then(({ data }) => setOculto(Array.isArray((data as any)?.menu_oculto) ? (data as any).menu_oculto : []));
  }, [session, pathname]);

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
  const tituloTop = TITULOS_TOP[pathname] ?? (pathname.startsWith("/cad/") ? "Central de Despacho — Detalle de incidente" : undefined);
  // Ítem activo = el href que es el PREFIJO MÁS LARGO de la ruta (así /rondines/sesiones
  // no marca también /rondines).
  const activoHref = GRUPOS.flatMap((g) => g.items.filter((it) => !it.nueva).map((it) => it.href))
    .filter((h) => pathname === h || pathname.startsWith(h + "/"))
    .sort((a, b) => b.length - a.length)[0] ?? null;

  // Menú según la preferencia del usuario: oculta los módulos elegidos (salvo los
  // SIEMPRE_VISIBLE) y descarta los grupos que queden vacíos.
  const gruposVisibles = GRUPOS
    .map((g) => ({ ...g, items: g.items.filter((it) => SIEMPRE_VISIBLE.includes(it.href) || !oculto.includes(it.href)) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className={`shell${colapsado ? " collapsed" : ""}`}>
      <aside className="shell-side">
        <Link href="/" className="shell-brand">
          <img src="/escudo.png" alt="Logo" className="brand-escudo" />
          <span className="brand-name">Sistema de<br />Gestión de<br />Seguridad</span>
        </Link>
        <nav className="shell-nav">
          {gruposVisibles.map((g) => (
            <div key={g.grupo}>
              <div className="shell-group">{g.grupo}</div>
              {g.items.map((it) => (
                <Link
                  key={`${g.grupo}-${it.label}`}
                  href={it.href}
                  className={!it.nueva && it.href === activoHref ? "on" : ""}
                  target={it.nueva ? "_blank" : undefined}
                  rel={it.nueva ? "noopener noreferrer" : undefined}
                >
                  <span className="ico">{it.ico}</span>
                  <span>{it.label}</span>
                  {it.nueva && <span style={{ marginLeft: "auto", opacity: 0.6, fontSize: 12 }}>↗</span>}
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
          {tituloTop ? (
            <>
              <div style={{ fontWeight: 800, fontSize: 16 }}>{tituloTop}</div>
              <div style={{ marginLeft: "auto", textAlign: "right", fontVariantNumeric: "tabular-nums", lineHeight: 1.15 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{ahora ? ahora.toLocaleTimeString() : "—"}</div>
                <div style={{ fontSize: 11.5, opacity: 0.7 }}>{ahora ? ahora.toLocaleDateString("es-MX", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }) : ""}</div>
              </div>
              <div className="shell-user" style={{ marginLeft: 18 }}>
                <Link href="/perfil" className="shell-avatar" title="Mi cuenta · opciones">{iniciales}</Link>
                <button className="shell-salir" onClick={salir}>Salir</button>
              </div>
            </>
          ) : (
            <>
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
            </>
          )}
        </header>

        <main className="shell-content">{children}</main>
      </div>
    </div>
  );
}
