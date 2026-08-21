-- =====================================================================
-- 0053_rondines.sql · SGS — Rondines (guard tour)
--
-- puntos_control: puntos físicos de un sitio (con un `codigo` = contenido del QR
--   o id del tag NFC) que el guardia debe visitar en su recorrido.
-- rondines: cada PASO/lectura de un guardia por un punto (fecha/hora, GPS, novedad,
--   foto). Lo alimenta el móvil al escanear; el central lo supervisa en la web.
-- =====================================================================

-- 1) Puntos de control -------------------------------------------------
create table if not exists puntos_control (
  id                  uuid primary key default gen_random_uuid(),
  folio               text,
  sitio_id            uuid not null references sitios(id),
  nombre              text not null,
  codigo              text not null,           -- contenido del QR / id del tag NFC
  orden               int,
  latitud             double precision,
  longitud            double precision,
  descripcion         text,
  datos_adicionales   jsonb default '{}'::jsonb,
  estatus             text not null default 'activo' check (estatus in ('activo','cancelado')),
  cancelado_en        timestamptz,
  motivo_cancelacion  text,
  creado_en           timestamptz not null default now(),
  actualizado_en      timestamptz not null default now()
);
create index if not exists idx_puntos_sitio on puntos_control(sitio_id);
-- Un código activo identifica UN punto (el guardia escanea el código y se resuelve el punto).
create unique index if not exists idx_puntos_codigo on puntos_control(codigo) where estatus = 'activo';

-- 2) Rondines (lecturas de paso) --------------------------------------
create table if not exists rondines (
  id                  uuid primary key default gen_random_uuid(),
  punto_id            uuid not null references puntos_control(id),
  personal_id         uuid references personal(id),      -- guardia
  turno_id            uuid references turnos(id),         -- turno en que ocurrió (opcional)
  fecha_hora          timestamptz not null default now(),
  latitud             double precision,
  longitud            double precision,
  novedad             text,                               -- "sin novedad" o el hallazgo
  foto                text,                               -- ruta de evidencia (opcional)
  datos_adicionales   jsonb default '{}'::jsonb,
  estatus             text not null default 'activo' check (estatus in ('activo','cancelado')),
  cancelado_en        timestamptz,
  motivo_cancelacion  text,
  creado_en           timestamptz not null default now(),
  actualizado_en      timestamptz not null default now()
);
create index if not exists idx_rondines_punto_fecha on rondines(punto_id, fecha_hora);
create index if not exists idx_rondines_guardia_fecha on rondines(personal_id, fecha_hora);

comment on table rondines is 'Cada paso de un guardia por un punto de control (guard tour).';

-- 3) Transversal (WORM + bitácora + folio en puntos + RLS) ------------
-- puntos_control: con foliador (PC).
insert into foliadores (modulo, nombre, iniciales) values ('puntos_control','Puntos de control','PC') on conflict (modulo) do nothing;
drop trigger if exists trg_folio_puntos_control on puntos_control;
create trigger trg_folio_puntos_control before insert on puntos_control for each row execute function fn_asignar_folio();

do $$
declare t text;
begin
  foreach t in array array['puntos_control','rondines'] loop
    execute format('alter table %I enable row level security;', t);
    execute format('drop policy if exists sel_%1$s on %1$s;', t);
    execute format($p$create policy sel_%1$s on %1$s for select to authenticated using (estatus = 'activo' or fn_rol_actual() in ('supervisor','investigador','administrador'));$p$, t);
    execute format('drop policy if exists ins_%1$s on %1$s;', t);
    execute format('create policy ins_%1$s on %1$s for insert to authenticated with check (true);', t);
    execute format('drop policy if exists upd_%1$s on %1$s;', t);
    execute format('create policy upd_%1$s on %1$s for update to authenticated using (true) with check (true);', t);

    execute format('drop trigger if exists trg_no_delete_%1$s on %1$s;', t);
    execute format('create trigger trg_no_delete_%1$s before delete on %1$s for each row execute function fn_bloquear_delete();', t);
    execute format('revoke delete on %I from authenticated, anon;', t);

    execute format('drop trigger if exists trg_auditoria_%1$s on %1$s;', t);
    execute format('create trigger trg_auditoria_%1$s after insert or update on %1$s for each row execute function fn_bitacora_generica();', t);
  end loop;
end $$;

-- 4) RPC para registrar un paso por CÓDIGO (lo usará el móvil al escanear) ----
--    Resuelve el punto por su código y registra el rondín del guardia dado.
create or replace function rpc_rondin_marcar(
  p_codigo   text,
  p_personal uuid default null,
  p_turno    uuid default null,
  p_lat      double precision default null,
  p_lng      double precision default null,
  p_novedad  text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_punto uuid;
  v_id    uuid;
begin
  select id into v_punto from puntos_control where codigo = p_codigo and estatus = 'activo' limit 1;
  if v_punto is null then
    raise exception 'Código de punto de control no reconocido: %', p_codigo;
  end if;
  insert into rondines (punto_id, personal_id, turno_id, latitud, longitud, novedad)
    values (v_punto, p_personal, p_turno, p_lat, p_lng, nullif(trim(coalesce(p_novedad,'')), ''))
    returning id into v_id;
  return v_id;
end;
$$;

-- 5) Ampliar rpc_cancelar_registro ------------------------------------
create or replace function rpc_cancelar_registro(
  p_tabla   text,
  p_id      uuid,
  p_motivo  text
) returns void as $$
begin
  if p_tabla not in ('personas','vehiculos','ubicaciones','vinculos','casos','personal',
                     'ordenes','evidencias','asuntos_internos','llamadas_cad','despachos',
                     'barandilla','equipo','incidentes','presuntos','kardex',
                     'patrullas','armamento','comunicacion','bodycams','otros',
                     'rol_servicio','rol_servicio_asignaciones','abordamientos','accidentes',
                     'tareas','tarea_asignaciones','transmisiones','caso_relaciones',
                     'guardia_capacitacion','clientes','sitios','turnos',
                     'puntos_control','rondines') then
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
