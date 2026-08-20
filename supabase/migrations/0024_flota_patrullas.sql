-- =====================================================================
-- 0024_flota_patrullas.sql   (Fase 1: esquema de flota/equipo dividido)
--
-- Divide el módulo "equipo" en 5 tablas: patrullas, armamento, comunicacion,
-- bodycams y otros. Las patrullas llevan un ESTATUS OPERATIVO
-- (disponible/fuera_servicio/en_rutina/en_pausa) para el despacho.
--
-- Migra los datos del `equipo` actual a las tablas nuevas, reclasifica los
-- `vehiculos` cuya descripción (modelo) dice 'Police' como patrullas, y agrega
-- `patrulla_id` a `despachos` (el despacho se asigna por patrulla; el oficial
-- se deriva del Rol de Servicio — ver 0025).
--
-- El `equipo` legado NO se borra (WORM); queda como histórico hasta retirar su
-- UI en la Fase 4. Los `vehiculos` reclasificados SÍ se cancelan (dejan de ser
-- vehículos civiles) con motivo, por petición explícita.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) PATRULLAS
-- ---------------------------------------------------------------------
create table if not exists patrullas (
  id                  uuid primary key default gen_random_uuid(),
  folio               text,
  numero              text,           -- número económico / de unidad
  tipo                text,           -- auto | motocicleta | bicicleta
  marca               text,
  modelo              text,
  placas              text,
  anio                int,
  color               text,
  numero_serie        text,
  estatus_unidad      text not null default 'fuera_servicio'
                        check (estatus_unidad in ('disponible','fuera_servicio','en_rutina','en_pausa')),
  fotografias         jsonb default '[]'::jsonb,
  datos_adicionales   jsonb default '{}'::jsonb,

  estatus             text not null default 'activo' check (estatus in ('activo','cancelado')),
  cancelado_en        timestamptz,
  motivo_cancelacion  text,
  creado_en           timestamptz not null default now(),
  actualizado_en      timestamptz not null default now()
);
comment on table patrullas is 'Unidades (auto/moto/bici) de la flota policial, con estatus operativo para el despacho.';
create index if not exists idx_patrullas_estatus_unidad on patrullas (estatus_unidad);
create index if not exists idx_patrullas_numero on patrullas (numero);
create or replace view patrullas_activas as select * from patrullas where estatus = 'activo';

-- ---------------------------------------------------------------------
-- 2) ARMAMENTO / COMUNICACION / BODYCAMS / OTROS (inventario uniforme)
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['armamento','comunicacion','bodycams','otros'] loop
    execute format($f$
      create table if not exists %I (
        id                  uuid primary key default gen_random_uuid(),
        folio               text,
        tipo                text,
        marca               text,
        modelo              text,
        numero_serie        text,
        descripcion         text,
        asignado_personal_id uuid references personal(id),
        estado_equipo       text not null default 'operativo'
                              check (estado_equipo in ('operativo','asignado','en_reparacion','baja')),
        fecha_alta          date,
        fotografias         jsonb default '[]'::jsonb,
        datos_adicionales   jsonb default '{}'::jsonb,
        estatus             text not null default 'activo' check (estatus in ('activo','cancelado')),
        cancelado_en        timestamptz,
        motivo_cancelacion  text,
        creado_en           timestamptz not null default now(),
        actualizado_en      timestamptz not null default now()
      );
      create or replace view %I as select * from %I where estatus = 'activo';
    $f$, t, t || '_activo', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 3) Triggers (no-delete + bitácora + folio), RLS y foliador por tabla.
-- ---------------------------------------------------------------------
do $$
declare
  cfg record;
begin
  for cfg in
    select * from (values
      ('patrullas','Patrullas','PT'),
      ('armamento','Armamento','AM'),
      ('comunicacion','Equipo de comunicación','CM'),
      ('bodycams','Bodycams','BC'),
      ('otros','Otros equipos','OT')
    ) as v(tabla, nombre, iniciales)
  loop
    -- no-delete
    execute format('drop trigger if exists trg_no_delete_%1$s on %1$s;', cfg.tabla);
    execute format('create trigger trg_no_delete_%1$s before delete on %1$s for each row execute function fn_bloquear_delete();', cfg.tabla);
    execute format('revoke delete on %I from authenticated, anon;', cfg.tabla);
    -- bitácora
    execute format('drop trigger if exists trg_auditoria_%1$s on %1$s;', cfg.tabla);
    execute format('create trigger trg_auditoria_%1$s after insert or update on %1$s for each row execute function fn_bitacora_generica();', cfg.tabla);
    -- foliador + trigger de folio
    insert into foliadores (modulo, nombre, iniciales) values (cfg.tabla, cfg.nombre, cfg.iniciales) on conflict (modulo) do nothing;
    execute format('drop trigger if exists trg_folio_%1$s on %1$s;', cfg.tabla);
    execute format('create trigger trg_folio_%1$s before insert on %1$s for each row execute function fn_asignar_folio();', cfg.tabla);
    -- RLS
    execute format('alter table %I enable row level security;', cfg.tabla);
    execute format('drop policy if exists sel_%1$s on %1$s;', cfg.tabla);
    execute format($p$create policy sel_%1$s on %1$s for select to authenticated using (estatus = 'activo' or fn_rol_actual() in ('supervisor','investigador','administrador'));$p$, cfg.tabla);
    execute format('drop policy if exists ins_%1$s on %1$s;', cfg.tabla);
    execute format('create policy ins_%1$s on %1$s for insert to authenticated with check (true);', cfg.tabla);
    execute format('drop policy if exists upd_%1$s on %1$s;', cfg.tabla);
    execute format('create policy upd_%1$s on %1$s for update to authenticated using (true) with check (true);', cfg.tabla);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 4) Ampliar rpc_cancelar_registro con las tablas nuevas.
