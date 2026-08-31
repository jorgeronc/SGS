-- =====================================================================
-- 0082_movimiento_incidente.sql · Vista Operativa (Fase B)
-- Une el movimiento con el pipeline de incidentes (CAD): un incidente puede
-- nacer desde un movimiento y queda ligado (columna + vínculo). Recrea el RPC
-- agregador para reflejar liberación, riesgo e incidentes ligados.
-- =====================================================================

-- 1) Liga directa incidente → movimiento (además del vínculo genérico).
alter table llamadas_cad add column if not exists movimiento_id uuid references movimientos(id);
create index if not exists idx_llamadas_cad_mov on llamadas_cad(movimiento_id);

-- 2) Crear un incidente CAD desde un movimiento (reusa el chat que crea el trigger).
create or replace function rpc_incidente_desde_movimiento(
  p_movimiento_id uuid, p_tipo text, p_descripcion text default null, p_prioridad text default 'media')
returns jsonb as $fn$
declare
  v_rol text := coalesce(fn_rol_actual(),''); m record; v_id uuid; v_folio text; v_canal uuid; v_correo text;
begin
  if v_rol not in ('operador','coordinador','supervisor','administrador') then
    raise exception 'No autorizado para crear incidentes.';
  end if;
  if coalesce(p_prioridad,'') not in ('alta','media','baja') then p_prioridad := 'media'; end if;
  select mv.folio, mv.sitio_origen_id, so.nombre as origen, mv.transporte_activo_id
    into m from movimientos mv left join sitios so on so.id = mv.sitio_origen_id
    where mv.id = p_movimiento_id;
  if m.folio is null and not found then raise exception 'movimiento no encontrado'; end if;
  select email into v_correo from auth.users where id = auth.uid();

  insert into llamadas_cad (tipo, prioridad, reportante, descripcion, direccion, sitio_id,
    estado_despacho, movimiento_id, datos_adicionales)
  values (coalesce(p_tipo,'Incidente logístico'), p_prioridad, v_correo,
    p_descripcion, m.origen, m.sitio_origen_id, 'recibida', p_movimiento_id,
    jsonb_build_object('origen','movimiento','source','LOGISTICS','movimiento_folio', m.folio,
                       'transporte_activo_id', m.transporte_activo_id))
  returning id, folio into v_id, v_folio;

  -- Vínculo genérico movimiento → cad (para VinculosPanel y consultas).
  insert into vinculos (entidad_origen_tipo, entidad_origen_id, entidad_destino_tipo, entidad_destino_id, tipo_relacion)
    values ('movimiento', p_movimiento_id, 'cad', v_id, 'INCIDENTE');

  select chat_canal_id into v_canal from llamadas_cad where id = v_id;

  insert into movimiento_eventos (movimiento_id, tipo_evento, etapa, actor, datos)
    values (p_movimiento_id, 'incident.created', null, v_correo,
            jsonb_build_object('llamada_id', v_id, 'folio', v_folio, 'tipo', p_tipo));

  return jsonb_build_object('ok', true, 'id', v_id, 'folio', v_folio, 'chat_canal_id', v_canal);
end;
$fn$ language plpgsql security definer;
grant execute on function rpc_incidente_desde_movimiento(uuid, text, text, text) to authenticated;

-- 3) Whitelist de cancelación: agrega liberaciones_seguridad.
create or replace function rpc_cancelar_registro(p_tabla text, p_id uuid, p_motivo text)
returns void as $$
begin
  if p_tabla not in ('personas','vehiculos','ubicaciones','vinculos','casos','personal',
                     'ordenes','evidencias','asuntos_internos','llamadas_cad','despachos',
                     'barandilla','equipo','incidentes','presuntos','kardex',
                     'patrullas','armamento','comunicacion','bodycams','otros',
                     'rol_servicio','rol_servicio_asignaciones','abordamientos','accidentes',
                     'tareas','tarea_asignaciones','transmisiones','caso_relaciones',
                     'guardia_capacitacion','clientes','sitios','turnos',
                     'puntos_control','rondines','camaras','accesos','credenciales',
                     'citas','transportistas','zonas','zona_permisos','sla_metas',
                     'directorio_autoridades',
                     -- Seguridad Logística:
                     'transporte_activos','unidades_carga','cargas','movimientos','sellos','inspecciones',
                     'liberaciones_seguridad') then
    raise exception 'Tabla no reconocida: %', p_tabla;
  end if;
  if p_tabla = 'asuntos_internos'
     and coalesce(fn_rol_actual(), '') not in ('asuntos_internos','administrador') then
    raise exception 'No autorizado para cancelar registros de asuntos internos.';
  end if;
  execute format(
    'update %I set estatus = ''cancelado'', cancelado_en = now(), motivo_cancelacion = $1, actualizado_en = now() where id = $2',
    p_tabla
  ) using p_motivo, p_id;
