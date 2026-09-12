-- =====================================================================
-- 0107_rondines_programados.sql
-- Rondín PROGRAMADO. Cambia el inicio de la SESIÓN de rondín:
--   * ANTES (0095): la sesión se abría sola al ENTRAR a la geocerca del sitio.
--   * AHORA: el supervisor/central PROGRAMA el rondín (hora); la sesión inicia por
--       (a) el guardia pone su estatus "en rondín", o
--       (b) 15 min después de la hora programada sin iniciarla (barrido/cron).
--     Un programado SOLO define la hora; la sesión funciona igual que 0095
--     (checkpoints por geocerca, cierre por salida/cumplimiento/vencida).
--
-- Reglas de "en rondín":
--   * Siempre abre sesión.
--   * Si hay un programado dentro de ±15 min de su hora y sin ejecutar hoy, esa
--     apertura CUENTA como la programada (se cumple).
--   * Fuera de esa ventana, es una sesión NUEVA (manual).
--
-- Depende de 0095 (sesiones_rondin, fn_sesion_activa_guardia, fn_rondin_cerrar_sesion).
-- =====================================================================

-- 1) Tabla de rondines programados -------------------------------------------
create table if not exists rondines_programados (
  id                 uuid primary key default gen_random_uuid(),
  folio              text,
  sitio_id           uuid references sitios(id),
  personal_id        uuid references personal(id),   -- guardia concreto; null = todos los del sitio
  turno_id           uuid references turnos(id),
  fecha              date not null,                   -- día programado (hora local)
  hora               time not null,                   -- hora local de inicio
  repetir_diario     boolean not null default false,  -- se repite cada día a esa hora desde `fecha`
  motivo             text,                             -- rutina | incidente | texto libre
  incidente_id       uuid,                             -- opcional: si nace de un incidente (llamadas_cad)
  estado             text not null default 'pendiente' check (estado in ('pendiente','iniciada','omitida','cancelada')),
  sesion_id          uuid references sesiones_rondin(id),
  iniciada_en        timestamptz,
  metodo_inicio      text,                             -- estatus | auto
  creado_por         uuid default auth.uid(),
  datos_adicionales  jsonb default '{}'::jsonb,        -- {ultima_ejecucion: 'YYYY-MM-DD'} para repetir_diario
  estatus            text not null default 'activo' check (estatus in ('activo','cancelado')),
  cancelado_en       timestamptz,
  motivo_cancelacion text,
  creado_en          timestamptz not null default now(),
  actualizado_en     timestamptz not null default now()
);
create index if not exists idx_rond_prog_sitio on rondines_programados(sitio_id, fecha);
create index if not exists idx_rond_prog_guardia on rondines_programados(personal_id, fecha);
comment on table rondines_programados is 'Rondines programados (folio RP): definen la HORA a la que debe iniciar una sesión de rondín. La sesión inicia por estatus "en rondín" o por barrido a +15 min (0107).';

-- Folio RP.
insert into foliadores (modulo, nombre, iniciales) values ('rondines_programados','Rondines programados','RP')
  on conflict (modulo) do nothing;
drop trigger if exists trg_folio_rond_prog on rondines_programados;
create trigger trg_folio_rond_prog before insert on rondines_programados
  for each row execute function fn_asignar_folio();

-- WORM + bitácora.
drop trigger if exists trg_no_delete_rond_prog on rondines_programados;
create trigger trg_no_delete_rond_prog before delete on rondines_programados
  for each row execute function fn_bloquear_delete();
revoke delete on rondines_programados from authenticated, anon;
drop trigger if exists trg_bitacora_rond_prog on rondines_programados;
create trigger trg_bitacora_rond_prog after insert or update on rondines_programados
  for each row execute function fn_bitacora_generica();

-- RLS: el guardia ve los suyos (o los de su sitio); mandos ven todo. Escritura por RPC/mando.
alter table rondines_programados enable row level security;
drop policy if exists sel_rond_prog on rondines_programados;
create policy sel_rond_prog on rondines_programados for select to authenticated
  using (true);
drop policy if exists ins_rond_prog on rondines_programados;
create policy ins_rond_prog on rondines_programados for insert to authenticated with check (true);
drop policy if exists upd_rond_prog on rondines_programados;
create policy upd_rond_prog on rondines_programados for update to authenticated using (true) with check (true);

-- 2) La geocerca YA NO abre sesión (solo cierra al salir) --------------------
create or replace function fn_geocerca_sesion()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_ses uuid;
begin
  -- La ENTRADA ya no abre sesión (ahora el rondín es programado; se inicia por
  -- estatus "en rondín" o por barrido a +15 min). La SALIDA sí cierra la sesión
  -- abierta del guardia en ese sitio (el rondín termina al dejar el perímetro).
  if NEW.tipo = 'salida' then
    select id into v_ses from sesiones_rondin
      where personal_id = NEW.personal_id and sitio_id = NEW.sitio_id
        and estado = 'en_progreso' and estatus = 'activo' limit 1;
    if v_ses is not null then perform fn_rondin_cerrar_sesion(v_ses, 'geocerca'); end if;
  end if;
  return NEW;
