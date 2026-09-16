-- =====================================================================
-- 0125_cad_despacho_coherencia.sql
-- CENTRAL / DESPACHO (CAD) — coherencia del proceso de atención.
--
-- Corrige cuatro puntos del diagnóstico de despacho:
--   (2) Anti-duplicado: se apoya en la UI (excluir recursos ya despachados),
--       pero aquí se documenta el criterio de "despacho activo".
--   (3) Cancelar / deshacer un despacho quedando en el historial y con el
--       operador que lo canceló: se agrega `cancelado_por` + rpc_cancelar_despacho.
--   (4) Coherencia de estados:
--       - La restricción de despachos.estado, que 0015 dejó en el vocabulario
--         POLICIAL (asignada/enterado/en_ruta/en_lugar/cerrado), no admitía los
--         estados que usa la UI de SGS (en_sitio / liberada) → al marcarlos
--         fallaba silenciosamente. Se amplía a un SUPERCONJUNTO que admite ambos.
--       - Rollup automático despacho → llamada: en_sitio ⇒ la llamada pasa a
--         "en atención"; todos liberada/cerrado ⇒ "resuelta" (sin cerrar el
--         reporte, el cierre sigue siendo manual con conclusión). Solo avanza,
--         nunca retrocede, y no toca reportes ya cerrados/cancelados.
--       - Estado del recurso despachado: `personal.estatus_operativo` se marca
--         'atendiendo_incidente' mientras el guardia/supervisor tenga un despacho
--         activo no liberado, y se limpia al liberar/cancelar/cerrar.
-- =====================================================================

-- ---------------------------------------------------------------------
-- (3) Quién canceló el despacho
-- ---------------------------------------------------------------------
alter table despachos add column if not exists cancelado_por uuid references auth.users(id);
comment on column despachos.cancelado_por is 'Usuario (operador) que canceló/deshizo el despacho.';

-- ---------------------------------------------------------------------
-- (4) Restricción de estado: superconjunto policial (0015) + SGS
-- ---------------------------------------------------------------------
alter table despachos drop constraint if exists despachos_estado_check;
alter table despachos add constraint despachos_estado_check
  check (estado in ('asignada','enterado','en_ruta','en_lugar','en_sitio','liberada','cerrado'));

-- ---------------------------------------------------------------------
-- (4) Estado operativo del recurso (guardia / supervisor)
-- ---------------------------------------------------------------------
alter table personal add column if not exists estatus_operativo text;
comment on column personal.estatus_operativo is 'Estado operativo derivado: ''atendiendo_incidente'' mientras tenga un despacho CAD activo no liberado; null en otro caso. Lo mantiene el trigger de despachos.';

-- Estados de despacho que cuentan como "atendiendo" (en curso).
create or replace function fn_despacho_en_curso(p_estado text) returns boolean
language sql immutable as $$
  select p_estado in ('asignada','enterado','en_ruta','en_lugar','en_sitio');
$$;

