"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";

// Rutas accesibles sin sesión.
const PUBLICAS = ["/", "/login"];

export default function Header() {
  const [session, setSession] = useState<Session | null>(null);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const pathname = usePathname();
  const router = useRouter();

  function buscar(e: React.FormEvent) {
    e.preventDefault();
    const q = busqueda.trim();
    if (q.length < 2) return;
    router.push(`/buscar?q=${encodeURIComponent(q)}`);
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setCargando(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_evento, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  // Guard de acceso: sin sesión, cualquier ruta de módulo redirige al login.
  useEffect(() => {
    if (!cargando && !session && !PUBLICAS.includes(pathname)) {
      router.replace("/login");
    }
  }, [cargando, session, pathname, router]);

  async function salir() {
    await supabase.auth.signOut();
    router.replace("/");
  }

  return (
    <header className="barra">
      <div className="barra-top">
        <h1>
          <Link href="/">Sistema de Gestión de Seguridad</Link>
        </h1>
        <img src="/escudo.png" alt="Logo SGS" className="escudo-header" />
      </div>

      {session && (
        <nav className="nav">
          <form className="buscador" onSubmit={buscar}>
            <input
              type="search"
              placeholder="Buscar personas, placas, folios…"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </form>
          <Link href="/cad">CAD</Link>
          <Link href="/incidentes">Incidentes</Link>
          <Link href="/casos">Casos</Link>
          <Link href="/ordenes">Citatorios/Órdenes</Link>
          <Link href="/evidencias">Evidencias</Link>
          <Link href="/barandilla">Barandilla</Link>
          <Link href="/personas">Personas</Link>
          <Link href="/vehiculos">Vehículos</Link>
          <Link href="/ubicaciones">Ubicaciones</Link>
          <Link href="/personal">Personal</Link>
          <Link href="/equipo">Equipo</Link>
          <Link href="/asuntos-internos">Asuntos Internos</Link>
          <Link href="/bitacora">Bitácora</Link>
          <Link href="/admin">Administración</Link>
          <button className="salir" onClick={salir}>
            Salir
          </button>
        </nav>
      )}
    </header>
  );
}
