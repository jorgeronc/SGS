-- =====================================================================
-- 0057_recorrido_gps.sql
-- Historial de posiciones GPS del guardia (para supervisar el recorrido de un
-- rondín). ubicaciones_guardias (0054) guarda SOLO la última posición (telemetría
-- viva); esta tabla ACUMULA cada reporte para poder dibujar el trayecto y
-- exportarlo. El móvil inserta aquí en cada ping, además del upsert vivo.
-- =====================================================================

create table if not exists recorrido_gps (
  id             uuid primary key default gen_random_uuid(),
  personal_id    uuid references personal(id),
  user_id        uuid not null,                 -- auth.uid() del guardia que reporta
  turno_id       uuid references turnos(id),
  latitud        double precision not null,
  longitud       double precision not null,
  precision_m    double precision,
  rumbo          double precision,
  velocidad      double precision,
  fecha_hora     timestamptz not null default now()
);

create index if not exists idx_recorrido_guardia_fecha on recorrido_gps(personal_id, fecha_hora);
comment on table recorrido_gps is 'Historial de posiciones GPS del guardia (trayecto del rondín). Append-only telemetría; no WORM ni folio.';

-- No se borra por la app (telemetría).
revoke delete on recorrido_gps from authenticated, anon;

alter table recorrido_gps enable row level security;

-- Lectura: solo mandos (igual que la ubicación en vivo).
drop policy if exists sel_recorrido on recorrido_gps;
create policy sel_recorrido on recorrido_gps for select to authenticated
  using (coalesce(fn_rol_actual(), '') in ('supervisor', 'administrador'));

-- Escritura: cada guardia solo sus propias posiciones.
drop policy if exists ins_recorrido on recorrido_gps;
create policy ins_recorrido on recorrido_gps for insert to authenticated
  with check (user_id = auth.uid());
