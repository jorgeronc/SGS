"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { colorUsuario, fondoUsuario } from "@/lib/chatColor";

// Módulo de Comunicación (Chat). El central (web) crea y gestiona canales; el
// oficial (móvil) participa. INSERT = fuente de verdad; Realtime solo difunde.
// Cada pestaña de canal es uniforme (azul celeste, texto negro) con contador de
// no leídos; los canales cerrados se ocultan de la vista principal (pestaña
// aparte). Ver migraciones 0046/0048_chat.

interface Canal {
  id: string;
  nombre: string;
  tema: string | null;
  estado: "abierto" | "cerrado";
  actualizado_en: string;
}
interface Mensaje {
  id: string;
  canal_id: string;
  usuario_id: string | null;
  tipo: "texto" | "foto" | "archivo" | "sistema";
  cuerpo: string | null;
  adjunto_url: string | null;
  creado_en: string;
}
interface Miembro { usuario_id: string; es_admin: boolean; nombre: string | null }
interface DirUsuario { id: string; nombre: string | null; rol: string }

const BUCKET = "chat";
const AZUL_TAB = "#dbeffb";        // azul celeste de las pestañas
const AZUL_TAB_SEL = "#bfe4fa";    // pestaña seleccionada

// Sello de tiempo: hoy → hora; ayer → "ayer HH:MM"; más antiguo → "12 ago 14:03 · hace N días".
function selloTiempo(iso: string): string {
  const d = new Date(iso);
  const hora = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const soloDia = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dias = Math.round((soloDia(new Date()) - soloDia(d)) / 86400000);
  if (dias <= 0) return hora;
  if (dias === 1) return `ayer ${hora}`;
  const fecha = d.toLocaleDateString([], { day: "2-digit", month: "short" });
  return `${fecha} ${hora} · hace ${dias} días`;
}

