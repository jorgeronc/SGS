-- =====================================================================
-- 0117_relevo_override_fatiga.sql  (Fase 3: relevo con override de fatiga)
-- Permite que coordinador/administrador FUERCEN la asignación de un guardia a un
-- turno aunque encadene turnos (relevo de emergencia), registrando el motivo.
--   * turno_guardias.override_motivo / override_por: auditan el relevo forzado.
--   * fn_bloquear_fatiga: respeta un "bypass" de transacción (GUC sgs.fatiga_bypass).
--   * rpc_asignar_con_override(turno, personal, sitio, motivo): gated a
--     coordinador/administrador; activa el bypass e inserta con el motivo.
-- El bypass es local a la transacción del RPC (set_config ..., true), así que los
-- inserts normales del cliente siguen protegidos por el anti-fatiga.
-- =====================================================================

alter table turno_guardias add column if not exists override_motivo text;
alter table turno_guardias add column if not exists override_por    uuid references auth.users(id);
comment on column turno_guardias.override_motivo is 'Motivo del relevo forzado (override de fatiga). Null = asignación normal.';

-- Re-crea el trigger de fatiga (0110) agregando el bypass por GUC al inicio.
create or replace function fn_bloquear_fatiga()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_desc numeric; v_max int; v_gap interval;
  v_new tstzrange;
  v_ini timestamptz[]; v_fin timestamptz[];
  n int; i int; posnew int; leftc int; rightc int; run int;
begin
  -- Override de relevo (coordinador/administrador vía rpc_asignar_con_override):
  -- si el bypass está activo en esta transacción, no se evalúa la fatiga.
  if coalesce(current_setting('sgs.fatiga_bypass', true), 'off') = 'on' then
    return NEW;
  end if;

  select coalesce(turno_descanso_min_horas, 8), coalesce(turno_max_consecutivos, 2)
    into v_desc, v_max from config_sistema where id = true;
  v_desc := coalesce(v_desc, 8); v_max := coalesce(v_max, 2);
  v_gap := make_interval(mins => round(v_desc * 60)::int);

  v_new := fn_turno_ventana(NEW.turno_id);
  if v_new is null then return NEW; end if;

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
  if n <= v_max then return NEW; end if;

  posnew := null;
  for i in 1..n loop
    if v_ini[i] = lower(v_new) and v_fin[i] = upper(v_new) then posnew := i; exit; end if;
  end loop;
  if posnew is null then return NEW; end if;

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

-- Fuerza la asignación de un guardia a un turno omitiendo la fatiga (relevo).
-- Solo coordinador/administrador; exige motivo; audita override_por/override_motivo.
create or replace function rpc_asignar_con_override(
  p_turno uuid, p_personal uuid, p_sitio uuid, p_motivo text
) returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(fn_rol_actual(), '') not in ('coordinador','administrador') then
    raise exception 'Solo coordinador o administrador pueden forzar una asignación (override de fatiga).';
  end if;
  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Indica el motivo del relevo forzado.';
  end if;

  perform set_config('sgs.fatiga_bypass', 'on', true);  -- local a esta transacción

  insert into turno_guardias (turno_id, personal_id, sitio_id, override_motivo, override_por)
    values (p_turno, p_personal, p_sitio, btrim(p_motivo), auth.uid())
  on conflict (turno_id, personal_id) do update
    set sitio_id = excluded.sitio_id, override_motivo = excluded.override_motivo,
        override_por = excluded.override_por, actualizado_en = now();
end $$;
grant execute on function rpc_asignar_con_override(uuid, uuid, uuid, text) to authenticated;
