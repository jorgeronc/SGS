-- =====================================================================
-- 0095_sesiones_rondin.sql
-- Trazabilidad de rondines (Fase 1A) — SESIÓN DE RONDÍN automática por geocerca.
--
-- Idea (opción B): la sesión se ABRE sola cuando el guardia ENTRA a la geocerca
-- de un sitio (si el sitio tiene checkpoints) y se CIERRA cuando completa los
-- checkpoints obligatorios o SALE del perímetro. El servidor manda: toda la
-- lógica vive en un trigger sobre geocerca_eventos + RPC de marcado; el móvil
-- casi no cambia (ya inserta geocerca_eventos, recorrido_gps y marca rondines).
--
-- Reglas elegidas:
--   * 1b: si al cerrar no hubo NINGÚN check -> estado 'cancelado' (fue presencia,
--     no un rondín). Además rpc_rondin_barrer_vencidas() cancela sesiones abiertas
--     sin checks más viejas que sitios.rondin_auto_cancel_min (para un cron o al
--     cargar la supervisión).
--   * Debounce: una reentrada dentro de sitios.rondin_debounce_seg REABRE la misma
--     sesión (evita abrir/cerrar por saltos de GPS en el borde).
--
-- Depende de: 0053 (puntos_control, rondines), 0054 (ubicaciones_guardias),
-- 0057 (recorrido_gps), 0059 (geocerca_eventos, fn_distancia_m, rpc_rondin_marcar).
-- =====================================================================

-- 0) Config por sitio + flag de checkpoint obligatorio ------------------------
alter table sitios add column if not exists rondin_auto_cancel_min integer not null default 10;
alter table sitios add column if not exists rondin_debounce_seg    integer not null default 60;
comment on column sitios.rondin_auto_cancel_min is 'Minutos sin ningún check tras los que una sesión de rondín abierta se auto-cancela (fue presencia, no rondín).';
comment on column sitios.rondin_debounce_seg    is 'Ventana (seg) en que una reentrada a la geocerca reabre la misma sesión (anti-rebote de GPS).';

alter table puntos_control add column if not exists obligatorio boolean not null default true;
comment on column puntos_control.obligatorio is 'Si cuenta para el cumplimiento de la sesión de rondín (checkpoints esperados).';

-- 1) Tabla de sesiones de rondín (foliada, WORM) -----------------------------
create table if not exists sesiones_rondin (
  id                    uuid primary key default gen_random_uuid(),
  folio                 text,
  personal_id           uuid references personal(id),
  user_id               uuid,
  sitio_id              uuid references sitios(id),
  turno_id              uuid references turnos(id),
  device_id             text,
  iniciada_en           timestamptz not null default now(),
  finalizada_en         timestamptz,
  estado                text not null default 'en_progreso'
                          check (estado in ('en_progreso','completado','incompleto','cancelado')),
  metodo_inicio         text default 'geocerca',   -- geocerca | manual
  metodo_fin            text,                       -- geocerca | checkpoints | vencida | auto | manual
  checkpoints_esperados integer not null default 0,
  checkpoints_visitados integer not null default 0,
  cumplimiento_pct      numeric,
  distancia_m           numeric,
  duracion_min          numeric,
  datos_adicionales     jsonb default '{}'::jsonb,
  estatus               text not null default 'activo' check (estatus in ('activo','cancelado')),
  cancelado_en          timestamptz,
  motivo_cancelacion    text,
  creado_en             timestamptz not null default now(),
  actualizado_en        timestamptz not null default now()
);
create index if not exists idx_sesiones_rondin_guardia on sesiones_rondin(personal_id, estado);
create index if not exists idx_sesiones_rondin_sitio   on sesiones_rondin(sitio_id, iniciada_en);
comment on table sesiones_rondin is 'Sesión de rondín (folio RN): agrupa traza GPS + checks + indicadores. Se abre/cierra sola por geocerca (0095).';

-- Folio RN (foliadores.iniciales exige exactamente 2 caracteres).
insert into foliadores (modulo, nombre, iniciales) values ('sesiones_rondin','Sesiones de rondín','RN')
  on conflict (modulo) do nothing;