export default function ChatPage() {
  const [yo, setYo] = useState<string | null>(null);
  const [canales, setCanales] = useState<Canal[]>([]);
  const [adminDe, setAdminDe] = useState<Set<string>>(new Set());
  const [sel, setSel] = useState<string | null>(null);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [miembros, setMiembros] = useState<Miembro[]>([]);
  const [noLeidos, setNoLeidos] = useState<Record<string, number>>({});
  const [verCerrados, setVerCerrados] = useState(false);
  const [texto, setTexto] = useState("");
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [urlsFirmadas, setUrlsFirmadas] = useState<Record<string, string>>({});

  const finRef = useRef<HTMLDivElement | null>(null);
  const nombrePorId = useRef<Record<string, string>>({});
  const selRef = useRef<string | null>(null);
  const yoRef = useRef<string | null>(null);
  useEffect(() => { selRef.current = sel; }, [sel]);
  useEffect(() => { yoRef.current = yo; }, [yo]);

  // --- Carga de canales (RLS deja ver solo los míos) ---
  const cargarNoLeidos = useCallback(async () => {
    const { data } = await supabase.rpc("rpc_chat_no_leidos");
    const map: Record<string, number> = {};
    ((data as { canal_id: string; n: number }[]) ?? []).forEach((r) => { map[r.canal_id] = r.n; });
    setNoLeidos(map);
  }, []);

  const cargarCanales = useCallback(async () => {
    const { data } = await supabase
      .from("chat_canales")
      .select("id, nombre, tema, estado, actualizado_en")
      .order("actualizado_en", { ascending: false });
    setCanales((data as Canal[]) ?? []);
    const { data: mis } = await supabase.from("chat_miembros").select("canal_id, es_admin");
    const admin = new Set<string>();
    ((mis as any[]) ?? []).forEach((m) => { if (m.es_admin) admin.add(m.canal_id); });
    setAdminDe(admin);
    cargarNoLeidos();
  }, [cargarNoLeidos]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setYo(data.user?.id ?? null));
    cargarCanales();
  }, [cargarCanales]);

  // --- Al abrir un canal: miembros + historial + marcar leído ---
  const cargarCanal = useCallback(async (canalId: string) => {
    setError(null);
    const { data: mem } = await supabase
      .from("chat_miembros")
      .select("usuario_id, es_admin, perfil:usuarios_perfil(nombre)")
      .eq("canal_id", canalId);
    const miem: Miembro[] = ((mem as any[]) ?? []).map((m) => ({
      usuario_id: m.usuario_id, es_admin: m.es_admin, nombre: m.perfil?.nombre ?? null,
    }));
    setMiembros(miem);
    miem.forEach((m) => { if (m.nombre) nombrePorId.current[m.usuario_id] = m.nombre; });

    const { data: msg } = await supabase
      .from("chat_mensajes")
      .select("id, canal_id, usuario_id, tipo, cuerpo, adjunto_url, creado_en")
      .eq("canal_id", canalId)
      .order("creado_en", { ascending: true })
      .limit(200);
    setMensajes((msg as Mensaje[]) ?? []);
    // Al abrir/cargar el canal, márcalo leído. OJO: supabase.rpc es "lazy"; sin
    // await/.then() la petición NO se envía.
    await supabase.rpc("rpc_chat_marcar_leido", { p_canal: canalId });
  }, []);

  function abrir(canalId: string) {
    setSel(canalId);
    cargarCanal(canalId);
    setNoLeidos((p) => ({ ...p, [canalId]: 0 }));
  }

  // --- Realtime global: detecta mensajes en CUALQUIER canal mío ---
  useEffect(() => {
    const canal = supabase
      .channel("chat:global")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_mensajes" },
        (payload) => {
          const m = payload.new as Mensaje;
          if (m.canal_id === selRef.current) {
            setMensajes((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
            // Viéndolo en vivo → márcalo leído. `.then()` fuerza el envío (rpc es lazy).
            if (m.usuario_id !== yoRef.current) supabase.rpc("rpc_chat_marcar_leido", { p_canal: m.canal_id }).then(() => undefined);
          } else if (m.usuario_id !== yoRef.current && m.tipo !== "sistema") {
            setNoLeidos((prev) => ({ ...prev, [m.canal_id]: (prev[m.canal_id] ?? 0) + 1 }));
          }
          // Sube el canal al tope de la lista por actividad.
          setCanales((prev) => {
            const i = prev.findIndex((c) => c.id === m.canal_id);
            if (i < 0) return prev;
            const c = { ...prev[i], actualizado_en: m.creado_en };
            return [c, ...prev.filter((x) => x.id !== m.canal_id)];
          });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(canal); };
  }, []);

  // Auto-scroll al fondo cuando llegan mensajes.
  useEffect(() => { finRef.current?.scrollIntoView({ behavior: "smooth" }); }, [mensajes]);

  // Firmar URLs de adjuntos que aún no tenemos.
  useEffect(() => {
    const pend = mensajes.filter((m) => m.adjunto_url && !urlsFirmadas[m.adjunto_url]);
    if (pend.length === 0) return;
    (async () => {
      const nuevas: Record<string, string> = {};
      for (const m of pend) {
        const { data } = await supabase.storage.from(BUCKET).createSignedUrl(m.adjunto_url!, 3600);
        if (data?.signedUrl) nuevas[m.adjunto_url!] = data.signedUrl;
      }
      if (Object.keys(nuevas).length) setUrlsFirmadas((p) => ({ ...p, ...nuevas }));
    })();
  }, [mensajes, urlsFirmadas]);

  function nombreDe(id: string | null): string {
    if (!id) return "Sistema";
    return nombrePorId.current[id] ?? "Usuario";
  }

  const canalSel = canales.find((c) => c.id === sel) ?? null;
  const cerrado = canalSel?.estado === "cerrado";
  const lista = canales.filter((c) => (verCerrados ? c.estado === "cerrado" : c.estado === "abierto"));
  const nCerrados = canales.filter((c) => c.estado === "cerrado").length;

  async function enviar() {
    const t = texto.trim();
    if (!t || !sel || !yo || cerrado) return;
    setTexto("");
    const { error } = await supabase.from("chat_mensajes").insert({ canal_id: sel, usuario_id: yo, cuerpo: t });
    if (error) { setError(error.message); setTexto(t); }
  }

  async function adjuntar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !sel || !yo || cerrado) return;
    setSubiendo(true);
    setError(null);
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const ruta = `${sel}/${crypto.randomUUID()}.${ext}`;
    const { error: up } = await supabase.storage.from(BUCKET).upload(ruta, file, { contentType: file.type || undefined });
    if (up) { setError(up.message); setSubiendo(false); return; }
    const { error: ins } = await supabase.from("chat_mensajes").insert({ canal_id: sel, usuario_id: yo, adjunto_url: ruta });
    if (ins) setError(ins.message);
    setSubiendo(false);
  }

  async function alternarEstado() {
    if (!sel || !canalSel) return;
    const nuevo = canalSel.estado === "abierto" ? "cerrado" : "abierto";
    const { error } = await supabase.rpc("rpc_chat_estado_canal", { p_canal: sel, p_estado: nuevo });
    if (error) { setError(error.message); return; }
    setCanales((prev) => prev.map((c) => (c.id === sel ? { ...c, estado: nuevo } : c)));
    if (nuevo === "cerrado") setSel(null); // sale de la vista principal
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 120px)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>Comunicación</h2>
        <NuevoCanal onCreado={(id) => { cargarCanales(); abrir(id); }} />
      </div>

      <div style={{ display: "flex", gap: 14, flex: 1, minHeight: 0 }}>
        {/* Lista de canales */}
        <aside style={{ width: 290, flex: "0 0 auto", overflowY: "auto", borderRight: "1px solid var(--borde,#e3e6ea)", paddingRight: 10 }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
            <button className="qbtn2" onClick={() => { setVerCerrados(false); }} style={{ flex: 1, fontWeight: verCerrados ? 400 : 700, background: verCerrados ? undefined : AZUL_TAB_SEL }}>Activos</button>
            <button className="qbtn2" onClick={() => { setVerCerrados(true); }} style={{ flex: 1, fontWeight: verCerrados ? 700 : 400 }}>Cerrados{nCerrados ? ` (${nCerrados})` : ""}</button>
          </div>
          {lista.length === 0 && <p style={{ color: "#777", fontSize: 13 }}>{verCerrados ? "No hay canales cerrados." : "No perteneces a ningún canal activo."}</p>}
          {lista.map((c) => {
            const n = noLeidos[c.id] ?? 0;
            const activo = sel === c.id;
            return (
              <button
                key={c.id}
                onClick={() => abrir(c.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left",
                  padding: "10px 12px", marginBottom: 6, borderRadius: 10, cursor: "pointer",
                  border: activo ? "2px solid #38bdf8" : "1px solid #bcdcf0",
                  background: activo ? AZUL_TAB_SEL : AZUL_TAB, color: "#111",
                }}
              >
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>{c.nombre}</span>
                  {c.tema && <span style={{ fontWeight: 400, fontSize: 13, color: "#33475b" }}>{"  "}{c.tema}</span>}
                </span>
                {n > 0 && (
                  <span style={{ flex: "0 0 auto", background: "#e11d48", color: "#fff", fontSize: 11, fontWeight: 800, borderRadius: 999, padding: "1px 7px", minWidth: 18, textAlign: "center" }}>
                    {n}
                  </span>
                )}
              </button>
            );
          })}
        </aside>

        {/* Hilo del canal */}
        <section style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          {!canalSel ? (
            <div style={{ margin: "auto", color: "#888" }}>Elige un canal para ver la conversación.</div>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: 8, borderBottom: "1px solid var(--borde,#e3e6ea)" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 17, lineHeight: 1.25 }}>
                    <span style={{ fontWeight: 800 }}>{canalSel.nombre}</span>
                    {canalSel.tema && <span style={{ fontWeight: 400, color: "#555" }}>{"  "}{canalSel.tema}</span>}
                  </div>
                  <div style={{ fontSize: 12, color: "#777" }}>{miembros.length} integrante(s){cerrado ? " · cerrado" : ""}</div>
                </div>
                {adminDe.has(canalSel.id) && (
                  <div style={{ display: "flex", gap: 8, flex: "0 0 auto" }}>
                    <EditarCanal canal={canalSel} onHecho={(nombre, tema) => setCanales((prev) => prev.map((c) => (c.id === canalSel.id ? { ...c, nombre, tema } : c)))} />
                    {!cerrado && <IntegrarMiembros canalId={canalSel.id} actuales={miembros.map((m) => m.usuario_id)} onHecho={() => cargarCanal(canalSel.id)} />}
                    <button className="qbtn2" onClick={alternarEstado}>{canalSel.estado === "abierto" ? "Cerrar canal" : "Reabrir"}</button>
                  </div>
                )}
              </div>

              {/* min-height:0 para que el hilo scrollee y no empuje el input */}
              <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "12px 4px" }}>
                {mensajes.map((m) => {
                  if (m.tipo === "sistema") {
                    return <div key={m.id} style={{ textAlign: "center", color: "#888", fontSize: 12, margin: "8px 0" }}>{m.cuerpo}</div>;
                  }
                  const propio = m.usuario_id === yo;
                  const col = colorUsuario(m.usuario_id);
                  return (
                    <div key={m.id} style={{ display: "flex", justifyContent: propio ? "flex-end" : "flex-start", marginBottom: 8 }}>
                      <div style={{ maxWidth: "72%" }}>
                        {!propio && <div style={{ fontSize: 12, fontWeight: 700, color: col, marginBottom: 2 }}>{nombreDe(m.usuario_id)}</div>}
                        <div style={{
                          padding: "8px 11px", borderRadius: 12,
                          background: propio ? "var(--acento,#2563eb)" : fondoUsuario(m.usuario_id),
                          color: propio ? "#fff" : "#1a1d21",
                          borderTopLeftRadius: propio ? 12 : 3, borderTopRightRadius: propio ? 3 : 12,
                        }}>
                          {m.adjunto_url && urlsFirmadas[m.adjunto_url] && (
                            <a href={urlsFirmadas[m.adjunto_url]} target="_blank" rel="noreferrer">
                              <img src={urlsFirmadas[m.adjunto_url]} alt="adjunto" style={{ maxWidth: "100%", maxHeight: 260, borderRadius: 8, display: "block" }} />
                            </a>
                          )}
                          {m.cuerpo && <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{m.cuerpo}</div>}
                        </div>
                        <div style={{ fontSize: 10.5, color: "#999", textAlign: propio ? "right" : "left", marginTop: 2 }}>
                          {selloTiempo(m.creado_en)}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={finRef} />
              </div>

              {/* Barra de entrada (fija) */}
              {cerrado ? (
                <div style={{ padding: 10, textAlign: "center", color: "#b00020", fontSize: 13, borderTop: "1px solid var(--borde,#e3e6ea)" }}>
                  Canal cerrado — no se pueden enviar mensajes.
                </div>
              ) : (
                <div style={{ display: "flex", gap: 8, flex: "0 0 auto", paddingTop: 8, borderTop: "1px solid var(--borde,#e3e6ea)" }}>
                  <label className="qbtn2" style={{ cursor: "pointer", whiteSpace: "nowrap" }}>
                    {subiendo ? "Subiendo…" : "📎 Foto"}
                    <input type="file" accept="image/*" onChange={adjuntar} style={{ display: "none" }} disabled={subiendo} />
                  </label>
                  <input
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); } }}
                    placeholder="Escribe un mensaje…"
                    style={{ flex: 1, padding: "9px 12px", borderRadius: 10, border: "1px solid var(--borde,#cfd4da)" }}
                  />
                  <button className="qbtn2 primary" onClick={enviar} disabled={!texto.trim()}>Enviar</button>
                </div>
              )}
            </>
          )}
        </section>
      </div>
      {error && <p style={{ color: "#b00020", marginTop: 8 }}>{error}</p>}
    </div>
  );
}

