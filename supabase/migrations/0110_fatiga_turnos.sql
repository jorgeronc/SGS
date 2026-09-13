-- =====================================================================
-- 0110_fatiga_turnos.sql
-- Anti-fatiga: un guardia no puede encadenar demasiados turnos seguidos
-- (p. ej. 3 turnos back-to-back). Se ENFORZA en el servidor con un trigger
-- BEFORE INSERT sobre turno_guardias, para que no se pueda saltar desde el
-- cliente. "Encadenado" = el descanso entre el fin de un turno y el inicio del
-- siguiente es MENOR al mínimo configurado.
--
-- Parámetros (config_sistema, editables en Parámetros):
--   turno_descanso_min_horas : descanso mínimo entre turnos para NO considerarlos
--                              encadenados (default 8 h).
--   turno_max_consecutivos   : máximo de turnos encadenados permitidos (default 2;
--                              el 3ro seguido se bloquea).
-- =====================================================================

alter table config_sistema add column if not exists turno_descanso_min_horas numeric  not null default 8;
alter table config_sistema add column if not exists turno_max_consecutivos   integer  not null default 2;
comment on column config_sistema.turno_descanso_min_horas is 'Descanso mínimo (h) entre turnos para no considerarlos encadenados (anti-fatiga).';
comment on column config_sistema.turno_max_consecutivos   is 'Máximo de turnos encadenados que un guardia puede tener seguidos.';

-- Ventana [inicio, fin) de un turno como tstzrange (maneja cruce de medianoche).
-- null si el turno no tiene horas (no se puede evaluar fatiga sin franja).
create or replace function fn_turno_ventana(p_turno uuid)
returns tstzrange language sql stable security definer set search_path = public as $$
  select case
    when t.hora_inicio is null or t.hora_fin is null then null
    else tstzrange(
      (t.fecha + t.hora_inicio)::timestamptz,
      (t.fecha + t.hora_fin + case when t.hora_fin < t.hora_inicio then interval '1 day' else interval '0 day' end)::timestamptz
    )
  end
  from turnos t where t.id = p_turno;
$$;

-- Trigger anti-fatiga: al asignar un guardia a un turno, calcula la cadena de
-- turnos consecutivos (gap < descanso mínimo) que INCLUYE el turno nuevo; si supera
-- el máximo, bloquea.
create or replace function fn_bloquear_fatiga()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_desc numeric; v_max int; v_gap interval;
  v_new tstzrange;
  v_ini timestamptz[]; v_fin timestamptz[];
  n int; i int; posnew int; leftc int; rightc int; run int;
begin
  select coalesce(turno_descanso_min_horas, 8), coalesce(turno_max_consecutivos, 2)
    into v_desc, v_max from config_sistema where id = true;
  v_desc := coalesce(v_desc, 8); v_max := coalesce(v_max, 2);
  v_gap := make_interval(mins => round(v_desc * 60)::int);

  v_new := fn_turno_ventana(NEW.turno_id);
  if v_new is null then return NEW; end if; -- turno sin horas: no se evalúa

  -- Ventanas del guardia (turnos NO cancelados donde ya está asignado) + el nuevo,
  -- ordenadas por inicio.
  select array_agg(lower(w) order by lower(w)), array_agg(upper(w) order by lower(w))
    into v_ini, v_fin
  from (
    select fn_turno_ventana(tg.turno_id) as w
      from turno_guardias tg join turnos t on t.id = tg.turno_id
     where tg.personal_id = NEW.personal_id and tg.estatus = 'activo'
       and tg.turno_id <> NEW.turno_id and t.estatus = 'activo'
    union all
    select v_new
  ) s where s.w is not null;

  n := coalesce(array_length(v_ini, 1), 0);
  if n <= v_max then return NEW; end if; -- no puede exceder

  -- Posición del turno nuevo en el arreglo ordenado.
  posnew := null;
  for i in 1..n loop
    if v_ini[i] = lower(v_new) and v_fin[i] = upper(v_new) then posnew := i; exit; end if;
  end loop;
  if posnew is null then return NEW; end if;

  -- Expande la cadena a izquierda/derecha mientras el gap sea < descanso mínimo.
  leftc := 0; i := posnew;
  while i > 1 and (v_ini[i] - v_fin[i-1]) < v_gap loop leftc := leftc + 1; i := i - 1; end loop;
  rightc := 0; i := posnew;
  while i < n and (v_ini[i+1] - v_fin[i]) < v_gap loop rightc := rightc + 1; i := i + 1; end loop;
  run := leftc + 1 + rightc;

  if run > v_max then
    raise exception 'Anti-fatiga: este guardia quedaría con % turnos encadenados sin descanso de % h (máximo permitido: % seguidos). Deja descanso o asigna a otro guardia.', run, v_desc, v_max;
  end if;
  return NEW;
end $$;

drop trigger if exists trg_bloquear_fatiga on turno_guardias;
create trigger trg_bloquear_fatiga before insert on turno_guardias
  for each row execute function fn_bloquear_fatiga();
