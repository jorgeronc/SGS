-- =====================================================================
-- 0126_turno_ventana_activacion.sql
-- Rol de turnos: un turno solo puede ACTIVARSE cuando falta como máximo 2 horas
-- para el inicio de su horario (o ya inició). Antes de eso debe quedar en
-- 'borrador'. Evita activar hoy el turno de la noche y que el móvil lo cuente.
--
-- La ventana se calcula con la fecha + hora_inicio del turno en zona local
-- (America/Monterrey). Si el turno no tiene hora_inicio, no hay horario que
-- validar y se permite activar.
-- =====================================================================

create or replace function fn_turno_gate_activacion() returns trigger
language plpgsql as $$
declare v_inicio timestamptz;
begin
  -- Solo interesa la transición a 'activo'.
  if new.estado = 'activo' and coalesce(old.estado, '') <> 'activo' then
    if new.hora_inicio is not null then
      v_inicio := (new.fecha + new.hora_inicio) at time zone 'America/Monterrey';
      if v_inicio - now() > interval '2 hours' then
        raise exception 'No se puede activar el turno todavía: solo puede activarse dentro de las 2 horas previas a su inicio (%). Mantenlo en borrador.',
          to_char(v_inicio at time zone 'America/Monterrey', 'DD/MM/YYYY HH24:MI');
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_turno_gate_activacion on turnos;
create trigger trg_turno_gate_activacion before update on turnos
  for each row execute function fn_turno_gate_activacion();
