-- =====================================================================
-- 0102_turnos_terminado.sql
-- Turnos cuyo horario ya concluyó pasan a estado 'terminado'. Los turnos no se
-- cierran solos: el anterior seguía 'activo' y confundía a la app (traía el sitio
-- del turno pasado). rpc_cerrar_turnos_vencidos() marca 'terminado' los que
-- estaban 'activo' y cuya franja [hora_inicio, hora_fin] ya pasó (hora LOCAL de
-- Monterrey; soporta turnos que cruzan la medianoche). La web lo llama al abrir
-- Turnos; se puede además agendar con pg_cron.
-- =====================================================================

alter table turnos drop constraint if exists turnos_estado_check;
alter table turnos add constraint turnos_estado_check
  check (estado in ('borrador','activo','cerrado','terminado','programado','cubierto','falta','relevado'));

create or replace function rpc_cerrar_turnos_vencidos()
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_n int;
  v_now timestamp := (now() at time zone 'America/Monterrey');  -- ahora en hora local
begin
  with venc as (
    update turnos set estado = 'terminado', actualizado_en = now()
     where estatus = 'activo' and estado = 'activo'
       and hora_fin is not null
       and (
         fecha
         + hora_fin
         + case when hora_inicio is not null and hora_fin < hora_inicio then interval '1 day' else interval '0 day' end
       ) < v_now
     returning id
  ) select count(*) into v_n from venc;
  return v_n;
end $$;

grant execute on function rpc_cerrar_turnos_vencidos() to authenticated;

-- Opcional (si pg_cron está habilitado en el proyecto): correr cada 10 min.
-- create extension if not exists pg_cron;
-- select cron.schedule('cerrar-turnos-vencidos', '*/10 * * * *', $$select rpc_cerrar_turnos_vencidos()$$);
