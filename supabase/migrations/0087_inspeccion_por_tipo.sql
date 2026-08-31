-- =====================================================================
-- 0087_inspeccion_por_tipo.sql · Vista Operativa
-- Congruencia por tipo de inspección con las etapas del flujo:
--   · Pre-salida/Salida/Patio/Sello/… (todo lo que NO es 'Entrada') → etapa
--     "Inspección" (pre-salida) y gate de Liberación.
--   · 'Entrada' → etapa "Arribo/Recepción" (inspección de llegada al destino).
-- Recrea rpc_evaluar_liberacion y rpc_flujo_operativo con ese criterio.
-- =====================================================================

-- Gate de liberación: la inspección que cuenta es la de PRE-SALIDA (no 'Entrada').
create or replace function rpc_evaluar_liberacion(p_movimiento_id uuid)
returns jsonb as $fn$
declare
  m record;
  n_acc_ok int; n_acc_id int; n_unid int; n_pre int; n_pre_rech int;
  n_sello_val int; n_sello_bad int; n_evid int;
  b_access boolean; b_identity boolean; b_asset boolean; b_units boolean;
  b_insp boolean; b_seal boolean; b_evid boolean; b_gps boolean; b_risk boolean; b_super boolean;
  v_high boolean; v_falt text; v_res text;
begin
  select mv.*, ta.gps_device_id as gps into m from movimientos mv
    left join transporte_activos ta on ta.id = mv.transporte_activo_id
    where mv.id = p_movimiento_id;
  if m.id is null then return jsonb_build_object('error','movimiento no encontrado'); end if;

  select count(*) into n_acc_ok from accesos where movimiento_id = p_movimiento_id and estatus='activo' and resultado='autorizado';
  select count(*) into n_acc_id from accesos where movimiento_id = p_movimiento_id and estatus='activo' and resultado='autorizado' and (persona_id is not null or visitante_nombre is not null);
  select count(*) into n_unid from movimiento_unidades where movimiento_id = p_movimiento_id and estatus='activo';
  select count(*) into n_pre from inspecciones where movimiento_id = p_movimiento_id and estatus='activo' and coalesce(tipo_inspeccion,'') <> 'Entrada';
  select count(*) into n_pre_rech from inspecciones where movimiento_id = p_movimiento_id and estatus='activo' and coalesce(tipo_inspeccion,'') <> 'Entrada' and coalesce(resultado,'') ilike 'rechaz%';
  select count(*) into n_sello_val from sello_validaciones where movimiento_id = p_movimiento_id and resultado='VALIDO';
  select count(*) into n_sello_bad from sello_validaciones where movimiento_id = p_movimiento_id and resultado in ('ALTERADO','NO_COINCIDE');
  select count(*) into n_evid from vinculos where estatus='activo'
    and ((entidad_origen_tipo='movimiento' and entidad_origen_id=p_movimiento_id and entidad_destino_tipo='evidencia')
      or (entidad_destino_tipo='movimiento' and entidad_destino_id=p_movimiento_id and entidad_origen_tipo='evidencia'));

  v_high := coalesce(m.nivel_riesgo,'') in ('Alto valor','Sensible','Crítica');
  b_access := n_acc_ok > 0;
  b_identity := n_acc_id > 0;
  b_asset := m.transporte_activo_id is not null;
  b_units := n_unid > 0;
  b_insp := n_pre > 0 and n_pre_rech = 0;
  b_seal := n_sello_bad = 0;
  b_evid := true;
  b_gps := m.gps is not null;
  b_risk := m.nivel_riesgo is not null;
  b_super := not v_high;

  v_falt := nullif(trim(both ', ' from concat_ws(', ',
    case when not b_access then 'acceso no autorizado' end,
    case when not b_identity then 'identidad no validada' end,
    case when not b_asset then 'sin activo de transporte' end,
    case when not b_units then 'sin unidades de carga' end,
    case when not b_insp then (case when n_pre_rech>0 then 'inspección de pre-salida rechazada' else 'inspección de pre-salida pendiente' end) end,
    case when not b_seal then 'sello alterado' end,
    case when not b_gps then 'GPS no disponible' end,
    case when not b_risk then 'riesgo sin evaluar' end)), '');
  v_res := case when v_falt is null then 'READY' else 'BLOCKED' end;

  return jsonb_build_object(
    'movimiento_id', p_movimiento_id,
    'checklist', jsonb_build_object(
      'access_validated', b_access, 'identity_validated', b_identity, 'asset_validated', b_asset,
      'cargo_units_validated', b_units, 'inspection_completed', b_insp, 'seal_validated', b_seal,
      'required_evidence_completed', b_evid, 'gps_available', b_gps, 'risk_protocol_completed', b_risk,
      'supervisor_approval', b_super),
    'high_risk', v_high, 'resultado', v_res, 'faltantes', v_falt);
