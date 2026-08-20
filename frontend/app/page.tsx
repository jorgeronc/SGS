"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import Bienvenida from "./components/Bienvenida";
import Panel from "./components/Panel";

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setCargando(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_evento, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (cargando) {
    return (
      <main className="contenedor">
        <p>Cargando...</p>
      </main>
    );
  }

  // Sin sesión: pantalla de bienvenida con el escudo. Los módulos no aparecen.
  if (!session) {
    return <Bienvenida mostrarLogin />;
  }

  // Con sesión: panel de inicio con métricas y actividad reciente.
  return <Panel correo={session.user?.email} />;
}
