-- =====================================================================
-- 0079_vista_operativa.sql · Vista Operativa (Fase A)
-- Roles central (operador/coordinador), timeline de movimiento y el RPC
-- agregador que arma la Vista Operativa en una sola llamada.
-- Reutiliza: movimientos, accesos, inspecciones, sello_validaciones,
-- movimiento_unidades, cargas, vinculos, llamadas_cad.
-- =====================================================================

-- 1) Roles: agrega guardia (usado por el RLS de logística), operador y
--    coordinador (central de coordinación). Ver jerarquía Operador →
--    Coordinador → Administrador.
alter table usuarios_perfil drop constraint if exists usuarios_perfil_rol_check;
alter table usuarios_perfil add constraint usuarios_perfil_rol_check
  check (rol in ('oficial','guardia','supervisor','investigador','asuntos_internos','administrador','operador','coordinador'));

-- El operador/coordinador operan la central: pueden gestionar movimientos.
do $$
declare t text;
begin
  foreach t in array array['movimientos','movimiento_unidades'] loop
    execute format('drop policy if exists ins_%1$s on %1$s', t);
    execute format($p$create policy ins_%1$s on %1$s for insert to authenticated with check (coalesce(fn_rol_actual(),'') in ('operador','coordinador','supervisor','administrador'))$p$, t);
    execute format('drop policy if exists upd_%1$s on %1$s', t);
    execute format($p$create policy upd_%1$s on %1$s for update to authenticated using (coalesce(fn_rol_actual(),'') in ('operador','coordinador','supervisor','administrador')) with check (coalesce(fn_rol_actual(),'') in ('operador','coordinador','supervisor','administrador'))$p$, t);
  end loop;
end $$;

-- 2) Timeline / auditoría semántica del movimiento (append-only).
create table if not exists movimiento_eventos (
  id                uuid primary key default gen_random_uuid(),
  movimiento_id     uuid not null references movimientos(id),
  tipo_evento       text not null,      -- movement.created, risk.assessed, access.authorized,
                                        -- inspection.completed, seal.validated, clearance.approved,
                                        -- movement.started, position.updated, finding.created,
                                        -- finding.dismissed, finding.escalated, incident.created,
                                        -- movement.arrived, movement.closed …
  etapa             text,
  actor             text,               -- correo/usuario que ejecutó
  personal_id       uuid references personal(id),
  datos             jsonb default '{}'::jsonb,   -- previous/new state, notas
  latitud           double precision,
  longitud          double precision,
  creado_en         timestamptz not null default now()
);
comment on table movimiento_eventos is 'Línea de tiempo y auditoría semántica de un movimiento (append-only).';
create index if not exists idx_mov_eventos_mov on movimiento_eventos(movimiento_id, creado_en desc);

-- Append-only: nadie borra ni edita.
drop trigger if exists trg_no_delete_mov_eventos on movimiento_eventos;
create trigger trg_no_delete_mov_eventos before delete on movimiento_eventos for each row execute function fn_bloquear_delete();
revoke delete, update on movimiento_eventos from authenticated, anon;
alter table movimiento_eventos enable row level security;
drop policy if exists sel_mov_eventos on movimiento_eventos;
create policy sel_mov_eventos on movimiento_eventos for select to authenticated using (true);
drop policy if exists ins_mov_eventos on movimiento_eventos;
create policy ins_mov_eventos on movimiento_eventos for insert to authenticated
  with check (coalesce(fn_rol_actual(),'') in ('guardia','operador','coordinador','supervisor','administrador'));

-- 3) Resolver de etapa actual (deriva de estado + completitud de controles).
--    Etapas: PROGRAMADO, EVALUACION_RIESGO, CONTROL_ACCESO, INSPECCION,
--    LIBERACION, EN_TRANSITO, ARRIBO, CIERRE, CANCELADO.
create or replace function fn_flujo_etapa(p_movimiento_id uuid)
returns text as $function$
declare
  v_estado text; v_riesgo text;
  v_acc int; v_acc_ok int; v_insp int; v_insp_rech int;
