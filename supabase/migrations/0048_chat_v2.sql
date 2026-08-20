-- =====================================================================
-- 0048_chat_v2.sql · Chat: no leídos, editar canal, y limpieza de auditoría
--
--  * ultimo_leido por (canal, usuario): base para contar mensajes nuevos.
--  * rpc_chat_marcar_leido / rpc_chat_no_leidos.
--  * rpc_chat_actualizar_canal (editar nombre/tema; solo admin del canal).
--  * La auditoría de chat_miembros pasa a solo INSERT (el update de ultimo_leido
--    es lectura, no debe llenar la bitácora).
-- =====================================================================

alter table chat_miembros add column if not exists ultimo_leido timestamptz not null default now();

-- Marca el canal como leído hasta ahora para el usuario actual.
create or replace function rpc_chat_marcar_leido(p_canal uuid) returns void
language sql security definer set search_path = public as $$
  update chat_miembros set ultimo_leido = now()
   where canal_id = p_canal and usuario_id = auth.uid();
$$;

-- Mensajes NO leídos por canal (ajenos, no 'sistema', posteriores a mi marca).
-- Devuelve una fila por cada canal del usuario (n = 0 si está al día).
create or replace function rpc_chat_no_leidos()
returns table(canal_id uuid, n integer)
language sql stable security definer set search_path = public as $$
  select m.canal_id, count(msg.id)::int
    from chat_miembros m
    left join chat_mensajes msg
      on msg.canal_id = m.canal_id
     and msg.creado_en > m.ultimo_leido
     and msg.usuario_id is distinct from m.usuario_id
     and msg.tipo <> 'sistema'
   where m.usuario_id = auth.uid()
   group by m.canal_id;
$$;

-- Editar nombre / tema del canal (solo admin del canal).
create or replace function rpc_chat_actualizar_canal(p_canal uuid, p_nombre text, p_tema text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not fn_chat_es_admin(p_canal) then
    raise exception 'Solo el administrador del canal puede editarlo.';
  end if;
  update chat_canales
     set nombre = coalesce(nullif(trim(p_nombre), ''), nombre),
         tema   = nullif(trim(coalesce(p_tema, '')), ''),
         actualizado_en = now()
   where id = p_canal;
end;
$$;

-- La auditoría de membresía se limita a INSERT: los updates de ultimo_leido
-- (marca de lectura) no son actividad auditable y llenarían la bitácora.
drop trigger if exists trg_auditoria_chat_miembros on chat_miembros;
create trigger trg_auditoria_chat_miembros
  after insert on chat_miembros
  for each row execute function fn_bitacora_chat();
