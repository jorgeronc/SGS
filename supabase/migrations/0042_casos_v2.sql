-- =====================================================================
-- 0042_casos_v2.sql
-- Rework de Casos:
--   * Catálogo de DELITOS nuevo (distinto del catálogo 9-1-1 de incidentes)
--     y catálogo de PARENTESCOS, ambos administrables desde Admin -> Catálogos.
--   * presuntos: campos de identificación (nombre/apellidos) para presunto
--     identificado (además de la media filiación existente).
--   * caso_relaciones: personas relacionadas con la víctima o el presunto
--     (parentesco / tipo de relación) dentro de un caso.
-- Los datos de investigación por persona (estado civil, originario, teléfono,
-- redes) se guardan en personas.datos_adicionales (registro maestro); no
-- requieren esquema nuevo.
-- =====================================================================

-- 1) Catálogo de DELITOS (fuente del campo Delito en Casos).
insert into cat_opciones (categoria, valor, orden) values
  ('delito','Robo',1),
  ('delito','Robo a casa habitación',2),
  ('delito','Robo de vehículo',3),
  ('delito','Robo a negocio',4),
  ('delito','Robo a transeúnte',5),
  ('delito','Homicidio',6),
  ('delito','Lesiones',7),
  ('delito','Fraude',8),
  ('delito','Extorsión',9),
  ('delito','Secuestro',10),
  ('delito','Violencia familiar',11),
  ('delito','Amenazas',12),
  ('delito','Daño en propiedad ajena',13),
  ('delito','Narcomenudeo',14),
  ('delito','Abuso de confianza',15),
  ('delito','Despojo',16),
  ('delito','Abuso sexual',17),
  ('delito','Otro',99)
on conflict (categoria, valor) do nothing;

-- 2) Catálogo de PARENTESCOS / tipo de relación (pestaña Relaciones de Casos).
insert into cat_opciones (categoria, valor, orden) values
  ('parentesco','Padre',1),
  ('parentesco','Madre',2),
  ('parentesco','Hijo/a',3),
  ('parentesco','Hermano/a',4),
  ('parentesco','Cónyuge/Pareja',5),
  ('parentesco','Familiar',6),
  ('parentesco','Amigo/a',7),
  ('parentesco','Vecino/a',8),
  ('parentesco','Conocido/a',9),
  ('parentesco','Cómplice',10),
  ('parentesco','Jefe/Empleado',11),
  ('parentesco','Otro',99)
on conflict (categoria, valor) do nothing;

-- 3) presuntos: identificación cuando ya se conoce el nombre.
alter table presuntos add column if not exists nombre            text;
alter table presuntos add column if not exists apellido_paterno  text;
alter table presuntos add column if not exists apellido_materno  text;

-- 4) caso_relaciones: personas con parentesco/relación con la víctima o el presunto.
create table if not exists caso_relaciones (
  id                  uuid primary key default gen_random_uuid(),
  caso_id             uuid not null references casos(id),
  persona_id          uuid not null references personas(id),   -- persona relacionada
  con_tipo            text not null check (con_tipo in ('victima','presunto')),
  con_persona_id      uuid references personas(id),            -- víctima (persona) del caso
  con_presunto_id     uuid references presuntos(id),           -- presunto (identificado) del caso
  parentesco          text,                                    -- de cat_opciones 'parentesco'
  notas               text,

  estatus             text not null default 'activo' check (estatus in ('activo','cancelado')),
  cancelado_en        timestamptz,
  motivo_cancelacion  text,

  creado_en           timestamptz not null default now(),
  actualizado_en      timestamptz not null default now()
);

comment on table caso_relaciones is 'Personas relacionadas con la víctima o el presunto de un caso (parentesco/tipo de relación).';

create index if not exists idx_caso_relaciones_caso on caso_relaciones (caso_id);

drop trigger if exists trg_no_delete_caso_relaciones on caso_relaciones;
create trigger trg_no_delete_caso_relaciones before delete on caso_relaciones
  for each row execute function fn_bloquear_delete();

revoke delete on caso_relaciones from authenticated, anon;

drop trigger if exists trg_auditoria_caso_relaciones on caso_relaciones;
create trigger trg_auditoria_caso_relaciones after insert or update on caso_relaciones
  for each row execute function fn_bitacora_generica();

alter table caso_relaciones enable row level security;
drop policy if exists sel_caso_relaciones on caso_relaciones;
create policy sel_caso_relaciones on caso_relaciones for select to authenticated
  using (estatus = 'activo' or fn_rol_actual() in ('supervisor','investigador','administrador'));
drop policy if exists ins_caso_relaciones on caso_relaciones;
create policy ins_caso_relaciones on caso_relaciones for insert to authenticated with check (true);
drop policy if exists upd_caso_relaciones on caso_relaciones;
create policy upd_caso_relaciones on caso_relaciones for update to authenticated using (true) with check (true);

-- 5) Ampliar rpc_cancelar_registro con 'caso_relaciones' (whitelist completo vigente).
create or replace function rpc_cancelar_registro(
  p_tabla   text,
  p_id      uuid,
  p_motivo  text
) returns void as $$
begin
  if p_tabla not in ('personas','vehiculos','ubicaciones','vinculos','casos','personal',
                     'ordenes','evidencias','asuntos_internos','llamadas_cad','despachos',
                     'barandilla','equipo','incidentes','presuntos','kardex',
                     'patrullas','armamento','comunicacion','bodycams','otros',
                     'rol_servicio','rol_servicio_asignaciones','abordamientos','accidentes',
                     'tareas','tarea_asignaciones','transmisiones','caso_relaciones') then
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
