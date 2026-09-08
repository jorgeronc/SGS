-- =====================================================================
-- 0098_rpc_reportar_ubicacion.sql
-- Reporte de ubicación del guardia SIN que el cliente mande user_id: el servidor
-- lo deriva de auth.uid(). Antes, el móvil enviaba user_id desde el dispositivo y
-- la RLS (with check user_id = auth.uid()) rechazaba en silencio si no coincidía
-- (p. ej. identidad guardada desestabilizada), y el guardia nunca aparecía en el
-- mapa aunque la app dijera "compartiendo". Este RPC (security definer) hace el
-- upsert con user_id = auth.uid() y actualizado_en = now().
-- =====================================================================

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
  p_motivo     text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Sesión no válida (sin auth.uid).'; end if;
  if p_personal is null then raise exception 'Falta el guardia (personal_id).'; end if;

  insert into ubicaciones_guardias (
    personal_id, user_id, etiqueta, unidad, latitud, longitud,
    precision_m, rumbo, velocidad, en_linea, estatus_servicio, motivo_pausa, actualizado_en
  ) values (
    p_personal, v_uid, p_etiqueta, p_unidad, p_lat, p_lng,
    p_precision, p_rumbo, p_velocidad, true, coalesce(p_estatus, 'en_servicio'), p_motivo, now()
  )
  on conflict (personal_id) do update set
    user_id = excluded.user_id, etiqueta = excluded.etiqueta, unidad = excluded.unidad,
    latitud = excluded.latitud, longitud = excluded.longitud, precision_m = excluded.precision_m,
    rumbo = excluded.rumbo, velocidad = excluded.velocidad, en_linea = true,
    estatus_servicio = excluded.estatus_servicio, motivo_pausa = excluded.motivo_pausa,
    actualizado_en = now();
end $$;

grant execute on function rpc_reportar_ubicacion(uuid, double precision, double precision, text, text, double precision, double precision, double precision, text, text) to authenticated;
