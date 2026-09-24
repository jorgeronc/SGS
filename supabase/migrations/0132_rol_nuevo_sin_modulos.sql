-- =====================================================================
-- 0132_rol_nuevo_sin_modulos.sql
-- Fix: un rol NUEVO nacía con modulos = NULL, y NULL = "sin restricción" (ve
-- todo). Debe nacer RESTRINGIDO (solo Inicio) hasta que el admin le asigne
-- módulos. Los roles de sistema conservan su configuración (null = todos para
-- administrador/legados). También se corrigen los roles personalizados ya
-- creados que quedaron en NULL (p. ej. "credencialista").
-- =====================================================================

-- rpc_crear_rol ahora inicializa modulos = '[]' (restringido) para roles nuevos.
create or replace function rpc_crear_rol(p_clave text, p_nombre text)
returns void language plpgsql security definer set search_path = public as $$
declare v_clave text;
begin
  if coalesce(fn_rol_actual(), '') <> 'administrador' then raise exception 'Solo el administrador.'; end if;
  v_clave := regexp_replace(lower(trim(coalesce(p_clave, ''))), '[^a-z0-9_]+', '_', 'g');
  if v_clave = '' then raise exception 'Clave de rol inválida.'; end if;
  insert into roles (clave, nombre, modulos) values (v_clave, coalesce(nullif(trim(p_nombre), ''), v_clave), '[]'::jsonb)
  on conflict (clave) do update set nombre = excluded.nombre, actualizado_en = now();
end;
$$;

-- Roles personalizados (no de sistema) que quedaron en NULL → restringidos (vacíos).
update roles set modulos = '[]'::jsonb, actualizado_en = now()
 where es_sistema = false and modulos is null;
