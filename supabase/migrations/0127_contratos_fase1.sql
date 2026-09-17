-- =====================================================================
-- 0127_contratos_fase1.sql · SGS — Gestión de Contratos (Fase 1)
--
-- Vincula la relación comercial con la operación:
--   Contrato → Servicios (por sitio) → Puestos → Requerimientos cuantificables.
-- El SITIO pertenece al cliente; el contrato lo REFERENCIA (no lo duplica).
--
-- Dos ejes de estado, como en el resto de SGS:
--   estatus = retención de datos (activo/cancelado, WORM, nunca se borra)
--   estado  = ciclo de vida del contrato (borrador…cerrado), auditado.
--
-- Incluye:
--   * contratos, contrato_servicios, contrato_puestos, contrato_requerimientos
--   * contrato_sla_metas (SLA por contrato; override del SLA del cliente)
--   * rpc_contrato_vigente(cliente, sitio, fecha) → contrato aplicable
--   * rpc_dotacion_requerida_sitio(sitio, fecha) → dotación contractual del sitio
--     (base de la comparación Requerido vs Programado en el Rol de turnos).
-- No incluye importes (fase comercial posterior) ni entitlements/límites (Fase 3).
-- =====================================================================

-- 1) Tablas ------------------------------------------------------------
create table if not exists contratos (
  id                    uuid primary key default gen_random_uuid(),
  folio                 text,
  cliente_id            uuid not null references clientes(id),
  numero                text,                    -- número/identificador comercial del contrato
  nombre                text not null,
  descripcion           text,
  fecha_inicio          date,
  fecha_fin             date,
  estado                text not null default 'borrador'
                          check (estado in ('borrador','por_aprobar','programado','activo',
                                            'suspendido','por_vencer','vencido','terminado','cerrado')),
  referencia_comercial  text,
  account_manager       text,                    -- responsable comercial (nombre)
  coordinador_operativo uuid references personal(id),
  renovacion_tipo       text default 'manual'    check (renovacion_tipo in ('manual','automatica','ninguna')),
  renovacion_aviso_dias int default 30,
  notas                 text,
  datos_adicionales     jsonb default '{}'::jsonb,
  estatus               text not null default 'activo' check (estatus in ('activo','cancelado')),
  cancelado_en          timestamptz,
  motivo_cancelacion    text,
  creado_en             timestamptz not null default now(),
  actualizado_en        timestamptz not null default now()
);
create index if not exists idx_contratos_cliente on contratos(cliente_id);
create index if not exists idx_contratos_estado on contratos(estado);
comment on table contratos is 'Contrato: relación comercial con vigencia y estado. El sitio pertenece al cliente; el contrato lo referencia vía contrato_servicios.';

create table if not exists contrato_servicios (
  id                    uuid primary key default gen_random_uuid(),
  contrato_id           uuid not null references contratos(id),
  tipo_servicio         text,                    -- catálogo tipo_servicio_contrato
  sitio_id              uuid references sitios(id),  -- nulo para servicios no físicos
  fecha_inicio          date,
  fecha_fin             date,
  estado                text not null default 'activo' check (estado in ('activo','suspendido','terminado')),
  cobertura_tipo        text,                    -- 24x7 | franja | eventual
  guardias_requeridos   int,
  supervisores_requeridos int,
  horario               jsonb default '{}'::jsonb,   -- service_schedule (franjas/días)
  sla_perfil            text,
  notas                 text,
  estatus               text not null default 'activo' check (estatus in ('activo','cancelado')),
  cancelado_en          timestamptz,
  motivo_cancelacion    text,
  creado_en             timestamptz not null default now(),
  actualizado_en        timestamptz not null default now()
);
create index if not exists idx_contrato_servicios_contrato on contrato_servicios(contrato_id);
create index if not exists idx_contrato_servicios_sitio on contrato_servicios(sitio_id);
comment on table contrato_servicios is 'Servicio contratado (por sitio) dentro de un contrato. Puede terminar sin terminar el contrato.';

create table if not exists contrato_puestos (
  id                    uuid primary key default gen_random_uuid(),
  contrato_servicio_id  uuid not null references contrato_servicios(id),
  sitio_id              uuid references sitios(id),
  nombre                text not null,
  ubicacion             text,
  dotacion_requerida    int,
  horario               text,
  dias                  text,
  perfil                text,
  equipamiento          text,
  estado                text not null default 'activo' check (estado in ('activo','suspendido','terminado')),
  estatus               text not null default 'activo' check (estatus in ('activo','cancelado')),
  cancelado_en          timestamptz,
  motivo_cancelacion    text,
  creado_en             timestamptz not null default now(),
  actualizado_en        timestamptz not null default now()
);
create index if not exists idx_contrato_puestos_servicio on contrato_puestos(contrato_servicio_id);
comment on table contrato_puestos is 'Puesto de servicio (posición física) de un servicio contratado, con su dotación y horario.';

