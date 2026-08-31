-- =====================================================================
-- 0084_tipos_turno.sql · Rol de turnos
-- Catálogo estructurado de tipos de turno (nombre + horario inicio/fin),
-- administrable desde Administración. Reemplaza al catálogo de texto
-- 'tipo_turno' de cat_opciones (que no llevaba horario estructurado).
-- El turno sigue guardando tipo_turno (nombre) + hora_inicio/hora_fin.
-- =====================================================================

create table if not exists tipos_turno (
  id           uuid primary key default gen_random_uuid(),
  nombre       text not null unique,
  hora_inicio  time,
  hora_fin     time,
  orden        int not null default 100,
  activo       boolean not null default true,
  creado_en    timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
comment on table tipos_turno is 'Catálogo de tipos de turno con su horario (inicio/fin), administrable.';

insert into tipos_turno (nombre, hora_inicio, hora_fin, orden) values
  ('Matutino',   '06:00', '14:00', 1),
  ('Vespertino', '14:00', '22:00', 2),
  ('Nocturno',   '22:00', '06:00', 3),
  ('Diurno',     '08:00', '20:00', 4)
on conflict (nombre) do nothing;

alter table tipos_turno enable row level security;
drop policy if exists sel_tipos_turno on tipos_turno;
create policy sel_tipos_turno on tipos_turno for select to authenticated using (true);
drop policy if exists ins_tipos_turno on tipos_turno;
create policy ins_tipos_turno on tipos_turno for insert to authenticated
  with check (coalesce(fn_rol_actual(),'') = 'administrador');
drop policy if exists upd_tipos_turno on tipos_turno;
create policy upd_tipos_turno on tipos_turno for update to authenticated
  using (coalesce(fn_rol_actual(),'') = 'administrador')
  with check (coalesce(fn_rol_actual(),'') = 'administrador');
drop policy if exists del_tipos_turno on tipos_turno;
create policy del_tipos_turno on tipos_turno for delete to authenticated
  using (coalesce(fn_rol_actual(),'') = 'administrador');
