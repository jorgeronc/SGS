"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { GRUPOS, SIEMPRE_VISIBLE } from "@/app/components/AppShell";

// Personalización del menú lateral POR CUENTA: el usuario elige qué módulos ver.
// Guarda los ocultos con rpc_set_menu_oculto (0108); AppShell filtra al render.
export default function PersonalizarMenu() {
  const [oculto, setOculto] = useState<string[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (u.user) {
        const { data } = await supabase.from("usuarios_perfil").select("menu_oculto").eq("id", u.user.id).maybeSingle();
        setOculto(Array.isArray((data as any)?.menu_oculto) ? (data as any).menu_oculto : []);
      }
      setCargando(false);
    })();
  }, []);

  // Módulos ocultables: excluye los SIEMPRE_VISIBLE y de-duplica por href.
  const grupos = useMemo(() => GRUPOS.map((g) => ({
    grupo: g.grupo,
    items: g.items
      .filter((it) => !SIEMPRE_VISIBLE.includes(it.href))
      .filter((it, i, arr) => arr.findIndex((x) => x.href === it.href) === i),
  })).filter((g) => g.items.length > 0), []);

  const visible = (href: string) => !oculto.includes(href);
  const toggle = (href: string) => setOculto((p) => (p.includes(href) ? p.filter((x) => x !== href) : [...p, href]));

  async function guardar() {
    setGuardando(true); setMsg(null);
    const { error } = await supabase.rpc("rpc_set_menu_oculto", { p_oculto: oculto });
    setGuardando(false);
    if (error) { setMsg("No se pudo guardar: " + error.message); return; }
    setMsg("Guardado. Actualizando menú…");
    setTimeout(() => window.location.reload(), 500);
  }

  if (cargando) return <p className="dash-sub">Cargando…</p>;

  return (
    <div>
      <p className="dash-sub" style={{ marginBottom: 10 }}>
        Elige qué módulos ver en tu menú lateral. Es una preferencia de <b>tu cuenta</b> (te sigue en cualquier dispositivo).
        Desmarca para ocultar; los módulos ocultos siguen accesibles por su dirección. Inicio y Configuración no se pueden ocultar.
      </p>
      {grupos.map((g) => (
        <div key={g.grupo} style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 800, color: "var(--sc-text)", margin: "8px 0 4px" }}>{g.grupo}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 6 }}>
            {g.items.map((it) => (
              <label key={it.href} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, cursor: "pointer" }}>
                <input type="checkbox" checked={visible(it.href)} onChange={() => toggle(it.href)} />
                <span>{it.ico} {it.label}</span>
              </label>
            ))}
          </div>
        </div>
      ))}
      <div style={{ marginTop: 12 }}>
        <button onClick={guardar} disabled={guardando}
          style={{ background: "var(--sc-btn,#f4a03f)", color: "#fff", border: "none", borderRadius: 9, padding: "9px 16px", fontWeight: 700, cursor: "pointer" }}>
          {guardando ? "Guardando…" : "Guardar menú"}
        </button>
        {msg && <span className="dash-sub" style={{ marginLeft: 10 }}>{msg}</span>}
      </div>
    </div>
  );
}