create table if not exists contrato_requerimientos (
  id                    uuid primary key default gen_random_uuid(),
  contrato_servicio_id  uuid not null references contrato_servicios(id),
  clave                 text not null,           -- guardias_turno, rondines_turno, visitas_supervisor_turno, inspecciones_dia, tiempo_resp_min, cobertura_pct…
  valor                 numeric,
  unidad                text,
  notas                 text,
  estatus               text not null default 'activo' check (estatus in ('activo','cancelado')),
  cancelado_en          timestamptz,
  motivo_cancelacion    text,
  creado_en             timestamptz not null default now(),
  actualizado_en        timestamptz not null default now()
);
create index if not exists idx_contrato_requerimientos_servicio on contrato_requerimientos(contrato_servicio_id);
comment on table contrato_requerimientos is 'Requerimiento cuantificable de un servicio contratado (clave + valor + unidad).';

-- SLA por contrato (override del SLA del cliente). Mismas claves que lib/sla.ts.
create table if not exists contrato_sla_metas (
  id             uuid primary key default gen_random_uuid(),
  contrato_id    uuid not null references contratos(id),
  clave          text not null,
  valor          numeric,
  activa         boolean not null default true,
  actualizado_en timestamptz not null default now()
);
create unique index if not exists idx_contrato_sla_metas_uniq on contrato_sla_metas(contrato_id, clave);
comment on table contrato_sla_metas is 'SLA por contrato: override de las metas del cliente (clave del catálogo + valor + si aplica).';

-- 2) Transversal: WORM + bitácora + RLS (+ folio solo en contratos) ----
do $$
declare cfg record;
begin
  -- contratos lleva folio (CO); los hijos no.
  insert into foliadores (modulo, nombre, iniciales) values ('contratos','Contratos','CO') on conflict (modulo) do nothing;
  drop trigger if exists trg_folio_contratos on contratos;
  create trigger trg_folio_contratos before insert on contratos for each row execute function fn_asignar_folio();

  -- WORM (no-delete + estatus) solo para las tablas con ciclo de retención.
  -- contrato_sla_metas es configuración (permite delete para "heredar") → aparte.
  for cfg in (select unnest(array['contratos','contrato_servicios','contrato_puestos','contrato_requerimientos']) as tabla)
  loop
    execute format('drop trigger if exists trg_no_delete_%1$s on %1$s;', cfg.tabla);
    execute format('create trigger trg_no_delete_%1$s before delete on %1$s for each row execute function fn_bloquear_delete();', cfg.tabla);
    execute format('revoke delete on %I from authenticated, anon;', cfg.tabla);

    execute format('drop trigger if exists trg_auditoria_%1$s on %1$s;', cfg.tabla);
    execute format('create trigger trg_auditoria_%1$s after insert or update on %1$s for each row execute function fn_bitacora_generica();', cfg.tabla);

    execute format('alter table %I enable row level security;', cfg.tabla);
    execute format('drop policy if exists sel_%1$s on %1$s;', cfg.tabla);
    execute format($p$create policy sel_%1$s on %1$s for select to authenticated using (estatus = 'activo' or fn_rol_actual() in ('supervisor','investigador','administrador','coordinador','operador'));$p$, cfg.tabla);
    execute format('drop policy if exists ins_%1$s on %1$s;', cfg.tabla);
    execute format($p$create policy ins_%1$s on %1$s for insert to authenticated with check (coalesce(fn_rol_actual(), '') in ('administrador','coordinador','operador'));$p$, cfg.tabla);
    execute format('drop policy if exists upd_%1$s on %1$s;', cfg.tabla);
    execute format($p$create policy upd_%1$s on %1$s for update to authenticated using (coalesce(fn_rol_actual(), '') in ('administrador','coordinador','operador')) with check (coalesce(fn_rol_actual(), '') in ('administrador','coordinador','operador'));$p$, cfg.tabla);
  end loop;
end $$;