-- ---------------------------------------------------------------------
create or replace function rpc_cancelar_registro(p_tabla text, p_id uuid, p_motivo text)
returns void as $$
begin
  if p_tabla not in ('personas','vehiculos','ubicaciones','vinculos','casos','personal',
                     'ordenes','evidencias','asuntos_internos','llamadas_cad','despachos',
                     'barandilla','equipo','incidentes','presuntos','kardex',
                     'patrullas','armamento','comunicacion','bodycams','otros') then
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

-- ---------------------------------------------------------------------
-- 5) despachos: asignación por patrulla.
-- ---------------------------------------------------------------------
alter table despachos add column if not exists patrulla_id uuid references patrullas(id);
create index if not exists idx_despachos_patrulla on despachos (patrulla_id);

-- ---------------------------------------------------------------------
-- 6) MIGRACIÓN DE DATOS
-- ---------------------------------------------------------------------
-- 6a) equipo -> inventarios (arma/radio/bodycam/otro). Legado NO se cancela.
insert into armamento (tipo, marca, modelo, numero_serie, asignado_personal_id, estado_equipo, fecha_alta, fotografias, datos_adicionales)
  select 'arma', marca, modelo, numero_serie, asignado_personal_id, estado_equipo, fecha_alta, fotografias,
         coalesce(datos_adicionales,'{}'::jsonb) || jsonb_build_object('origen_equipo_id', id::text)
  from equipo where estatus='activo' and lower(coalesce(tipo,'')) = 'arma';

insert into comunicacion (tipo, marca, modelo, numero_serie, asignado_personal_id, estado_equipo, fecha_alta, fotografias, datos_adicionales)
  select lower(tipo), marca, modelo, numero_serie, asignado_personal_id, estado_equipo, fecha_alta, fotografias,
         coalesce(datos_adicionales,'{}'::jsonb) || jsonb_build_object('origen_equipo_id', id::text)
  from equipo where estatus='activo' and lower(coalesce(tipo,'')) in ('radio','celular');

insert into bodycams (tipo, marca, modelo, numero_serie, asignado_personal_id, estado_equipo, fecha_alta, fotografias, datos_adicionales)
  select 'bodycam', marca, modelo, numero_serie, asignado_personal_id, estado_equipo, fecha_alta, fotografias,
         coalesce(datos_adicionales,'{}'::jsonb) || jsonb_build_object('origen_equipo_id', id::text)
  from equipo where estatus='activo' and lower(coalesce(tipo,'')) = 'bodycam';

insert into otros (tipo, marca, modelo, numero_serie, asignado_personal_id, estado_equipo, fecha_alta, fotografias, datos_adicionales)
  select coalesce(tipo,'otro'), marca, modelo, numero_serie, asignado_personal_id, estado_equipo, fecha_alta, fotografias,
         coalesce(datos_adicionales,'{}'::jsonb) || jsonb_build_object('origen_equipo_id', id::text)
  from equipo where estatus='activo' and lower(coalesce(tipo,'')) not in ('arma','radio','celular','bodycam','patrulla','motocicleta');

-- 6b) equipo tipo patrulla/motocicleta -> patrullas (jala datos del vehículo ligado).
insert into patrullas (numero, tipo, marca, modelo, placas, anio, color, numero_serie, fotografias, datos_adicionales)
  select
    coalesce(v.datos_adicionales->>'numero_economico', e.numero_serie),
    case when lower(e.tipo)='motocicleta' then 'motocicleta' else 'auto' end,
    coalesce(v.marca, e.marca), coalesce(v.modelo, e.modelo), v.placas, v.anio, v.color, e.numero_serie,
    coalesce(v.fotografias, e.fotografias, '[]'::jsonb),
    jsonb_build_object('origen_equipo_id', e.id::text, 'origen_vehiculo_id', v.id::text)
  from equipo e
  left join vehiculos v on v.id = (e.datos_adicionales->>'vehiculo_id')::uuid
  where e.estatus='activo' and lower(coalesce(e.tipo,'')) in ('patrulla','motocicleta');

-- 6c) vehiculos con 'Police' en la descripción (modelo) -> patrullas; cancelar el vehículo origen.
insert into patrullas (numero, tipo, marca, modelo, placas, anio, color, fotografias, datos_adicionales)
  select datos_adicionales->>'numero_economico', 'auto', marca, modelo, placas, anio, color,
         coalesce(fotografias,'[]'::jsonb),
         coalesce(datos_adicionales,'{}'::jsonb) || jsonb_build_object('origen_vehiculo_id', id::text)
  from vehiculos
  where estatus='activo' and modelo ilike '%police%';

update vehiculos
  set estatus='cancelado', cancelado_en=now(), motivo_cancelacion='Reclasificado a patrullas (flota policial)', actualizado_en=now()
  where estatus='activo' and modelo ilike '%police%';
