-- =====================================================================
-- 0111_modelo_supervision.sql  (base para: chat de relevo, tablero de supervisores)
-- Formaliza el modelo de supervisión:
--   * usuarios_perfil.personal_id: liga CADA cuenta con su registro de personal
--     (el admin lo captura en Gestión del sistema). Puente usuario<->personal que
--     no existía; lo necesitan el chat de relevo y el tablero.
--   * turnos.coordinador_id: coordinador del turno (uno por turno, cubre todos los
--     clientes). turnos.supervisor_id se conserva (compat) pero se depreca.
--   * turno_supervisores: supervisor POR SITIO dentro de un turno. Permite dividir
--     la cobertura cuando hay más clientes/dispersión; una misma persona puede
--     cubrir varios (o todos) los sitios (varias filas con el mismo supervisor).
-- =====================================================================

-- 1) Cuenta <-> personal ------------------------------------------------------
alter table usuarios_perfil add column if not exists personal_id uuid references personal(id);
comment on column usuarios_perfil.personal_id is 'Registro de personal (guardia/supervisor/etc.) ligado a esta cuenta. Lo captura el admin.';
-- Un personal a lo más en una cuenta.
create unique index if not exists ux_usuarios_perfil_personal on usuarios_perfil(personal_id) where personal_id is not null;

-- Resuelve la CUENTA (usuarios_perfil.id) de un personal. null si no está ligado.
create or replace function fn_usuario_de_personal(p_personal uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select id from usuarios_perfil where personal_id = p_personal limit 1;
$$;
grant execute on function fn_usuario_de_personal(uuid) to authenticated;

-- 2) Coordinador del turno ----------------------------------------------------
alter table turnos add column if not exists coordinador_id uuid references personal(id);
comment on column turnos.coordinador_id is 'Coordinador del turno (uno por turno, cubre todos los clientes).';
comment on column turnos.supervisor_id  is 'DEPRECADO: usar turno_supervisores (supervisor por sitio). Se conserva por compatibilidad.';

-- 3) Supervisor por sitio dentro del turno -----------------------------------
create table if not exists turno_supervisores (
  id                     uuid primary key default gen_random_uuid(),
  turno_id               uuid not null references turnos(id) on delete cascade,
  sitio_id               uuid not null references sitios(id),
  supervisor_personal_id uuid not null references personal(id),
  estatus                text not null default 'activo' check (estatus in ('activo','cancelado')),
  creado_en              timestamptz not null default now(),
  actualizado_en         timestamptz not null default now(),
  unique (turno_id, sitio_id)
);
comment on table turno_supervisores is 'Supervisor asignado a cada sitio dentro de un turno (1 supervisor por turno×sitio; una persona puede cubrir varios sitios).';
create index if not exists idx_turno_sup_turno on turno_supervisores(turno_id);
create index if not exists idx_turno_sup_personal on turno_supervisores(supervisor_personal_id);

-- Bitácora (auditar asignaciones de supervisión).
drop trigger if exists trg_bitacora_turno_sup on turno_supervisores;
create trigger trg_bitacora_turno_sup after insert or update on turno_supervisores
  for each row execute function fn_bitacora_generica();

-- RLS: lectura para autenticados; escritura solo mando (asignar supervisión es
-- acción de mando, alineado con el hallazgo CSO de escritura permisiva).
alter table turno_supervisores enable row level security;
drop policy if exists sel_turno_sup on turno_supervisores;
create policy sel_turno_sup on turno_supervisores for select to authenticated using (true);
drop policy if exists ins_turno_sup on turno_supervisores;
create policy ins_turno_sup on turno_supervisores for insert to authenticated
  with check (coalesce(fn_rol_actual(),'') in ('supervisor','coordinador','operador','administrador'));
drop policy if exists upd_turno_sup on turno_supervisores;
create policy upd_turno_sup on turno_supervisores for update to authenticated
  using (coalesce(fn_rol_actual(),'') in ('supervisor','coordinador','operador','administrador'))
  with check (coalesce(fn_rol_actual(),'') in ('supervisor','coordinador','operador','administrador'));
drop policy if exists del_turno_sup on turno_supervisores;
create policy del_turno_sup on turno_supervisores for delete to authenticated
  using (coalesce(fn_rol_actual(),'') in ('supervisor','coordinador','operador','administrador'));

-- Helper: supervisor (personal) de un sitio en un turno.
create or replace function fn_supervisor_sitio(p_turno uuid, p_sitio uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select supervisor_personal_id from turno_supervisores
   where turno_id = p_turno and sitio_id = p_sitio and estatus = 'activo' limit 1;
$$;
grant execute on function fn_supervisor_sitio(uuid, uuid) to authenticated;