-- contrato_sla_metas: config (sin estatus, permite delete). Auditoría + RLS propias.
drop trigger if exists trg_auditoria_contrato_sla_metas on contrato_sla_metas;
create trigger trg_auditoria_contrato_sla_metas after insert or update on contrato_sla_metas for each row execute function fn_bitacora_generica();
alter table contrato_sla_metas enable row level security;
drop policy if exists sel_contrato_sla_metas on contrato_sla_metas;
create policy sel_contrato_sla_metas on contrato_sla_metas for select to authenticated using (true);
drop policy if exists ins_contrato_sla_metas on contrato_sla_metas;
create policy ins_contrato_sla_metas on contrato_sla_metas for insert to authenticated with check (coalesce(fn_rol_actual(), '') in ('administrador','coordinador','operador'));
drop policy if exists upd_contrato_sla_metas on contrato_sla_metas;
create policy upd_contrato_sla_metas on contrato_sla_metas for update to authenticated using (coalesce(fn_rol_actual(), '') in ('administrador','coordinador','operador')) with check (coalesce(fn_rol_actual(), '') in ('administrador','coordinador','operador'));
drop policy if exists del_contrato_sla_metas on contrato_sla_metas;
create policy del_contrato_sla_metas on contrato_sla_metas for delete to authenticated using (coalesce(fn_rol_actual(), '') in ('administrador','coordinador','operador'));

-- 3) Catálogo de tipos de servicio -------------------------------------
insert into cat_opciones (categoria, valor, orden) values
  ('tipo_servicio_contrato','Seguridad física / puesto fijo',1),
  ('tipo_servicio_contrato','Caseta',2),
  ('tipo_servicio_contrato','Rondines',3),
  ('tipo_servicio_contrato','Supervisión',4),
  ('tipo_servicio_contrato','Control de acceso',5),
  ('tipo_servicio_contrato','Videovigilancia',6),
  ('tipo_servicio_contrato','Bodycam',7),
  ('tipo_servicio_contrato','Seguridad logística',8),
  ('tipo_servicio_contrato','Inspecciones',9),
  ('tipo_servicio_contrato','Custodia',10),
  ('tipo_servicio_contrato','Otros',11)
on conflict (categoria, valor) do nothing;

-- 4) rpc_cancelar_registro += tablas de contratos ----------------------
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
                     'contratos','contrato_servicios','contrato_puestos','contrato_requerimientos') then
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

-- 5) Contrato vigente para (cliente, sitio, fecha) ---------------------
-- Devuelve el contrato aplicable: activo/por_vencer, dentro de vigencia y que
-- referencia ese sitio con un servicio activo. Si hay varios, el de inicio más
-- reciente.
create or replace function rpc_contrato_vigente(p_cliente uuid, p_sitio uuid, p_fecha date default current_date)
returns table(contrato_id uuid, folio text, nombre text, estado text)
language sql stable security definer set search_path = public as $$
  select c.id, c.folio, c.nombre, c.estado
    from contratos c
    join contrato_servicios s on s.contrato_id = c.id
   where c.estatus = 'activo'
     and c.estado in ('activo','por_vencer')
     and c.cliente_id = p_cliente
     and (c.fecha_inicio is null or c.fecha_inicio <= p_fecha)
     and (c.fecha_fin is null or c.fecha_fin >= p_fecha)
     and s.estatus = 'activo' and s.estado = 'activo'
     and (p_sitio is null or s.sitio_id = p_sitio)
   order by c.fecha_inicio desc nulls last
   limit 1;
$$;

-- 6) Dotación contractual requerida en un sitio para una fecha ----------
-- Suma guardias/supervisores requeridos de los servicios activos del contrato
-- vigente para ese sitio. Base de "Requerido vs Programado" en el Rol de turnos.
create or replace function rpc_dotacion_requerida_sitio(p_sitio uuid, p_fecha date default current_date)
returns table(contrato_id uuid, folio text, guardias_requeridos int, supervisores_requeridos int)
language plpgsql stable security definer set search_path = public as $$
declare v_cliente uuid;
begin
  select cliente_id into v_cliente from sitios where id = p_sitio;
  if v_cliente is null then return; end if;

  return query
  with vig as (
    select cv.contrato_id from rpc_contrato_vigente(v_cliente, p_sitio, p_fecha) cv
  )
  select c.id, c.folio,
         coalesce(sum(s.guardias_requeridos), 0)::int,
         coalesce(sum(s.supervisores_requeridos), 0)::int
    from contratos c
    join vig on vig.contrato_id = c.id
    join contrato_servicios s on s.contrato_id = c.id and s.sitio_id = p_sitio
   where s.estatus = 'activo' and s.estado = 'activo'
   group by c.id, c.folio;
end;
$$;