drop trigger if exists trg_folio_sesiones_rondin on sesiones_rondin;
create trigger trg_folio_sesiones_rondin before insert on sesiones_rondin
  for each row execute function fn_asignar_folio();

-- WORM.
drop trigger if exists trg_no_delete_sesiones_rondin on sesiones_rondin;
create trigger trg_no_delete_sesiones_rondin before delete on sesiones_rondin
  for each row execute function fn_bloquear_delete();
revoke delete on sesiones_rondin from authenticated, anon;

-- Bitácora.
drop trigger if exists trg_bitacora_sesiones_rondin on sesiones_rondin;
create trigger trg_bitacora_sesiones_rondin after insert or update on sesiones_rondin
  for each row execute function fn_bitacora_generica();

-- RLS: el guardia ve las suyas; central ve todas. Escritura solo por RPC/trigger definer.
alter table sesiones_rondin enable row level security;
drop policy if exists sel_sesiones_rondin on sesiones_rondin;
create policy sel_sesiones_rondin on sesiones_rondin for select to authenticated
  using (user_id = auth.uid() or coalesce(fn_rol_actual(), '') in ('supervisor','administrador'));

-- 2) FK de sesión en la traza y en los checks -------------------------------
alter table recorrido_gps add column if not exists sesion_id uuid references sesiones_rondin(id);
alter table rondines      add column if not exists sesion_id uuid references sesiones_rondin(id);
create index if not exists idx_recorrido_sesion on recorrido_gps(sesion_id, fecha_hora);
create index if not exists idx_rondines_sesion  on rondines(sesion_id);

-- 3) Helpers: sesión activa, checkpoints visitados, distancia de la traza -----
create or replace function fn_sesion_activa_guardia(p_personal uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select id from sesiones_rondin
   where personal_id = p_personal and estado = 'en_progreso' and estatus = 'activo'
   order by iniciada_en desc limit 1;
$$;

create or replace function fn_rondin_visitados(p_ses uuid)
returns integer language sql stable security definer set search_path = public as $$
  select count(distinct r.punto_id)::int
    from rondines r join puntos_control p on p.id = r.punto_id
   where r.sesion_id = p_ses and r.estatus = 'activo'
     and p.estatus = 'activo' and coalesce(p.obligatorio, true);
$$;

create or replace function fn_distancia_traza(p_ses uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(round(sum(d)::numeric, 1), 0) from (
    select fn_distancia_m(lag(latitud) over w, lag(longitud) over w, latitud, longitud) as d
      from recorrido_gps where sesion_id = p_ses
     window w as (order by fecha_hora)
  ) t where d is not null;
$$;

-- 4) Cerrar una sesión: calcula visitados, cumplimiento, distancia, duración --
create or replace function fn_rondin_cerrar_sesion(p_ses uuid, p_metodo text)
returns void language plpgsql security definer set search_path = public as $$
declare v_esp int; v_vis int; v_estado text;
begin
  select checkpoints_esperados into v_esp from sesiones_rondin where id = p_ses;
  v_vis := fn_rondin_visitados(p_ses);
  v_estado := case when v_vis = 0 then 'cancelado'
                   when v_esp > 0 and v_vis >= v_esp then 'completado'
                   else 'incompleto' end;
  update sesiones_rondin set
      finalizada_en = now(),
      estado = v_estado,
      metodo_fin = p_metodo,
      checkpoints_visitados = v_vis,
      cumplimiento_pct = case when v_esp > 0 then round(v_vis::numeric / v_esp * 100) else null end,
      distancia_m = fn_distancia_traza(p_ses),
      duracion_min = round(extract(epoch from (now() - iniciada_en))::numeric / 60, 1),
      actualizado_en = now()
   where id = p_ses;
end; $$;

-- 5) Trigger sobre geocerca_eventos: abre/cierra la sesión -------------------
create or replace function fn_geocerca_sesion()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_ses uuid; v_deb int; v_esp int;
begin
  if NEW.tipo = 'entrada' then
    -- ya hay una sesión abierta para (guardia, sitio): nada que hacer
    select id into v_ses from sesiones_rondin
      where personal_id = NEW.personal_id and sitio_id = NEW.sitio_id
        and estado = 'en_progreso' and estatus = 'activo' limit 1;
    if v_ses is not null then return NEW; end if;

    -- debounce: reentrada reciente -> reabrir la misma sesión
    select coalesce(rondin_debounce_seg, 60) into v_deb from sitios where id = NEW.sitio_id;
    select id into v_ses from sesiones_rondin
      where personal_id = NEW.personal_id and sitio_id = NEW.sitio_id and estatus = 'activo'
        and finalizada_en is not null and finalizada_en > now() - make_interval(secs => coalesce(v_deb, 60))
      order by finalizada_en desc limit 1;
    if v_ses is not null then
      update sesiones_rondin set estado = 'en_progreso', finalizada_en = null, metodo_fin = null, actualizado_en = now()
        where id = v_ses;
      return NEW;
    end if;

    -- solo se crea sesión si el sitio tiene checkpoints obligatorios
    select count(*) into v_esp from puntos_control
      where sitio_id = NEW.sitio_id and estatus = 'activo' and coalesce(obligatorio, true);
    if coalesce(v_esp, 0) = 0 then return NEW; end if;

    -- higiene: cerrar cualquier otra sesión abierta del guardia en OTRO sitio
    update sesiones_rondin set
        finalizada_en = now(),
        estado = case when checkpoints_visitados = 0 then 'cancelado'
                      when checkpoints_esperados > 0 and checkpoints_visitados >= checkpoints_esperados then 'completado'
                      else 'incompleto' end,
        metodo_fin = 'auto', actualizado_en = now()
      where personal_id = NEW.personal_id and estado = 'en_progreso' and estatus = 'activo';

    insert into sesiones_rondin (personal_id, user_id, sitio_id, iniciada_en, estado, metodo_inicio, checkpoints_esperados)
      values (NEW.personal_id, NEW.user_id, NEW.sitio_id, coalesce(NEW.fecha_hora, now()), 'en_progreso', 'geocerca', v_esp);

  elsif NEW.tipo = 'salida' then
    select id into v_ses from sesiones_rondin
      where personal_id = NEW.personal_id and sitio_id = NEW.sitio_id
        and estado = 'en_progreso' and estatus = 'activo' limit 1;
    if v_ses is not null then perform fn_rondin_cerrar_sesion(v_ses, 'geocerca'); end if;
  end if;
  return NEW;
