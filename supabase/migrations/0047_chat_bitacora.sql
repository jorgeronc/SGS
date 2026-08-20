-- =====================================================================
-- 0047_chat_bitacora.sql · Auditar el chat en la bitácora
--
-- Registra la actividad del chat en la bitácora con los MISMOS campos que el
-- resto del sistema (usuario, IP, dispositivo, acción, entidad, fecha), pero
-- SIN el contenido de los mensajes: en chat_mensajes se redactan `cuerpo` y
-- `adjunto_url`. Así queda constancia de que hubo comunicación (quién, en qué
-- canal, cuándo) sin guardar el texto.
--
-- No se usa fn_bitacora_generica porque: (a) chat_miembros tiene PK compuesta
-- (sin columna id) y (b) chat_mensajes no debe volcar su contenido.
-- =====================================================================

create or replace function fn_bitacora_chat() returns trigger
language plpgsql security definer as $$
declare
  v_headers  json;
  v_ip       text;
  v_device   text;
  v_usuario  uuid;
  v_entidad  uuid;
  v_nuevos   jsonb;
  v_ant      jsonb;
begin
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::json;
  exception when others then v_headers := null; end;
  v_ip     := coalesce(v_headers->>'x-forwarded-for', v_headers->>'cf-connecting-ip');
  v_device := v_headers->>'x-device-id';
  begin v_usuario := auth.uid(); exception when others then v_usuario := null; end;

  v_ant    := case when tg_op = 'UPDATE' then to_jsonb(old) else null end;
  v_nuevos := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end;

  if tg_table_name = 'chat_miembros' then
    -- PK compuesta: se referencia el canal como entidad.
    v_entidad := coalesce(new.canal_id, old.canal_id);
  else
    v_entidad := coalesce(new.id, old.id);
  end if;

  if tg_table_name = 'chat_mensajes' then
    -- Nunca se guarda el CONTENIDO del mensaje en la bitácora.
    v_nuevos := v_nuevos - 'cuerpo' - 'adjunto_url';
    v_ant    := v_ant    - 'cuerpo' - 'adjunto_url';
  end if;

  insert into bitacora (
    usuario_id, computadora_id, ip_address, tipo_accion,
    entidad_tipo, entidad_id, valores_anteriores, valores_nuevos, modulo
  ) values (
    v_usuario, v_device, v_ip, tg_op,
    tg_table_name, v_entidad, v_ant, v_nuevos, 'chat'
  );

  return coalesce(new, old);
end;
$$;

-- Canales: alta y cambios de estado (abrir/cerrar).
drop trigger if exists trg_auditoria_chat_canales on chat_canales;
create trigger trg_auditoria_chat_canales
  after insert or update on chat_canales
  for each row execute function fn_bitacora_chat();

-- Membresía: altas de integrantes.
drop trigger if exists trg_auditoria_chat_miembros on chat_miembros;
create trigger trg_auditoria_chat_miembros
  after insert or update on chat_miembros
  for each row execute function fn_bitacora_chat();

-- Mensajes: solo el metadato (quién, canal, tipo, fecha); NUNCA el contenido.
drop trigger if exists trg_auditoria_chat_mensajes on chat_mensajes;
create trigger trg_auditoria_chat_mensajes
  after insert on chat_mensajes
  for each row execute function fn_bitacora_chat();
