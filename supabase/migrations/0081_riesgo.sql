-- =====================================================================
-- 0081_riesgo.sql · Vista Operativa (Fase B)
-- Evaluación de riesgo del movimiento: reglas simples (carga + horario) que
-- SUGIEREN un nivel, más ajuste manual (override) del mando. Historial
-- append-only; el nivel vigente se refleja en movimientos.nivel_riesgo.
-- Decisión D3: manual + reglas simples ahora; motor completo después.
-- =====================================================================

create table if not exists evaluaciones_riesgo (
  id                  uuid primary key default gen_random_uuid(),
  movimiento_id       uuid not null references movimientos(id),
  riesgo_carga        text,
  riesgo_ruta         text,
  riesgo_horario      text,
  nivel_resultante    text,
  protocolo_requerido text,
  metodo              text not null default 'auto' check (metodo in ('auto','manual')),
  ajustado_por        text,
  notas               text,
  creado_en           timestamptz not null default now()
);
comment on table evaluaciones_riesgo is 'Historial de evaluaciones de riesgo de un movimiento (append-only). El nivel vigente vive en movimientos.nivel_riesgo.';
create index if not exists idx_eval_riesgo_mov on evaluaciones_riesgo(movimiento_id, creado_en desc);

-- Append-only.
drop trigger if exists trg_no_delete_eval_riesgo on evaluaciones_riesgo;
create trigger trg_no_delete_eval_riesgo before delete on evaluaciones_riesgo for each row execute function fn_bloquear_delete();
revoke delete, update on evaluaciones_riesgo from authenticated, anon;
alter table evaluaciones_riesgo enable row level security;
drop policy if exists sel_eval_riesgo on evaluaciones_riesgo;
create policy sel_eval_riesgo on evaluaciones_riesgo for select to authenticated using (true);
drop policy if exists ins_eval_riesgo on evaluaciones_riesgo;
create policy ins_eval_riesgo on evaluaciones_riesgo for insert to authenticated
  with check (coalesce(fn_rol_actual(),'') in ('operador','coordinador','supervisor','administrador'));

-- Rango del catálogo nivel_riesgo_carga (Normal<Controlada<Alto valor<Sensible<Crítica).
create or replace function fn_riesgo_rango(p_nivel text)
returns int as $fn$
  select case coalesce(p_nivel,'')
    when 'Normal' then 1 when 'Controlada' then 2 when 'Alto valor' then 3
    when 'Sensible' then 4 when 'Crítica' then 5 else 1 end;
$fn$ language sql immutable;

create or replace function fn_riesgo_label(p_rango int)
returns text as $fn$
  select case least(greatest(p_rango,1),5)
    when 1 then 'Normal' when 2 then 'Controlada' when 3 then 'Alto valor'
    when 4 then 'Sensible' else 'Crítica' end;
$fn$ language sql immutable;

-- Recalcula el riesgo por reglas simples: nivel de carga + horario nocturno.
create or replace function rpc_recalcular_riesgo(p_movimiento_id uuid)
returns jsonb as $fn$
declare
  m record; v_carga_max int; v_hora int; v_noct boolean;
  v_rango int; v_nivel text; v_proto text; v_hlbl text; v_correo text;
begin
  select * into m from movimientos where id = p_movimiento_id;
  if m.id is null then raise exception 'movimiento no encontrado'; end if;

  -- Riesgo de carga: mayor nivel entre las cargas del movimiento.
  select coalesce(max(fn_riesgo_rango(c.nivel_riesgo)), 1) into v_carga_max
    from movimiento_unidades mu join cargas c on c.id = mu.carga_id
    where mu.movimiento_id = p_movimiento_id and mu.estatus='activo';

  -- Riesgo de horario: nocturno (18:00–06:00) sube un nivel.
  v_hora := extract(hour from coalesce(m.programado_inicio, now()))::int;
  v_noct := (v_hora >= 18 or v_hora < 6);
  v_hlbl := case when v_noct then 'Nocturno (alto)' else 'Diurno (normal)' end;

  v_rango := least(v_carga_max + (case when v_noct then 1 else 0 end), 5);
  v_nivel := fn_riesgo_label(v_rango);
  v_proto := case when v_rango >= 4 then 'Custodia armada + monitoreo continuo'
                  when v_rango = 3 then 'Monitoreo reforzado'
                  else 'Estándar' end;

  select email into v_correo from auth.users where id = auth.uid();

  insert into evaluaciones_riesgo (movimiento_id, riesgo_carga, riesgo_ruta, riesgo_horario,
    nivel_resultante, protocolo_requerido, metodo, ajustado_por)
  values (p_movimiento_id, fn_riesgo_label(v_carga_max), 'Normal', v_hlbl, v_nivel, v_proto, 'auto', v_correo);

  update movimientos set nivel_riesgo = v_nivel, actualizado_en = now() where id = p_movimiento_id;

  insert into movimiento_eventos (movimiento_id, tipo_evento, etapa, actor, datos)
    values (p_movimiento_id, 'risk.assessed', 'EVALUACION_RIESGO', v_correo,
            jsonb_build_object('nivel', v_nivel, 'protocolo', v_proto, 'horario', v_hlbl, 'metodo','auto'));

  return jsonb_build_object('ok', true, 'nivel', v_nivel, 'protocolo', v_proto,
    'riesgo_carga', fn_riesgo_label(v_carga_max), 'riesgo_horario', v_hlbl);
end;
$fn$ language plpgsql security definer;

-- Ajuste manual del nivel (override auditado; solo mando).
create or replace function rpc_ajustar_riesgo(p_movimiento_id uuid, p_nivel text, p_motivo text)
returns jsonb as $fn$
declare v_rol text := coalesce(fn_rol_actual(),''); v_proto text; v_rango int; v_correo text;
begin
  if v_rol not in ('coordinador','supervisor','administrador') then
    raise exception 'Solo coordinador/administrador puede ajustar el nivel de riesgo.';
  end if;
  if p_nivel not in ('Normal','Controlada','Alto valor','Sensible','Crítica') then
    raise exception 'Nivel de riesgo inválido: %', p_nivel;
  end if;
  v_rango := fn_riesgo_rango(p_nivel);
  v_proto := case when v_rango >= 4 then 'Custodia armada + monitoreo continuo'
                  when v_rango = 3 then 'Monitoreo reforzado' else 'Estándar' end;
  select email into v_correo from auth.users where id = auth.uid();

  insert into evaluaciones_riesgo (movimiento_id, nivel_resultante, protocolo_requerido, metodo, ajustado_por, notas)
    values (p_movimiento_id, p_nivel, v_proto, 'manual', v_correo, p_motivo);
  update movimientos set nivel_riesgo = p_nivel, actualizado_en = now() where id = p_movimiento_id;

  insert into movimiento_eventos (movimiento_id, tipo_evento, etapa, actor, datos)
    values (p_movimiento_id, 'risk.override', 'EVALUACION_RIESGO', v_correo,
            jsonb_build_object('nivel', p_nivel, 'motivo', p_motivo, 'metodo','manual'));

  return jsonb_build_object('ok', true, 'nivel', p_nivel, 'protocolo', v_proto);
end;
$fn$ language plpgsql security definer;

grant execute on function rpc_recalcular_riesgo(uuid) to authenticated;
grant execute on function rpc_ajustar_riesgo(uuid, text, text) to authenticated;

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='evaluaciones_riesgo') then
    alter publication supabase_realtime add table evaluaciones_riesgo;
  end if;
end $$;
