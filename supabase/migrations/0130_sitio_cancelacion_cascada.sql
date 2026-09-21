-- =====================================================================
-- 0130_sitio_cancelacion_cascada.sql
-- "Todo conectado": al CANCELAR un sitio, desconectar sus dependientes para que
-- deje de aparecer en las opciones/operación del sistema. WORM (se cancela, no
-- se borra). Incluye backfill para los sitios ya cancelados.
--
-- Cascada (solo sobre registros vigentes / turnos no cerrados):
--   * puntos_control, zonas, camaras, rondines_programados  → estatus 'cancelado'
--   * contrato_servicios activos                            → estado 'terminado'
--   * turno_supervisores (turnos borrador/activo)           → estatus 'cancelado'
--   * turno_guardias (turnos borrador/activo)               → sitio_id = null (queda sin sitio)
--   * citas CEDIS pendientes / citas_visitantes pendientes  → canceladas
-- =====================================================================

create or replace function fn_sitio_desconectar(p_sitio uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update puntos_control set estatus = 'cancelado', cancelado_en = now(), motivo_cancelacion = 'Sitio cancelado', actualizado_en = now()
   where sitio_id = p_sitio and estatus = 'activo';

  update zonas set estatus = 'cancelado', cancelado_en = now(), motivo_cancelacion = 'Sitio cancelado', actualizado_en = now()
   where sitio_id = p_sitio and estatus = 'activo';

  update camaras set estatus = 'cancelado', cancelado_en = now(), motivo_cancelacion = 'Sitio cancelado', actualizado_en = now()
   where sitio_id = p_sitio and estatus = 'activo';

  update rondines_programados set estatus = 'cancelado', cancelado_en = now(), motivo_cancelacion = 'Sitio cancelado', actualizado_en = now()
   where sitio_id = p_sitio and estatus = 'activo';

  update contrato_servicios set estado = 'terminado', fecha_fin = coalesce(fecha_fin, current_date), actualizado_en = now()
   where sitio_id = p_sitio and estatus = 'activo' and estado = 'activo';

  -- Supervisión del sitio en turnos aún no cerrados.
  update turno_supervisores ts set estatus = 'cancelado', actualizado_en = now()
    from turnos t
   where t.id = ts.turno_id and ts.sitio_id = p_sitio and ts.estatus = 'activo'
     and t.estatus = 'activo' and t.estado in ('borrador', 'activo');

  -- Guardias asignados al sitio en turnos aún no cerrados → quedan sin sitio.
  update turno_guardias tg set sitio_id = null, actualizado_en = now()
    from turnos t
   where t.id = tg.turno_id and tg.sitio_id = p_sitio and tg.estatus = 'activo'
     and t.estatus = 'activo' and t.estado in ('borrador', 'activo');

  -- Citas CEDIS pendientes del sitio.
  update citas set estatus = 'cancelado', cancelado_en = now(), motivo_cancelacion = 'Sitio cancelado', actualizado_en = now()
   where sitio_id = p_sitio and estatus = 'activo' and estado not in ('finalizada', 'salida', 'cancelada');

  -- Citas de visitante pendientes del sitio.
  update citas_visitantes set estado = 'cancelada', estatus = 'cancelado', cancelado_en = now(), motivo_cancelacion = 'Sitio cancelado', actualizado_en = now()
   where sitio_id = p_sitio and estatus = 'activo' and estado = 'pendiente';
end;
$$;

-- Trigger: al pasar el sitio a 'cancelado', dispara la cascada.
create or replace function fn_sitio_cascada() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.estatus = 'cancelado' and coalesce(old.estatus, '') <> 'cancelado' then
    perform fn_sitio_desconectar(new.id);
  end if;
  return new;
end;
$$;
drop trigger if exists trg_sitio_cascada on sitios;
create trigger trg_sitio_cascada after update on sitios
  for each row execute function fn_sitio_cascada();

-- Backfill: desconectar dependientes de los sitios YA cancelados (p. ej. los que
-- se cancelaron antes de existir este trigger).
do $$
declare s record;
begin
  for s in select id from sitios where estatus = 'cancelado' loop
    perform fn_sitio_desconectar(s.id);
  end loop;
end $$;