end;
$fn$ language plpgsql stable security definer;

-- RPC agregador: etapa "Inspección" usa pre-salida; "Arribo" usa la de 'Entrada'.
create or replace function rpc_flujo_operativo(p_movimiento_id uuid)
returns jsonb as $fn$
declare
  m record;
  v_rol text := coalesce(fn_rol_actual(), '');
  v_stage text; v_estado text;
  n_acc int; n_acc_ok int; n_insp int; n_pre int; n_pre_rech int; n_entrada int;
  n_sello_val int; n_sello_bad int; n_unid int; n_sensible int; n_incidentes int;
  b_liberado boolean;
  lib record; ev_lib jsonb; s_lib text; block_lib text;
  s_arribo text;
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
  if m.id is null then return jsonb_build_object('error', 'movimiento no encontrado'); end if;

  v_estado := m.estado;
  v_stage  := fn_flujo_etapa(p_movimiento_id);

  select count(*) into n_acc from accesos where movimiento_id = p_movimiento_id and estatus='activo';
  select count(*) into n_acc_ok from accesos where movimiento_id = p_movimiento_id and estatus='activo' and resultado='autorizado';
  select count(*) into n_insp from inspecciones where movimiento_id = p_movimiento_id and estatus='activo';
  select count(*) into n_pre from inspecciones where movimiento_id = p_movimiento_id and estatus='activo' and coalesce(tipo_inspeccion,'') <> 'Entrada';
  select count(*) into n_pre_rech from inspecciones where movimiento_id = p_movimiento_id and estatus='activo' and coalesce(tipo_inspeccion,'') <> 'Entrada' and coalesce(resultado,'') ilike 'rechaz%';
  select count(*) into n_entrada from inspecciones where movimiento_id = p_movimiento_id and estatus='activo' and coalesce(tipo_inspeccion,'') = 'Entrada';
  select count(*) into n_sello_val from sello_validaciones where movimiento_id = p_movimiento_id;
  select count(*) into n_sello_bad from sello_validaciones where movimiento_id = p_movimiento_id and resultado in ('ALTERADO','NO_COINCIDE');
  select count(*) into n_unid from movimiento_unidades where movimiento_id = p_movimiento_id and estatus='activo';
  select count(*) into n_sensible from movimiento_unidades mu join cargas c on c.id = mu.carga_id
    where mu.movimiento_id = p_movimiento_id and mu.estatus='activo' and coalesce(c.nivel_riesgo,'') in ('Alto valor','Sensible','Crítica');

  select count(*) into n_incidentes from llamadas_cad lc where lc.estatus='activo'
    and (lc.movimiento_id = p_movimiento_id
      or exists (select 1 from vinculos v where v.estatus='activo'
        and ((v.entidad_origen_tipo='movimiento' and v.entidad_origen_id=p_movimiento_id and v.entidad_destino_tipo='cad' and v.entidad_destino_id=lc.id)
          or (v.entidad_destino_tipo='movimiento' and v.entidad_destino_id=p_movimiento_id and v.entidad_origen_tipo='cad' and v.entidad_origen_id=lc.id))));

  select * into lib from liberaciones_seguridad where movimiento_id = p_movimiento_id and estatus='activo' order by creado_en desc limit 1;
  ev_lib := rpc_evaluar_liberacion(p_movimiento_id);
  b_liberado := v_estado in ('EN_TRANSITO','DETENIDO','EN_PATIO','FINALIZADO');

  if lib.resultado = 'APPROVED' then s_lib := 'COMPLETED'; block_lib := null;
  elsif lib.resultado = 'REJECTED' then s_lib := 'BLOCKED'; block_lib := coalesce(lib.notas,'rechazada');
  elsif b_liberado then s_lib := 'COMPLETED'; block_lib := null;
  elsif (ev_lib->>'resultado') = 'READY' then s_lib := 'READY'; block_lib := null;
  else s_lib := 'BLOCKED'; block_lib := ev_lib->>'faltantes';
  end if;

  -- Arribo: completa al finalizar; en curso si hay inspección de Entrada o está en patio.
  s_arribo := case when v_estado = 'FINALIZADO' then 'COMPLETED'
                   when v_estado = 'EN_PATIO' or n_entrada > 0 then 'IN_PROGRESS'
                   else 'PENDING' end;

  return jsonb_build_object(
    'movement', jsonb_build_object(
      'id', m.id, 'folio', m.folio, 'tipo', m.tipo_movimiento, 'estado', v_estado,
      'nivel_riesgo', m.nivel_riesgo, 'referencia_externa', m.referencia_externa,
      'origen', m.origen_nombre, 'destino', m.destino_nombre,
      'activo', nullif(trim(concat_ws(' ', m.activo_ident, m.activo_placas)), ''),
      'activo_tipo', m.activo_tipo, 'gps_device_id', m.activo_gps,
      'programado_inicio', m.programado_inicio, 'programado_fin', m.programado_fin,
      'real_inicio', m.real_inicio, 'real_fin', m.real_fin, 'chat_canal_id', m.chat_canal_id),
    'current_stage', v_stage,
    'kpis', jsonb_build_object(
      'activos', (m.transporte_activo_id is not null)::int, 'hallazgos', 0,
      'incidentes', n_incidentes, 'inspecciones', n_insp, 'unidades', n_unid, 'carga_sensible', n_sensible),
    'clearance', ev_lib || jsonb_build_object(
      'aprobacion', case when lib.id is not null then jsonb_build_object(
        'resultado', lib.resultado, 'folio', lib.folio, 'aprobado_por', lib.aprobado_por,
        'notas', lib.notas, 'creado_en', lib.creado_en) else null end),
    'stages', jsonb_build_array(
      jsonb_build_object('id','programado','label','Programado','required',true,'status','COMPLETED','route','/logistica/movimientos/'||m.id,'blockReason',null),
      jsonb_build_object('id','riesgo','label','Evaluación de riesgo','required',false,
        'status', case when m.nivel_riesgo is not null then 'COMPLETED' else 'READY' end,
        'route','/logistica/movimientos/'||m.id,'blockReason',null),
      jsonb_build_object('id','acceso','label','Control de acceso','required',true,
        'status', case when n_acc_ok>0 then 'COMPLETED' when n_acc>0 then 'IN_PROGRESS' else 'READY' end,
        'count', n_acc, 'route','/accesos?movementId='||m.id,'blockReason',null),
      jsonb_build_object('id','inspeccion','label','Inspección (pre-salida)','required',true,
        'status', case when n_pre=0 then 'READY' when n_pre_rech>0 then 'WARNING' else 'COMPLETED' end,
        'count', n_pre, 'route','/logistica/inspecciones?movementId='||m.id,'blockReason',null),
      jsonb_build_object('id','liberacion','label','Liberación de seguridad','required',true,
        'status', s_lib, 'route','/vista-operativa?movementId='||m.id,'blockReason', block_lib),
      jsonb_build_object('id','transito','label','En tránsito','required',true,
        'status', case when v_estado='EN_TRANSITO' then 'IN_PROGRESS' when v_estado='DETENIDO' then 'WARNING'
                       when v_estado in ('EN_PATIO','FINALIZADO') then 'COMPLETED' else 'PENDING' end,
        'route','/mapa-operacional?mov='||m.id,'blockReason',null),
      jsonb_build_object('id','monitoreo','label','Monitoreo','required',false,
        'status', case when v_estado in ('EN_TRANSITO','DETENIDO') then 'IN_PROGRESS'
                       when v_estado in ('EN_PATIO','FINALIZADO') then 'COMPLETED' else 'PENDING' end,
        'route','/mapa-operacional?mov='||m.id,'blockReason',null),
      jsonb_build_object('id','arribo','label','Arribo / Recepción','required',true,
        'status', s_arribo, 'count', n_entrada, 'route','/logistica/inspecciones?movementId='||m.id,'blockReason',null),
      jsonb_build_object('id','cierre','label','Cierre','required',true,
        'status', case when v_estado='FINALIZADO' then 'COMPLETED' else 'PENDING' end,
        'route','/logistica/movimientos/'||m.id,'blockReason',null)),
    'exceptions', jsonb_build_object(
      'hallazgos', '[]'::jsonb,
      'incidentes', coalesce((
        select jsonb_agg(j order by cen desc) from (
          select lc.creado_en as cen, jsonb_build_object('id', lc.id, 'folio', lc.folio, 'tipo', lc.tipo,
                 'estado_despacho', lc.estado_despacho, 'prioridad', lc.prioridad) as j
          from llamadas_cad lc where lc.estatus='activo'
            and (lc.movimiento_id = p_movimiento_id
              or exists (select 1 from vinculos v where v.estatus='activo'
                and ((v.entidad_origen_tipo='movimiento' and v.entidad_origen_id=p_movimiento_id and v.entidad_destino_tipo='cad' and v.entidad_destino_id=lc.id)
                  or (v.entidad_destino_tipo='movimiento' and v.entidad_destino_id=p_movimiento_id and v.entidad_origen_tipo='cad' and v.entidad_origen_id=lc.id))))
        ) t), '[]'::jsonb)),
    'timeline', coalesce((
      select jsonb_agg(jsonb_build_object('id', e.id, 'tipo_evento', e.tipo_evento, 'etapa', e.etapa,
        'actor', e.actor, 'datos', e.datos, 'creado_en', e.creado_en) order by e.creado_en desc)
      from (select * from movimiento_eventos where movimiento_id = p_movimiento_id order by creado_en desc limit 50) e
    ), '[]'::jsonb),
    'permisos', (case
      when v_rol='administrador' then jsonb_build_array('logistics.flow.view','logistics.risk.view','logistics.risk.manage','logistics.clearance.view','logistics.clearance.approve','logistics.finding.view','logistics.finding.create','logistics.finding.escalate','access.view','access.authorize','incident.view','incident.create','incident.manage')
      when v_rol='coordinador' then jsonb_build_array('logistics.flow.view','logistics.risk.view','logistics.risk.manage','logistics.clearance.view','logistics.clearance.approve','logistics.finding.view','logistics.finding.escalate','access.view','incident.view','incident.create','incident.manage')
      when v_rol='operador' then jsonb_build_array('logistics.flow.view','logistics.risk.view','logistics.risk.manage','logistics.clearance.view','logistics.finding.view','logistics.finding.create','logistics.inspection.create','access.view','access.authorize','incident.view','incident.create')
      when v_rol='supervisor' then jsonb_build_array('logistics.flow.view','logistics.risk.view','logistics.risk.manage','logistics.clearance.view','logistics.clearance.approve','logistics.finding.view','logistics.finding.escalate','incident.view','incident.create','incident.manage')
      else jsonb_build_array('logistics.flow.view','logistics.finding.view','incident.view')
    end)
  );
end;
$fn$ language plpgsql stable security definer;