-- Recalcula el estatus_operativo de un elemento según sus despachos activos.
create or replace function fn_recalc_estatus_operativo(p_personal uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_atiende boolean;
begin
  if p_personal is null then return; end if;
  select exists (
    select 1 from despachos d
      join llamadas_cad l on l.id = d.llamada_id
     where d.personal_id = p_personal
       and d.estatus = 'activo'
       and fn_despacho_en_curso(d.estado)
       and l.estatus = 'activo'
       and l.estado_despacho <> 'resuelta'
  ) into v_atiende;

  update personal
     set estatus_operativo = case when v_atiende then 'atendiendo_incidente' else null end,
         actualizado_en = now()
   where id = p_personal
     and estatus_operativo is distinct from (case when v_atiende then 'atendiendo_incidente' else null end);
end;
$$;

-- ---------------------------------------------------------------------
-- (4) Rollup despacho → estado_despacho de la llamada (solo avanza)
-- ---------------------------------------------------------------------
create or replace function fn_rollup_llamada_desde_despachos(p_llamada uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_estatus  text;
  v_actual   text;
  v_total    int;
  v_en_sitio int;
  v_curso    int;      -- despachos aún no liberados
  v_target   text;
  rank_actual int; rank_target int;
  ranks jsonb := '{"recibida":0,"despachada":1,"en_atencion":2,"resuelta":3}'::jsonb;
begin
  select estatus, estado_despacho into v_estatus, v_actual from llamadas_cad where id = p_llamada;
  if v_estatus is null or v_estatus <> 'activo' then return; end if;  -- no tocar cerradas/canceladas

  -- Se consideran los recursos despachados activos que NO son contacto a autoridad.
  select count(*),
         count(*) filter (where estado in ('en_sitio','en_lugar')),
         count(*) filter (where fn_despacho_en_curso(estado))
    into v_total, v_en_sitio, v_curso
    from despachos
   where llamada_id = p_llamada and estatus = 'activo' and coalesce(es_contacto, false) = false;

  if v_total = 0 then return; end if;                 -- sin despachos: no cambiar
  if v_en_sitio > 0 then v_target := 'en_atencion';
  elsif v_curso = 0 then v_target := 'resuelta';       -- todos liberada/cerrado
  else v_target := 'despachada';
  end if;

  rank_actual := coalesce((ranks ->> v_actual)::int, 0);
  rank_target := coalesce((ranks ->> v_target)::int, 0);
  if rank_target > rank_actual then
    update llamadas_cad
       set estado_despacho = v_target,
           fecha_cierre = case when v_target = 'resuelta' then coalesce(fecha_cierre, now()) else fecha_cierre end,
           actualizado_en = now()
     where id = p_llamada;
  end if;
end;
$$;

-- Trigger que dispara ambos recálculos ante cualquier cambio de despacho.
create or replace function fn_despacho_coherencia() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform fn_rollup_llamada_desde_despachos(new.llamada_id);
  perform fn_recalc_estatus_operativo(new.personal_id);
  if tg_op = 'UPDATE' and old.personal_id is distinct from new.personal_id then
    perform fn_recalc_estatus_operativo(old.personal_id);
  end if;
  return new;
end;
$$;
drop trigger if exists trg_despacho_coherencia on despachos;
create trigger trg_despacho_coherencia after insert or update on despachos
  for each row execute function fn_despacho_coherencia();

-- ---------------------------------------------------------------------
-- (3) Cancelar / deshacer un despacho (queda en historial, con operador)
-- ---------------------------------------------------------------------
create or replace function rpc_cancelar_despacho(p_id uuid, p_motivo text default null)
returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  update despachos
     set estatus = 'cancelado',
         cancelado_en = now(),
         cancelado_por = auth.uid(),
         motivo_cancelacion = nullif(trim(coalesce(p_motivo, '')), ''),
         actualizado_en = now()
   where id = p_id and estatus = 'activo';
end;
$$;

-- ---------------------------------------------------------------------
-- (3) Historial: registrar la cancelación de un despacho en la línea de tiempo.
--     (Complementa fn_hist_despacho de 0070, que solo registra cambios de estado.)
-- ---------------------------------------------------------------------
create or replace function fn_hist_despacho() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_num text; v_desc text;
begin
  select numero into v_num from patrullas where id = new.patrulla_id;
  v_desc := coalesce(new.recurso_nombre, case when v_num is not null then 'Unidad #' || v_num else null end);
  if tg_op = 'INSERT' then
    insert into cad_estado_historial (llamada_id, despacho_id, ambito, campo, estado, patrulla_numero, recurso_desc, es_contacto, usuario)
      values (new.llamada_id, new.id, 'despacho', 'estado', new.estado, v_num, v_desc, coalesce(new.es_contacto, false), fn_usuario_actual());
    return new;
  end if;
  if new.estado is distinct from old.estado then
    insert into cad_estado_historial (llamada_id, despacho_id, ambito, campo, estado, patrulla_numero, recurso_desc, es_contacto, usuario)
      values (new.llamada_id, new.id, 'despacho', 'estado', new.estado, v_num, v_desc, coalesce(new.es_contacto, false), fn_usuario_actual());
  end if;
  if new.estatus is distinct from old.estatus and new.estatus = 'cancelado' then
    insert into cad_estado_historial (llamada_id, despacho_id, ambito, campo, estado, patrulla_numero, recurso_desc, es_contacto, usuario)
      values (new.llamada_id, new.id, 'despacho', 'estatus', 'cancelado', v_num, v_desc, coalesce(new.es_contacto, false), fn_usuario_actual());
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Realtime: que el detalle del incidente refleje en vivo el rollup del estado.
-- ---------------------------------------------------------------------
do $$ begin
  alter publication supabase_realtime add table llamadas_cad;
exception when duplicate_object then null; end $$;
