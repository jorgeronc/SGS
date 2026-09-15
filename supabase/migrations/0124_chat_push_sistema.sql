-- =====================================================================
-- 0124_chat_push_sistema.sql
-- Los mensajes de SISTEMA (p. ej. brecha de relevo) ahora SÍ notifican por push y
-- SÍ cuentan como "no leídos":
--   * fn_push_chat: notificaba solo mensajes de usuario y, con remitente null
--     (sistema), el filtro usuario_id <> null excluía a todos. Ahora empuja también
--     los de sistema y calcula destinatarios con remitente null.
--   * rpc_chat_no_leidos: dejaba fuera tipo='sistema'; ahora los cuenta (así aparece
--     el indicador de mensajes nuevos en web y móvil).
-- =====================================================================
create or replace function fn_push_chat() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_secret text := (select valor from app_secretos where clave = 'push_secret');
  v_url    text := 'https://rdyjjfbehjfggpldmmur.supabase.co/functions/v1/enviar_push';
  v_canal  text; v_remite text; v_users uuid[]; v_titulo text; v_cuerpo text;
begin
  if coalesce(v_secret, '') = '' then return new; end if;
  select nombre into v_canal from chat_canales where id = new.canal_id;

  -- Destinatarios: miembros del canal menos el remitente (si lo hay).
  select array_agg(usuario_id) into v_users
    from chat_miembros
   where canal_id = new.canal_id and (new.usuario_id is null or usuario_id <> new.usuario_id);
  if v_users is null or array_length(v_users, 1) is null then return new; end if;

  if new.tipo = 'sistema' then
    v_titulo := coalesce(v_canal, 'Aviso');
    v_cuerpo := left(coalesce(nullif(new.cuerpo, ''), 'Aviso'), 180);
  else
    select coalesce(nombre, 'Alguien') into v_remite from usuarios_perfil where id = new.usuario_id;
    v_titulo := coalesce('#' || v_canal || ' · ', '') || v_remite;
    v_cuerpo := left(coalesce(nullif(new.cuerpo, ''), '📷 Foto'), 180);
  end if;

  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
    body    := jsonb_build_object(
      'user_ids', to_jsonb(v_users),
      'tipo',     'chat',
      'titulo',   v_titulo,
      'cuerpo',   v_cuerpo,
      'data',     jsonb_build_object('tipo', 'chat', 'canal_id', new.canal_id, 'nombre', v_canal)
    )
  );
  return new;
end $$;

-- No leídos: ahora cuenta también los mensajes de sistema (relevo).
create or replace function rpc_chat_no_leidos()
returns table(canal_id uuid, n integer)
language sql stable security definer set search_path = public as $$
  select m.canal_id, count(msg.id)::int
    from chat_miembros m
    left join chat_mensajes msg
      on msg.canal_id = m.canal_id
     and msg.creado_en > m.ultimo_leido
     and msg.usuario_id is distinct from m.usuario_id
   where m.usuario_id = auth.uid()
   group by m.canal_id;
$$;
