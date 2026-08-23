-- =====================================================================
-- 0058_turnos_rework.sql
-- Rework de turnos: ahora un turno es una CABECERA (supervisor + fecha + franja)
-- con VARIOS guardias (detalle turno_guardias), cada guardia con su sitio/puesto.
-- Flujo: crear turno (supervisor) en 'borrador' -> abrir y agregar guardias por
-- checkbox -> activar ('activo'). Un turno se puede copiar a otra fecha.
-- =====================================================================

-- 1) Cabecera: turnos ---------------------------------------------------
alter table turnos add column if not exists supervisor_id uuid references personal(id);
alter table turnos add column if not exists folio text;
-- El guardia/sitio ya no viven en la cabecera (pasan al detalle); se permiten nulos
-- para no romper filas viejas.
alter table turnos alter column personal_id drop not null;
alter table turnos alter column sitio_id drop not null;
alter table turnos alter column estado set default 'borrador';

-- Estados de la cabecera: borrador/activo/cerrado (se conservan los antiguos por
-- compatibilidad con filas existentes).
alter table turnos drop constraint if exists turnos_estado_check;
alter table turnos add constraint turnos_estado_check
  check (estado in ('borrador','activo','cerrado','programado','cubierto','falta','relevado'));

-- Folio del turno (TU).
insert into foliadores (modulo, nombre, iniciales) values ('turnos','Turnos','TU') on conflict (modulo) do nothing;
drop trigger if exists trg_folio_turnos on turnos;
create trigger trg_folio_turnos before insert on turnos for each row execute function fn_asignar_folio();

-- 2) Detalle: turno_guardias (guardia + su sitio dentro del turno) ------
create table if not exists turno_guardias (
  id             uuid primary key default gen_random_uuid(),
  turno_id       uuid not null references turnos(id) on delete cascade,
  personal_id    uuid not null references personal(id),
  sitio_id       uuid references sitios(id),
  estado         text not null default 'programado'
                   check (estado in ('programado','cubierto','falta','relevado')),
  estatus        text not null default 'activo' check (estatus in ('activo','cancelado')),
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (turno_id, personal_id)
);
create index if not exists idx_turno_guardias_turno on turno_guardias(turno_id);
comment on table turno_guardias is 'Guardias que integran un turno (detalle), cada uno con su sitio/puesto.';

-- RLS: lectura para autenticados; escritura/borrado libres (armado del turno).
-- No es WORM: al editar el borrador se pueden quitar guardias (delete real).
alter table turno_guardias enable row level security;
drop policy if exists sel_turno_guardias on turno_guardias;
create policy sel_turno_guardias on turno_guardias for select to authenticated using (true);
drop policy if exists ins_turno_guardias on turno_guardias;
create policy ins_turno_guardias on turno_guardias for insert to authenticated with check (true);
drop policy if exists upd_turno_guardias on turno_guardias;
create policy upd_turno_guardias on turno_guardias for update to authenticated using (true) with check (true);
drop policy if exists del_turno_guardias on turno_guardias;
create policy del_turno_guardias on turno_guardias for delete to authenticated using (true);
