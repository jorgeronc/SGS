-- =====================================================================
-- 0088_ligar_usuario_guardia.sql · Identidad del guardia
-- El administrador liga cada cuenta de usuario con su guardia (personal), para
-- que la app móvil auto-resuelva "Mi elemento" al iniciar sesión (sin elegir de
-- una lista). Usa personal.usuario_id (creado en 0062). 1 usuario ↔ 1 guardia.
-- =====================================================================

create or replace function rpc_ligar_usuario_guardia(p_usuario uuid, p_personal uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(fn_rol_actual(),'') <> 'administrador' then
    raise exception 'Solo el administrador puede ligar usuarios con guardias.';
  end if;
  -- Un usuario solo puede estar ligado a un guardia: se limpia el anterior.
  update personal set usuario_id = null, actualizado_en = now() where usuario_id = p_usuario;
  if p_personal is not null then
    update personal set usuario_id = p_usuario, actualizado_en = now() where id = p_personal;
  end if;
end; $$;
grant execute on function rpc_ligar_usuario_guardia(uuid, uuid) to authenticated;
