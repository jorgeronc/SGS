-- =====================================================================
-- 0115_rol_whitelist_admin.sql
-- Fix: rpc_admin_actualizar_usuario (0014) rechazaba 'coordinador'/'operador'/
-- 'guardia' con "Rol no válido" porque conservaba la whitelist vieja, aunque el
-- CHECK de usuarios_perfil.rol (0079) ya admite esos roles. Se sincroniza la
-- whitelist de la RPC con el CHECK de la columna.
-- =====================================================================

create or replace function rpc_admin_actualizar_usuario(
  p_user   uuid,
  p_nombre text,
  p_rol    text,
  p_activo boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(fn_rol_actual(), '') <> 'administrador' then
    raise exception 'Solo el administrador puede modificar usuarios.';
  end if;

  -- Misma lista que el CHECK de usuarios_perfil.rol (0079_vista_operativa.sql).
  if p_rol not in ('oficial','guardia','supervisor','investigador','asuntos_internos','administrador','operador','coordinador') then
    raise exception 'Rol no válido: %', p_rol;
  end if;

  if p_user = auth.uid() and (p_rol <> 'administrador' or p_activo = false) then
    raise exception 'No puedes quitarte tu propio acceso de administrador.';
  end if;

  update usuarios_perfil
     set nombre = p_nombre, rol = p_rol, activo = p_activo
   where id = p_user;
end;
$$;
