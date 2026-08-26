-- =====================================================================
-- 0063_control_accesos.sql · Módulo de Control de Accesos — Fase 1 (personas)
--
-- Registra, autoriza, valida y audita el ingreso/salida de PERSONAS por las
-- casetas de un sitio. Reutiliza registro maestro (personas), sitios/puntos de
-- control (la caseta es un punto tipo 'caseta'), guardias, geocerca, chat,
-- evidencias e incidencias. Vehículos/citas/LPR/zonas quedan para fases 2-3.
--
-- Convenciones SGS: WORM (baja = cancelación), folios, bitácora, RLS, dos ejes
-- de estatus, catálogos administrables (cat_opciones).
-- =====================================================================

-- 1) Catálogos administrables (idempotente por PK categoria+valor) ------------
insert into cat_opciones (categoria, valor, orden) values
  ('tipo_persona_acceso','Visitante',1),
  ('tipo_persona_acceso','Proveedor',2),
  ('tipo_persona_acceso','Contratista',3),
  ('tipo_persona_acceso','Transportista',4),
  ('tipo_persona_acceso','Empleado',5),
  ('tipo_persona_acceso','Mantenimiento',6),
  ('tipo_persona_acceso','Otro',7),
  ('motivo_acceso','Visita',1),
  ('motivo_acceso','Entrega',2),
  ('motivo_acceso','Recolección',3),
  ('motivo_acceso','Mantenimiento',4),
  ('motivo_acceso','Auditoría',5),
  ('motivo_acceso','Entrevista',6),
  ('motivo_acceso','Otro',7),
  ('tipo_credencial','QR',1),
  ('tipo_credencial','NFC',2),
  ('tipo_credencial','Código temporal',3)
on conflict (categoria, valor) do nothing;

-- 2) La caseta es un punto de control tipo 'caseta' --------------------------
alter table puntos_control drop constraint if exists chk_tipo_punto;
alter table puntos_control add constraint chk_tipo_punto
  check (tipo_punto in ('control','entrada','salida','caseta'));

-- 3) Credenciales (QR / NFC / código temporal) -------------------------------
create table if not exists credenciales (
  id                  uuid primary key default gen_random_uuid(),
  folio               text,
  persona_id          uuid references personas(id),
  tipo                text not null default 'temporal' check (tipo in ('qr','nfc','temporal')),
  codigo              text not null,                 -- lo que se escanea/teclea en la caseta
  descripcion         text,
  vigencia_inicio     timestamptz,
  vigencia_fin        timestamptz,
  datos_adicionales   jsonb default '{}'::jsonb,
  estatus             text not null default 'activo' check (estatus in ('activo','cancelado')),
  cancelado_en        timestamptz,
  motivo_cancelacion  text,
  creado_en           timestamptz not null default now(),
  actualizado_en      timestamptz not null default now()
);
comment on table credenciales is 'Credenciales de acceso (QR/NFC/código temporal) ligadas a una persona; se validan en la caseta.';
create index if not exists idx_credenciales_persona on credenciales(persona_id);
create unique index if not exists idx_credenciales_codigo on credenciales(codigo) where estatus = 'activo';

