-- =====================================================================
-- 0054_gps_guardias.sql
-- Ubicación en vivo de guardias: el móvil reporta su posición cada N seg
-- (parámetro en config_sistema, leído al iniciar sesión) y la central la ve
-- en el mapa de monitoreo. Solo mandos (supervisor/administrador) leen; cada
-- guardia solo escribe su propia fila. Telemetría viva (upsert), no WORM.
-- =====================================================================

-- 1) Parámetros de rastreo en la config del sistema (singleton) ---------
alter table config_sistema
  add column if not exists gps_activo        boolean not null default true,
  add column if not exists gps_intervalo_seg integer not null default 60,
  add column if not exists gps_ventana_seg   integer not null default 180;

comment on column config_sistema.gps_activo        is 'Interruptor maestro del rastreo GPS de guardias (lo lee el móvil al iniciar sesión).';
comment on column config_sistema.gps_intervalo_seg is 'Cada cuántos segundos reporta el móvil su ubicación (mínimo efectivo 10).';
comment on column config_sistema.gps_ventana_seg   is 'Segundos sin reportar tras los cuales el guardia deja de considerarse "en línea".';

do $$ begin
  alter table config_sistema add constraint chk_gps_intervalo check (gps_intervalo_seg between 10 and 3600);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table config_sistema add constraint chk_gps_ventana check (gps_ventana_seg between 30 and 7200);
exception when duplicate_object then null; end $$;

-- 2) Tabla de última posición por guardia ------------------------------
create table if not exists ubicaciones_guardias (
  personal_id    uuid primary key references personal(id),
  user_id        uuid not null,
  etiqueta       text,
  unidad         text,                             -- sitio/puesto o unidad asignada (viene del móvil)
  latitud        double precision not null,
  longitud       double precision not null,
  precision_m    double precision,
  rumbo          double precision,
  velocidad      double precision,
  en_linea       boolean not null default true,
  actualizado_en timestamptz not null default now()
);

create index if not exists idx_ubic_guardias_linea on ubicaciones_guardias(en_linea, actualizado_en);
comment on table ubicaciones_guardias is 'Última posición GPS conocida de cada guardia con la app móvil (telemetría viva, upsert por personal_id).';

-- 3) No se borran por la app (telemetría) ------------------------------
revoke delete on ubicaciones_guardias from authenticated, anon;

-- 4) RLS ---------------------------------------------------------------
alter table ubicaciones_guardias enable row level security;

-- Lectura: solo central/mandos.
drop policy if exists sel_ubic_guardias on ubicaciones_guardias;
create policy sel_ubic_guardias on ubicaciones_guardias for select to authenticated
  using (coalesce(fn_rol_actual(), '') in ('supervisor', 'administrador'));

-- Escritura: cada guardia solo su propia fila.
drop policy if exists ins_ubic_guardias on ubicaciones_guardias;
create policy ins_ubic_guardias on ubicaciones_guardias for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists upd_ubic_guardias on ubicaciones_guardias;
create policy upd_ubic_guardias on ubicaciones_guardias for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 5) Realtime ----------------------------------------------------------
do $$ begin
  alter publication supabase_realtime add table ubicaciones_guardias;
exception when duplicate_object then null; end $$;
