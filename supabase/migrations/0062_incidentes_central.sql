-- =====================================================================
-- 0062_incidentes_central.sql · Rework de Central/Despacho (incidencias)
--
-- Todo reporte llega por un guardia (app móvil) o lo levanta un operador de
-- central. El lugar SIEMPRE es un sitio registrado (+ punto exacto en el mapa).
-- Al crear el incidente se arma en automático un CHAT entre el creador, el
-- guardia (si reportó) y el supervisor del turno activo del sitio; el operador
-- se suma al tomarlo. El guardia y su supervisor consultan/actualizan el
-- incidente hasta el cierre.
--
-- Requiere: identidad del guardia ligada a su cuenta de login (usuarios_perfil),
-- porque el chat funciona por cuentas (ver 0046_chat).
-- =====================================================================

-- 1) Guardia: teléfono propio + vínculo con su cuenta de login ----------------
alter table personal add column if not exists telefono   text;
alter table personal add column if not exists usuario_id uuid references usuarios_perfil(id);
create index if not exists idx_personal_usuario on personal(usuario_id);

-- El guardia liga su "elemento" con su cuenta al seleccionar "Mi elemento" en la
-- app (ya validó su smartphone). No permite robar un elemento ya ligado a otro.
create or replace function rpc_vincular_usuario_elemento(p_personal uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update personal set usuario_id = auth.uid(), actualizado_en = now()
   where id = p_personal and (usuario_id is null or usuario_id = auth.uid());
end; $$;

-- 2) Incidencia (llamadas_cad): sitio + canal de chat -------------------------
alter table llamadas_cad add column if not exists sitio_id      uuid references sitios(id);
alter table llamadas_cad add column if not exists chat_canal_id uuid references chat_canales(id);
create index if not exists idx_llamadas_cad_sitio on llamadas_cad(sitio_id);

-- 3) Crear el chat del incidente con sus miembros (idempotente) ---------------
-- Miembros: el creador (guardia u operador, = auth.uid()), el guardia que reportó
-- (datos_adicionales.personal_id) y el supervisor del turno activo del sitio hoy.
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

  -- Miembros sin duplicar ni nulos; el creador queda como admin del canal.
  insert into chat_miembros (canal_id, usuario_id, es_admin)
    select v_canal, u, (u = v_creador)
      from (select distinct unnest(array[v_creador, v_guardia_user, v_sup_user]) as u) s
     where u is not null
    on conflict do nothing;

  insert into chat_mensajes (canal_id, usuario_id, tipo, cuerpo)
    values (v_canal, v_creador, 'sistema', 'Canal del incidente ' || v_folio || ' creado.');

  update llamadas_cad set chat_canal_id = v_canal where id = p_llamada;
  return v_canal;
end; $$;

-- Trigger: al crear una incidencia se arma su chat en automático.
create or replace function fn_llamada_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform fn_incidente_crear_chat(new.id);
  return new;
end; $$;

drop trigger if exists trg_llamada_chat on llamadas_cad;
create trigger trg_llamada_chat after insert on llamadas_cad
  for each row execute function fn_llamada_after_insert();

-- 4) El operador se une al chat al tomar el incidente ------------------------
-- Devuelve el canal del incidente (lo crea si faltara) y agrega al operador
-- (rol central) como miembro. Los guardias/supervisores ya son miembros.
create or replace function rpc_incidente_unir_chat(p_llamada uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_canal uuid;
begin
  select chat_canal_id into v_canal from llamadas_cad where id = p_llamada;
  if v_canal is null then v_canal := fn_incidente_crear_chat(p_llamada); end if;
  if v_canal is null then return null; end if;
  if coalesce(fn_rol_actual(), '') in ('supervisor','investigador','administrador') then
    insert into chat_miembros (canal_id, usuario_id) values (v_canal, auth.uid())
      on conflict do nothing;
  end if;
  return v_canal;
end; $$;
