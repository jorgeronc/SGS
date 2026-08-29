-- =====================================================================
-- 0072_incidente_chat_central.sql
-- El chat del incidente debe aparecer en el módulo de chat de CENTRAL (web) apenas
-- se crea, sin que el operador tenga que abrir el incidente. Antes (0062) solo se
-- agregaban como miembros el creador, el guardia que reportó y el supervisor del
-- turno del sitio; el operador de central se sumaba tarde (rpc_incidente_unir_chat),
-- lo que retrasaba la recepción de mensajes.
--
-- Aquí se redefine fn_incidente_crear_chat para agregar además, como miembros del
-- canal, a TODOS los usuarios con rol 'administrador' o 'supervisor' (mando /
-- central). El trigger trg_llamada_chat (0062) ya apunta a esta función.
-- =====================================================================
create or replace function fn_incidente_crear_chat(p_llamada uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_ll           llamadas_cad;
  v_canal        uuid;
  v_guardia_user uuid;
  v_sup_user     uuid;
  v_creador      uuid := auth.uid();
  v_folio        text;
begin
  select * into v_ll from llamadas_cad where id = p_llamada;
  if v_ll.id is null then return null; end if;
  if v_ll.chat_canal_id is not null then return v_ll.chat_canal_id; end if;

  -- Guardia que reportó (si vino del móvil) → su cuenta de login.
  if (v_ll.datos_adicionales->>'personal_id') is not null then
    select usuario_id into v_guardia_user
      from personal where id = (v_ll.datos_adicionales->>'personal_id')::uuid;
  end if;

  -- Supervisor del turno ACTIVO del sitio hoy → su cuenta de login.
  if v_ll.sitio_id is not null then
    select p.usuario_id into v_sup_user
      from turnos t
      join personal p on p.id = t.supervisor_id
     where t.estatus = 'activo' and t.estado = 'activo' and t.fecha = current_date
       and exists (select 1 from turno_guardias tg where tg.turno_id = t.id and tg.sitio_id = v_ll.sitio_id)
     order by t.creado_en desc
     limit 1;
  end if;

  v_folio := coalesce(v_ll.folio, 'incidente');
  insert into chat_canales (nombre, tema, creado_por)
    values ('Incidente ' || v_folio, 'Coordinación del incidente ' || v_folio, v_creador)
    returning id into v_canal;

  -- Miembros base: creador (admin del canal), guardia y supervisor del sitio.
  insert into chat_miembros (canal_id, usuario_id, es_admin)
    select v_canal, u, (u = v_creador)
      from (select distinct unnest(array[v_creador, v_guardia_user, v_sup_user]) as u) s
     where u is not null
    on conflict do nothing;

  -- Central / mando: todos los administradores y supervisores, para que el chat
  -- aparezca en su módulo de chat (web) de inmediato y reciban mensajes a tiempo.
  insert into chat_miembros (canal_id, usuario_id)
    select v_canal, up.id
      from usuarios_perfil up
     where up.rol in ('administrador','supervisor') and up.id is not null
    on conflict do nothing;

  insert into chat_mensajes (canal_id, usuario_id, tipo, cuerpo)
    values (v_canal, v_creador, 'sistema', 'Canal del incidente ' || v_folio || ' creado.');

  update llamadas_cad set chat_canal_id = v_canal where id = p_llamada;
  return v_canal;
end; $$;
