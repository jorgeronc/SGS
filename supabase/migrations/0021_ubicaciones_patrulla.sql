-- =====================================================================
-- 0021_ubicaciones_patrulla.sql
-- Posiciones GPS enviadas por el elemento desde la app móvil ("Enviar
-- ubicación"). Es una bitácora append-only (WORM) de pings de posición:
-- cada envío es un renglón inmutable. El centro de mando (web) puede leer
-- la última posición de cada patrulla desde la vista de abajo.
-- =====================================================================

create table if not exists ubicaciones_patrulla (
  id            bigint generated always as identity primary key,
  usuario_id    uuid,                                   -- auth.uid() de quien envía
  personal_id   uuid references personal(id),           -- elemento (si se vincula usuario↔personal)
  latitud       double precision not null,
  longitud      double precision not null,
  precision_m   double precision,                       -- exactitud reportada por el GPS (metros)
  origen        text not null default 'movil',
  enviado_en    timestamptz not null default now()
);

comment on table ubicaciones_patrulla is 'Pings de posición GPS enviados por el elemento en campo (append-only / WORM). La última fila por usuario es la posición actual de la patrulla.';

create index if not exists idx_ubic_patrulla_usuario on ubicaciones_patrulla (usuario_id, enviado_en desc);
create index if not exists idx_ubic_patrulla_fecha on ubicaciones_patrulla (enviado_en desc);

-- Última posición conocida por usuario (para el mapa del dashboard web).
create or replace view ubicaciones_patrulla_ultimas as
  select distinct on (usuario_id) *
  from ubicaciones_patrulla
  order by usuario_id, enviado_en desc;

-- WORM: un ping, una vez enviado, no se modifica ni se borra.
-- (fn_bloquear_cambios_append_only se definió en 0015_incidentes.sql)
drop trigger if exists trg_ubic_patrulla_worm on ubicaciones_patrulla;
create trigger trg_ubic_patrulla_worm
  before update or delete on ubicaciones_patrulla
  for each row execute function fn_bloquear_cambios_append_only();

revoke update, delete on ubicaciones_patrulla from authenticated, anon;

-- RLS: lectura para autenticados; sólo inserción (append-only).
alter table ubicaciones_patrulla enable row level security;

drop policy if exists sel_ubic_patrulla on ubicaciones_patrulla;
create policy sel_ubic_patrulla on ubicaciones_patrulla for select to authenticated using (true);

drop policy if exists ins_ubic_patrulla on ubicaciones_patrulla;
create policy ins_ubic_patrulla on ubicaciones_patrulla for insert to authenticated with check (true);

-- Registro del ping con el usuario resuelto en el servidor (auth.uid()).
create or replace function rpc_registrar_ubicacion(
  p_lat       double precision,
  p_lng       double precision,
  p_precision double precision default null
) returns bigint as $$
declare
  v_id bigint;
begin
  insert into ubicaciones_patrulla (usuario_id, latitud, longitud, precision_m, origen)
  values (auth.uid(), p_lat, p_lng, p_precision, 'movil')
  returning id into v_id;
  return v_id;
end;
$$ language plpgsql security definer;
