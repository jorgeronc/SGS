-- =====================================================================
-- 0059_geofencing_nfc.sql
-- Geofencing y NFC para rondines.
--  - Cada punto tiene su radio permitido; el sitio su radio de geocerca.
--  - config_sistema.geofence_margen_m = tolerancia global por error de GPS.
--  - Al marcar un rondín se calcula la distancia guardia↔etiqueta y si está
--    dentro de (radio + margen); se guarda distancia, dentro_geocerca, tipo de
--    evento (entrada/salida/control) y método (qr/nfc).
--  - Tabla geocerca_eventos: entradas/salidas automáticas del perímetro del
--    sitio detectadas por el geofencing en segundo plano del móvil.
-- =====================================================================

-- 1) Parámetros -----------------------------------------------------------------
alter table config_sistema add column if not exists geofence_margen_m integer not null default 20;
comment on column config_sistema.geofence_margen_m is 'Margen (± metros) que se suma al radio del punto al validar la geocerca, por errores de GPS.';

alter table sitios          add column if not exists radio_geofence_m integer default 150;
alter table puntos_control  add column if not exists radio_m integer default 40;
alter table puntos_control  add column if not exists tipo_punto text default 'control';
do $$ begin
  alter table puntos_control add constraint chk_tipo_punto check (tipo_punto in ('control','entrada','salida'));
exception when duplicate_object then null; end $$;

-- 2) Campos de geocerca / método en cada rondín ---------------------------------
alter table rondines add column if not exists distancia_m     double precision;  -- guardia ↔ etiqueta
alter table rondines add column if not exists dentro_geocerca boolean;           -- dentro de (radio + margen)
alter table rondines add column if not exists tipo_evento     text default 'control';
alter table rondines add column if not exists metodo          text default 'qr'; -- qr | nfc | manual

-- 3) Distancia en metros (Haversine) -------------------------------------------
create or replace function fn_distancia_m(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision language sql immutable as $$
  select case when lat1 is null or lng1 is null or lat2 is null or lng2 is null then null else
    2 * 6371000 * asin(sqrt(
      power(sin(radians(lat2 - lat1) / 2), 2) +
      cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
    )) end;
$$;

-- 4) rpc_rondin_marcar extendido (geocerca + método) ----------------------------
create or replace function rpc_rondin_marcar(
  p_codigo   text,
  p_personal uuid default null,
  p_turno    uuid default null,
  p_lat      double precision default null,
  p_lng      double precision default null,
  p_novedad  text default null,
  p_metodo   text default 'qr'
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_p       record;
  v_margen  integer;
  v_dist    double precision;
  v_dentro  boolean;
  v_evento  text;
  v_id      uuid;
begin
  select id, nombre, latitud, longitud, coalesce(radio_m, 40) as radio_m, coalesce(tipo_punto,'control') as tipo_punto
    into v_p from puntos_control where codigo = p_codigo and estatus = 'activo' limit 1;
  if v_p.id is null then
    raise exception 'Código de punto de control no reconocido: %', p_codigo;
  end if;

  select coalesce(geofence_margen_m, 20) into v_margen from config_sistema where id = true;
  v_margen := coalesce(v_margen, 20);

  v_dist := fn_distancia_m(p_lat, p_lng, v_p.latitud, v_p.longitud);
  if v_dist is not null then v_dentro := v_dist <= (v_p.radio_m + v_margen); else v_dentro := null; end if;
  v_evento := v_p.tipo_punto;

  insert into rondines (punto_id, personal_id, turno_id, latitud, longitud, novedad,
                        distancia_m, dentro_geocerca, tipo_evento, metodo)
    values (v_p.id, p_personal, p_turno, p_lat, p_lng, nullif(trim(coalesce(p_novedad,'')), ''),
            v_dist, v_dentro, v_evento, coalesce(nullif(p_metodo,''), 'qr'))
    returning id into v_id;

  return jsonb_build_object(
    'id', v_id, 'punto', v_p.nombre, 'evento', v_evento,
    'distancia_m', round(v_dist::numeric, 1), 'dentro', v_dentro,
    'radio_m', v_p.radio_m, 'margen_m', v_margen
  );
end;
$$;

-- 5) Eventos de geocerca de sitio (entrada/salida automáticas, background) ------
create table if not exists geocerca_eventos (
  id           uuid primary key default gen_random_uuid(),
  personal_id  uuid references personal(id),
  user_id      uuid not null,
  sitio_id     uuid references sitios(id),
  tipo         text not null check (tipo in ('entrada','salida')),
  latitud      double precision,
  longitud     double precision,
  fecha_hora   timestamptz not null default now()
);
create index if not exists idx_geocerca_ev_guardia on geocerca_eventos(personal_id, fecha_hora);
create index if not exists idx_geocerca_ev_sitio on geocerca_eventos(sitio_id, fecha_hora);
comment on table geocerca_eventos is 'Entradas/salidas del perímetro (geocerca) de un sitio, detectadas por el móvil en segundo plano.';

revoke delete on geocerca_eventos from authenticated, anon;
alter table geocerca_eventos enable row level security;
drop policy if exists sel_geocerca_ev on geocerca_eventos;
create policy sel_geocerca_ev on geocerca_eventos for select to authenticated
  using (coalesce(fn_rol_actual(), '') in ('supervisor', 'administrador'));
drop policy if exists ins_geocerca_ev on geocerca_eventos;
create policy ins_geocerca_ev on geocerca_eventos for insert to authenticated
  with check (user_id = auth.uid());
