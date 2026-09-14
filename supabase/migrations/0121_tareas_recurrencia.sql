-- =====================================================================
-- 0121_tareas_recurrencia.sql  (Fase B: recurrencia de tareas)
-- Modelo "plantilla + generación automática":
--   * Una tarea con es_plantilla=true es una PLANTILLA (no se asigna ni se trabaja).
--   * recurrencia jsonb: { modo: 'diaria'|'semana'|'turno', dias:[1..7] (ISO, para
--     'semana'), alcance:'todos'|'especificos', guardias:[uuid] }.
--   * recurrencia_activa: pausar sin borrar.
--   * plantilla_id: en las INSTANCIAS generadas, apunta a su plantilla.
--   * rpc_generar_tareas_recurrentes(fecha): crea las instancias faltantes del día
--     (idempotente por datos_adicionales.ocurrencia) y las asigna. Corre por pg_cron
--     cada hora y se puede llamar manualmente ("Generar ahora").
-- =====================================================================

alter table tareas add column if not exists es_plantilla       boolean not null default false;
alter table tareas add column if not exists plantilla_id       uuid references tareas(id);
alter table tareas add column if not exists recurrencia        jsonb;
alter table tareas add column if not exists recurrencia_activa boolean not null default true;
create index if not exists idx_tareas_plantilla on tareas (plantilla_id);
create index if not exists idx_tareas_es_plantilla on tareas (es_plantilla) where es_plantilla;
comment on column tareas.recurrencia is 'Regla de recurrencia (solo en plantillas): {modo:diaria|semana|turno, dias:[1..7], alcance, guardias:[uuid]}.';

-- Las plantillas no son tareas vigentes "de trabajo" (no aparecen en el móvil ni tablero).
-- DROP + CREATE (no "create or replace"): al agregar columnas a tareas, t.* corre la
-- posición de la columna "vigente" y "create or replace view" no permite renombrar.
drop view if exists tareas_vigentes;
create view tareas_vigentes as
  select t.*, (t.vigencia_hasta is null or t.vigencia_hasta > now()) as vigente
  from tareas t
  where t.estatus = 'activo' and not t.es_plantilla
    and (t.vigencia_hasta is null or t.vigencia_hasta > now() - interval '24 hours');
grant select on tareas_vigentes to authenticated, anon;

-- Generador de instancias de tareas recurrentes para una fecha (local Monterrey).
create or replace function rpc_generar_tareas_recurrentes(p_fecha date default (now() at time zone 'America/Monterrey')::date)
returns int language plpgsql security definer set search_path = public as $$
declare
  pl record; tr record;
  v_modo text; v_dow int := extract(isodow from p_fecha)::int;
  v_guardias uuid[]; v_alcance text;
  v_inst uuid; v_key text; v_n int := 0;
  v_tini time; v_tfin time; v_desde timestamptz; v_hasta timestamptz;
