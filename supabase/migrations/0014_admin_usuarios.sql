-- =====================================================================
-- 0014_admin_usuarios.sql
-- Administración de usuarios y roles (cierra un pendiente de la Fase 0).
--
-- El correo del usuario vive en auth.users (esquema no expuesto por
-- PostgREST). Se exponen dos RPC security definer, ambas restringidas al rol
-- 'administrador', para listar y actualizar usuarios desde el frontend sin
-- dar acceso directo al esquema auth ni al service_role.
-- =====================================================================

-- Lista de usuarios (id, correo, nombre, rol, activo) — solo administrador.
create or replace function rpc_listar_usuarios()
returns table (
  id        uuid,
  email     text,
  nombre    text,
  rol       text,
  activo    boolean,
  creado_en timestamptz
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if coalesce(fn_rol_actual(), '') <> 'administrador' then
    raise exception 'Solo el administrador puede listar usuarios.';
  end if;

  return query
    select u.id, u.email::text, p.nombre, p.rol, p.activo, p.creado_en
    from auth.users u
    join usuarios_perfil p on p.id = u.id
    order by p.creado_en;
end;
$$;

-- Actualiza nombre/rol/activo de un usuario — solo administrador.
-- Guard anti-autobloqueo: un admin no puede quitarse su propio rol de
-- administrador ni desactivarse a sí mismo.
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

  if p_rol not in ('oficial','supervisor','investigador','administrador','asuntos_internos') then
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
