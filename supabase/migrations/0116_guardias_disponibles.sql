-- =====================================================================
-- 0116_guardias_disponibles.sql
-- Base del relevo (Fase 2): personal DISPONIBLE para un turno = activo, que no
-- está ya en el turno, y para quien asignarlo NO rompería el anti-fatiga (0110).
--   * fn_turno_run(personal, ventana): cuántos turnos encadenados tendría esa
--     persona si se le asigna un turno con esa ventana (1 = sin encadenar).
--     Misma lógica que fn_bloquear_fatiga, reusada como consulta.
--   * rpc_guardias_disponibles(p_turno): lista el personal disponible (con su rol
--     y la racha que tendría), filtrando a los que no exceden turno_max_consecutivos.
-- =====================================================================

-- Racha de turnos encadenados que tendría p_personal si se le añade un turno con
-- ventana p_new (incluyéndola). Espeja fn_bloquear_fatiga (0110).
create or replace function fn_turno_run(p_personal uuid, p_new tstzrange)
returns int language plpgsql stable security definer set search_path = public as $$
declare
  v_desc numeric; v_gap interval;
  v_ini timestamptz[]; v_fin timestamptz[];
  n int; i int; posnew int; leftc int; rightc int;
begin
  if p_new is null then return 1; end if;
  select coalesce(turno_descanso_min_horas, 8) into v_desc from config_sistema where id = true;
  v_desc := coalesce(v_desc, 8);
  v_gap := make_interval(mins => round(v_desc * 60)::int);

  select array_agg(lower(w) order by lower(w)), array_agg(upper(w) order by lower(w))
    into v_ini, v_fin
  from (
    select fn_turno_ventana(tg.turno_id) as w
      from turno_guardias tg join turnos t on t.id = tg.turno_id
     where tg.personal_id = p_personal and tg.estatus = 'activo' and t.estatus = 'activo'
    union all
    select p_new
  ) s where s.w is not null;

  n := coalesce(array_length(v_ini, 1), 0);
  if n = 0 then return 1; end if;

  posnew := null;
  for i in 1..n loop
    if v_ini[i] = lower(p_new) and v_fin[i] = upper(p_new) then posnew := i; exit; end if;
  end loop;
  if posnew is null then return 1; end if;

  leftc := 0; i := posnew;
  while i > 1 and (v_ini[i] - v_fin[i-1]) < v_gap loop leftc := leftc + 1; i := i - 1; end loop;
  rightc := 0; i := posnew;
  while i < n and (v_ini[i+1] - v_fin[i]) < v_gap loop rightc := rightc + 1; i := i + 1; end loop;
  return leftc + 1 + rightc;
end $$;
grant execute on function fn_turno_run(uuid, tstzrange) to authenticated;

-- Personal disponible para un turno (para relevo/ajustes): activo, no está ya en
-- el turno (ni como guardia ni como supervisor) y no excede la fatiga.
create or replace function rpc_guardias_disponibles(p_turno uuid)
returns table(
  personal_id uuid,
  nombre      text,
  categoria   text,
  rol         text,
  run         int        -- turnos encadenados que tendría si se le asigna (1 = sin encadenar)
) language plpgsql stable security definer set search_path = public as $$
declare v_new tstzrange; v_max int;
begin
  select coalesce(turno_max_consecutivos, 2) into v_max from config_sistema where id = true;
  v_max := coalesce(v_max, 2);
  v_new := fn_turno_ventana(p_turno);

  return query
  select x.personal_id, x.nombre, x.categoria, x.rol, x.run
  from (
    select p.id as personal_id,
      trim(coalesce(pe.nombre,'') || ' ' || coalesce(pe.apellido_paterno,'') || ' ' || coalesce(pe.apellido_materno,'')) as nombre,
      p.categoria,
      coalesce(up.rol, 'guardia') as rol,
      case when v_new is null then 1 else fn_turno_run(p.id, v_new) end as run
    from personal p
    left join personas pe on pe.id = p.persona_id
    left join usuarios_perfil up on up.id = p.usuario_id
    where p.estatus = 'activo' and p.estado_laboral = 'activo'
      and p.id not in (select tg.personal_id from turno_guardias tg where tg.turno_id = p_turno and tg.estatus = 'activo')
      and p.id not in (select ts.supervisor_personal_id from turno_supervisores ts where ts.turno_id = p_turno and ts.estatus = 'activo')
  ) x
  where v_new is null or x.run <= v_max
  order by x.rol, x.nombre;
end $$;
grant execute on function rpc_guardias_disponibles(uuid) to authenticated;