begin
  for pl in
    select * from tareas
     where es_plantilla and estatus = 'activo' and coalesce(recurrencia_activa, true)
       and recurrencia is not null
  loop
    v_modo := pl.recurrencia->>'modo';
    v_alcance := coalesce(pl.recurrencia->>'alcance', 'todos');
    v_guardias := (select array_agg(x::uuid) from jsonb_array_elements_text(coalesce(pl.recurrencia->'guardias','[]'::jsonb)) x);

    if v_modo = 'semana' then
      if not (v_dow = any (select jsonb_array_elements_text(coalesce(pl.recurrencia->'dias','[]'::jsonb))::int)) then
        continue;
      end if;
    elsif v_modo not in ('diaria','turno') then
      continue;
    end if;

    if v_modo in ('diaria','semana') then
      v_key := p_fecha::text;
      if exists (select 1 from tareas i where i.plantilla_id = pl.id and i.estatus <> 'cancelado'
                   and i.datos_adicionales->>'ocurrencia' = v_key) then
        continue;
      end if;
      -- Ventana = hora del día de la plantilla, aplicada a p_fecha.
      v_tini := (pl.vigencia_desde at time zone 'America/Monterrey')::time;
      v_tfin := (coalesce(pl.vigencia_hasta, pl.vigencia_desde + interval '30 minutes') at time zone 'America/Monterrey')::time;
      v_desde := (p_fecha + v_tini) at time zone 'America/Monterrey';
      v_hasta := (p_fecha + v_tfin) at time zone 'America/Monterrey';
      if v_hasta <= v_desde then v_hasta := v_hasta + interval '1 day'; end if;

      insert into tareas (tipo, motivo, asunto, instrucciones, direccion, latitud, longitud, prioridad,
                          vigencia_desde, vigencia_hasta, sitio_id, fotografias, plantilla_id, datos_adicionales)
      values (pl.tipo, pl.motivo, pl.asunto, pl.instrucciones, pl.direccion, pl.latitud, pl.longitud, pl.prioridad,
              v_desde, v_hasta, pl.sitio_id, pl.fotografias, pl.id,
              jsonb_build_object('ocurrencia', v_key, 'origen', 'recurrencia'))
      returning id into v_inst;

      if v_alcance = 'especificos' and v_guardias is not null and array_length(v_guardias,1) > 0 then
        perform rpc_asignar_tarea_guardias(v_inst, v_guardias, pl.sitio_id);
      else
        perform rpc_asignar_tarea_guardias(v_inst, null, pl.sitio_id);
      end if;
      v_n := v_n + 1;

    else -- 'turno': una instancia por turno activo del sitio ese día
      for tr in
        select id, fecha, hora_inicio, hora_fin from turnos
         where sitio_id is not distinct from pl.sitio_id  -- turnos del sitio (o generales)
           and estado = 'activo' and estatus = 'activo' and fecha = p_fecha
      loop
        v_key := p_fecha::text || ':' || tr.id::text;
        if exists (select 1 from tareas i where i.plantilla_id = pl.id and i.estatus <> 'cancelado'
                     and i.datos_adicionales->>'ocurrencia' = v_key) then
          continue;
        end if;
        v_desde := (tr.fecha + coalesce(tr.hora_inicio, time '00:00')) at time zone 'America/Monterrey';
        v_hasta := (tr.fecha + coalesce(tr.hora_fin, time '23:59')
                    + case when coalesce(tr.hora_fin, time '23:59') < coalesce(tr.hora_inicio, time '00:00') then interval '1 day' else interval '0' end)
                   at time zone 'America/Monterrey';

        insert into tareas (tipo, motivo, asunto, instrucciones, direccion, latitud, longitud, prioridad,
                            vigencia_desde, vigencia_hasta, sitio_id, fotografias, plantilla_id, datos_adicionales)
        values (pl.tipo, pl.motivo, pl.asunto, pl.instrucciones, pl.direccion, pl.latitud, pl.longitud, pl.prioridad,
                v_desde, v_hasta, pl.sitio_id, pl.fotografias, pl.id,
                jsonb_build_object('ocurrencia', v_key, 'origen', 'recurrencia', 'turno_id', tr.id))
        returning id into v_inst;

        -- Se asigna a los guardias de ESE turno en el sitio (dispara push por guardia).
        insert into tarea_asignaciones (tarea_id, personal_id)
        select v_inst, tg.personal_id from turno_guardias tg
         where tg.turno_id = tr.id and tg.sitio_id is not distinct from pl.sitio_id and tg.estatus = 'activo'
        on conflict do nothing;
        v_n := v_n + 1;
      end loop;
    end if;
  end loop;
  return v_n;
end $$;
grant execute on function rpc_generar_tareas_recurrentes(date) to authenticated;

-- pg_cron: generar cada hora (idempotente). Toma la fecha local Monterrey.
select cron.unschedule('sgs-tareas-recurrentes') where exists (select 1 from cron.job where jobname = 'sgs-tareas-recurrentes');
select cron.schedule('sgs-tareas-recurrentes', '10 * * * *', $$ select public.rpc_generar_tareas_recurrentes(); $$);
