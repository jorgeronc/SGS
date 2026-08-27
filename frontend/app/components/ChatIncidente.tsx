"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { colorUsuario, fondoUsuario } from "@/lib/chatColor";

// Chat compacto de UN canal (el del incidente), para incrustar en el Mapa
// Operacional. Reusa las tablas del módulo de chat (chat_mensajes / chat_miembros)
// y el realtime filtrado por canal. La membresía se asegura antes (via
// rpc_incidente_unir_chat) para que la RLS deje leer/escribir.
interface Mensaje {
  id: string; canal_id: string; usuario_id: string | null;
  tipo: "texto" | "foto" | "archivo" | "sistema"; cuerpo: string | null; creado_en: string;
}

export default function ChatIncidente({ canalId, alto = 300 }: { canalId: string; alto?: number }) {
  const [yo, setYo] = useState<string | null>(null);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [nombres, setNombres] = useState<Record<string, string>>({});
  const [texto, setTexto] = useState("");
  const finRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { supabase.auth.getUser().then(({ data }) => setYo(data.user?.id ?? null)); }, []);

  const cargar = useCallback(async () => {
    const { data: mem } = await supabase.from("chat_miembros")
      .select("usuario_id, perfil:usuarios_perfil(nombre)").eq("canal_id", canalId);
    const nm: Record<string, string> = {};
    ((mem as any[]) ?? []).forEach((m) => { if (m.perfil?.nombre) nm[m.usuario_id] = m.perfil.nombre; });
    setNombres(nm);
    const { data } = await supabase.from("chat_mensajes")
      .select("id, canal_id, usuario_id, tipo, cuerpo, creado_en")
      .eq("canal_id", canalId).order("creado_en", { ascending: true }).limit(200);
    setMensajes((data as Mensaje[]) ?? []);
    supabase.rpc("rpc_chat_marcar_leido", { p_canal: canalId }).then(() => undefined);
  }, [canalId]);

  useEffect(() => { cargar(); }, [cargar]);

  // Realtime: mensajes nuevos de ESTE canal.
  useEffect(() => {
    const ch = supabase.channel(`chat-inc:${canalId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_mensajes", filter: `canal_id=eq.${canalId}` }, (payload) => {
        const m = payload.new as Mensaje;
        setMensajes((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
        supabase.rpc("rpc_chat_marcar_leido", { p_canal: canalId }).then(() => undefined);
      }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [canalId]);

  useEffect(() => { finRef.current?.scrollIntoView({ behavior: "smooth" }); }, [mensajes]);

  async function enviar() {
    const t = texto.trim();
    if (!t || !yo) return;
    setTexto("");
    const { error } = await supabase.from("chat_mensajes").insert({ canal_id: canalId, usuario_id: yo, cuerpo: t });
    if (error) setTexto(t);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: alto }}>
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "4px 2px" }}>
        {mensajes.length === 0 && <div style={{ color: "var(--sc-text-faint)", fontSize: 12, textAlign: "center", marginTop: 18 }}>Sin mensajes aún.</div>}
        {mensajes.map((m) => {
          if (m.tipo === "sistema") return <div key={m.id} style={{ textAlign: "center", color: "var(--sc-text-faint)", fontSize: 11, margin: "6px 0" }}>{m.cuerpo}</div>;
          const propio = m.usuario_id === yo;
          return (
            <div key={m.id} style={{ display: "flex", justifyContent: propio ? "flex-end" : "flex-start", marginBottom: 6 }}>
              <div style={{ maxWidth: "80%" }}>
                {!propio && <div style={{ fontSize: 11, fontWeight: 700, color: colorUsuario(m.usuario_id), marginBottom: 2 }}>{nombres[m.usuario_id ?? ""] ?? "Usuario"}</div>}
                <div style={{ padding: "6px 9px", borderRadius: 10, fontSize: 13, background: propio ? "#2563eb" : fondoUsuario(m.usuario_id), color: propio ? "#fff" : "#1a1d21", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{m.cuerpo}</div>
                <div style={{ fontSize: 10, color: "var(--sc-text-faint)", textAlign: propio ? "right" : "left", marginTop: 1 }}>{new Date(m.creado_en).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
              </div>
            </div>
          );
        })}
        <div ref={finRef} />
      </div>
      <div style={{ display: "flex", gap: 6, paddingTop: 6, borderTop: "1px solid var(--sc-card-line)" }}>
        <input value={texto} onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); } }}
          placeholder="Mensaje…"
          style={{ flex: 1, padding: "7px 10px", borderRadius: 8, border: "1px solid var(--sc-card-line)", background: "var(--sc-content)", color: "var(--sc-text)", fontSize: 13 }} />
        <button onClick={enviar} disabled={!texto.trim()} style={{ background: "#2563eb", color: "#fff", border: "none", borderRadius: 8, padding: "7px 12px", fontWeight: 700, cursor: "pointer" }}>Enviar</button>
      </div>
    </div>
  );
}
