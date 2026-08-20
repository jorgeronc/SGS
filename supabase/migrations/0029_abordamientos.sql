-- =====================================================================
-- 0029_abordamientos.sql   (Módulo Abordamientos)
--
-- Un abordamiento documenta, a discreción del oficial, personas/vehículos en
-- circunstancias sospechosas o inusuales. Intercambia información con
-- Barandilla, Incidentes, Casos, Personas, Vehículos, Órdenes y Citatorios
-- (vía la tabla genérica `vinculos`; se agrega el tipo 'abordamiento').
--
-- Campos tomados de Tablas/Abordamientos.jpg. La persona y el vehículo abordados
-- se guardan en los catálogos maestros (personas/vehiculos) y se enlazan por
-- persona_id / vehiculo_id; sus atributos extra (ocupación, estado civil,
-- escolaridad, originario / estado del vehículo, seguro) viven en el
-- `datos_adicionales` de esos registros.
-- =====================================================================

create table if not exists abordamientos (
  id                   uuid primary key default gen_random_uuid(),
  folio                text,
  fecha_registro       timestamptz not null default now(),
  tipo_servicio        text check (tipo_servicio in ('operativo','rutina')),
  folio_operativo      text,                       -- folio del operativo (si aplica)

  -- Primer respondiente
  oficial_personal_id  uuid references personal(id),
  crp                  text,
  bodycam              text,

  -- Motivo (multi, del catálogo motivo_abordamiento; coma-separado)
  motivo               text,

  -- Ubicación
  direccion            text,
  colonia              text,
  latitud              double precision,
  longitud             double precision,

  -- Persona y vehículo abordados (índice maestro)
  persona_id           uuid references personas(id),
  vehiculo_id          uuid references vehiculos(id),

  -- Resultado / notas / fotos del abordamiento
  resultado            text,                       -- catálogo resultado_abordamiento
  observaciones        text,
  fotografias          jsonb default '[]'::jsonb,
  datos_adicionales    jsonb default '{}'::jsonb,

  estatus              text not null default 'activo' check (estatus in ('activo','cancelado')),
  cancelado_en         timestamptz,
  motivo_cancelacion   text,
  creado_en            timestamptz not null default now(),
  actualizado_en       timestamptz not null default now()
);
comment on table abordamientos is 'Abordamientos: registro discrecional de personas/vehículos en circunstancias sospechosas; insumo para análisis de delitos. Intercambia con barandilla/incidentes/casos/personas/vehiculos/ordenes vía vinculos.';

create index if not exists idx_abordamientos_oficial on abordamientos (oficial_personal_id);
create index if not exists idx_abordamientos_persona on abordamientos (persona_id);
create index if not exists idx_abordamientos_vehiculo on abordamientos (vehiculo_id);
create index if not exists idx_abordamientos_fecha on abordamientos (fecha_registro desc);

create or replace view abordamientos_activos as
  select * from abordamientos where estatus = 'activo';

-- Triggers: no-delete (WORM) + bitácora + foliador (AB).
drop trigger if exists trg_no_delete_abordamientos on abordamientos;
create trigger trg_no_delete_abordamientos before delete on abordamientos
  for each row execute function fn_bloquear_delete();
revoke delete on abordamientos from authenticated, anon;

drop trigger if exists trg_auditoria_abordamientos on abordamientos;
create trigger trg_auditoria_abordamientos after insert or update on abordamientos
  for each row execute function fn_bitacora_generica();

insert into foliadores (modulo, nombre, iniciales) values ('abordamientos','Abordamientos','AB')
  on conflict (modulo) do nothing;
drop trigger if exists trg_folio_abordamientos on abordamientos;
create trigger trg_folio_abordamientos before insert on abordamientos
  for each row execute function fn_asignar_folio();

-- RLS (patrón estándar).
alter table abordamientos enable row level security;
drop policy if exists sel_abordamientos on abordamientos;
create policy sel_abordamientos on abordamientos for select to authenticated
  using (estatus = 'activo' or fn_rol_actual() in ('supervisor','investigador','administrador'));
drop policy if exists ins_abordamientos on abordamientos;
create policy ins_abordamientos on abordamientos for insert to authenticated with check (true);
drop policy if exists upd_abordamientos on abordamientos;
create policy upd_abordamientos on abordamientos for update to authenticated using (true) with check (true);

-- Ampliar rpc_cancelar_registro con 'abordamientos'.
create or replace function rpc_cancelar_registro(p_tabla text, p_id uuid, p_motivo text)
returns void as $$
begin
  if p_tabla not in ('personas','vehiculos','ubicaciones','vinculos','casos','personal',
                     'ordenes','evidencias','asuntos_internos','llamadas_cad','despachos',
                     'barandilla','equipo','incidentes','presuntos','kardex',
                     'patrullas','armamento','comunicacion','bodycams','otros',
                     'rol_servicio','rol_servicio_asignaciones','abordamientos') then
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

-- Catálogos del módulo.
insert into cat_opciones (categoria, valor, orden) values
  ('motivo_abordamiento','PLACA FORANEA',1),
  ('motivo_abordamiento','PLACA OBSTRUIDA / FALTANTE',2),
  ('motivo_abordamiento','PLACA FALSA',3),
  ('motivo_abordamiento','POLARIZADO EXTRA',4),
  ('motivo_abordamiento','INCUMPLE REGLAMENTO',5),
  ('motivo_abordamiento','FALTA ADMINISTRATIVA',6),
  ('motivo_abordamiento','PERSONA SOSPECHOSA',7),
  ('motivo_abordamiento','VEHICULO SOSPECHOSO',8),
  ('motivo_abordamiento','ACTIVIDAD SOSPECHOSA',9),
  ('resultado_abordamiento','SIN NOVEDAD',1),
  ('resultado_abordamiento','INFORME DE INCIDENTE',2),
  ('resultado_abordamiento','REMISION / BARANDILLA',3),
  ('resultado_abordamiento','CITATORIO',4),
  ('resultado_abordamiento','ASEGURAMIENTO',5),
  ('resultado_abordamiento','OTRO',6),
  ('estado_civil','SOLTERO/A',1),
  ('estado_civil','CASADO/A',2),
  ('estado_civil','UNION LIBRE',3),
  ('estado_civil','DIVORCIADO/A',4),
  ('estado_civil','VIUDO/A',5),
  ('escolaridad','NINGUNA',1),
  ('escolaridad','PRIMARIA',2),
  ('escolaridad','SECUNDARIA',3),
  ('escolaridad','PREPARATORIA',4),
  ('escolaridad','LICENCIATURA',5),
  ('escolaridad','POSGRADO',6)
on conflict (categoria, valor) do nothing;
