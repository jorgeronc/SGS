-- =====================================================================
-- 0089_chat_incidente_oficiales.sql
-- Al ABRIR el chat de un incidente, integrar automáticamente:
--   * los oficiales que están ATENDIENDO el incidente (despacho en_ruta / en_lugar),
--   * el supervisor del turno activo del sitio (ya se agrega al crear; se re-asegura).
-- Se hace al abrir el chat (rpc_incidente_unir_chat), que ya llaman la vista de
-- Central/Despacho (Ir al chat) y el Mapa Operacional (Chat del incidente).
-- =====================================================================

-- Sincroniza los miembros del canal de un incidente con los oficiales que lo
-- atienden y el supervisor del turno. Devuelve cuántos miembros NUEVOS agregó.
create or replace function fn_incidente_sincronizar_miembros(p_llamada uuid, p_canal uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_ll      llamadas_cad;
  v_users   uuid[] := '{}';
  v_nuevos  int := 0;
begin
  select * into v_ll from llamadas_cad where id = p_llamada;
  if v_ll.id is null or p_canal is null then return 0; end if;

  -- Oficiales que atienden: despacho activo en_ruta / en_lugar -> su cuenta.
  v_users := array(
    select distinct p.usuario_id
      from despachos d
      join personal p on p.id = d.personal_id
     where d.llamada_id = p_llamada
       and d.estatus = 'activo'
       and d.estado in ('en_ruta','en_lugar')
       and p.usuario_id is not null
  );

  -- Supervisor del turno activo del sitio hoy -> su cuenta.
  if v_ll.sitio_id is not null then
    v_users := v_users || array(
      select distinct p.usuario_id
        from turnos t
        join personal p on p.id = t.supervisor_id
       where t.estatus = 'activo' and t.estado = 'activo' and t.fecha = current_date
         and p.usuario_id is not null
         and exists (select 1 from turno_guardias tg where tg.turno_id = t.id and tg.sitio_id = v_ll.sitio_id)
    );
  end if;

  if array_length(v_users, 1) is null then return 0; end if;

  with ins as (
    insert into chat_miembros (canal_id, usuario_id)
      select distinct p_canal, u from unnest(v_users) u where u is not null
      on conflict do nothing
      returning usuario_id
  )
  select count(*) into v_nuevos from ins;

  if v_nuevos > 0 then
    insert into chat_mensajes (canal_id, usuario_id, tipo, cuerpo)
      values (p_canal, auth.uid(), 'sistema',
              'Se integraron al canal los oficiales que atienden el incidente y el supervisor del turno.');
  end if;
  return v_nuevos;
end; $$;

-- Redefine: el operador se une al chat Y se sincronizan los oficiales/supervisor.
create or replace function rpc_incidente_unir_chat(p_llamada uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_canal uuid;
begin
  select chat_canal_id into v_canal from llamadas_cad where id = p_llamada;
  if v_canal is null then v_canal := fn_incidente_crear_chat(p_llamada); end if;
  if v_canal is null then return null; end if;

  -- El operador (mando central) se agrega como miembro.
  if coalesce(fn_rol_actual(), '') in ('supervisor','investigador','administrador') then
    insert into chat_miembros (canal_id, usuario_id) values (v_canal, auth.uid())
      on conflict do nothing;
  end if;

  -- Integrar oficiales que atienden + supervisor del turno.
  perform fn_incidente_sincronizar_miembros(p_llamada, v_canal);
  return v_canal;
end; $$;
