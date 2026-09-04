-- =====================================================================
-- 0090_alerta_general.sql
-- Alerta GENERAL de búsqueda: el central (web) pone en alerta a TODOS los
-- oficiales en turno sobre una PERSONA y/o un VEHÍCULO.
--   * Los datos capturados se guardan en los REGISTROS MAESTROS (personas /
--     vehiculos) y quedan marcados con la alerta (folio, fecha, motivo) en
--     datos_adicionales.alerta_general.
--   * Se crea un registro alertas_generales (folio AG) y un CHAT nuevo con todos
--     los oficiales en turno (+ supervisores/mando), donde se envían los datos.
--     El push a los oficiales lo dispara el trigger de chat existente.
-- =====================================================================

-- 1) Catálogo de motivos ----------------------------------------------------
insert into cat_opciones (categoria, valor, orden) values
  ('motivo_alerta_general', 'Objetivo prioritario', 1),
  ('motivo_alerta_general', 'Persona no localizada', 2),
  ('motivo_alerta_general', 'Vehículo robado', 3),
  ('motivo_alerta_general', 'Vehículo sospechoso', 4),
  ('motivo_alerta_general', 'Persona sospechosa', 5),
  ('motivo_alerta_general', 'Orden de aprehensión', 6),
  ('motivo_alerta_general', 'Otro', 7)
on conflict do nothing;