-- 4) Accesos (ledger de entradas/salidas) ------------------------------------
create table if not exists accesos (
  id                  uuid primary key default gen_random_uuid(),
  folio               text,
  tipo                text not null check (tipo in ('entrada','salida')),
  -- Persona: del registro maestro, o nombre suelto para una visita rápida.
  persona_id          uuid references personas(id),
  visitante_nombre    text,
  tipo_persona        text,                          -- catálogo tipo_persona_acceso
  -- Dónde y quién registró.
  sitio_id            uuid references sitios(id),
  punto_id            uuid references puntos_control(id),   -- caseta
  personal_id         uuid references personal(id),         -- guardia que registró
  credencial_id       uuid references credenciales(id),
  motivo              text,                          -- catálogo motivo_acceso
  -- Resultado y autorización (excepción vía chat, decisión auditada aquí).
  resultado           text not null default 'autorizado' check (resultado in ('autorizado','rechazado','pendiente')),
  autorizado_por      uuid references usuarios_perfil(id),
  autorizacion_motivo text,
  autorizacion_en     timestamptz,
  chat_canal_id       uuid references chat_canales(id),      -- canal de la solicitud de autorización
  incidente_id        uuid references llamadas_cad(id),      -- si generó incidencia
  latitud             double precision,
  longitud            double precision,
  fotografias         text[] default '{}',
  datos_adicionales   jsonb default '{}'::jsonb,
  estatus             text not null default 'activo' check (estatus in ('activo','cancelado')),
  cancelado_en        timestamptz,
  motivo_cancelacion  text,
  fecha_evento        timestamptz not null default now(),
  creado_en           timestamptz not null default now(),
  actualizado_en      timestamptz not null default now()
);
comment on table accesos is 'Ledger WORM de entradas/salidas de personas por caseta; reusa personas, sitios, guardias, credenciales, chat, incidencias y evidencias.';
create index if not exists idx_accesos_sitio  on accesos(sitio_id);
create index if not exists idx_accesos_persona on accesos(persona_id);
create index if not exists idx_accesos_fecha  on accesos(fecha_evento);
create index if not exists idx_accesos_result on accesos(resultado);

-- 5) Foliadores (AC / CR), WORM y bitácora -----------------------------------
insert into foliadores (modulo, nombre, iniciales) values
  ('accesos','Accesos','AC'), ('credenciales','Credenciales','CR')
  on conflict (modulo) do nothing;

do $$
declare t text;
begin
  foreach t in array array['accesos','credenciales'] loop
    execute format('drop trigger if exists trg_folio_%1$s on %1$s;', t);
    execute format('create trigger trg_folio_%1$s before insert on %1$s for each row execute function fn_asignar_folio();', t);
    execute format('drop trigger if exists trg_no_delete_%1$s on %1$s;', t);
    execute format('create trigger trg_no_delete_%1$s before delete on %1$s for each row execute function fn_bloquear_delete();', t);
    execute format('revoke delete on %I from authenticated, anon;', t);
    execute format('drop trigger if exists trg_auditoria_%1$s on %1$s;', t);
    execute format('create trigger trg_auditoria_%1$s after insert or update on %1$s for each row execute function fn_bitacora_generica();', t);
  end loop;
end $$;

-- 6) RLS: ver e insertar cualquier autenticado (el guardia opera la caseta) ---
alter table accesos     enable row level security;
alter table credenciales enable row level security;

drop policy if exists sel_accesos on accesos;
create policy sel_accesos on accesos for select to authenticated using (true);
drop policy if exists ins_accesos on accesos;
create policy ins_accesos on accesos for insert to authenticated with check (true);
drop policy if exists upd_accesos on accesos;
create policy upd_accesos on accesos for update to authenticated using (true) with check (true);

drop policy if exists sel_credenciales on credenciales;
create policy sel_credenciales on credenciales for select to authenticated using (true);
drop policy if exists ins_credenciales on credenciales;
create policy ins_credenciales on credenciales for insert to authenticated with check (true);
drop policy if exists upd_credenciales on credenciales;
create policy upd_credenciales on credenciales for update to authenticated using (true) with check (true);

-- 7) Personas actualmente dentro (entrada sin salida posterior) ---------------
create or replace view v_personas_dentro
with (security_invoker = on) as
  select e.*
    from accesos e
   where e.tipo = 'entrada' and e.estatus = 'activo' and e.resultado = 'autorizado'
     and not exists (
       select 1 from accesos s
        where s.tipo = 'salida' and s.estatus = 'activo'
          and s.persona_id is not distinct from e.persona_id
          and coalesce(s.visitante_nombre,'') = coalesce(e.visitante_nombre,'')
          and s.sitio_id is not distinct from e.sitio_id
          and s.fecha_evento > e.fecha_evento
     );
comment on view v_personas_dentro is 'Accesos de entrada sin una salida posterior: quién está dentro ahora.';

-- 8) Realtime (dashboard/monitoreo de accesos en vivo) -----------------------
do $$ begin alter publication supabase_realtime add table accesos; exception when duplicate_object then null; end $$;

-- 9) rpc_cancelar_registro += accesos, credenciales --------------------------
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
                     'puntos_control','rondines','camaras','accesos','credenciales') then
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