// --- Modal: crear canal ---
function NuevoCanal({ onCreado }: { onCreado: (id: string) => void }) {
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState("");
  const [tema, setTema] = useState("");
  const [dir, setDir] = useState<DirUsuario[]>([]);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    supabase.rpc("rpc_chat_directorio").then(({ data }) => setDir((data as DirUsuario[]) ?? []));
  }, [abierto]);

  async function crear() {
    if (!nombre.trim()) { setError("El canal necesita un nombre."); return; }
    setGuardando(true); setError(null);
    const { data, error } = await supabase.rpc("rpc_chat_crear_canal", {
      p_nombre: nombre.trim(), p_tema: tema.trim() || null, p_miembros: Array.from(sel),
    });
    setGuardando(false);
    if (error) { setError(error.message); return; }
    setAbierto(false); setNombre(""); setTema(""); setSel(new Set());
    onCreado(data as string);
  }

  if (!abierto) return <button className="qbtn2 primary" onClick={() => setAbierto(true)}>+ Nuevo canal</button>;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
      <div style={{ background: "#fff", borderRadius: 12, padding: 20, width: 460, maxWidth: "92vw", maxHeight: "86vh", overflowY: "auto" }}>
        <h3 style={{ marginTop: 0 }}>Nuevo canal</h3>
        <input placeholder="Nombre del canal" value={nombre} onChange={(e) => setNombre(e.target.value)} style={{ width: "100%", padding: 9, marginBottom: 8, borderRadius: 8, border: "1px solid #cfd4da" }} />
        <input placeholder="Tema (opcional)" value={tema} onChange={(e) => setTema(e.target.value)} style={{ width: "100%", padding: 9, marginBottom: 12, borderRadius: 8, border: "1px solid #cfd4da" }} />
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Integrantes</div>
        <div style={{ maxHeight: 240, overflowY: "auto", border: "1px solid #eee", borderRadius: 8, padding: 6 }}>
          {dir.map((u) => (
            <label key={u.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "5px 4px", cursor: "pointer" }}>
              <input type="checkbox" checked={sel.has(u.id)} onChange={(e) => setSel((p) => { const n = new Set(p); e.target.checked ? n.add(u.id) : n.delete(u.id); return n; })} />
              <span style={{ fontWeight: 600, color: colorUsuario(u.id) }}>{u.nombre ?? "(sin nombre)"}</span>
              <span style={{ fontSize: 12, color: "#888" }}>· {u.rol}</span>
            </label>
          ))}
          {dir.length === 0 && <p style={{ color: "#888", fontSize: 13, margin: 6 }}>Sin usuarios disponibles.</p>}
        </div>
        {error && <p style={{ color: "#b00020" }}>{error}</p>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
          <button className="qbtn2" onClick={() => setAbierto(false)}>Cancelar</button>
          <button className="qbtn2 primary" onClick={crear} disabled={guardando}>{guardando ? "Creando…" : "Crear canal"}</button>
        </div>
      </div>
    </div>
  );
}

