// Edge Function: crear_usuario
//
// Crea una cuenta del sistema (Supabase Auth) desde la app web. SOLO un usuario
// con rol 'administrador' puede invocarla. Crea la cuenta ya confirmada con una
// contraseña inicial y fija el rol solicitado en usuarios_perfil.
//
// Usa el SERVICE_ROLE_KEY (inyectado por Supabase en las Edge Functions), que
// nunca se expone al navegador. La autorización se valida en el servidor:
// se identifica al solicitante por su JWT y se comprueba su rol.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { json, preflight } from "../_shared/cors.ts";

const ROLES = ["oficial", "guardia", "supervisor", "investigador", "asuntos_internos", "administrador", "operador", "coordinador"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!serviceKey) return json({ error: "Falta configurar SUPABASE_SERVICE_ROLE_KEY." }, 500);

    // 1) Identifica al solicitante por su sesión.
    const asCaller = createClient(url, anon, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
    const { data: { user } } = await asCaller.auth.getUser();
    if (!user) return json({ error: "No autorizado. Inicia sesión." }, 401);

    // 2) Comprueba que el solicitante sea administrador (con el cliente de servicio).
    const admin = createClient(url, serviceKey);
    const { data: perfil } = await admin.from("usuarios_perfil").select("rol").eq("id", user.id).maybeSingle();
    if (!perfil || (perfil as { rol?: string }).rol !== "administrador") {
      return json({ error: "Solo un administrador puede crear usuarios." }, 403);
    }

    // 3) Valida los datos.
    const body = await req.json().catch(() => ({}));
    const email = (body?.email ?? "").toString().trim().toLowerCase();
    const password = (body?.password ?? "").toString();
    const nombre = (body?.nombre ?? "").toString().trim();
    const rol = (body?.rol ?? "oficial").toString();
    if (!email || !email.includes("@")) return json({ error: "Correo inválido." }, 400);
    if (password.length < 6) return json({ error: "La contraseña debe tener al menos 6 caracteres." }, 400);
    if (!ROLES.includes(rol)) return json({ error: "Rol inválido." }, 400);

    // 4) Crea la cuenta ya confirmada con la contraseña inicial.
    const { data: creado, error: eCrear } = await admin.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { nombre },
    });
    if (eCrear || !creado?.user) return json({ error: eCrear?.message ?? "No se pudo crear el usuario." }, 400);
    const nuevoId = creado.user.id;

    // 5) Fija nombre + rol (el trigger crea el perfil con rol 'oficial'; aquí se ajusta).
    const { error: ePerfil } = await admin.from("usuarios_perfil").upsert({ id: nuevoId, nombre: nombre || null, rol }, { onConflict: "id" });
    if (ePerfil) return json({ ok: true, id: nuevoId, email, rol, aviso: `Cuenta creada, pero no se pudo fijar el rol: ${ePerfil.message}` });

    return json({ ok: true, id: nuevoId, email, rol });
  } catch (e) {
    return json({ error: String((e as { message?: string })?.message ?? e) }, 500);
  }
});
