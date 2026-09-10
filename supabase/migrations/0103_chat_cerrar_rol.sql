-- =====================================================================
-- 0103_chat_cerrar_rol.sql
-- Cerrar/reabrir un canal de chat lo puede hacer el administrador DEL CANAL o
-- cualquier usuario con rol administrador/supervisor (antes solo el admin del
-- canal). Se recrea rpc_chat_estado_canal ampliando la autorización.
-- =====================================================================

create or replace function rpc_chat_estado_canal(p_canal uuid, p_estado text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (fn_chat_es_admin(p_canal) or coalesce(fn_rol_actual(), '') in ('administrador','supervisor')) then
    raise exception 'No autorizado para cambiar el estado del canal.';
  end if;
  if p_estado not in ('abierto','cerrado') then
    raise exception 'Estado no válido: %', p_estado;
  end if;
  update chat_canales set estado = p_estado::chat_estado_canal, actualizado_en = now()
   where id = p_canal;
  insert into chat_mensajes (canal_id, usuario_id, tipo, cuerpo)
    values (p_canal, auth.uid(), 'sistema',
            case when p_estado = 'cerrado' then 'El canal fue cerrado.' else 'El canal fue reabierto.' end);
end;
$$;