begin
  select estado, nivel_riesgo into v_estado, v_riesgo from movimientos where id = p_movimiento_id;
  if v_estado is null then return null; end if;
  if v_estado = 'CANCELADO' then return 'CANCELADO'; end if;
  if v_estado = 'FINALIZADO' then return 'CIERRE'; end if;
  if v_estado = 'EN_PATIO' then return 'ARRIBO'; end if;
  if v_estado in ('EN_TRANSITO','DETENIDO') then return 'EN_TRANSITO'; end if;

  -- PROGRAMADO / EN_PREPARACION → refinar por controles capturados.
  select count(*) into v_acc from accesos where movimiento_id = p_movimiento_id and estatus = 'activo';
  select count(*) into v_acc_ok from accesos where movimiento_id = p_movimiento_id and estatus = 'activo' and resultado = 'autorizado';
  select count(*) into v_insp from inspecciones where movimiento_id = p_movimiento_id and estatus = 'activo';
  select count(*) into v_insp_rech from inspecciones where movimiento_id = p_movimiento_id and estatus = 'activo' and coalesce(resultado,'') ilike 'rechaz%';

  if v_acc_ok > 0 and v_insp > 0 and v_insp_rech = 0 then return 'LIBERACION';
  elsif v_insp > 0 then return 'INSPECCION';
  elsif v_acc > 0 then return 'CONTROL_ACCESO';
  elsif v_riesgo is not null then return 'EVALUACION_RIESGO';
  else return 'PROGRAMADO';
  end if;
end;
$function$ language plpgsql stable security definer;

-- 4) RPC agregador: arma toda la Vista Operativa en una sola llamada.
create or replace function rpc_flujo_operativo(p_movimiento_id uuid)
returns jsonb as $function$
declare
  m record;
  v_rol text := coalesce(fn_rol_actual(), '');
  v_stage text;
  v_estado text;
  n_acc int; n_acc_ok int; n_insp int; n_insp_rech int;
  n_sello_val int; n_sello_bad int; n_unid int; n_sensible int;
  n_incidentes int;
  b_liberado boolean;           -- ya pasó a tránsito/patio/finalizado
  s_lib text; block_lib text;
  result jsonb;
