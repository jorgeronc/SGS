import { supabase } from "./supabase";

// Rol del usuario que inició sesión (de usuarios_perfil). Sirve para gatear
// opciones que solo deben ver mandos (p. ej. la consulta/búsqueda).
export async function getRolActual(): Promise<string | null> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return null;
  const { data } = await supabase.from("usuarios_perfil").select("rol").eq("id", u.user.id).maybeSingle();
  return (data as any)?.rol ?? null;
}

// Mando = supervisor o administrador (los que pueden consultar/buscar).
export function esMando(rol: string | null): boolean {
  return rol === "supervisor" || rol === "administrador";
}
