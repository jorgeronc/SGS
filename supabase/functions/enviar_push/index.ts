// Edge Function: enviar_push
//
// Envía notificaciones push (Expo Push API) a los dispositivos de un elemento
// (personal). La invoca el disparador SQL fn_push_despacho vía pg_net cuando un
// despacho se asigna o cambia de estado.
//
// Se despliega SIN verificación de JWT (la llama Postgres, sin sesión):
//   supabase functions deploy enviar_push --no-verify-jwt
// La autorización se hace con un secreto compartido en la cabecera
// x-push-secret, que debe coincidir con el secreto PUSH_SECRET de la función.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { json, preflight } from "../_shared/cors.ts";

const EXPO_PUSH = "https://exp.host/--/api/v2/push/send";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  try {
    // 1) Valida el secreto compartido.
    const secret = Deno.env.get("PUSH_SECRET") ?? "";
    if (!secret || req.headers.get("x-push-secret") !== secret) {
      return json({ error: "No autorizado." }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const personalId = (body?.personal_id ?? "").toString();
    // user_ids: lista de auth.uid (lo usa el chat, que se dirige por usuario, no
    // por elemento). Acepta arreglo o un solo user_id.
    const userIds: string[] = Array.isArray(body?.user_ids)
      ? body.user_ids.map((x: unknown) => String(x)).filter(Boolean)
      : body?.user_id ? [String(body.user_id)] : [];
    const titulo = (body?.titulo ?? "SCP").toString();
    const cuerpo = (body?.cuerpo ?? "").toString();
    const data = body?.data ?? {};
    if (!personalId && userIds.length === 0) {
      return json({ error: "Falta personal_id o user_ids." }, 400);
    }

    // 2) Busca los tokens de los destinatarios (con el cliente de servicio).
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, serviceKey);
    let q = admin.from("dispositivos_push").select("expo_push_token");
    q = userIds.length > 0 ? q.in("user_id", userIds) : q.eq("personal_id", personalId);
    const { data: disp, error } = await q;
    if (error) return json({ error: error.message }, 500);

    const tokens = ((disp as { expo_push_token: string }[]) ?? [])
      .map((d) => d.expo_push_token)
      .filter((t) => typeof t === "string" && t.startsWith("ExponentPushToken"));
    if (tokens.length === 0) return json({ ok: true, enviados: 0 });

    // 3) Envía a Expo (un mensaje por token).
    const mensajes = tokens.map((to) => ({
      to,
      sound: "default",
      title: titulo,
      body: cuerpo,
      data,
      channelId: "default",
      priority: "high",
    }));

    const r = await fetch(EXPO_PUSH, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(mensajes),
    });
    const resultado = await r.json().catch(() => ({}));
    return json({ ok: true, enviados: tokens.length, expo: resultado });
  } catch (e) {
    return json({ error: (e as Error)?.message ?? String(e) }, 500);
  }
});
