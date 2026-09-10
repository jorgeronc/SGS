-- =====================================================================
-- 0101_gps_mock.sql
-- Antifraude: marca de UBICACIÓN SIMULADA (mock location). Android informa si un
-- fix viene de una app de ubicación falsa (expo-location: LocationObject.mocked).
-- Se guarda por punto en recorrido_gps y en la última posición (ubicaciones_guardias)
-- para levantar una anomalía de revisión. No decide sanciones por sí sola.
-- =====================================================================

alter table recorrido_gps        add column if not exists mock boolean not null default false;
alter table ubicaciones_guardias add column if not exists mock boolean not null default false;

-- rpc_reportar_ubicacion + p_mock (recreado; se elimina la firma anterior para no dejar overload ambiguo).
drop function if exists rpc_reportar_ubicacion(uuid, double precision, double precision, text, text, double precision, double precision, double precision, text, text);

create or replace function rpc_reportar_ubicacion(
  p_personal   uuid,
  p_lat        double precision,
  p_lng        double precision,
  p_etiqueta   text default null,
  p_unidad     text default null,
  p_precision  double precision default null,
  p_rumbo      double precision default null,
  p_velocidad  double precision default null,
  p_estatus    text default 'en_servicio',
  p_motivo     text default null,
  p_mock       boolean default false
) returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Sesión no válida (sin auth.uid).'; end if;
  if p_personal is null then raise exception 'Falta el guardia (personal_id).'; end if;

  insert into ubicaciones_guardias (
    personal_id, user_id, etiqueta, unidad, latitud, longitud,
    precision_m, rumbo, velocidad, en_linea, estatus_servicio, motivo_pausa, mock, actualizado_en
  ) values (
    p_personal, v_uid, p_etiqueta, p_unidad, p_lat, p_lng,
    p_precision, p_rumbo, p_velocidad, true, coalesce(p_estatus, 'en_servicio'), p_motivo, coalesce(p_mock, false), now()
  )
  on conflict (personal_id) do update set
    user_id = excluded.user_id, etiqueta = excluded.etiqueta, unidad = excluded.unidad,
    latitud = excluded.latitud, longitud = excluded.longitud, precision_m = excluded.precision_m,
    rumbo = excluded.rumbo, velocidad = excluded.velocidad, en_linea = true,
    estatus_servicio = excluded.estatus_servicio, motivo_pausa = excluded.motivo_pausa, mock = excluded.mock,
    actualizado_en = now();
end $$;

grant execute on function rpc_reportar_ubicacion(uuid, double precision, double precision, text, text, double precision, double precision, double precision, text, text, boolean) to authenticated;
