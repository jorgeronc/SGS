-- =====================================================================
-- 0120_tareas_asignar_menos_ruido.sql
-- Reduce el ruido de bitácora al crear/asignar tareas: rpc_asignar_tarea_guardias
-- solo actualiza tareas.sitio_id cuando REALMENTE cambia (antes lo escribía siempre,
-- generando un UPDATE de auditoría redundante justo tras el INSERT).
-- =====================================================================
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
    update tareas set sitio_id = p_sitio, actualizado_en = now()
     where id = p_tarea_id and sitio_id is distinct from p_sitio;  -- solo si cambia
  end if;

  insert into tarea_asignaciones (tarea_id, personal_id)
  select distinct p_tarea_id, s.pid from (
    select unnest(coalesce(p_personal, array[]::uuid[])) as pid
    union
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