begin
  select mv.*,
         so.nombre as origen_nombre, sd.nombre as destino_nombre,
         ta.identificador as activo_ident, ta.placas as activo_placas, ta.tipo_activo as activo_tipo,
         ta.gps_device_id as activo_gps
    into m
  from movimientos mv
  left join sitios so on so.id = mv.sitio_origen_id
  left join sitios sd on sd.id = mv.sitio_destino_id
  left join transporte_activos ta on ta.id = mv.transporte_activo_id
  where mv.id = p_movimiento_id;

  if m.id is null then
    return jsonb_build_object('error', 'movimiento no encontrado');
  end if;

  v_estado := m.estado;
  v_stage  := fn_flujo_etapa(p_movimiento_id);

  select count(*) into n_acc from accesos where movimiento_id = p_movimiento_id and estatus = 'activo';
  select count(*) into n_acc_ok from accesos where movimiento_id = p_movimiento_id and estatus = 'activo' and resultado = 'autorizado';
  select count(*) into n_insp from inspecciones where movimiento_id = p_movimiento_id and estatus = 'activo';
  select count(*) into n_insp_rech from inspecciones where movimiento_id = p_movimiento_id and estatus = 'activo' and coalesce(resultado,'') ilike 'rechaz%';
  select count(*) into n_sello_val from sello_validaciones where movimiento_id = p_movimiento_id;
  select count(*) into n_sello_bad from sello_validaciones where movimiento_id = p_movimiento_id and resultado in ('ALTERADO','NO_COINCIDE');
  select count(*) into n_unid from movimiento_unidades where movimiento_id = p_movimiento_id and estatus = 'activo';
  select count(*) into n_sensible
    from movimiento_unidades mu join cargas c on c.id = mu.carga_id
    where mu.movimiento_id = p_movimiento_id and mu.estatus = 'activo'
      and coalesce(c.nivel_riesgo,'') in ('Alto valor','Sensible','Crítica');

  -- Incidentes ligados (vía vinculos movimiento↔cad, en ambos sentidos).
  select count(*) into n_incidentes
    from vinculos v
    where v.estatus = 'activo'
      and ((v.entidad_origen_tipo = 'movimiento'  and v.entidad_origen_id  = p_movimiento_id and v.entidad_destino_tipo = 'cad')
        or (v.entidad_destino_tipo = 'movimiento' and v.entidad_destino_id = p_movimiento_id and v.entidad_origen_tipo  = 'cad'));

  b_liberado := v_estado in ('EN_TRANSITO','DETENIDO','EN_PATIO','FINALIZADO');

  -- Estado de la etapa Liberación (gate light de Fase A).
  if b_liberado then
    s_lib := 'COMPLETED'; block_lib := null;
  elsif n_acc_ok > 0 and n_insp > 0 and n_insp_rech = 0 and n_sello_bad = 0 then
    s_lib := 'READY'; block_lib := null;
  else
    s_lib := 'BLOCKED';
    block_lib := trim(both ', ' from concat_ws(', ',
      case when n_acc_ok = 0 then 'acceso no autorizado' end,
      case when n_insp = 0 then 'inspección pendiente' end,
      case when n_insp_rech > 0 then 'inspección rechazada' end,
      case when n_sello_bad > 0 then 'sello alterado' end));
  end if;

  result := jsonb_build_object(
    'movement', jsonb_build_object(
      'id', m.id, 'folio', m.folio, 'tipo', m.tipo_movimiento, 'estado', v_estado,
      'nivel_riesgo', m.nivel_riesgo, 'referencia_externa', m.referencia_externa,
      'origen', m.origen_nombre, 'destino', m.destino_nombre,
      'activo', nullif(trim(concat_ws(' ', m.activo_ident, m.activo_placas)), ''),
      'activo_tipo', m.activo_tipo, 'gps_device_id', m.activo_gps,
      'programado_inicio', m.programado_inicio, 'programado_fin', m.programado_fin,
      'real_inicio', m.real_inicio, 'real_fin', m.real_fin,
      'chat_canal_id', m.chat_canal_id
    ),
    'current_stage', v_stage,
    'kpis', jsonb_build_object(
      'activos', (m.transporte_activo_id is not null)::int,
      'hallazgos', 0,                       -- tabla en Fase C
      'incidentes', n_incidentes,
      'inspecciones', n_insp,
      'unidades', n_unid,
      'carga_sensible', n_sensible
    ),
    'stages', jsonb_build_array(
      jsonb_build_object('id','programado','label','Programado','required',true,
        'status','COMPLETED','route', '/logistica/movimientos/'||m.id, 'blockReason', null),
      jsonb_build_object('id','riesgo','label','Evaluación de riesgo','required',false,
        'status', case when m.nivel_riesgo is not null then 'COMPLETED' else 'READY' end,
        'route', '/logistica/movimientos/'||m.id, 'blockReason', null),
      jsonb_build_object('id','acceso','label','Control de acceso','required',true,
        'status', case when n_acc_ok > 0 then 'COMPLETED' when n_acc > 0 then 'IN_PROGRESS' else 'READY' end,
        'count', n_acc, 'route', '/accesos?movementId='||m.id, 'blockReason', null),
      jsonb_build_object('id','inspeccion','label','Inspección','required',true,
        'status', case when n_insp = 0 then 'READY' when n_insp_rech > 0 then 'WARNING' else 'COMPLETED' end,
        'count', n_insp, 'route', '/logistica/inspecciones?movementId='||m.id, 'blockReason', null),
      jsonb_build_object('id','liberacion','label','Liberación de seguridad','required',true,
        'status', s_lib, 'route', '/logistica/movimientos/'||m.id, 'blockReason', block_lib),
      jsonb_build_object('id','transito','label','En tránsito','required',true,
        'status', case when v_estado = 'EN_TRANSITO' then 'IN_PROGRESS' when v_estado = 'DETENIDO' then 'WARNING'
                       when v_estado in ('EN_PATIO','FINALIZADO') then 'COMPLETED' else 'PENDING' end,
        'route', '/mapa-operacional?mov='||m.id, 'blockReason', null),
      jsonb_build_object('id','monitoreo','label','Monitoreo','required',false,
        'status', case when v_estado in ('EN_TRANSITO','DETENIDO') then 'IN_PROGRESS'
                       when v_estado in ('EN_PATIO','FINALIZADO') then 'COMPLETED' else 'PENDING' end,
        'route', '/mapa-operacional?mov='||m.id, 'blockReason', null),
      jsonb_build_object('id','arribo','label','Arribo / Recepción','required',true,
        'status', case when v_estado = 'EN_PATIO' then 'IN_PROGRESS' when v_estado = 'FINALIZADO' then 'COMPLETED' else 'PENDING' end,
        'route', '/logistica/movimientos/'||m.id, 'blockReason', null),
      jsonb_build_object('id','cierre','label','Cierre','required',true,
        'status', case when v_estado = 'FINALIZADO' then 'COMPLETED' else 'PENDING' end,
        'route', '/logistica/movimientos/'||m.id, 'blockReason', null)
    ),
    'exceptions', jsonb_build_object(
      'hallazgos', '[]'::jsonb,             -- Fase C
      'incidentes', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', lc.id, 'folio', lc.folio, 'tipo', lc.tipo,
          'estado_despacho', lc.estado_despacho, 'prioridad', lc.prioridad)
          order by lc.creado_en desc)
        from vinculos v
        join llamadas_cad lc on lc.id = case
              when v.entidad_origen_tipo = 'cad' then v.entidad_origen_id
              else v.entidad_destino_id end
        where v.estatus = 'activo'
          and ((v.entidad_origen_tipo = 'movimiento'  and v.entidad_origen_id  = p_movimiento_id and v.entidad_destino_tipo = 'cad')
            or (v.entidad_destino_tipo = 'movimiento' and v.entidad_destino_id = p_movimiento_id and v.entidad_origen_tipo  = 'cad'))
      ), '[]'::jsonb)
    ),
    'timeline', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'tipo_evento', e.tipo_evento, 'etapa', e.etapa,
        'actor', e.actor, 'datos', e.datos, 'creado_en', e.creado_en)
        order by e.creado_en desc)
      from (select * from movimiento_eventos where movimiento_id = p_movimiento_id order by creado_en desc limit 50) e
    ), '[]'::jsonb),
    'permisos', (
      case
        when v_rol = 'administrador' then jsonb_build_array(
          'logistics.flow.view','logistics.risk.view','logistics.risk.manage',
          'logistics.clearance.view','logistics.clearance.approve',
          'logistics.finding.view','logistics.finding.create','logistics.finding.escalate',
          'access.view','access.authorize','incident.view','incident.create','incident.manage')
        when v_rol = 'coordinador' then jsonb_build_array(
          'logistics.flow.view','logistics.risk.view','logistics.risk.manage',
          'logistics.clearance.view','logistics.clearance.approve',
          'logistics.finding.view','logistics.finding.escalate',
          'access.view','incident.view','incident.create','incident.manage')
        when v_rol = 'operador' then jsonb_build_array(
          'logistics.flow.view','logistics.risk.view','logistics.clearance.view',
          'logistics.finding.view','logistics.finding.create','logistics.inspection.create',
          'access.view','access.authorize','incident.view','incident.create')
        when v_rol = 'supervisor' then jsonb_build_array(
          'logistics.flow.view','logistics.risk.view','logistics.clearance.view',
          'logistics.finding.view','logistics.finding.escalate','incident.view','incident.manage')
        else jsonb_build_array('logistics.flow.view','logistics.finding.view','incident.view')
      end
    )
  );

  return result;
end;
$function$ language plpgsql stable security definer;

grant execute on function fn_flujo_etapa(uuid) to authenticated;
grant execute on function rpc_flujo_operativo(uuid) to authenticated;

-- 5) Realtime: la Vista Operativa se refresca con los eventos del movimiento.
do $$
begin
  begin
    alter publication supabase_realtime add table movimiento_eventos;
  exception when duplicate_object then null;
  end;
end $$;