end;
$$ language plpgsql security definer;

-- 4) RPC agregador (recreado): refleja liberación, riesgo e incidentes ligados.
create or replace function rpc_flujo_operativo(p_movimiento_id uuid)
returns jsonb as $fn$
declare
  m record;
  v_rol text := coalesce(fn_rol_actual(), '');
  v_stage text; v_estado text;
  n_acc int; n_acc_ok int; n_insp int; n_insp_rech int;
  n_sello_val int; n_sello_bad int; n_unid int; n_sensible int; n_incidentes int;
  b_liberado boolean;
  lib record; ev_lib jsonb; s_lib text; block_lib text;
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
  select count(*) into n_insp_rech from inspecciones where movimiento_id = p_movimiento_id and estatus='activo' and coalesce(resultado,'') ilike 'rechaz%';
  select count(*) into n_sello_val from sello_validaciones where movimiento_id = p_movimiento_id;
  select count(*) into n_sello_bad from sello_validaciones where movimiento_id = p_movimiento_id and resultado in ('ALTERADO','NO_COINCIDE');
  select count(*) into n_unid from movimiento_unidades where movimiento_id = p_movimiento_id and estatus='activo';
  select count(*) into n_sensible from movimiento_unidades mu join cargas c on c.id = mu.carga_id
    where mu.movimiento_id = p_movimiento_id and mu.estatus='activo' and coalesce(c.nivel_riesgo,'') in ('Alto valor','Sensible','Crítica');

  -- Incidentes ligados (por columna directa o por vínculo).
  select count(*) into n_incidentes from llamadas_cad lc where lc.estatus='activo'
    and (lc.movimiento_id = p_movimiento_id
      or exists (select 1 from vinculos v where v.estatus='activo'
        and ((v.entidad_origen_tipo='movimiento' and v.entidad_origen_id=p_movimiento_id and v.entidad_destino_tipo='cad' and v.entidad_destino_id=lc.id)
          or (v.entidad_destino_tipo='movimiento' and v.entidad_destino_id=p_movimiento_id and v.entidad_origen_tipo='cad' and v.entidad_origen_id=lc.id))));

  -- Liberación: última aprobación/rechazo + evaluación del gate.
  select * into lib from liberaciones_seguridad where movimiento_id = p_movimiento_id and estatus='activo' order by creado_en desc limit 1;
  ev_lib := rpc_evaluar_liberacion(p_movimiento_id);
  b_liberado := v_estado in ('EN_TRANSITO','DETENIDO','EN_PATIO','FINALIZADO');

  if lib.resultado = 'APPROVED' then s_lib := 'COMPLETED'; block_lib := null;
  elsif lib.resultado = 'REJECTED' then s_lib := 'BLOCKED'; block_lib := coalesce(lib.notas,'rechazada');
  elsif b_liberado then s_lib := 'COMPLETED'; block_lib := null;
  elsif (ev_lib->>'resultado') = 'READY' then s_lib := 'READY'; block_lib := null;
  else s_lib := 'BLOCKED'; block_lib := ev_lib->>'faltantes';
  end if;

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
      jsonb_build_object('id','inspeccion','label','Inspección','required',true,
        'status', case when n_insp=0 then 'READY' when n_insp_rech>0 then 'WARNING' else 'COMPLETED' end,
        'count', n_insp, 'route','/logistica/inspecciones?movementId='||m.id,'blockReason',null),
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
        'status', case when v_estado='EN_PATIO' then 'IN_PROGRESS' when v_estado='FINALIZADO' then 'COMPLETED' else 'PENDING' end,
        'route','/logistica/movimientos/'||m.id,'blockReason',null),
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
grant execute on function rpc_flujo_operativo(uuid) to authenticated;
