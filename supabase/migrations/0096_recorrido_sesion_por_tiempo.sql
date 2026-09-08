-- =====================================================================
-- 0096_recorrido_sesion_por_tiempo.sql
-- Ajuste al sellado de sesión en recorrido_gps (rondines Fase 1A).
--
-- Antes (0095): fn_recorrido_sesion estampaba la sesión ACTIVA del guardia AL
-- INSERTAR. Con el buffer offline del móvil, un punto capturado sin red se
-- inserta más tarde (cuando la sesión pudo YA haberse cerrado) y quedaba sin
-- sesión o mal asignado. Ahora se empata por la FECHA_HORA del punto contra la
-- ventana [iniciada_en, coalesce(finalizada_en, now())] de la sesión del guardia.
-- =====================================================================

create or replace function fn_recorrido_sesion()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if NEW.sesion_id is null and NEW.personal_id is not null then
    NEW.sesion_id := (
      select id from sesiones_rondin
       where personal_id = NEW.personal_id and estatus = 'activo'
         and NEW.fecha_hora >= iniciada_en
         and NEW.fecha_hora <= coalesce(finalizada_en, now())
       order by iniciada_en desc limit 1);
  end if;
  return NEW;
end; $$;
