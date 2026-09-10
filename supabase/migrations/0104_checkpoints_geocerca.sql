-- =====================================================================
-- 0104_checkpoints_geocerca.sql
-- Rondines Fase 2A — validación de checkpoints por GEOCERCA (sin QR/NFC), para
-- áreas amplias. Como el móvil ya transmite recorrido_gps (con sesion_id y
-- precision_m), la validación se hace en el SERVIDOR: un trigger sobre
-- recorrido_gps evalúa, al entrar el guardia al radio de un checkpoint tipo
-- geocerca durante una sesión activa, si hay permanencia (dwell) y muestras
-- suficientes con precisión aceptable → registra el paso (metodo='geocerca').
-- No requiere cambios en el móvil. Círculos (radio_m); polígonos = fase 2B.
--
-- Nota: si al correr da "deadlock detected" es contención transitoria con la app
-- escribiendo recorrido_gps / leyendo puntos_control mientras la migración pide
-- locks. Es idempotente: vuelve a correr el archivo completo (idealmente en un
-- momento de baja actividad). lock_timeout hace que falle rápido y limpio.
-- =====================================================================

set local lock_timeout = '5s';

alter table puntos_control add column if not exists metodo_validacion text not null default 'scan';
do $$ begin
  alter table puntos_control add constraint chk_metodo_validacion check (metodo_validacion in ('scan','geocerca','ambos'));
exception when duplicate_object then null; end $$;
alter table puntos_control add column if not exists dwell_seg       integer not null default 45;  -- permanencia mínima
alter table puntos_control add column if not exists muestras_min    integer not null default 2;   -- muestras GPS mínimas
alter table puntos_control add column if not exists precision_max_m integer not null default 25;  -- precisión máxima aceptada (m)
comment on column puntos_control.metodo_validacion is 'Cómo se valida el punto: scan (QR/NFC), geocerca (automático por GPS) o ambos.';

-- Evalúa los checkpoints geocerca del sitio al insertar un punto de recorrido.
create or replace function fn_evaluar_geocercas()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_sitio  uuid;
  v_margen integer;
  r        record;
  v_cnt    int;
  v_span   numeric;
  v_dist   double precision;
  v_vis    int;
  v_esp    int;
begin
  if NEW.sesion_id is null or NEW.personal_id is null then return NEW; end if;
  select sitio_id into v_sitio from sesiones_rondin where id = NEW.sesion_id and estado = 'en_progreso' and estatus = 'activo';
  if v_sitio is null then return NEW; end if;
  select coalesce(geofence_margen_m, 20) into v_margen from config_sistema where id = true;
  v_margen := coalesce(v_margen, 20);

  for r in
    select id, latitud, longitud, coalesce(radio_m, 40) as radio_m, coalesce(tipo_punto, 'control') as tipo_punto,
           coalesce(dwell_seg, 45) as dwell_seg, coalesce(muestras_min, 2) as muestras_min, coalesce(precision_max_m, 25) as precision_max_m
      from puntos_control
     where sitio_id = v_sitio and estatus = 'activo'
       and coalesce(metodo_validacion, 'scan') in ('geocerca', 'ambos')
       and latitud is not null and longitud is not null
  loop
    -- ya registrado en esta sesión (por geocerca o por scan): no duplicar
    if exists (select 1 from rondines where sesion_id = NEW.sesion_id and punto_id = r.id and estatus = 'activo') then continue; end if;
    -- ¿el punto nuevo cae dentro del radio del checkpoint? (si no, ni evaluamos)
    v_dist := fn_distancia_m(NEW.latitud, NEW.longitud, r.latitud, r.longitud);
    if v_dist is null or v_dist > (r.radio_m + v_margen) then continue; end if;
    -- muestras válidas dentro del radio durante esta sesión (ventana reciente)
    select count(*), coalesce(extract(epoch from (max(fecha_hora) - min(fecha_hora))), 0)
      into v_cnt, v_span
      from recorrido_gps
     where sesion_id = NEW.sesion_id
       and fecha_hora >= now() - interval '20 minutes'
       and (precision_m is null or precision_m <= r.precision_max_m)
       and fn_distancia_m(latitud, longitud, r.latitud, r.longitud) <= (r.radio_m + v_margen);
    if v_cnt >= r.muestras_min and v_span >= r.dwell_seg then
      insert into rondines (punto_id, personal_id, turno_id, latitud, longitud, distancia_m, dentro_geocerca, tipo_evento, metodo, sesion_id)
        values (r.id, NEW.personal_id, null, NEW.latitud, NEW.longitud, round(v_dist::numeric, 1), true, r.tipo_punto, 'geocerca', NEW.sesion_id);
      v_vis := fn_rondin_visitados(NEW.sesion_id);
      select checkpoints_esperados into v_esp from sesiones_rondin where id = NEW.sesion_id;
      update sesiones_rondin set checkpoints_visitados = v_vis, actualizado_en = now() where id = NEW.sesion_id;
      if v_esp > 0 and v_vis >= v_esp then perform fn_rondin_cerrar_sesion(NEW.sesion_id, 'checkpoints'); end if;
    end if;
  end loop;
  return NEW;
end $$;

drop trigger if exists trg_evaluar_geocercas on recorrido_gps;
create trigger trg_evaluar_geocercas after insert on recorrido_gps
  for each row execute function fn_evaluar_geocercas();
