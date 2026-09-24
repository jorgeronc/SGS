"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { GRUPOS } from "@/app/components/AppShell";

// Matriz rol → módulos (0131). El admin define qué módulos ve/usa cada rol; el
// AppShell filtra el menú y bloquea las rutas según esta matriz. modulos = null →
// "sin restricción" (ve todo). Enforcement de datos (RLS) es fase posterior.
interface RolCat { clave: string; nombre: string; modulos: string[] | null; es_sistema: boolean }

// Módulos = ítems del menú (menos Inicio, que siempre está permitido).
const MODULOS = GRUPOS.map((g) => ({ grupo: g.grupo, items: g.items.filter((it) => it.href !== "/") }));

export default function RolesPanel() {
  const [roles, setRoles] = useState<RolCat[]>([]);
  const [sel, setSel] = useState<string>("");
  const [sinRestriccion, setSinRestriccion] = useState(false);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [nClave, setNClave] = useState("");
  const [nNombre, setNNombre] = useState("");

  const todosHrefs = useMemo(() => MODULOS.flatMap((g) => g.items.map((it) => it.href)), []);

  async function cargar() {
    const { data, error } = await supabase.from("roles").select("clave, nombre, modulos, es_sistema").eq("activo", true).order("nombre");
    if (error) { setError(error.message); return; }
    setRoles((data as any[]) ?? []);
  }
  useEffect(() => { cargar(); }, []);

  function elegir(clave: string) {
    setSel(clave); setError(null); setMsg(null);
    const r = roles.find((x) => x.clave === clave);
    if (!r) return;
    if (r.modulos == null) { setSinRestriccion(true); setMarcados(new Set(todosHrefs)); }
    else { setSinRestriccion(false); setMarcados(new Set(r.modulos)); }
  }

  function toggle(href: string) {
    setMarcados((s) => { const n = new Set(s); n.has(href) ? n.delete(href) : n.add(href); return n; });
  }

  async function guardar() {
    if (!sel) return;
    setError(null); setMsg(null);
    const modulos = sinRestriccion ? null : Array.from(marcados);
    const { error } = await supabase.rpc("rpc_set_rol_modulos", { p_clave: sel, p_modulos: modulos });
    if (error) { setError(error.message); return; }
    setMsg("Módulos del rol guardados. Los usuarios verán el cambio al recargar.");
    cargar();
  }

  async function crearRol(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setMsg(null);
    if (!nClave.trim()) { setError("Indica la clave del rol."); return; }
    const { error } = await supabase.rpc("rpc_crear_rol", { p_clave: nClave.trim(), p_nombre: nNombre.trim() });
    if (error) { setError(error.message); return; }
    setNClave(""); setNNombre(""); setMsg("Rol creado. Ya puedes asignarle módulos y usarlo en Usuarios.");
    cargar();
  }

  const rSel = roles.find((x) => x.clave === sel);
  const esAdmin = sel === "administrador";

  return (
    <>
      <p style={{ fontSize: 13, color: "#555" }}>
        Define qué <b>módulos</b> ve y usa cada <b>rol</b>. El menú y el acceso a cada pantalla se filtran por esto.
        El rol <code>administrador</code> siempre ve todo. Solo administrador.
      </p>

      <form onSubmit={crearRol} className="sc-subcard" style={{ maxWidth: 620 }}>
        <div className="dash-eyebrow">Crear rol nuevo</div>
        <div className="form-fila">
          <input placeholder="Clave (ej. credencialista)" value={nClave} onChange={(e) => setNClave(e.target.value)} />
          <input placeholder="Nombre visible (ej. Credencialista)" value={nNombre} onChange={(e) => setNNombre(e.target.value)} style={{ flex: 2 }} />
          <button type="submit">Crear rol</button>
        </div>
        <p style={{ fontSize: 12, color: "#777", marginTop: 4 }}>La clave se normaliza a minúsculas/guion bajo. Luego asígnale módulos abajo y úsalo en “Usuarios y roles”.</p>
      </form>

      {error && <p style={{ color: "#b00020" }}>{error}</p>}
      {msg && <p style={{ color: "#0a7c2f" }}>{msg}</p>}

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 12 }}>
        <div style={{ minWidth: 220 }}>
          <div className="dash-eyebrow">Roles</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {roles.map((r) => (
              <button key={r.clave} onClick={() => elegir(r.clave)}
                style={{ textAlign: "left", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--sc-card-line, #e2e6ec)", background: sel === r.clave ? "var(--sc-btn-soft,#f6ede1)" : "transparent", cursor: "pointer", fontWeight: sel === r.clave ? 700 : 400 }}>
                {r.nombre} <span style={{ color: "#888", fontSize: 12 }}>· {r.modulos == null ? "todo" : `${r.modulos.length} mód.`}</span>
              </button>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 300 }}>
          {!sel ? (
            <p className="dash-sub">Elige un rol para configurar sus módulos.</p>
          ) : esAdmin ? (
            <p className="dash-sub">El rol <b>administrador</b> tiene acceso a todo y no se restringe.</p>
          ) : (
            <>
              <div className="dash-eyebrow">Módulos de “{rSel?.nombre}”</div>
              <label style={{ display: "flex", alignItems: "center", gap: 8, margin: "6px 0 10px", fontSize: 14 }}>
                <input type="checkbox" checked={sinRestriccion} onChange={(e) => { setSinRestriccion(e.target.checked); if (e.target.checked) setMarcados(new Set(todosHrefs)); }} />
                Sin restricción (ve todos los módulos)
              </label>
              {!sinRestriccion && MODULOS.map((g) => (
                <div key={g.grupo} style={{ marginBottom: 10 }}>
                  <div style={{ fontWeight: 800, fontSize: 13, color: "var(--sc-text)", margin: "6px 0 4px" }}>{g.grupo}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 6 }}>
                    {g.items.map((it) => (
                      <label key={it.href} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, cursor: "pointer" }}>
                        <input type="checkbox" checked={marcados.has(it.href)} onChange={() => toggle(it.href)} />
                        <span>{it.ico} {it.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              <div style={{ marginTop: 10 }}>
                <button onClick={guardar} style={{ background: "var(--sc-btn,#f4a03f)", color: "#fff", border: "none", borderRadius: 9, padding: "9px 16px", fontWeight: 700, cursor: "pointer" }}>Guardar módulos del rol</button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