end $$;

-- 3) Helper: abrir una sesión de rondín (reusa la lógica de 0095) ------------
create or replace function fn_rondin_abrir(p_personal uuid, p_user uuid, p_sitio uuid, p_metodo text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_esp int; v_id uuid;
begin
  if p_sitio is null or p_personal is null then return null; end if;
  -- higiene: cerrar cualquier sesión abierta del guardia
  update sesiones_rondin set
      finalizada_en = now(),
      estado = case when checkpoints_visitados = 0 then 'cancelado'
                    when checkpoints_esperados > 0 and checkpoints_visitados >= checkpoints_esperados then 'completado'
                    else 'incompleto' end,
      metodo_fin = 'auto', actualizado_en = now()
    where personal_id = p_personal and estado = 'en_progreso' and estatus = 'activo';
  select count(*) into v_esp from puntos_control
    where sitio_id = p_sitio and estatus = 'activo' and coalesce(obligatorio, true);
  insert into sesiones_rondin (personal_id, user_id, sitio_id, iniciada_en, estado, metodo_inicio, checkpoints_esperados)
    values (p_personal, p_user, p_sitio, now(), 'en_progreso', p_metodo, coalesce(v_esp, 0))
    returning id into v_id;
  return v_id;
end $$;

-- Sitio del guardia hoy (según su turno vigente).
create or replace function fn_sitio_guardia_hoy(p_personal uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select tg.sitio_id
    from turno_guardias tg join turnos t on t.id = tg.turno_id
   where tg.personal_id = p_personal and tg.estatus = 'activo'
     and t.estado = 'activo' and t.fecha = (now() at time zone 'America/Monterrey')::date
   order by t.creado_en desc nulls last limit 1;
$$;

-- 4) "En rondín": abre la sesión (programada si aplica; si no, nueva) ---------
create or replace function rpc_rondin_por_estatus(p_personal uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_hoy   date := (now() at time zone 'America/Monterrey')::date;
  v_sitio uuid;
  v_prog  record;
  v_due   timestamptz;
  v_ses   uuid;
begin
  if p_personal is null then return jsonb_build_object('ok', false, 'msg', 'sin guardia'); end if;
  -- si ya hay sesión abierta, no abrir otra
  v_ses := fn_sesion_activa_guardia(p_personal);
  if v_ses is not null then return jsonb_build_object('ok', true, 'sesion_id', v_ses, 'nota', 'ya habia sesion'); end if;

  v_sitio := fn_sitio_guardia_hoy(p_personal);

  -- ¿hay un programado (del guardia o de su sitio) dentro de ±15 min y sin ejecutar hoy?
  for v_prog in
    select * from rondines_programados rp
     where rp.estatus = 'activo'
       and (rp.personal_id = p_personal or (rp.personal_id is null and rp.sitio_id = v_sitio))
       and ((not rp.repetir_diario and rp.fecha = v_hoy and rp.estado = 'pendiente')
         or (rp.repetir_diario and rp.fecha <= v_hoy and coalesce(rp.datos_adicionales->>'ultima_ejecucion','') <> v_hoy::text))
     order by rp.hora
  loop
    v_due := ((v_hoy::text || ' ' || v_prog.hora::text)::timestamp) at time zone 'America/Monterrey';
    if now() between v_due - interval '15 min' and v_due + interval '15 min' then
      v_ses := fn_rondin_abrir(p_personal, v_uid, coalesce(v_prog.sitio_id, v_sitio), 'programado');
      update rondines_programados set
          estado = case when repetir_diario then estado else 'iniciada' end,
          sesion_id = coalesce(sesion_id, v_ses), iniciada_en = coalesce(iniciada_en, now()), metodo_inicio = 'estatus',
          datos_adicionales = case when repetir_diario
            then jsonb_set(coalesce(datos_adicionales, '{}'::jsonb), '{ultima_ejecucion}', to_jsonb(v_hoy::text))
            else datos_adicionales end,
          actualizado_en = now()
        where id = v_prog.id;
      return jsonb_build_object('ok', true, 'sesion_id', v_ses, 'programada', true, 'folio', v_prog.folio);
    end if;
  end loop;

  -- sin programado en ventana: sesión NUEVA (manual)
  if v_sitio is null then return jsonb_build_object('ok', false, 'msg', 'Sin sitio asignado hoy; no se abrió sesión.'); end if;
  v_ses := fn_rondin_abrir(p_personal, v_uid, v_sitio, 'manual');
  return jsonb_build_object('ok', true, 'sesion_id', v_ses, 'programada', false);
end $$;
grant execute on function rpc_rondin_por_estatus(uuid) to authenticated;

-- 5) Barrido: auto-inicia los programados con +15 min de atraso --------------
-- Llamar por pg_cron (cada minuto/5) o al cargar Supervisión / la agenda.
create or replace function rpc_rondin_barrer_programados()
returns int language plpgsql security definer set search_path = public as $$
declare
  v_hoy date := (now() at time zone 'America/Monterrey')::date;
  v_n   int := 0;
  v_prog record; v_due timestamptz; v_ses uuid; v_uid uuid; v_g record;
begin
  for v_prog in
    select * from rondines_programados rp
     where rp.estatus = 'activo'
       and ((not rp.repetir_diario and rp.fecha = v_hoy and rp.estado = 'pendiente')
         or (rp.repetir_diario and rp.fecha <= v_hoy and coalesce(rp.datos_adicionales->>'ultima_ejecucion','') <> v_hoy::text))
  loop
    v_due := ((v_hoy::text || ' ' || v_prog.hora::text)::timestamp) at time zone 'America/Monterrey';
    if now() < v_due + interval '15 min' then continue; end if;

    if v_prog.personal_id is not null then
      -- programado por guardia
      if fn_sesion_activa_guardia(v_prog.personal_id) is not null then
        -- ya tiene sesión (la inició él): marca cumplido y sigue
      else
        select user_id into v_uid from ubicaciones_guardias where personal_id = v_prog.personal_id;
        v_ses := fn_rondin_abrir(v_prog.personal_id, v_uid, coalesce(v_prog.sitio_id, fn_sitio_guardia_hoy(v_prog.personal_id)), 'auto');
      end if;
      update rondines_programados set
          estado = case when repetir_diario then estado else 'iniciada' end,
          sesion_id = coalesce(sesion_id, v_ses), iniciada_en = coalesce(iniciada_en, now()), metodo_inicio = coalesce(metodo_inicio, 'auto'),
          datos_adicionales = case when repetir_diario
            then jsonb_set(coalesce(datos_adicionales, '{}'::jsonb), '{ultima_ejecucion}', to_jsonb(v_hoy::text)) else datos_adicionales end,
          actualizado_en = now()
        where id = v_prog.id;
      v_n := v_n + 1;
    else
      -- programado por SITIO: abre para cada guardia con turno hoy en el sitio, sin sesión
      for v_g in
        select tg.personal_id, ug.user_id
          from turno_guardias tg join turnos t on t.id = tg.turno_id
          left join ubicaciones_guardias ug on ug.personal_id = tg.personal_id
         where tg.sitio_id = v_prog.sitio_id and tg.estatus = 'activo'
           and t.estado = 'activo' and t.fecha = v_hoy
      loop
        if fn_sesion_activa_guardia(v_g.personal_id) is null then
          perform fn_rondin_abrir(v_g.personal_id, v_g.user_id, v_prog.sitio_id, 'auto');
        end if;
      end loop;
      update rondines_programados set
          estado = case when repetir_diario then estado else 'iniciada' end,
          iniciada_en = coalesce(iniciada_en, now()), metodo_inicio = coalesce(metodo_inicio, 'auto'),
          datos_adicionales = case when repetir_diario
            then jsonb_set(coalesce(datos_adicionales, '{}'::jsonb), '{ultima_ejecucion}', to_jsonb(v_hoy::text)) else datos_adicionales end,
          actualizado_en = now()
        where id = v_prog.id;
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end $$;
grant execute on function rpc_rondin_barrer_programados() to authenticated;

-- 6) Programados vigentes de HOY para un guardia (recordatorio del móvil) ------
create or replace function rpc_rondin_programados_hoy(p_personal uuid)
returns setof rondines_programados language sql stable security definer set search_path = public as $$
  select rp.* from rondines_programados rp
   where rp.estatus = 'activo'
     and (rp.personal_id = p_personal or (rp.personal_id is null and rp.sitio_id = fn_sitio_guardia_hoy(p_personal)))
     and ((not rp.repetir_diario and rp.fecha = (now() at time zone 'America/Monterrey')::date)
       or (rp.repetir_diario and rp.fecha <= (now() at time zone 'America/Monterrey')::date))
   order by rp.hora;
$$;
grant execute on function rpc_rondin_programados_hoy(uuid) to authenticated;

-- 7) rpc_cancelar_registro: + rondines_programados ---------------------------
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
                     'transporte_activos','unidades_carga','cargas','movimientos','sellos','inspecciones',
                     'liberaciones_seguridad','alertas_generales',
                     'sesiones_rondin','rondines_programados') then
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