// --- Modal: editar nombre / tema (admin del canal) ---
function EditarCanal({ canal, onHecho }: { canal: Canal; onHecho: (nombre: string, tema: string | null) => void }) {
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState(canal.nombre);
  const [tema, setTema] = useState(canal.tema ?? "");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (abierto) { setNombre(canal.nombre); setTema(canal.tema ?? ""); } }, [abierto, canal]);

  async function guardar() {
    if (!nombre.trim()) { setError("El canal necesita un nombre."); return; }
    const { error } = await supabase.rpc("rpc_chat_actualizar_canal", { p_canal: canal.id, p_nombre: nombre.trim(), p_tema: tema.trim() || null });
    if (error) { setError(error.message); return; }
    setAbierto(false);
    onHecho(nombre.trim(), tema.trim() || null);
  }

  if (!abierto) return <button className="qbtn2" title="Editar nombre y tema" onClick={() => setAbierto(true)}>✎ Editar</button>;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
      <div style={{ background: "#fff", borderRadius: 12, padding: 20, width: 420, maxWidth: "92vw" }}>
        <h3 style={{ marginTop: 0 }}>Editar canal</h3>
        <label style={{ fontSize: 13, fontWeight: 700 }}>Nombre</label>
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} style={{ width: "100%", padding: 9, margin: "4px 0 10px", borderRadius: 8, border: "1px solid #cfd4da" }} />
        <label style={{ fontSize: 13, fontWeight: 700 }}>Tema</label>
        <input value={tema} onChange={(e) => setTema(e.target.value)} placeholder="Tema (opcional)" style={{ width: "100%", padding: 9, margin: "4px 0 6px", borderRadius: 8, border: "1px solid #cfd4da" }} />
        {error && <p style={{ color: "#b00020" }}>{error}</p>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
          <button className="qbtn2" onClick={() => setAbierto(false)}>Cancelar</button>
          <button className="qbtn2 primary" onClick={guardar}>Guardar</button>
        </div>
      </div>
    </div>
  );
}

