-- =====================================================================
-- 0118_tareas_nucleo.sql  (Fase A: núcleo de tareas)
-- * Vigencia: si no se da fin, se pone +30 min del inicio (editable en la UI).
-- * Asignación por SITIO primero, y opcionalmente por GUARDIA(s): si se pasan
--   guardias, solo esos; si no, todos los del sitio con turno vigente hoy.
-- * Estatus unificados con el móvil (tarea_asignaciones.respuesta:
--   pendiente/enterado/atendiendo/completada). tareas.estado se deriva.
-- * Bloqueo/relevo: cuando alguien "atendiendo/completada" toma el control, los
--   demás no pueden cambiar el estatus, SALVO que el turno de la tarea haya vencido
--   y no se haya subido evidencia (entonces se libera).
-- * Push a los DEMÁS guardias de la tarea cuando alguien atiende/completa.
-- =====================================================================

-- 1) Columnas nuevas -----------------------------------------------------------
alter table tareas add column if not exists sitio_id       uuid references sitios(id);
alter table tareas add column if not exists atendida_por   uuid references personal(id);
alter table tareas add column if not exists completada_por uuid references personal(id);
comment on column tareas.sitio_id is 'Sitio al que pertenece la tarea (asignación por sitio → guardias).';
comment on column tareas.completada_por is 'Personal que completó la tarea (para mostrar en la lista del móvil).';
create index if not exists idx_tareas_sitio on tareas (sitio_id);

-- 2) Vigencia por defecto +30 min si no se especifica fin ----------------------
create or replace function fn_tarea_vigencia_default() returns trigger
language plpgsql as $$
begin
  if new.vigencia_desde is null then new.vigencia_desde := now(); end if;
  if new.vigencia_hasta is null then new.vigencia_hasta := new.vigencia_desde + interval '30 minutes'; end if;
  return new;
end $$;
drop trigger if exists trg_tarea_vigencia_default on tareas;
create trigger trg_tarea_vigencia_default before insert on tareas
  for each row execute function fn_tarea_vigencia_default();

-- 3) ¿La tarea tiene evidencia ligada? (foto/video) ----------------------------
create or replace function fn_tarea_tiene_evidencia(p_tarea uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from vinculos v
     where v.entidad_origen_tipo = 'tarea' and v.entidad_origen_id = p_tarea
       and v.entidad_destino_tipo = 'evidencia' and v.estatus = 'activo'
  ) or exists (
    select 1 from evidencias e
     where e.estatus = 'activo'
       and e.datos_adicionales->>'origen_tipo' = 'tarea'
       and e.datos_adicionales->>'origen_id' = p_tarea::text
  );
$$;
grant execute on function fn_tarea_tiene_evidencia(uuid) to authenticated;

-- 4) Asignación por sitio → todos, o guardias específicos ----------------------
create or replace function rpc_asignar_tarea_guardias(
  p_tarea_id uuid,
  p_personal uuid[] default null,
  p_sitio    uuid default null
) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_n   int;
  v_hoy date := (now() at time zone 'America/Monterrey')::date;
begin
  if p_sitio is not null then
    update tareas set sitio_id = p_sitio, actualizado_en = now() where id = p_tarea_id;
  end if;

  insert into tarea_asignaciones (tarea_id, personal_id)
  select distinct p_tarea_id, s.pid from (
    -- guardias explícitos (uno/varios)
    select unnest(coalesce(p_personal, array[]::uuid[])) as pid
    union
    -- o TODOS los del sitio con turno vigente hoy (solo si no se pasaron guardias)
    select tg.personal_id as pid
      from turno_guardias tg join turnos t on t.id = tg.turno_id
     where p_sitio is not null
       and (p_personal is null or array_length(p_personal, 1) is null)
       and tg.sitio_id = p_sitio and tg.estatus = 'activo'
       and t.estado = 'activo' and t.fecha = v_hoy
  ) s
  where s.pid is not null
  on conflict do nothing;

  get diagnostics v_n = row_count;
  return v_n;
end $$;
grant execute on function rpc_asignar_tarea_guardias(uuid, uuid[], uuid) to authenticated;

