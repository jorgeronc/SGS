-- =====================================================================
-- 0112_fix_puente_usuario_personal.sql  (corrige 0111)
-- El puente cuenta<->personal YA EXISTÍA: personal.usuario_id (0062) + el RPC
-- rpc_ligar_usuario_guardia (0088), y UsuariosPanel ya lo gestiona (columna
-- "Guardia (app)"). La columna usuarios_perfil.personal_id que agregó 0111 es
-- redundante: se elimina, y fn_usuario_de_personal ahora usa personal.usuario_id.
-- =====================================================================

drop index if exists ux_usuarios_perfil_personal;
alter table usuarios_perfil drop column if exists personal_id;

-- Cuenta (usuarios_perfil.id / auth uid) ligada a un personal, vía personal.usuario_id.
create or replace function fn_usuario_de_personal(p_personal uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select usuario_id from personal where id = p_personal limit 1;
$$;
grant execute on function fn_usuario_de_personal(uuid) to authenticated;