-- 2) Tabla de alertas generales (WORM, foliada) -----------------------------
create table if not exists alertas_generales (
  id             uuid primary key default gen_random_uuid(),
  folio          text,
  motivo         text not null,
  descripcion    text,
  persona_id     uuid references personas(id),
  vehiculo_id    uuid references vehiculos(id),
  canal_id       uuid references chat_canales(id),
  creado_por     uuid references usuarios_perfil(id),
  estatus        text not null default 'activo' check (estatus in ('activo','cancelado')),
  cancelado_en   timestamptz,
  motivo_cancelacion text,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index if not exists idx_alertas_generales_estatus on alertas_generales(estatus);
comment on table alertas_generales is 'Alertas generales de búsqueda difundidas a los oficiales en turno (persona y/o vehículo).';

-- Folio AG + trigger.
insert into foliadores (modulo, nombre, iniciales) values ('alertas_generales','Alertas generales','AG')
  on conflict (modulo) do nothing;
drop trigger if exists trg_folio_alertas_generales on alertas_generales;
create trigger trg_folio_alertas_generales before insert on alertas_generales
  for each row execute function fn_asignar_folio();

-- WORM: no se borran (se cancelan).
drop trigger if exists trg_no_delete_alertas_generales on alertas_generales;
create trigger trg_no_delete_alertas_generales before delete on alertas_generales
  for each row execute function fn_bloquear_delete();
revoke delete on alertas_generales from authenticated, anon;

-- Bitácora genérica.
drop trigger if exists trg_bitacora_alertas_generales on alertas_generales;
create trigger trg_bitacora_alertas_generales after insert or update on alertas_generales
  for each row execute function fn_bitacora_generica();

-- RLS: lectura para autenticados; alta/cambios solo por RPC (definer).
alter table alertas_generales enable row level security;
drop policy if exists sel_alertas_generales on alertas_generales;
create policy sel_alertas_generales on alertas_generales for select to authenticated using (true);

-- 3) RPC: crear alerta general y difundirla --------------------------------
-- p_persona / p_vehiculo: jsonb con los datos a capturar (o null si no aplica).
-- p_persona_id / p_vehiculo_id: usar un registro maestro EXISTENTE (opcional).
create or replace function rpc_crear_alerta_general(
  p_motivo      text,
  p_descripcion text default null,
  p_persona     jsonb default null,
  p_vehiculo    jsonb default null,
  p_persona_id  uuid  default null,
  p_vehiculo_id uuid  default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_yo        uuid := auth.uid();
  v_persona   uuid := p_persona_id;
  v_vehiculo  uuid := p_vehiculo_id;
  v_alerta    uuid;
  v_folio     text;
  v_canal     uuid;
  v_users     uuid[] := '{}';
  v_marca     jsonb;
  v_cuerpo    text;
  v_pnom      text;
  v_vdesc     text;
begin
  if coalesce(fn_rol_actual(), '') not in ('supervisor','investigador','administrador') then
    raise exception 'Solo el personal central (web) puede emitir alertas generales.';
  end if;
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'La alerta necesita un motivo.';
  end if;

  -- Persona: usa existente o crea un registro maestro nuevo.
  if v_persona is null and p_persona is not null and coalesce(trim(p_persona->>'nombre'), '') <> '' then
    insert into personas (nombre, apellido_paterno, apellido_materno, media_filiacion, datos_adicionales)
      values (
        trim(p_persona->>'nombre'),
        nullif(trim(coalesce(p_persona->>'apellido_paterno','')), ''),
        nullif(trim(coalesce(p_persona->>'apellido_materno','')), ''),
        jsonb_build_object('senas', nullif(trim(coalesce(p_persona->>'senas','')), '')),
        jsonb_build_object('alias', nullif(trim(coalesce(p_persona->>'alias','')), ''))
      ) returning id into v_persona;
  end if;

  -- Vehículo: usa existente o crea un registro maestro nuevo.
  if v_vehiculo is null and p_vehiculo is not null
     and (coalesce(trim(p_vehiculo->>'placas'), '') <> '' or coalesce(trim(p_vehiculo->>'marca'), '') <> '') then
    insert into vehiculos (placas, marca, modelo, anio, color, tipo)
      values (
        nullif(trim(coalesce(p_vehiculo->>'placas','')), ''),
        nullif(trim(coalesce(p_vehiculo->>'marca','')), ''),
        nullif(trim(coalesce(p_vehiculo->>'modelo','')), ''),
        nullif(p_vehiculo->>'anio','')::int,
        nullif(trim(coalesce(p_vehiculo->>'color','')), ''),
        nullif(trim(coalesce(p_vehiculo->>'tipo','')), '')
      ) returning id into v_vehiculo;
  end if;

  if v_persona is null and v_vehiculo is null then
    raise exception 'Captura los datos de una persona, un vehículo o ambos.';
  end if;

  -- Registro de la alerta (folio AG por trigger).
  insert into alertas_generales (motivo, descripcion, persona_id, vehiculo_id, creado_por)
    values (trim(p_motivo), nullif(trim(coalesce(p_descripcion,'')), ''), v_persona, v_vehiculo, v_yo)
    returning id, folio into v_alerta, v_folio;

  -- Marca en los registros maestros.
  v_marca := jsonb_build_object('alerta_general', jsonb_build_object(
    'folio', v_folio, 'fecha', now(), 'motivo', trim(p_motivo), 'alerta_id', v_alerta));
  if v_persona is not null then
    update personas set datos_adicionales = coalesce(datos_adicionales,'{}'::jsonb) || v_marca,
           actualizado_en = now() where id = v_persona;
    select trim(concat_ws(' ', nombre, apellido_paterno, apellido_materno)) into v_pnom from personas where id = v_persona;
  end if;
  if v_vehiculo is not null then
    update vehiculos set datos_adicionales = coalesce(datos_adicionales,'{}'::jsonb) || v_marca,
           actualizado_en = now() where id = v_vehiculo;
    select trim(concat_ws(' ', marca, modelo, color, case when placas is not null then '· '||placas end))
      into v_vdesc from vehiculos where id = v_vehiculo;
  end if;

  -- Destinatarios: oficiales en turno hoy + supervisores de esos turnos + mando.
  v_users := array(
    select distinct p.usuario_id
      from turno_guardias tg
      join turnos t on t.id = tg.turno_id
      join personal p on p.id = tg.personal_id
     where t.estatus = 'activo' and t.estado = 'activo' and t.fecha = current_date
       and tg.estatus = 'activo' and p.usuario_id is not null
  );
  v_users := v_users || array(
    select distinct p.usuario_id
      from turnos t join personal p on p.id = t.supervisor_id
     where t.estatus = 'activo' and t.estado = 'activo' and t.fecha = current_date
       and p.usuario_id is not null
  );
  v_users := v_users || array(
    select up.id from usuarios_perfil up where up.activo and up.rol in ('administrador','supervisor') and up.id is not null
  );

  -- Canal del chat de la alerta.
  insert into chat_canales (nombre, tema, creado_por)
    values ('Alerta general ' || v_folio, trim(p_motivo), v_yo)
    returning id into v_canal;
  insert into chat_miembros (canal_id, usuario_id, es_admin) values (v_canal, v_yo, true)
    on conflict do nothing;
  insert into chat_miembros (canal_id, usuario_id)
    select distinct v_canal, u from unnest(v_users) u where u is not null and u <> v_yo
    on conflict do nothing;

  update alertas_generales set canal_id = v_canal where id = v_alerta;

  -- Mensaje con los datos (tipo 'texto' => dispara el push a los miembros).
  v_cuerpo := '🚨 ALERTA GENERAL ' || v_folio || ' — ' || trim(p_motivo);
  if v_pnom is not null and v_pnom <> '' then v_cuerpo := v_cuerpo || E'\n👤 Persona: ' || v_pnom; end if;
  if v_persona is not null then
    v_cuerpo := v_cuerpo || coalesce(E'\n   Señas: ' || nullif((select media_filiacion->>'senas' from personas where id = v_persona), ''), '');
  end if;
  if v_vdesc is not null and v_vdesc <> '' then v_cuerpo := v_cuerpo || E'\n🚗 Vehículo: ' || v_vdesc; end if;
  if nullif(trim(coalesce(p_descripcion,'')), '') is not null then v_cuerpo := v_cuerpo || E'\n📝 ' || trim(p_descripcion); end if;

  insert into chat_mensajes (canal_id, usuario_id, tipo, cuerpo)
    values (v_canal, v_yo, 'texto', v_cuerpo);

  return jsonb_build_object('alerta_id', v_alerta, 'folio', v_folio, 'canal_id', v_canal);
end; $$;

-- 4) rpc_cancelar_registro (recreado): + alertas_generales ------------------
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
                     'liberaciones_seguridad',
                     -- Alertas:
                     'alertas_generales') then
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