end; $$;

drop trigger if exists trg_geocerca_sesion on geocerca_eventos;
create trigger trg_geocerca_sesion after insert on geocerca_eventos
  for each row execute function fn_geocerca_sesion();

-- 6) Trigger sobre recorrido_gps: sella la sesión activa del guardia ---------
create or replace function fn_recorrido_sesion()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if NEW.sesion_id is null and NEW.personal_id is not null then
    NEW.sesion_id := fn_sesion_activa_guardia(NEW.personal_id);
  end if;
  return NEW;
end; $$;

drop trigger if exists trg_recorrido_sesion on recorrido_gps;
create trigger trg_recorrido_sesion before insert on recorrido_gps
  for each row execute function fn_recorrido_sesion();

-- 7) rpc_rondin_marcar: sella sesion_id, actualiza visitados y cierra si completó
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
  v_ses     uuid;
  v_esp     int;
  v_vis     int;
begin
  select id, nombre, sitio_id, latitud, longitud, coalesce(radio_m, 40) as radio_m, coalesce(tipo_punto,'control') as tipo_punto
    into v_p from puntos_control where codigo = p_codigo and estatus = 'activo' limit 1;
  if v_p.id is null then
    raise exception 'Código de punto de control no reconocido: %', p_codigo;
  end if;

  select coalesce(geofence_margen_m, 20) into v_margen from config_sistema where id = true;
  v_margen := coalesce(v_margen, 20);

  v_dist := fn_distancia_m(p_lat, p_lng, v_p.latitud, v_p.longitud);
  if v_dist is not null then v_dentro := v_dist <= (v_p.radio_m + v_margen); else v_dentro := null; end if;
  v_evento := v_p.tipo_punto;

  -- sesión abierta del guardia en el sitio del punto (si existe)
  if p_personal is not null then
    select id into v_ses from sesiones_rondin
      where personal_id = p_personal and sitio_id = v_p.sitio_id
        and estado = 'en_progreso' and estatus = 'activo' limit 1;
  end if;

  insert into rondines (punto_id, personal_id, turno_id, latitud, longitud, novedad,
                        distancia_m, dentro_geocerca, tipo_evento, metodo, sesion_id)
    values (v_p.id, p_personal, p_turno, p_lat, p_lng, nullif(trim(coalesce(p_novedad,'')), ''),
            v_dist, v_dentro, v_evento, coalesce(nullif(p_metodo,''), 'qr'), v_ses)
    returning id into v_id;

  -- actualiza avance de la sesión; si completó los obligatorios, la cierra
  if v_ses is not null then
    v_vis := fn_rondin_visitados(v_ses);
    select checkpoints_esperados into v_esp from sesiones_rondin where id = v_ses;
    update sesiones_rondin set checkpoints_visitados = v_vis, actualizado_en = now() where id = v_ses;
    if v_esp > 0 and v_vis >= v_esp then
      perform fn_rondin_cerrar_sesion(v_ses, 'checkpoints');
    end if;
  end if;

  return jsonb_build_object(
    'id', v_id, 'punto', v_p.nombre, 'evento', v_evento,
    'distancia_m', round(v_dist::numeric, 1), 'dentro', v_dentro,
    'radio_m', v_p.radio_m, 'margen_m', v_margen,
    'sesion_id', v_ses
  );
