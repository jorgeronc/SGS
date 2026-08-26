-- =====================================================================
-- 0064_control_accesos_vehiculos.sql · Control de Accesos — Fase 2 (vehículos + citas)
--
-- Añade la logística de CEDIS: transportistas, CITAS (con máquina de estados) y
-- accesos de VEHÍCULOS (placa capturada manual + foto, ligados a su cita y
-- andén). Reutiliza el registro maestro de vehículos, personas (operador), el
-- ledger `accesos` (Fase 1) y el chat para autorizaciones de excepción.
-- LPR/ANPR queda para más adelante (captura manual por ahora).
-- =====================================================================

-- 1) Catálogo de operación CEDIS --------------------------------------------
insert into cat_opciones (categoria, valor, orden) values
  ('tipo_operacion_cedis','Carga',1),
  ('tipo_operacion_cedis','Descarga',2),
  ('tipo_operacion_cedis','Entrega',3),
  ('tipo_operacion_cedis','Recolección',4),
  ('tipo_operacion_cedis','Cross-dock',5),
  ('tipo_operacion_cedis','Otro',6)
on conflict (categoria, valor) do nothing;

-- 2) Transportistas (empresas de transporte) --------------------------------
create table if not exists transportistas (
  id                  uuid primary key default gen_random_uuid(),
  folio               text,
  razon_social        text not null,
  rfc                 text,
  contacto_nombre     text,
  contacto_tel        text,
  datos_adicionales   jsonb default '{}'::jsonb,
  estatus             text not null default 'activo' check (estatus in ('activo','cancelado')),
  cancelado_en        timestamptz,
  motivo_cancelacion  text,
  creado_en           timestamptz not null default now(),
  actualizado_en      timestamptz not null default now()
);
comment on table transportistas is 'Empresas de transporte que operan citas y accesos de vehículos en el CEDIS.';
create index if not exists idx_transportistas_rs on transportistas(razon_social);

-- 3) Citas (agenda logística con máquina de estados) ------------------------
create table if not exists citas (
  id                  uuid primary key default gen_random_uuid(),
  folio               text,
  sitio_id            uuid references sitios(id),
  transportista_id    uuid references transportistas(id),
  operador_persona_id uuid references personas(id),
  operador_nombre     text,                      -- si no está en registro maestro
  vehiculo_id         uuid references vehiculos(id),
  placa               text,
  remolque_placa      text,
  tipo_operacion      text,                      -- catálogo tipo_operacion_cedis
  origen              text,
  destino             text,
  referencia          text,                      -- OC / embarque / pedido
  anden               text,
  programada_en       timestamptz,
  -- Estado operativo (dominio) separado del estatus (WORM).
  estado              text not null default 'programada'
                        check (estado in ('programada','en_camino','llego','en_caseta',
                                          'autorizada','en_anden','carga_descarga','finalizada','salida','cancelada')),
  datos_adicionales   jsonb default '{}'::jsonb,
  estatus             text not null default 'activo' check (estatus in ('activo','cancelado')),
  cancelado_en        timestamptz,
  motivo_cancelacion  text,
  creado_en           timestamptz not null default now(),
  actualizado_en      timestamptz not null default now()
);
comment on table citas is 'Citas de CEDIS: transportista/operador/vehículo/operación/andén con máquina de estados programada→salida.';
create index if not exists idx_citas_sitio on citas(sitio_id);
create index if not exists idx_citas_estado on citas(estado);
create index if not exists idx_citas_fecha on citas(programada_en);

-- 4) Accesos: campos de vehículo (extiende el ledger de Fase 1) --------------
alter table accesos add column if not exists vehiculo_id    uuid references vehiculos(id);
alter table accesos add column if not exists placa          text;
alter table accesos add column if not exists cita_id        uuid references citas(id);
alter table accesos add column if not exists anden          text;
alter table accesos add column if not exists remolque_placa text;
create index if not exists idx_accesos_cita on accesos(cita_id);

-- 5) Foliadores (CI citas, TR transportistas), WORM y bitácora --------------
insert into foliadores (modulo, nombre, iniciales) values
  ('citas','Citas','CI'), ('transportistas','Transportistas','TR')
  on conflict (modulo) do nothing;

do $$
declare t text;
begin
  foreach t in array array['citas','transportistas'] loop
    execute format('drop trigger if exists trg_folio_%1$s on %1$s;', t);
    execute format('create trigger trg_folio_%1$s before insert on %1$s for each row execute function fn_asignar_folio();', t);
    execute format('drop trigger if exists trg_no_delete_%1$s on %1$s;', t);
    execute format('create trigger trg_no_delete_%1$s before delete on %1$s for each row execute function fn_bloquear_delete();', t);
    execute format('revoke delete on %I from authenticated, anon;', t);
    execute format('drop trigger if exists trg_auditoria_%1$s on %1$s;', t);
    execute format('create trigger trg_auditoria_%1$s after insert or update on %1$s for each row execute function fn_bitacora_generica();', t);
  end loop;
end $$;

-- 6) RLS: ver/insertar/actualizar autenticado -------------------------------
do $$
declare t text;
begin
  foreach t in array array['citas','transportistas'] loop
    execute format('alter table %I enable row level security;', t);
    execute format('drop policy if exists sel_%1$s on %1$s;', t);
    execute format('create policy sel_%1$s on %1$s for select to authenticated using (true);', t);
    execute format('drop policy if exists ins_%1$s on %1$s;', t);
    execute format('create policy ins_%1$s on %1$s for insert to authenticated with check (true);', t);
    execute format('drop policy if exists upd_%1$s on %1$s;', t);
    execute format('create policy upd_%1$s on %1$s for update to authenticated using (true) with check (true);', t);
  end loop;
end $$;

-- 7) Vehículos actualmente dentro (entrada sin salida posterior) -------------
create or replace view v_vehiculos_dentro
with (security_invoker = on) as
  select e.*
    from accesos e
   where e.tipo = 'entrada' and e.estatus = 'activo' and e.resultado = 'autorizado'
     and (e.vehiculo_id is not null or coalesce(e.placa,'') <> '')
     and not exists (
       select 1 from accesos s
        where s.tipo = 'salida' and s.estatus = 'activo'
          and s.sitio_id is not distinct from e.sitio_id
          and (s.vehiculo_id is not distinct from e.vehiculo_id
               or (coalesce(s.placa,'') <> '' and upper(s.placa) = upper(e.placa)))
          and s.fecha_evento > e.fecha_evento
     );
comment on view v_vehiculos_dentro is 'Accesos de entrada de vehículos sin una salida posterior: qué vehículos están dentro ahora.';

-- 8) Avanzar el estado de una cita ------------------------------------------
create or replace function rpc_cita_avanzar(p_cita uuid, p_estado text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_estado not in ('programada','en_camino','llego','en_caseta','autorizada',
                      'en_anden','carga_descarga','finalizada','salida','cancelada') then
    raise exception 'Estado de cita no válido: %', p_estado;
  end if;
  update citas set estado = p_estado, actualizado_en = now() where id = p_cita;
end; $$;

-- 9) Realtime + rpc_cancelar_registro ---------------------------------------
do $$ begin alter publication supabase_realtime add table citas; exception when duplicate_object then null; end $$;

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
                     'citas','transportistas') then
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
