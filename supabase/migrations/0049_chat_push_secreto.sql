-- =====================================================================
-- 0049_chat_push_secreto.sql · Arreglar el push del chat
--
-- fn_push_chat (0046) leía el secreto del GUC `app.push_secret`, pero desde la
-- migración 0036 el secreto vive en la tabla `app_secretos` (clave 'push_secret')
-- y el GUC quedó vacío. Resultado: el disparador salía sin enviar y el chat nunca
-- notificaba (el de despachos sí, porque ya leía de la tabla).
--
-- Aquí se reescribe fn_push_chat para leer el secreto de app_secretos, igual que
-- fn_push_despacho. El trigger trg_push_chat (0046) ya apunta a esta función, así
-- que no hay que recrearlo. No requiere redeploy de enviar_push ni tocar env.
-- =====================================================================

create or replace function fn_push_chat() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_secret  text := (select valor from app_secretos where clave = 'push_secret');
  v_url     text := 'https://okhsniabwiukjyjhmeav.supabase.co/functions/v1/enviar_push';
  v_canal   text;
  v_remite  text;
  v_users   uuid[];
begin
  -- Los mensajes de sistema no notifican. Sin secreto configurado, no hace nada.
  if new.tipo = 'sistema' or coalesce(v_secret, '') = '' then
    return new;
  end if;

  select nombre into v_canal from chat_canales where id = new.canal_id;
  select coalesce(nombre, 'Alguien') into v_remite from usuarios_perfil where id = new.usuario_id;

  -- Destinatarios: miembros del canal menos el remitente.
  select array_agg(usuario_id) into v_users
    from chat_miembros
   where canal_id = new.canal_id and usuario_id <> new.usuario_id;

  if v_users is null or array_length(v_users, 1) is null then
    return new;
  end if;

  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
    body    := jsonb_build_object(
      'user_ids', to_jsonb(v_users),
      'tipo',     'chat',
      'titulo',   coalesce('#' || v_canal || ' · ', '') || v_remite,
      'cuerpo',   left(coalesce(nullif(new.cuerpo, ''), '📷 Foto'), 180),
      'data',     jsonb_build_object('tipo', 'chat', 'canal_id', new.canal_id, 'nombre', v_canal)
    )
  );
  return new;
end;
$$;
