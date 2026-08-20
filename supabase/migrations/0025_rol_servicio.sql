-- =====================================================================
-- 0025_rol_servicio.sql   (Fase 2: Rol de Servicio)
--
-- Un supervisor elabora, antes de cada turno de 12 h, el ROL DE SERVICIO:
-- las parejas oficial ↔ patrulla que estarán en servicio. El módulo de
-- despacho lee de aquí qué unidades (y con qué oficial) están disponibles en
-- el día y horario en que se despacha.
-- =====================================================================

create table if not exists rol_servicio (
  id                     uuid primary key default gen_random_uuid(),
  folio                  text,
  fecha                  date not null,
  turno                  text not null check (turno in ('diurno','nocturno')),
  inicio                 timestamptz,
  fin                    timestamptz,
  supervisor_personal_id uuid references personal(id),
  notas                  text,
  estatus                text not null default 'activo' check (estatus in ('activo','cancelado')),
  cancelado_en           timestamptz,
  motivo_cancelacion     text,
  creado_en              timestamptz not null default now(),
  actualizado_en         timestamptz not null default now()
);
comment on table rol_servicio is 'Rol de servicio por turno de 12 h (elaborado por un supervisor).';
create index if not exists idx_rol_servicio_fecha on rol_servicio (fecha, turno);

create table if not exists rol_servicio_asignaciones (
  id             uuid primary key default gen_random_uuid(),
  rol_id         uuid not null references rol_servicio(id),
  patrulla_id    uuid not null references patrullas(id),
  personal_id    uuid not null references personal(id),
  rol_en_unidad  text,            -- conductor | acompañante | jefe de unidad, etc.
  notas          text,
  estatus        text not null default 'activo' check (estatus in ('activo','cancelado')),
  cancelado_en   timestamptz,
  motivo_cancelacion text,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index if not exists idx_rol_asig_rol on rol_servicio_asignaciones (rol_id);
create index if not exists idx_rol_asig_patrulla on rol_servicio_asignaciones (patrulla_id);

-- Triggers (no-delete + bitácora), foliador (RS) y RLS.
drop trigger if exists trg_no_delete_rol_servicio on rol_servicio;
create trigger trg_no_delete_rol_servicio before delete on rol_servicio for each row execute function fn_bloquear_delete();
drop trigger if exists trg_no_delete_rol_asig on rol_servicio_asignaciones;
create trigger trg_no_delete_rol_asig before delete on rol_servicio_asignaciones for each row execute function fn_bloquear_delete();
revoke delete on rol_servicio, rol_servicio_asignaciones from authenticated, anon;

drop trigger if exists trg_auditoria_rol_servicio on rol_servicio;
create trigger trg_auditoria_rol_servicio after insert or update on rol_servicio for each row execute function fn_bitacora_generica();
drop trigger if exists trg_auditoria_rol_asig on rol_servicio_asignaciones;
create trigger trg_auditoria_rol_asig after insert or update on rol_servicio_asignaciones for each row execute function fn_bitacora_generica();

insert into foliadores (modulo, nombre, iniciales) values ('rol_servicio','Rol de Servicio','RS') on conflict (modulo) do nothing;
drop trigger if exists trg_folio_rol_servicio on rol_servicio;
create trigger trg_folio_rol_servicio before insert on rol_servicio for each row execute function fn_asignar_folio();

alter table rol_servicio enable row level security;
alter table rol_servicio_asignaciones enable row level security;

-- Lectura: cualquier autenticado (el despacho la necesita). Escritura: supervisor/administrador.
drop policy if exists sel_rol_servicio on rol_servicio;
create policy sel_rol_servicio on rol_servicio for select to authenticated using (true);
drop policy if exists ins_rol_servicio on rol_servicio;
create policy ins_rol_servicio on rol_servicio for insert to authenticated with check (fn_rol_actual() in ('supervisor','administrador'));
drop policy if exists upd_rol_servicio on rol_servicio;
create policy upd_rol_servicio on rol_servicio for update to authenticated using (fn_rol_actual() in ('supervisor','administrador')) with check (fn_rol_actual() in ('supervisor','administrador'));

drop policy if exists sel_rol_asig on rol_servicio_asignaciones;
create policy sel_rol_asig on rol_servicio_asignaciones for select to authenticated using (true);
drop policy if exists ins_rol_asig on rol_servicio_asignaciones;
create policy ins_rol_asig on rol_servicio_asignaciones for insert to authenticated with check (fn_rol_actual() in ('supervisor','administrador'));
drop policy if exists upd_rol_asig on rol_servicio_asignaciones;
create policy upd_rol_asig on rol_servicio_asignaciones for update to authenticated using (fn_rol_actual() in ('supervisor','administrador')) with check (fn_rol_actual() in ('supervisor','administrador'));

-- Ampliar rpc_cancelar_registro con las tablas del rol.
create or replace function rpc_cancelar_registro(p_tabla text, p_id uuid, p_motivo text)
returns void as $$
begin
  if p_tabla not in ('personas','vehiculos','ubicaciones','vinculos','casos','personal',
                     'ordenes','evidencias','asuntos_internos','llamadas_cad','despachos',
                     'barandilla','equipo','incidentes','presuntos','kardex',
                     'patrullas','armamento','comunicacion','bodycams','otros',
                     'rol_servicio','rol_servicio_asignaciones') then
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

-- Vista para el despacho: patrullas EN SERVICIO ahora (rol activo cuyo horario
-- cubre el momento actual), con su oficial y el estatus operativo de la unidad.
create or replace view patrullas_en_servicio as
  select
    p.id            as patrulla_id,
    p.numero, p.tipo, p.marca, p.modelo, p.placas, p.estatus_unidad,
    a.personal_id,
    r.id            as rol_id, r.fecha, r.turno, r.inicio, r.fin
  from rol_servicio_asignaciones a
  join rol_servicio r on r.id = a.rol_id and r.estatus = 'activo'
  join patrullas p    on p.id = a.patrulla_id and p.estatus = 'activo'
  where a.estatus = 'activo'
    and now() between r.inicio and r.fin;