-- 5) Bloqueo/relevo: gate BEFORE UPDATE en tarea_asignaciones ------------------
create or replace function fn_tarea_asig_gate() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_claimer record; v_venc timestamptz; v_stale boolean;
begin
  if new.respuesta is not distinct from old.respuesta then return new; end if;

  -- ¿Otra asignación de la misma tarea ya tomó el control?
  select ta.id, ta.personal_id into v_claimer
    from tarea_asignaciones ta
   where ta.tarea_id = new.tarea_id and ta.id <> new.id and ta.estatus = 'activo'
     and ta.respuesta in ('atendiendo','completada')
   order by (ta.respuesta = 'completada') desc, ta.respondido_en asc
   limit 1;

  if found then
    select vigencia_hasta into v_venc from tareas where id = new.tarea_id;
    -- El claim se respeta salvo que la tarea haya vencido SIN evidencia (relevo).
    v_stale := (v_venc is not null and now() > v_venc and not fn_tarea_tiene_evidencia(new.tarea_id));
    if not v_stale then
      raise exception 'Esta tarea ya está siendo atendida por otro guardia; no puedes cambiar su estatus.';
    end if;
    -- Relevo: se libera el claim previo (regresa a "enterado").
    update tarea_asignaciones set respuesta = 'enterado', actualizado_en = now() where id = v_claimer.id;
  end if;
  return new;
end $$;
drop trigger if exists trg_tarea_asig_gate on tarea_asignaciones;
create trigger trg_tarea_asig_gate before update on tarea_asignaciones
  for each row execute function fn_tarea_asig_gate();

-- 6) Rollup: deriva tareas.estado + atendida_por/completada_por ----------------
create or replace function fn_tarea_asig_rollup() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_estado text; v_atend uuid; v_compl uuid;
begin
  select personal_id into v_compl from tarea_asignaciones
   where tarea_id = new.tarea_id and estatus = 'activo' and respuesta = 'completada'
   order by respondido_en asc limit 1;
  select personal_id into v_atend from tarea_asignaciones
   where tarea_id = new.tarea_id and estatus = 'activo' and respuesta = 'atendiendo'
   order by respondido_en asc limit 1;

  if v_compl is not null then v_estado := 'completada';
  elsif exists (select 1 from tarea_asignaciones where tarea_id = new.tarea_id and estatus = 'activo' and respuesta in ('atendiendo','enterado'))
    then v_estado := 'en_proceso';
  else v_estado := 'abierta'; end if;

  update tareas
     set estado = v_estado, atendida_por = coalesce(v_atend, v_compl), completada_por = v_compl,
         actualizado_en = now()
   where id = new.tarea_id and (estado is distinct from v_estado
         or atendida_por is distinct from coalesce(v_atend, v_compl) or completada_por is distinct from v_compl);
  return new;
end $$;
drop trigger if exists trg_tarea_asig_rollup on tarea_asignaciones;
create trigger trg_tarea_asig_rollup after insert or update on tarea_asignaciones
  for each row execute function fn_tarea_asig_rollup();

-- 7) Push a los demás guardias cuando alguien atiende/completa -----------------
create or replace function fn_push_tarea_estado() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_secret text := (select valor from app_secretos where clave = 'push_secret');
  v_url    text := 'https://rdyjjfbehjfggpldmmur.supabase.co/functions/v1/enviar_push';
  v_nom text; v_folio text; r record;
begin
  if coalesce(v_secret, '') = '' then return new; end if;
  if new.respuesta is not distinct from old.respuesta then return new; end if;
  if new.respuesta not in ('atendiendo','completada') then return new; end if;

  select trim(coalesce(pe.nombre,'') || ' ' || coalesce(pe.apellido_paterno,'')) into v_nom
    from personal p left join personas pe on pe.id = p.persona_id where p.id = new.personal_id;
  select folio into v_folio from tareas where id = new.tarea_id;

  for r in select personal_id from tarea_asignaciones
            where tarea_id = new.tarea_id and id <> new.id and estatus = 'activo' and personal_id is not null loop
    perform net.http_post(
      url     := v_url,
      headers := jsonb_build_object('Content-Type','application/json','x-push-secret', v_secret),
      body    := jsonb_build_object(
        'personal_id', r.personal_id,
        'tipo', 'tarea',
        'titulo', (case when new.respuesta = 'completada' then 'Tarea completada' else 'Tarea en atención' end) || coalesce(' ' || v_folio, ''),
        'cuerpo', coalesce(v_nom, 'Un guardia') || (case when new.respuesta = 'completada' then ' completó la tarea.' else ' está atendiendo la tarea.' end),
        'data', jsonb_build_object('tipo', 'tarea', 'tarea_id', new.tarea_id)
      ));
  end loop;
  return new;
end $$;
drop trigger if exists trg_push_tarea_estado on tarea_asignaciones;
create trigger trg_push_tarea_estado after update on tarea_asignaciones
  for each row execute function fn_push_tarea_estado();
