// Edge Function: buscar-ia   (Fase 0: prueba de recuperación semántica)
// Embebe la consulta con gte-small y devuelve los fragmentos más similares
// LLAMANDO al RPC con el JWT del usuario, por lo que la recuperación respeta
// sus permisos (RLS). Sin LLM todavía: sirve para validar el índice.
//
//   POST /functions/v1/buscar-ia   {"q":"robo de vehículo en la colonia centro","k":8}
//
// Deno / Edge runtime.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { json, preflight } from "../_shared/cors.ts";

// deno-lint-ignore no-explicit-any
const Sesion = (globalThis as any).Supabase?.ai?.Session;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  try {
    const { q, k } = await req.json().catch(() => ({}));
    if (!q || typeof q !== "string") return json({ error: "Falta 'q' (consulta)." }, 400);

    // Cliente con el JWT del usuario que llama → RLS y fn_rol_actual() aplican a él.
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const modelo = new Sesion("gte-small");
    const emb: number[] = await modelo.run(q, { mean_pool: true, normalize: true });

    const { data, error } = await supabase.rpc("rpc_buscar_semantica", {
      p_embedding: "[" + emb.join(",") + "]",
      p_k: Math.min(Math.max(Number(k) || 8, 1), 20),
    });
    if (error) return json({ error: error.message }, 500);

    return json({ ok: true, resultados: data ?? [] });
  } catch (e) {
    return json({ error: String((e as { message?: string })?.message ?? e) }, 500);
  }
});