// --- Modal: integrar miembros a un canal abierto ---
function IntegrarMiembros({ canalId, actuales, onHecho }: { canalId: string; actuales: string[]; onHecho: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const [dir, setDir] = useState<DirUsuario[]>([]);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!abierto) return;
    supabase.rpc("rpc_chat_directorio").then(({ data }) => setDir(((data as DirUsuario[]) ?? []).filter((u) => !actuales.includes(u.id))));
  }, [abierto, actuales]);

  async function integrar() {
    if (sel.size === 0) { setAbierto(false); return; }
    const { error } = await supabase.rpc("rpc_chat_integrar_miembros", { p_canal: canalId, p_usuarios: Array.from(sel) });
    if (error) { setError(error.message); return; }
    setAbierto(false); setSel(new Set()); onHecho();
  }

  if (!abierto) return <button className="qbtn2" onClick={() => setAbierto(true)}>+ Integrar</button>;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
      <div style={{ background: "#fff", borderRadius: 12, padding: 20, width: 420, maxWidth: "92vw", maxHeight: "86vh", overflowY: "auto" }}>
        <h3 style={{ marginTop: 0 }}>Integrar miembros</h3>
        <div style={{ maxHeight: 300, overflowY: "auto", border: "1px solid #eee", borderRadius: 8, padding: 6 }}>
          {dir.map((u) => (
            <label key={u.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "5px 4px", cursor: "pointer" }}>
              <input type="checkbox" checked={sel.has(u.id)} onChange={(e) => setSel((p) => { const n = new Set(p); e.target.checked ? n.add(u.id) : n.delete(u.id); return n; })} />
              <span style={{ fontWeight: 600, color: colorUsuario(u.id) }}>{u.nombre ?? "(sin nombre)"}</span>
              <span style={{ fontSize: 12, color: "#888" }}>· {u.rol}</span>
            </label>
          ))}
          {dir.length === 0 && <p style={{ color: "#888", fontSize: 13, margin: 6 }}>No hay usuarios por agregar.</p>}
        </div>
        {error && <p style={{ color: "#b00020" }}>{error}</p>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
          <button className="qbtn2" onClick={() => setAbierto(false)}>Cancelar</button>
          <button className="qbtn2 primary" onClick={integrar}>Integrar</button>
        </div>
      </div>
    </div>
  );
}