end;
$$;

-- 8) Barrido de sesiones vencidas (presencia sin checks) ---------------------
-- Cancela sesiones abiertas sin ningún check más viejas que el umbral del sitio.
-- Pensado para un cron (pg_cron) o llamarse al cargar la supervisión.
create or replace function rpc_rondin_barrer_vencidas()
returns integer language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  with vencidas as (
    update sesiones_rondin s set
        estado = 'cancelado', finalizada_en = now(), metodo_fin = 'vencida', actualizado_en = now()
      from sitios si
     where s.sitio_id = si.id and s.estado = 'en_progreso' and s.estatus = 'activo'
       and s.checkpoints_visitados = 0
       and s.iniciada_en < now() - make_interval(mins => coalesce(si.rondin_auto_cancel_min, 10))
     returning s.id
  ) select count(*) into v_n from vencidas;
  return v_n;
end; $$;
grant execute on function rpc_rondin_barrer_vencidas() to authenticated;

-- 9) rpc_cancelar_registro (recreado): + sesiones_rondin ---------------------
create or replace function rpc_cancelar_registro(p_tabla text, p_id uuid, p_motivo text)
returns void as $$
begin
  if p_tabla not in ('personas','vehiculos','ubicaciones','vinculos','casos','personal',
                     'ordenes','evidencias','asuntos_internos','llamadas_cad','despachos',
                     'barandilla','equipo','incidentes','presuntos','kardex',
                     'patrullas','armamento','comunicacion','bodycams','otros',
                     'rol_servicio','rol_servicio_asignaciones','abordamientos','accidentes',
                     'tareas','tarea_asignaciones','transmisiones','caso_relaciones',
                     'guardia_capacitacion','clientes','sitios','turnos',
                     'puntos_control','rondines','camaras','accesos','credenciales',
                     'citas','transportistas','zonas','zona_permisos','sla_metas',
                     'directorio_autoridades',
                     -- Seguridad Logística:
                     'transporte_activos','unidades_carga','cargas','movimientos','sellos','inspecciones',
                     'liberaciones_seguridad',
                     -- Alertas:
                     'alertas_generales',
                     -- Rondines (trazabilidad):
                     'sesiones_rondin') then
    raise exception 'Tabla no reconocida: %', p_tabla;
  end if;
  if p_tabla = 'asuntos_internos'
     and coalesce(fn_rol_actual(), '') not in ('asuntos_internos','administrador') then
    raise exception 'No autorizado para cancelar registros de asuntos internos.';
  end if;
  execute format(
    'update %I set estatus = ''cancelado'', cancelado_en = now(), motivo_cancelacion = $1, actualizado_en = now() where id = $2',
    p_tabla
  ) using p_motivo, p_id;
end;
$$ language plpgsql security definer;
