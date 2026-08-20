-- ==========================================================================
-- SGS · Sistema de Gestión de Seguridad
-- MIGRACIÓN COMPLETA (0001 → 0049) en un solo script.
--
-- Generado concatenando supabase/migrations/*.sql en ORDEN NUMÉRICO
-- (= orden de dependencias). Correr UNA sola vez, en el SQL Editor de un
-- proyecto Supabase NUEVO / VACÍO (el de SGS: rdyjjfbehjfggpldmmur).
--
-- Notas:
--  * El SQL Editor de Supabase corre el script en una transacción: si algo
--    falla, hace ROLLBACK y NO deja nada a medias (arreglas y vuelves a correr).
--  * Requiere el proyecto Supabase estándar (esquemas auth/storage y la
--    publicación supabase_realtime ya existen por defecto).
--  * Después de esto: desplegar Edge Functions, fijar app_secretos/PUSH_SECRET
--    y crear el primer usuario administrador (ver instrucciones aparte).
-- ==========================================================================


-- ########################################################################
-- ###  0001_core_schema.sql
-- ########################################################################

-- =====================================================================
-- 0001_core_schema.sql
-- Entidades núcleo: Personas, Vehículos, Ubicaciones/Domicilios y Vínculos
-- =====================================================================
-- Requiere la extensión pgcrypto (para gen_random_uuid) y, si se usa
-- georreferencia real, postgis. Ambas están disponibles en Supabase;
-- postgis se puede activar desde el dashboard (Database > Extensions)
-- o descomentando la línea de abajo si el proyecto ya la tiene disponible.

create extension if not exists pgcrypto;
-- create extension if not exists postgis;

-- ---------------------------------------------------------------------
-- Campos estándar que llevará TODA tabla núcleo del sistema:
--   id                 identificador único
--   estatus            'activo' | 'cancelado'  (nunca se borra, solo se cancela)
--   cancelado_en       cuándo se canceló
--   motivo_cancelacion por qué se canceló
--   creado_en / actualizado_en
-- (quién creó/canceló cada registro vive en la bitácora, no duplicado aquí)
-- ---------------------------------------------------------------------

-- =========================
-- PERSONAS
-- =========================
create table if not exists personas (
  id                  uuid primary key default gen_random_uuid(),
  nombre              text not null,
  apellido_paterno    text,
  apellido_materno    text,
  fecha_nacimiento    date,
  sexo                text,
  curp                text,
  rfc                 text,
  media_filiacion     jsonb default '{}'::jsonb,   -- estatura, señas particulares, etc.
  fotografias         jsonb default '[]'::jsonb,   -- referencias a Storage
  datos_adicionales   jsonb default '{}'::jsonb,   -- campos configurables por agencia

  estatus             text not null default 'activo' check (estatus in ('activo','cancelado')),
  cancelado_en        timestamptz,
  motivo_cancelacion  text,

  creado_en           timestamptz not null default now(),
  actualizado_en      timestamptz not null default now()
);

comment on table personas is 'Índice maestro único de personas: sospechosos, víctimas, testigos, oficiales, personas en custodia, etc.';

-- =========================
-- VEHÍCULOS
-- =========================
create table if not exists vehiculos (
  id                  uuid primary key default gen_random_uuid(),
  placas              text,
  vin                 text,
  marca               text,
  modelo              text,
  anio                int,
  color               text,
  tipo                text,               -- patrulla, motocicleta, particular, etc.
  es_flota_agencia    boolean not null default false,
  datos_adicionales   jsonb default '{}'::jsonb,

  estatus             text not null default 'activo' check (estatus in ('activo','cancelado')),
  cancelado_en        timestamptz,
  motivo_cancelacion  text,

  creado_en           timestamptz not null default now(),
  actualizado_en      timestamptz not null default now()
);

comment on table vehiculos is 'Vehículos de flota propia y de terceros involucrados en incidentes, citatorios u órdenes.';

-- =========================
-- UBICACIONES / DOMICILIOS
-- =========================
create table if not exists ubicaciones (
  id                  uuid primary key default gen_random_uuid(),
  calle               text,
  numero_exterior     text,
  numero_interior     text,
  colonia             text,
  municipio           text,
  estado              text,
  codigo_postal       text,
  referencias         text,
  latitud             double precision,
  longitud            double precision,
  -- si postgis está activo, se puede agregar además:
  -- geom             geometry(Point, 4326),
  datos_adicionales   jsonb default '{}'::jsonb,

  estatus             text not null default 'activo' check (estatus in ('activo','cancelado')),
  cancelado_en        timestamptz,
  motivo_cancelacion  text,

  creado_en           timestamptz not null default now(),
  actualizado_en      timestamptz not null default now()
);

comment on table ubicaciones is 'Direcciones/domicilios normalizados, reutilizables entre personas, vehículos, incidentes y despacho (CAD).';

-- =========================
-- VÍNCULOS (motor de relaciones genérico)
-- =========================
create table if not exists vinculos (
  id                    uuid primary key default gen_random_uuid(),
  entidad_origen_tipo   text not null,   -- 'persona' | 'vehiculo' | 'ubicacion' | 'caso' | ... (extensible)
  entidad_origen_id     uuid not null,
  entidad_destino_tipo  text not null,
  entidad_destino_id    uuid not null,
  tipo_relacion         text not null,   -- 'domicilio_actual', 'propietario', 'conductor_habitual', etc.
  fecha_inicio          date,
  fecha_fin             date,
  notas                 text,

  estatus               text not null default 'activo' check (estatus in ('activo','cancelado')),
  cancelado_en          timestamptz,
  motivo_cancelacion    text,

  creado_en             timestamptz not null default now(),
  actualizado_en        timestamptz not null default now()
);

comment on table vinculos is 'Relaciones entre cualquier par de entidades del sistema (personas, vehículos, ubicaciones y, a futuro, casos/incidentes/evidencias).';

create index if not exists idx_vinculos_origen on vinculos (entidad_origen_tipo, entidad_origen_id);
create index if not exists idx_vinculos_destino on vinculos (entidad_destino_tipo, entidad_destino_id);

-- =========================
-- Vistas filtradas por defecto (solo registros activos)
-- =========================
create or replace view personas_activas as
  select * from personas where estatus = 'activo';

create or replace view vehiculos_activos as
  select * from vehiculos where estatus = 'activo';

create or replace view ubicaciones_activas as
  select * from ubicaciones where estatus = 'activo';

create or replace view vinculos_activos as
  select * from vinculos where estatus = 'activo';


-- ########################################################################
-- ###  0002_bitacora.sql
-- ########################################################################

-- =====================================================================
-- 0002_bitacora.sql
-- Bitácora de auditoría transversal: usuario, computadora, timestamp,
-- tipo de acción, IP, valores antes/después.
-- =====================================================================

create table if not exists bitacora (
  id                  bigint generated always as identity primary key,
  usuario_id          uuid,             -- auth.uid() de quien hizo la acción
  computadora_id      text,             -- ver lib/deviceId.ts en el frontend; PENDIENTE
                                         -- pasar a catálogo de dispositivos registrados por TI
  ip_address          text,
  tipo_accion         text not null,    -- INSERT | UPDATE | CANCELAR | CONSULTAR | EXPORTAR | IMPRIMIR | LOGIN | LOGOUT
  entidad_tipo        text not null,    -- nombre de tabla o módulo
  entidad_id          uuid,
  valores_anteriores  jsonb,
  valores_nuevos      jsonb,
  modulo              text,
  creado_en           timestamptz not null default now()
);

comment on table bitacora is 'Bitácora de auditoría de todo el sistema. No se borra nunca (ni siquiera se cancela: es el registro de lo que pasó).';

create index if not exists idx_bitacora_usuario on bitacora (usuario_id);
create index if not exists idx_bitacora_entidad on bitacora (entidad_tipo, entidad_id);
create index if not exists idx_bitacora_creado_en on bitacora (creado_en);

-- La bitácora tampoco se puede alterar ni borrar una vez escrita.
create or replace function fn_bloquear_cambios_bitacora()
returns trigger as $$
begin
  raise exception 'La bitácora de auditoría es de solo escritura: no se puede modificar ni borrar (tabla %, operación %)', tg_table_name, tg_op;
end;
$$ language plpgsql;

drop trigger if exists trg_bitacora_no_update on bitacora;
create trigger trg_bitacora_no_update
  before update or delete on bitacora
  for each row execute function fn_bloquear_cambios_bitacora();

-- =====================================================================
-- Función de auditoría genérica, para adjuntar como trigger AFTER
-- INSERT/UPDATE en cada tabla núcleo (personas, vehiculos, ubicaciones,
-- vinculos, y cualquier tabla nueva que se agregue a futuro).
--
-- Usuario:      auth.uid() (lo resuelve Supabase Auth automáticamente)
-- IP / device:  se leen de los headers de la petición HTTP, expuestos
--               por PostgREST como el GUC "request.headers". El frontend
--               debe enviar el header `x-device-id` en cada llamada
--               (ver lib/supabaseClient.ts). La IP normalmente llega en
--               `x-forwarded-for`.
--
-- IMPORTANTE: hay que confirmar, ya conectados a un proyecto Supabase
-- real, que "request.headers" efectivamente trae estos valores (depende
-- de la configuración de PostgREST/Supabase). Si no llegan, hay que
-- ajustar esta función o mover la captura de IP/device a una llamada
-- RPC explícita antes de cada operación.
-- =====================================================================
create or replace function fn_bitacora_generica()
returns trigger as $$
declare
  v_headers     json;
  v_ip          text;
  v_device      text;
  v_usuario     uuid;
  v_entidad_id  uuid;
begin
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    v_headers := null;
  end;

  v_ip     := coalesce(v_headers->>'x-forwarded-for', v_headers->>'cf-connecting-ip');
  v_device := v_headers->>'x-device-id';

  begin
    v_usuario := auth.uid();
  exception when others then
    v_usuario := null;
  end;

  if tg_op = 'DELETE' then
    v_entidad_id := old.id;
  else
    v_entidad_id := new.id;
  end if;

  insert into bitacora (
    usuario_id, computadora_id, ip_address, tipo_accion,
    entidad_tipo, entidad_id, valores_anteriores, valores_nuevos, modulo
  ) values (
    v_usuario,
    v_device,
    v_ip,
    tg_op,
    tg_table_name,
    v_entidad_id,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end,
    tg_table_name
  );

  return coalesce(new, old);
end;
$$ language plpgsql security definer;

-- Adjuntar la auditoría a cada tabla núcleo
drop trigger if exists trg_auditoria_personas on personas;
create trigger trg_auditoria_personas
  after insert or update on personas
  for each row execute function fn_bitacora_generica();

drop trigger if exists trg_auditoria_vehiculos on vehiculos;
create trigger trg_auditoria_vehiculos
  after insert or update on vehiculos
  for each row execute function fn_bitacora_generica();

drop trigger if exists trg_auditoria_ubicaciones on ubicaciones;
create trigger trg_auditoria_ubicaciones
  after insert or update on ubicaciones
  for each row execute function fn_bitacora_generica();

drop trigger if exists trg_auditoria_vinculos on vinculos;
create trigger trg_auditoria_vinculos
  after insert or update on vinculos
  for each row execute function fn_bitacora_generica();

-- Nota: las acciones que NO disparan INSERT/UPDATE (consultar, exportar,
-- imprimir, iniciar/cerrar sesión) se registran desde el frontend/API
-- llamando a la función rpc_registrar_bitacora() de abajo.
create or replace function rpc_registrar_bitacora(
  p_tipo_accion  text,
  p_entidad_tipo text,
  p_entidad_id   uuid default null,
  p_modulo       text default null
) returns void as $$
declare
  v_headers json;
begin
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    v_headers := null;
  end;

  insert into bitacora (usuario_id, computadora_id, ip_address, tipo_accion, entidad_tipo, entidad_id, modulo)
  values (
    auth.uid(),
    v_headers->>'x-device-id',
    coalesce(v_headers->>'x-forwarded-for', v_headers->>'cf-connecting-ip'),
    p_tipo_accion,
    p_entidad_tipo,
    p_entidad_id,
    p_modulo
  );
end;
$$ language plpgsql security definer;


-- ########################################################################
-- ###  0003_no_delete.sql
-- ########################################################################

-- =====================================================================
-- 0003_no_delete.sql
-- Ningún registro núcleo se borra físicamente jamás: solo se cancela
-- (estatus = 'cancelado'). Esto se refuerza a nivel de base de datos
-- con dos mecanismos independientes, por si uno falla:
--   1) Trigger BEFORE DELETE que rechaza la operación.
--   2) Revocar el privilegio DELETE a los roles de la aplicación.
-- =====================================================================

create or replace function fn_bloquear_delete()
returns trigger as $$
begin
  raise exception
    'No se permite borrar registros de "%" (id=%). Use la cancelación (estatus = ''cancelado'') en su lugar.',
    tg_table_name, old.id;
end;
$$ language plpgsql;

drop trigger if exists trg_no_delete_personas on personas;
create trigger trg_no_delete_personas
  before delete on personas
  for each row execute function fn_bloquear_delete();

drop trigger if exists trg_no_delete_vehiculos on vehiculos;
create trigger trg_no_delete_vehiculos
  before delete on vehiculos
  for each row execute function fn_bloquear_delete();

drop trigger if exists trg_no_delete_ubicaciones on ubicaciones;
create trigger trg_no_delete_ubicaciones
  before delete on ubicaciones
  for each row execute function fn_bloquear_delete();

drop trigger if exists trg_no_delete_vinculos on vinculos;
create trigger trg_no_delete_vinculos
  before delete on vinculos
  for each row execute function fn_bloquear_delete();

-- Capa 2: quitar el privilegio DELETE a los roles que usa la aplicación.
-- Nota: el rol "service_role" de Supabase usa un rol de Postgres con
-- BYPASSRLS, pero el privilegio DELETE y los triggers BEFORE DELETE
-- siguen aplicando salvo que alguien tenga acceso directo como el rol
-- "postgres" (superusuario) — por eso el trigger es la protección real.
revoke delete on personas, vehiculos, ubicaciones, vinculos from authenticated, anon;

-- Función de ayuda para "cancelar" un registro de forma estándar,
-- para usarla desde el frontend en vez de un UPDATE manual repetido
-- en cada módulo.
create or replace function rpc_cancelar_registro(
  p_tabla   text,
  p_id      uuid,
  p_motivo  text
) returns void as $$
begin
  if p_tabla not in ('personas','vehiculos','ubicaciones','vinculos') then
    raise exception 'Tabla no reconocida: %', p_tabla;
  end if;

  execute format(
    'update %I set estatus = ''cancelado'', cancelado_en = now(), motivo_cancelacion = $1, actualizado_en = now() where id = $2',
    p_tabla
  ) using p_motivo, p_id;
end;
$$ language plpgsql security definer;


-- ########################################################################
-- ###  0004_roles_rls.sql
-- ########################################################################

-- =====================================================================
-- 0004_roles_rls.sql
-- Perfiles de usuario (rol dentro de la agencia) y políticas RLS
-- básicas sobre las tablas núcleo. Se refinan por módulo más adelante
-- (por ejemplo, Asuntos Internos necesitará políticas mucho más
-- restrictivas cuando se construya ese módulo).
-- =====================================================================

create table if not exists usuarios_perfil (
  id            uuid primary key references auth.users(id) on delete cascade,
  nombre        text,
  rol           text not null default 'oficial'
                check (rol in ('oficial','supervisor','investigador','administrador')),
  activo        boolean not null default true,
  creado_en     timestamptz not null default now()
);

comment on table usuarios_perfil is 'Rol de cada usuario dentro de la agencia. Vinculado 1:1 a auth.users de Supabase.';

-- Los perfiles tampoco se borran: se desactivan.
revoke delete on usuarios_perfil from authenticated, anon;

create or replace function fn_bloquear_delete_perfil()
returns trigger as $$
begin
  raise exception 'No se permite borrar perfiles de usuario (id=%). Desactive el perfil en su lugar.', old.id;
end;
$$ language plpgsql;

drop trigger if exists trg_no_delete_usuarios_perfil on usuarios_perfil;
create trigger trg_no_delete_usuarios_perfil
  before delete on usuarios_perfil
  for each row execute function fn_bloquear_delete_perfil();

-- Helper: rol del usuario autenticado actual
create or replace function fn_rol_actual()
returns text as $$
  select rol from usuarios_perfil where id = auth.uid();
$$ language sql stable security definer;

-- =========================
-- Habilitar RLS en las tablas núcleo
-- =========================
alter table personas    enable row level security;
alter table vehiculos   enable row level security;
alter table ubicaciones enable row level security;
alter table vinculos    enable row level security;
alter table usuarios_perfil enable row level security;

-- Lectura: cualquier usuario autenticado con perfil activo puede ver
-- los registros activos; los cancelados solo los ve supervisor+.
drop policy if exists sel_personas on personas;
create policy sel_personas on personas
  for select to authenticated
  using (
    estatus = 'activo'
    or fn_rol_actual() in ('supervisor','investigador','administrador')
  );

drop policy if exists sel_vehiculos on vehiculos;
create policy sel_vehiculos on vehiculos
  for select to authenticated
  using (
    estatus = 'activo'
    or fn_rol_actual() in ('supervisor','investigador','administrador')
  );

drop policy if exists sel_ubicaciones on ubicaciones;
create policy sel_ubicaciones on ubicaciones
  for select to authenticated
  using (
    estatus = 'activo'
    or fn_rol_actual() in ('supervisor','investigador','administrador')
  );

drop policy if exists sel_vinculos on vinculos;
create policy sel_vinculos on vinculos
  for select to authenticated
  using (
    estatus = 'activo'
    or fn_rol_actual() in ('supervisor','investigador','administrador')
  );

-- Escritura (insert/update): cualquier usuario autenticado con perfil
-- activo. Ajustar por módulo cuando haga falta (por ejemplo, solo
-- supervisor puede reasignar, etc.).
drop policy if exists ins_personas on personas;
create policy ins_personas on personas for insert to authenticated with check (true);
drop policy if exists upd_personas on personas;
create policy upd_personas on personas for update to authenticated using (true) with check (true);

drop policy if exists ins_vehiculos on vehiculos;
create policy ins_vehiculos on vehiculos for insert to authenticated with check (true);
drop policy if exists upd_vehiculos on vehiculos;
create policy upd_vehiculos on vehiculos for update to authenticated using (true) with check (true);

drop policy if exists ins_ubicaciones on ubicaciones;
create policy ins_ubicaciones on ubicaciones for insert to authenticated with check (true);
drop policy if exists upd_ubicaciones on ubicaciones;
create policy upd_ubicaciones on ubicaciones for update to authenticated using (true) with check (true);

drop policy if exists ins_vinculos on vinculos;
create policy ins_vinculos on vinculos for insert to authenticated with check (true);
drop policy if exists upd_vinculos on vinculos;
create policy upd_vinculos on vinculos for update to authenticated using (true) with check (true);

-- Perfiles: cada quien ve el suyo; administrador ve todos.
drop policy if exists sel_usuarios_perfil on usuarios_perfil;
create policy sel_usuarios_perfil on usuarios_perfil
  for select to authenticated
  using (id = auth.uid() or fn_rol_actual() = 'administrador');

drop policy if exists upd_usuarios_perfil on usuarios_perfil;
create policy upd_usuarios_perfil on usuarios_perfil
  for update to authenticated
  using (fn_rol_actual() = 'administrador')
  with check (fn_rol_actual() = 'administrador');

-- La bitácora: nadie inserta directo (solo los triggers/RPC con
-- security definer); solo administrador/supervisor pueden leerla.
alter table bitacora enable row level security;

drop policy if exists sel_bitacora on bitacora;
create policy sel_bitacora on bitacora
  for select to authenticated
  using (fn_rol_actual() in ('supervisor','administrador'));

-- Crear automáticamente un perfil (rol 'oficial' por defecto) cuando
-- se registra un nuevo usuario en Supabase Auth.
-- security definer + search_path fijo + tabla calificada con esquema: GoTrue
-- (el servicio de Auth) ejecuta este trigger con un search_path restringido,
-- así que sin esto la creación de usuarios falla con "Database error creating
-- new user". El bloque exception evita además que un fallo al crear el perfil
-- bloquee el alta del usuario: el perfil se puede reparar después.
create or replace function fn_crear_perfil_nuevo_usuario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.usuarios_perfil (id, nombre, rol)
  values (new.id, new.raw_user_meta_data->>'nombre', 'oficial')
  on conflict (id) do nothing;
  return new;
exception
  when others then
    raise warning 'No se pudo crear el perfil para %: %', new.id, sqlerrm;
    return new;
end;
$$;

drop trigger if exists trg_crear_perfil_nuevo_usuario on auth.users;
create trigger trg_crear_perfil_nuevo_usuario
  after insert on auth.users
  for each row execute function fn_crear_perfil_nuevo_usuario();


-- ########################################################################
-- ###  0005_casos.sql
-- ########################################################################

-- =====================================================================
-- 0005_casos.sql
-- Módulo de Casos / Incidentes.
--
-- Un caso es la unidad de investigación: agrupa (vía el motor de vínculos)
-- a las personas, vehículos y ubicaciones involucradas. Reutiliza toda la
-- infraestructura núcleo ya existente:
--   - política "cancelar, nunca borrar" (estatus + trigger no-delete)
--   - bitácora de auditoría (trigger AFTER insert/update)
--   - RLS por rol
--   - motor de vínculos genérico (entidad tipo 'caso')
--
-- Nota sobre los dos "estados": 'estatus' (activo/cancelado) es la política
-- de retención de datos y NO se usa para el flujo de trabajo. El avance de
-- la investigación se lleva en 'estado_investigacion'.
-- =====================================================================

create table if not exists casos (
  id                    uuid primary key default gen_random_uuid(),
  folio                 text,                -- número de expediente/caso (asignado por la agencia)
  tipo                  text,                -- robo, homicidio, accidente vial, extravío, etc.
  titulo                text not null,
  narrativa             text,                -- descripción de los hechos
  fecha_hecho           timestamptz,         -- cuándo ocurrió (distinto de creado_en = cuándo se capturó)
  prioridad             text not null default 'media'
                          check (prioridad in ('baja','media','alta')),
  estado_investigacion  text not null default 'abierto'
                          check (estado_investigacion in ('abierto','en_investigacion','cerrado','archivado')),
  datos_adicionales     jsonb default '{}'::jsonb,

  estatus               text not null default 'activo' check (estatus in ('activo','cancelado')),
  cancelado_en          timestamptz,
  motivo_cancelacion    text,

  creado_en             timestamptz not null default now(),
  actualizado_en        timestamptz not null default now()
);

comment on table casos is 'Casos/incidentes: unidad de investigación que agrupa personas, vehículos y ubicaciones vía el motor de vínculos.';

create index if not exists idx_casos_estado on casos (estado_investigacion);
create index if not exists idx_casos_folio on casos (folio);

create or replace view casos_activos as
  select * from casos where estatus = 'activo';

-- ---------------------------------------------------------------------
-- Política "cancelar, nunca borrar" (igual que el resto de tablas núcleo)
-- ---------------------------------------------------------------------
drop trigger if exists trg_no_delete_casos on casos;
create trigger trg_no_delete_casos
  before delete on casos
  for each row execute function fn_bloquear_delete();

revoke delete on casos from authenticated, anon;

-- ---------------------------------------------------------------------
-- Bitácora de auditoría (reutiliza fn_bitacora_generica de 0002)
-- ---------------------------------------------------------------------
drop trigger if exists trg_auditoria_casos on casos;
create trigger trg_auditoria_casos
  after insert or update on casos
  for each row execute function fn_bitacora_generica();

-- ---------------------------------------------------------------------
-- Ampliar rpc_cancelar_registro para admitir la tabla 'casos'.
-- (redefinición idempotente de la función de 0003, agregando 'casos')
-- ---------------------------------------------------------------------
create or replace function rpc_cancelar_registro(
  p_tabla   text,
  p_id      uuid,
  p_motivo  text
) returns void as $$
begin
  if p_tabla not in ('personas','vehiculos','ubicaciones','vinculos','casos') then
    raise exception 'Tabla no reconocida: %', p_tabla;
  end if;

  execute format(
    'update %I set estatus = ''cancelado'', cancelado_en = now(), motivo_cancelacion = $1, actualizado_en = now() where id = $2',
    p_tabla
  ) using p_motivo, p_id;
end;
$$ language plpgsql security definer;

-- ---------------------------------------------------------------------
-- RLS (mismo patrón que las demás tablas núcleo en 0004)
-- ---------------------------------------------------------------------
alter table casos enable row level security;

drop policy if exists sel_casos on casos;
create policy sel_casos on casos
  for select to authenticated
  using (
    estatus = 'activo'
    or fn_rol_actual() in ('supervisor','investigador','administrador')
  );

drop policy if exists ins_casos on casos;
create policy ins_casos on casos for insert to authenticated with check (true);

drop policy if exists upd_casos on casos;
create policy upd_casos on casos for update to authenticated using (true) with check (true);


-- ########################################################################
-- ###  0006_personal.sql
-- ########################################################################

-- =====================================================================
-- 0006_personal.sql
-- Módulo de Personal (Fase 2 del roadmap: Personal, Flota y Equipo).
--
-- Un registro de "personal" es el vínculo de EMPLEO de una persona con la
-- agencia (placa, rango, adscripción, estado laboral). NO duplica los datos
-- biográficos: apunta a la persona en el índice maestro (tabla personas),
-- coherente con el principio de "un solo registro por individuo" — un
-- oficial es una persona más del índice, no un registro aparte.
--
-- La flota (vehículos de la agencia) ya está cubierta por la tabla vehiculos
-- con la bandera es_flota_agencia; no se necesita tabla nueva para eso.
-- =====================================================================

create table if not exists personal (
  id                    uuid primary key default gen_random_uuid(),
  persona_id            uuid not null references personas(id),
  numero_placa          text,                -- número de placa / identificador de oficial
  rango                 text,                -- oficial, cabo, sargento, teniente, etc.
  adscripcion           text,                -- unidad / área / destacamento
  fecha_ingreso         date,
  estado_laboral        text not null default 'activo'
                          check (estado_laboral in ('activo','licencia','suspendido','baja')),
  datos_adicionales     jsonb default '{}'::jsonb,

  estatus               text not null default 'activo' check (estatus in ('activo','cancelado')),
  cancelado_en          timestamptz,
  motivo_cancelacion    text,

  creado_en             timestamptz not null default now(),
  actualizado_en        timestamptz not null default now()
);

comment on table personal is 'Registro de empleo del personal de la agencia. Referencia a personas (índice maestro); NO duplica datos biográficos.';

create index if not exists idx_personal_persona on personal (persona_id);
create index if not exists idx_personal_placa on personal (numero_placa);

create or replace view personal_activo as
  select * from personal where estatus = 'activo';

-- ---------------------------------------------------------------------
-- Política "cancelar, nunca borrar"
-- ---------------------------------------------------------------------
drop trigger if exists trg_no_delete_personal on personal;
create trigger trg_no_delete_personal
  before delete on personal
  for each row execute function fn_bloquear_delete();

revoke delete on personal from authenticated, anon;

-- ---------------------------------------------------------------------
-- Bitácora de auditoría (reutiliza fn_bitacora_generica de 0002)
-- ---------------------------------------------------------------------
drop trigger if exists trg_auditoria_personal on personal;
create trigger trg_auditoria_personal
  after insert or update on personal
  for each row execute function fn_bitacora_generica();

-- ---------------------------------------------------------------------
-- Ampliar rpc_cancelar_registro para admitir la tabla 'personal'.
-- (redefinición idempotente, agregando 'personal' a la lista blanca)
-- ---------------------------------------------------------------------
create or replace function rpc_cancelar_registro(
  p_tabla   text,
  p_id      uuid,
  p_motivo  text
) returns void as $$
begin
  if p_tabla not in ('personas','vehiculos','ubicaciones','vinculos','casos','personal') then
    raise exception 'Tabla no reconocida: %', p_tabla;
  end if;

  execute format(
    'update %I set estatus = ''cancelado'', cancelado_en = now(), motivo_cancelacion = $1, actualizado_en = now() where id = $2',
    p_tabla
  ) using p_motivo, p_id;
end;
$$ language plpgsql security definer;

-- ---------------------------------------------------------------------
-- RLS (mismo patrón que las demás tablas núcleo en 0004)
-- ---------------------------------------------------------------------
alter table personal enable row level security;

drop policy if exists sel_personal on personal;
create policy sel_personal on personal
  for select to authenticated
  using (
    estatus = 'activo'
    or fn_rol_actual() in ('supervisor','investigador','administrador')
  );

drop policy if exists ins_personal on personal;
create policy ins_personal on personal for insert to authenticated with check (true);

drop policy if exists upd_personal on personal;
create policy upd_personal on personal for update to authenticated using (true) with check (true);


-- ########################################################################
-- ###  0007_ordenes.sql
-- ########################################################################

-- =====================================================================
-- 0007_ordenes.sql
-- Módulo de Citatorios y Órdenes (Fase 3 del roadmap).
--
-- Una "orden" cubre tanto citatorios como órdenes de autoridad superior
-- (aprehensión, cateo, comparecencia, presentación), diferenciadas por el
-- campo 'tipo'. Sus relaciones (con el caso, la persona citada/requerida,
-- vehículos o ubicaciones) se expresan con el motor de vínculos genérico,
-- igual que los casos.
--
-- NOTA sobre firma electrónica: el roadmap marca esta fase como dependiente
-- de un estándar de firma electrónica (flujos con juzgado/fiscalía). Para la
-- demo se registran los metadatos de autorización (autorizada_por) y se deja
-- la firma criptográfica como pendiente de producción — mismo criterio que
-- otros temas de hardening del sistema (ver README).
--
-- Como el resto del sistema: estatus (activo/cancelado) es retención de datos;
-- el avance del trámite se lleva en 'estado'.
-- =====================================================================

create table if not exists ordenes (
  id                    uuid primary key default gen_random_uuid(),
  folio                 text,
  tipo                  text not null default 'citatorio'
                          check (tipo in ('citatorio','orden_aprehension','orden_cateo',
                                          'orden_comparecencia','orden_presentacion')),
  autoridad_emisora     text,                -- juzgado / fiscalía / autoridad que emite
  autorizada_por        text,                -- funcionario que autoriza (firma pendiente en prod)
  asunto                text,
  fecha_emision         date,
  fecha_limite          date,                -- fecha de comparecencia / vencimiento
  estado                text not null default 'emitida'
                          check (estado in ('emitida','notificada','cumplida','vencida')),
  datos_adicionales     jsonb default '{}'::jsonb,

  estatus               text not null default 'activo' check (estatus in ('activo','cancelado')),
  cancelado_en          timestamptz,
  motivo_cancelacion    text,

  creado_en             timestamptz not null default now(),
  actualizado_en        timestamptz not null default now()
);

comment on table ordenes is 'Citatorios y órdenes de autoridad (aprehensión, cateo, comparecencia). Se relacionan con casos/personas/etc. vía el motor de vínculos.';

create index if not exists idx_ordenes_estado on ordenes (estado);
create index if not exists idx_ordenes_folio on ordenes (folio);

create or replace view ordenes_activas as
  select * from ordenes where estatus = 'activo';

-- ---------------------------------------------------------------------
-- Política "cancelar, nunca borrar"
-- ---------------------------------------------------------------------
drop trigger if exists trg_no_delete_ordenes on ordenes;
create trigger trg_no_delete_ordenes
  before delete on ordenes
  for each row execute function fn_bloquear_delete();

revoke delete on ordenes from authenticated, anon;

-- ---------------------------------------------------------------------
-- Bitácora de auditoría (reutiliza fn_bitacora_generica de 0002)
-- ---------------------------------------------------------------------
drop trigger if exists trg_auditoria_ordenes on ordenes;
create trigger trg_auditoria_ordenes
  after insert or update on ordenes
  for each row execute function fn_bitacora_generica();

-- ---------------------------------------------------------------------
-- Ampliar rpc_cancelar_registro para admitir la tabla 'ordenes'.
-- ---------------------------------------------------------------------
create or replace function rpc_cancelar_registro(
  p_tabla   text,
  p_id      uuid,
  p_motivo  text
) returns void as $$
begin
  if p_tabla not in ('personas','vehiculos','ubicaciones','vinculos','casos','personal','ordenes') then
    raise exception 'Tabla no reconocida: %', p_tabla;
  end if;

  execute format(
    'update %I set estatus = ''cancelado'', cancelado_en = now(), motivo_cancelacion = $1, actualizado_en = now() where id = $2',
    p_tabla
  ) using p_motivo, p_id;
end;
$$ language plpgsql security definer;

-- ---------------------------------------------------------------------
-- RLS (mismo patrón que las demás tablas núcleo en 0004)
-- ---------------------------------------------------------------------
alter table ordenes enable row level security;

drop policy if exists sel_ordenes on ordenes;
create policy sel_ordenes on ordenes
  for select to authenticated
  using (
    estatus = 'activo'
    or fn_rol_actual() in ('supervisor','investigador','administrador')
  );

drop policy if exists ins_ordenes on ordenes;
create policy ins_ordenes on ordenes for insert to authenticated with check (true);

drop policy if exists upd_ordenes on ordenes;
create policy upd_ordenes on ordenes for update to authenticated using (true) with check (true);


-- ########################################################################
-- ###  0008_fotos_storage.sql
-- ########################################################################

-- =====================================================================
-- 0008_fotos_storage.sql
-- Soporte de fotografías para Personas y Vehículos usando Supabase Storage.
--
-- - personas ya tiene la columna `fotografias jsonb` desde 0001.
-- - a vehiculos se le agrega la misma columna aquí.
-- - se crea un bucket público 'fotos' y las políticas de acceso sobre
--   storage.objects (lectura pública, escritura solo autenticados).
--
-- Las columnas `fotografias` guardan un arreglo JSON de RUTAS dentro del
-- bucket (ej. ["personas/<uuid>/1699999999_frente.jpg"]). La URL pública
-- se resuelve en el frontend con supabase.storage.getPublicUrl().
--
-- Nota de producción: el bucket es público para simplificar la demo. Para
-- datos sensibles (evidencia, fotos de personas) conviene un bucket privado
-- + URLs firmadas y políticas por rol; ver README.
-- =====================================================================

alter table vehiculos add column if not exists fotografias jsonb default '[]'::jsonb;

-- Bucket de almacenamiento de fotos.
insert into storage.buckets (id, name, public)
values ('fotos', 'fotos', true)
on conflict (id) do nothing;

-- Políticas sobre los objetos del bucket 'fotos'.
-- storage.objects ya tiene RLS habilitada por defecto en Supabase.
drop policy if exists "fotos_select" on storage.objects;
create policy "fotos_select" on storage.objects
  for select using (bucket_id = 'fotos');

drop policy if exists "fotos_insert" on storage.objects;
create policy "fotos_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'fotos');

drop policy if exists "fotos_update" on storage.objects;
create policy "fotos_update" on storage.objects
  for update to authenticated using (bucket_id = 'fotos');


-- ########################################################################
-- ###  0009_evidencias.sql
-- ########################################################################

-- =====================================================================
-- 0009_evidencias.sql
-- Módulo de Bienes y Evidencias (Fase 4 del roadmap). Depende de Casos.
--
-- Dos tablas:
--   1) evidencias        el bien/objeto asegurado (con fotos).
--   2) cadena_custodia   registro APPEND-ONLY (WORM) de cada movimiento de
--                        custodia de una evidencia — inmutable por diseño.
--
-- La inmutabilidad de la cadena de custodia se refuerza a nivel de base de
-- datos (bloqueo de UPDATE y DELETE + revocación de privilegios), que es la
-- aproximación WORM que plantea el documento de arquitectura mientras no se
-- adopte un almacenamiento WORM dedicado.
--
-- Como el resto del sistema: estatus (activo/cancelado) es retención; el
-- avance del bien se lleva en 'estado_evidencia'.
-- =====================================================================

-- =========================
-- EVIDENCIAS
-- =========================
create table if not exists evidencias (
  id                    uuid primary key default gen_random_uuid(),
  folio                 text,                -- etiqueta / número de evidencia
  tipo                  text,                -- arma, droga, documento, dispositivo, dinero, etc.
  descripcion           text,
  cantidad              text,                -- ej. "2 piezas", "15.3 g" (texto libre para la demo)
  ubicacion_almacen     text,               -- bodega / anaquel donde se resguarda
  estado_evidencia      text not null default 'recolectada'
                          check (estado_evidencia in ('recolectada','en_almacen','en_analisis',
                                                      'entregada','devuelta','destruida')),
  fecha_recoleccion     timestamptz,
  fotografias           jsonb default '[]'::jsonb,
  datos_adicionales     jsonb default '{}'::jsonb,

  estatus               text not null default 'activo' check (estatus in ('activo','cancelado')),
  cancelado_en          timestamptz,
  motivo_cancelacion    text,

  creado_en             timestamptz not null default now(),
  actualizado_en        timestamptz not null default now()
);

comment on table evidencias is 'Bienes y evidencias asegurados. Se relacionan con casos/personas/etc. vía vínculos; su custodia se registra en cadena_custodia.';

create index if not exists idx_evidencias_estado on evidencias (estado_evidencia);
create index if not exists idx_evidencias_folio on evidencias (folio);

create or replace view evidencias_activas as
  select * from evidencias where estatus = 'activo';

drop trigger if exists trg_no_delete_evidencias on evidencias;
create trigger trg_no_delete_evidencias
  before delete on evidencias
  for each row execute function fn_bloquear_delete();

revoke delete on evidencias from authenticated, anon;

drop trigger if exists trg_auditoria_evidencias on evidencias;
create trigger trg_auditoria_evidencias
  after insert or update on evidencias
  for each row execute function fn_bitacora_generica();

-- =========================
-- CADENA DE CUSTODIA (append-only / WORM)
-- =========================
create table if not exists cadena_custodia (
  id              bigint generated always as identity primary key,
  evidencia_id    uuid not null references evidencias(id),
  tipo_evento     text not null
                    check (tipo_evento in ('recoleccion','traslado','resguardo','analisis',
                                           'entrega','devolucion','destruccion')),
  responsable     text,                -- quién recibe/ejecuta la custodia
  ubicacion       text,                -- dónde queda la evidencia tras el evento
  notas           text,
  fecha_evento    timestamptz not null default now(),
  creado_en       timestamptz not null default now()
);

comment on table cadena_custodia is 'Registro append-only (WORM) de los movimientos de custodia de cada evidencia. No se modifica ni se borra jamás.';

create index if not exists idx_custodia_evidencia on cadena_custodia (evidencia_id, fecha_evento);

-- WORM: la cadena de custodia no se puede modificar ni borrar una vez escrita.
create or replace function fn_bloquear_cambios_custodia()
returns trigger as $$
begin
  raise exception 'La cadena de custodia es de solo escritura (append-only): no se puede modificar ni borrar (operación %).', tg_op;
end;
$$ language plpgsql;

drop trigger if exists trg_custodia_worm on cadena_custodia;
create trigger trg_custodia_worm
  before update or delete on cadena_custodia
  for each row execute function fn_bloquear_cambios_custodia();

revoke update, delete on cadena_custodia from authenticated, anon;

-- ---------------------------------------------------------------------
-- Ampliar rpc_cancelar_registro para admitir 'evidencias'.
-- (cadena_custodia NO se cancela: es append-only.)
-- ---------------------------------------------------------------------
create or replace function rpc_cancelar_registro(
  p_tabla   text,
  p_id      uuid,
  p_motivo  text
) returns void as $$
begin
  if p_tabla not in ('personas','vehiculos','ubicaciones','vinculos','casos','personal','ordenes','evidencias') then
    raise exception 'Tabla no reconocida: %', p_tabla;
  end if;

  execute format(
    'update %I set estatus = ''cancelado'', cancelado_en = now(), motivo_cancelacion = $1, actualizado_en = now() where id = $2',
    p_tabla
  ) using p_motivo, p_id;
end;
$$ language plpgsql security definer;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table evidencias enable row level security;

drop policy if exists sel_evidencias on evidencias;
create policy sel_evidencias on evidencias
  for select to authenticated
  using (
    estatus = 'activo'
    or fn_rol_actual() in ('supervisor','investigador','administrador')
  );

drop policy if exists ins_evidencias on evidencias;
create policy ins_evidencias on evidencias for insert to authenticated with check (true);

drop policy if exists upd_evidencias on evidencias;
create policy upd_evidencias on evidencias for update to authenticated using (true) with check (true);

alter table cadena_custodia enable row level security;

-- Lectura para cualquier autenticado; escritura solo insert (append-only).
drop policy if exists sel_custodia on cadena_custodia;
create policy sel_custodia on cadena_custodia for select to authenticated using (true);

drop policy if exists ins_custodia on cadena_custodia;
create policy ins_custodia on cadena_custodia for insert to authenticated with check (true);


-- ########################################################################
-- ###  0010_asuntos_internos.sql
-- ########################################################################

-- =====================================================================
-- 0010_asuntos_internos.sql
-- Módulo de Asuntos Internos (Fase 5 del roadmap): el más sensible.
--
-- Diseño de seguridad (lo que distingue a este módulo del resto):
--   1) RLS ESTRICTA: solo el rol 'asuntos_internos' (+ 'administrador')
--      puede ver, crear o editar estos registros. Ni oficiales, ni
--      supervisores, ni investigadores los ven — ni siquiera los activos.
--   2) AISLAMIENTO: NO se integra al motor de vínculos (cuya RLS es
--      permisiva y filtraría la existencia de un asunto sobre una persona)
--      ni a las fotos (el bucket 'fotos' es público). El oficial investigado
--      se referencia con una FK directa a personal.
--   3) La RPC rpc_cancelar_registro es SECURITY DEFINER (salta RLS): se le
--      agrega un guard de rol para que nadie cancele un asunto interno sin
--      el rol adecuado.
--   4) ALERTAS DE CONSULTA: cada apertura queda registrada en la bitácora
--      (acción CONSULTAR) desde el frontend.
--
-- Pendiente de producción: cifrado por registro (field-level) de la
-- narrativa/resolución; ver README.
-- =====================================================================

-- Nuevo rol 'asuntos_internos' en el catálogo de roles.
alter table usuarios_perfil drop constraint if exists usuarios_perfil_rol_check;
alter table usuarios_perfil add constraint usuarios_perfil_rol_check
  check (rol in ('oficial','supervisor','investigador','administrador','asuntos_internos'));

create table if not exists asuntos_internos (
  id                    uuid primary key default gen_random_uuid(),
  folio                 text,
  tipo                  text,                -- queja_ciudadana, investigacion_interna, uso_de_fuerza, etc.
  asunto                text,
  narrativa             text,                -- detalle confidencial
  personal_id           uuid references personal(id),   -- oficial investigado (opcional)
  confidencialidad      text not null default 'confidencial'
                          check (confidencialidad in ('reservado','confidencial','restringido')),
  estado                text not null default 'abierto'
                          check (estado in ('abierto','en_investigacion','resuelto','cerrado')),
  resolucion            text,
  datos_adicionales     jsonb default '{}'::jsonb,

  estatus               text not null default 'activo' check (estatus in ('activo','cancelado')),
  cancelado_en          timestamptz,
  motivo_cancelacion    text,

  creado_en             timestamptz not null default now(),
  actualizado_en        timestamptz not null default now()
);

comment on table asuntos_internos is 'Asuntos Internos (quejas e investigaciones sobre personal). Acceso restringido por RLS al rol asuntos_internos/administrador. No se expone en vínculos ni fotos por confidencialidad.';

create index if not exists idx_asuntos_internos_estado on asuntos_internos (estado);
create index if not exists idx_asuntos_internos_personal on asuntos_internos (personal_id);

create or replace view asuntos_internos_activos as
  select * from asuntos_internos where estatus = 'activo';

drop trigger if exists trg_no_delete_asuntos_internos on asuntos_internos;
create trigger trg_no_delete_asuntos_internos
  before delete on asuntos_internos
  for each row execute function fn_bloquear_delete();

revoke delete on asuntos_internos from authenticated, anon;

drop trigger if exists trg_auditoria_asuntos_internos on asuntos_internos;
create trigger trg_auditoria_asuntos_internos
  after insert or update on asuntos_internos
  for each row execute function fn_bitacora_generica();

-- ---------------------------------------------------------------------
-- rpc_cancelar_registro: admite 'asuntos_internos' PERO con guard de rol,
-- porque esta función es security definer y de otro modo saltaría la RLS.
-- ---------------------------------------------------------------------
create or replace function rpc_cancelar_registro(
  p_tabla   text,
  p_id      uuid,
  p_motivo  text
) returns void as $$
begin
  if p_tabla not in ('personas','vehiculos','ubicaciones','vinculos','casos','personal','ordenes','evidencias','asuntos_internos') then
    raise exception 'Tabla no reconocida: %', p_tabla;
  end if;

  -- Asuntos Internos: solo el rol autorizado puede cancelar (la función es
  -- security definer y no aplicaría la RLS por sí sola).
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

-- ---------------------------------------------------------------------
-- RLS ESTRICTA: solo asuntos_internos / administrador.
-- ---------------------------------------------------------------------
alter table asuntos_internos enable row level security;

drop policy if exists sel_asuntos_internos on asuntos_internos;
create policy sel_asuntos_internos on asuntos_internos
  for select to authenticated
  using (fn_rol_actual() in ('asuntos_internos','administrador'));

drop policy if exists ins_asuntos_internos on asuntos_internos;
create policy ins_asuntos_internos on asuntos_internos
  for insert to authenticated
  with check (fn_rol_actual() in ('asuntos_internos','administrador'));

drop policy if exists upd_asuntos_internos on asuntos_internos;
create policy upd_asuntos_internos on asuntos_internos
  for update to authenticated
  using (fn_rol_actual() in ('asuntos_internos','administrador'))
  with check (fn_rol_actual() in ('asuntos_internos','administrador'));


-- ########################################################################
-- ###  0011_cad_barandilla.sql
-- ########################################################################

-- =====================================================================
-- 0011_cad_barandilla.sql
-- Fase 6 del roadmap: CAD (Atención de llamadas / despacho) y Barandilla.
--
-- Se construye la lógica de negocio del despacho y la custodia. Las
-- integraciones de infraestructura de cada agencia (telefonía en tiempo
-- real, radios, CCTV, AVL/GPS de unidades) quedan fuera: el roadmap las
-- marca como dependientes del despliegue on-premise de cada cliente.
--
-- Tres tablas:
--   1) llamadas_cad   la llamada/incidente de despacho, con georreferencia.
--   2) despachos      asignación de una unidad (oficial + patrulla) a una
--                     llamada, con su estado (asignada/en_ruta/en_sitio/...).
--   3) barandilla     registro de custodia/detención, ligado a Personas.
-- =====================================================================

-- =========================
-- CAD: LLAMADAS
-- =========================
create table if not exists llamadas_cad (
  id                  uuid primary key default gen_random_uuid(),
  folio               text,
  tipo                text,             -- emergencia, robo_en_progreso, accidente, auxilio, etc.
  prioridad           text not null default 'media' check (prioridad in ('alta','media','baja')),
  reportante          text,
  telefono            text,
  descripcion         text,
  direccion           text,
  latitud             double precision,
  longitud            double precision,
  estado_despacho     text not null default 'recibida'
                        check (estado_despacho in ('recibida','despachada','en_atencion','resuelta')),
  fecha_recepcion     timestamptz not null default now(),
  fecha_cierre        timestamptz,
  datos_adicionales   jsonb default '{}'::jsonb,

  estatus             text not null default 'activo' check (estatus in ('activo','cancelado')),
  cancelado_en        timestamptz,
  motivo_cancelacion  text,

  creado_en           timestamptz not null default now(),
  actualizado_en      timestamptz not null default now()
);

comment on table llamadas_cad is 'Llamadas/incidentes de despacho (CAD) con georreferencia. Se relacionan con casos/personas vía vínculos.';

create index if not exists idx_llamadas_cad_estado on llamadas_cad (estado_despacho);
create index if not exists idx_llamadas_cad_prioridad on llamadas_cad (prioridad);

create or replace view llamadas_cad_activas as
  select * from llamadas_cad where estatus = 'activo';

-- =========================
-- CAD: DESPACHOS (unidades asignadas a una llamada)
-- =========================
create table if not exists despachos (
  id                  uuid primary key default gen_random_uuid(),
  llamada_id          uuid not null references llamadas_cad(id),
  personal_id         uuid references personal(id),    -- oficial asignado
  vehiculo_id         uuid references vehiculos(id),   -- unidad/patrulla
  estado              text not null default 'asignada'
                        check (estado in ('asignada','en_ruta','en_sitio','liberada')),
  notas               text,
  fecha_asignacion    timestamptz not null default now(),

  estatus             text not null default 'activo' check (estatus in ('activo','cancelado')),
  cancelado_en        timestamptz,
  motivo_cancelacion  text,

  creado_en           timestamptz not null default now(),
  actualizado_en      timestamptz not null default now()
);

comment on table despachos is 'Asignación de unidades (oficial + patrulla) a una llamada CAD, con seguimiento de estado.';

create index if not exists idx_despachos_llamada on despachos (llamada_id);

-- =========================
-- BARANDILLA (custodia / registro de detención)
-- =========================
create table if not exists barandilla (
  id                  uuid primary key default gen_random_uuid(),
  folio               text,
  persona_id          uuid not null references personas(id),
  motivo              text,
  autoridad_remitente text,
  celda               text,
  pertenencias        text,
  fecha_ingreso       timestamptz not null default now(),
  fecha_egreso        timestamptz,
  estado              text not null default 'ingresado'
                        check (estado in ('ingresado','en_custodia','liberado','trasladado')),
  datos_adicionales   jsonb default '{}'::jsonb,

  estatus             text not null default 'activo' check (estatus in ('activo','cancelado')),
  cancelado_en        timestamptz,
  motivo_cancelacion  text,

  creado_en           timestamptz not null default now(),
  actualizado_en      timestamptz not null default now()
);

comment on table barandilla is 'Registro de custodia/detención (barandilla), ligado al índice maestro de Personas.';

create index if not exists idx_barandilla_persona on barandilla (persona_id);
create index if not exists idx_barandilla_estado on barandilla (estado);

create or replace view barandilla_activa as
  select * from barandilla where estatus = 'activo';

-- ---------------------------------------------------------------------
-- Política "cancelar, nunca borrar" + bitácora para las tres tablas
-- ---------------------------------------------------------------------
drop trigger if exists trg_no_delete_llamadas_cad on llamadas_cad;
create trigger trg_no_delete_llamadas_cad before delete on llamadas_cad
  for each row execute function fn_bloquear_delete();
drop trigger if exists trg_no_delete_despachos on despachos;
create trigger trg_no_delete_despachos before delete on despachos
  for each row execute function fn_bloquear_delete();
drop trigger if exists trg_no_delete_barandilla on barandilla;
create trigger trg_no_delete_barandilla before delete on barandilla
  for each row execute function fn_bloquear_delete();

revoke delete on llamadas_cad, despachos, barandilla from authenticated, anon;

drop trigger if exists trg_auditoria_llamadas_cad on llamadas_cad;
create trigger trg_auditoria_llamadas_cad after insert or update on llamadas_cad
  for each row execute function fn_bitacora_generica();
drop trigger if exists trg_auditoria_despachos on despachos;
create trigger trg_auditoria_despachos after insert or update on despachos
  for each row execute function fn_bitacora_generica();
drop trigger if exists trg_auditoria_barandilla on barandilla;
create trigger trg_auditoria_barandilla after insert or update on barandilla
  for each row execute function fn_bitacora_generica();

-- ---------------------------------------------------------------------
-- Ampliar rpc_cancelar_registro con las tres tablas nuevas.
-- ---------------------------------------------------------------------
create or replace function rpc_cancelar_registro(
  p_tabla   text,
  p_id      uuid,
  p_motivo  text
) returns void as $$
begin
  if p_tabla not in ('personas','vehiculos','ubicaciones','vinculos','casos','personal',
                     'ordenes','evidencias','asuntos_internos','llamadas_cad','despachos','barandilla') then
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

-- ---------------------------------------------------------------------
-- RLS (patrón estándar: activo visible a autenticados; cancelado a supervisor+)
-- ---------------------------------------------------------------------
alter table llamadas_cad enable row level security;
alter table despachos    enable row level security;
alter table barandilla   enable row level security;

drop policy if exists sel_llamadas_cad on llamadas_cad;
create policy sel_llamadas_cad on llamadas_cad for select to authenticated
  using (estatus = 'activo' or fn_rol_actual() in ('supervisor','investigador','administrador'));
drop policy if exists ins_llamadas_cad on llamadas_cad;
create policy ins_llamadas_cad on llamadas_cad for insert to authenticated with check (true);
drop policy if exists upd_llamadas_cad on llamadas_cad;
create policy upd_llamadas_cad on llamadas_cad for update to authenticated using (true) with check (true);

drop policy if exists sel_despachos on despachos;
create policy sel_despachos on despachos for select to authenticated
  using (estatus = 'activo' or fn_rol_actual() in ('supervisor','investigador','administrador'));
drop policy if exists ins_despachos on despachos;
create policy ins_despachos on despachos for insert to authenticated with check (true);
drop policy if exists upd_despachos on despachos;
create policy upd_despachos on despachos for update to authenticated using (true) with check (true);

drop policy if exists sel_barandilla on barandilla;
create policy sel_barandilla on barandilla for select to authenticated
  using (estatus = 'activo' or fn_rol_actual() in ('supervisor','investigador','administrador'));
drop policy if exists ins_barandilla on barandilla;
create policy ins_barandilla on barandilla for insert to authenticated with check (true);
drop policy if exists upd_barandilla on barandilla;
create policy upd_barandilla on barandilla for update to authenticated using (true) with check (true);


-- ########################################################################
-- ###  0012_foliador.sql
-- ########################################################################

-- =====================================================================
-- 0012_foliador.sql
-- Foliador único, consecutivo y administrable, para todos los módulos que
-- manejan un campo `folio`.
--
-- Formato del folio (12 caracteres): AAAA + II + NNNNNN
--   - AAAA   : año (4 dígitos)
--   - II     : iniciales del módulo (2 letras, configurables)
--   - NNNNNN : consecutivo de 6 dígitos, con ceros a la izquierda
-- El consecutivo se REINICIA cada año, por módulo.  Ej: 2026CA000001
--
-- Se administra desde el módulo de administración (/admin): se pueden
-- cambiar las iniciales de cada módulo y ver/ajustar el consecutivo por año.
-- =====================================================================

-- Catálogo de módulos que usan folio, con sus iniciales configurables.
create table if not exists foliadores (
  modulo    text primary key,     -- coincide con el nombre de la tabla (ej. 'casos')
  nombre    text not null,        -- nombre para mostrar
  iniciales text not null check (char_length(iniciales) = 2),
  activo    boolean not null default true
);

comment on table foliadores is 'Configuración del foliador por módulo: iniciales (2 letras) que forman parte del folio.';

-- Consecutivo por módulo y año (se reinicia cada año).
create table if not exists folios_consecutivos (
  modulo  text not null,
  anio    int  not null,
  ultimo  int  not null default 0,
  primary key (modulo, anio)
);

comment on table folios_consecutivos is 'Último consecutivo asignado por módulo y año. El foliador reinicia en 1 cada año.';

-- Semilla de módulos con folio (iniciales por defecto).
insert into foliadores (modulo, nombre, iniciales) values
  ('casos',            'Casos / Incidentes',   'CA'),
  ('ordenes',          'Citatorios y Órdenes', 'OR'),
  ('evidencias',       'Bienes y Evidencias',  'EV'),
  ('asuntos_internos', 'Asuntos Internos',     'AI'),
  ('llamadas_cad',     'CAD / Despacho',       'CD'),
  ('barandilla',       'Barandilla',           'BA')
on conflict (modulo) do nothing;

-- ---------------------------------------------------------------------
-- Función que entrega el siguiente folio de un módulo (atómica).
-- security definer: escribe folios_consecutivos saltando la RLS.
-- ---------------------------------------------------------------------
create or replace function rpc_siguiente_folio(p_modulo text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_anio  int := extract(year from now())::int;
  v_ini   text;
  v_next  int;
begin
  select iniciales into v_ini from foliadores where modulo = p_modulo and activo;
  if v_ini is null then
    raise exception 'No hay foliador configurado (o está inactivo) para el módulo %', p_modulo;
  end if;

  insert into folios_consecutivos (modulo, anio, ultimo)
  values (p_modulo, v_anio, 1)
  on conflict (modulo, anio)
  do update set ultimo = folios_consecutivos.ultimo + 1
  returning ultimo into v_next;

  return v_anio::text || upper(v_ini) || lpad(v_next::text, 6, '0');
end;
$$;

-- ---------------------------------------------------------------------
-- Trigger BEFORE INSERT: si no se envió folio, lo asigna el foliador.
-- Usa el nombre de la tabla como clave de módulo.
-- ---------------------------------------------------------------------
create or replace function fn_asignar_folio()
returns trigger
language plpgsql
as $$
begin
  if new.folio is null or new.folio = '' then
    new.folio := rpc_siguiente_folio(tg_table_name);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_folio_casos on casos;
create trigger trg_folio_casos before insert on casos
  for each row execute function fn_asignar_folio();

drop trigger if exists trg_folio_ordenes on ordenes;
create trigger trg_folio_ordenes before insert on ordenes
  for each row execute function fn_asignar_folio();

drop trigger if exists trg_folio_evidencias on evidencias;
create trigger trg_folio_evidencias before insert on evidencias
  for each row execute function fn_asignar_folio();

drop trigger if exists trg_folio_asuntos_internos on asuntos_internos;
create trigger trg_folio_asuntos_internos before insert on asuntos_internos
  for each row execute function fn_asignar_folio();

drop trigger if exists trg_folio_llamadas_cad on llamadas_cad;
create trigger trg_folio_llamadas_cad before insert on llamadas_cad
  for each row execute function fn_asignar_folio();

drop trigger if exists trg_folio_barandilla on barandilla;
create trigger trg_folio_barandilla before insert on barandilla
  for each row execute function fn_asignar_folio();

-- ---------------------------------------------------------------------
-- RLS: la administración del foliador es solo para administrador.
-- (rpc_siguiente_folio es security definer, así que el alta de registros
--  funciona para cualquier usuario aunque no pueda leer estas tablas.)
-- ---------------------------------------------------------------------
alter table foliadores enable row level security;
alter table folios_consecutivos enable row level security;

drop policy if exists sel_foliadores on foliadores;
create policy sel_foliadores on foliadores for select to authenticated
  using (fn_rol_actual() = 'administrador');
drop policy if exists upd_foliadores on foliadores;
create policy upd_foliadores on foliadores for update to authenticated
  using (fn_rol_actual() = 'administrador') with check (fn_rol_actual() = 'administrador');
drop policy if exists ins_foliadores on foliadores;
create policy ins_foliadores on foliadores for insert to authenticated
  with check (fn_rol_actual() = 'administrador');

drop policy if exists sel_folios_consecutivos on folios_consecutivos;
create policy sel_folios_consecutivos on folios_consecutivos for select to authenticated
  using (fn_rol_actual() = 'administrador');
drop policy if exists upd_folios_consecutivos on folios_consecutivos;
create policy upd_folios_consecutivos on folios_consecutivos for update to authenticated
  using (fn_rol_actual() = 'administrador') with check (fn_rol_actual() = 'administrador');


-- ########################################################################
-- ###  0013_equipo.sql
-- ########################################################################

-- =====================================================================
-- 0013_equipo.sql
-- Módulo de Equipo policial (Fase 7 del roadmap).
--
-- Inventario del equipo de la agencia: armas, radios de comunicación,
-- bodycams, patrullas, motocicletas, etc. (diferenciado por `tipo`).
-- Cada pieza puede asignarse a un elemento de personal y lleva folio
-- automático (foliador, iniciales EQ), fotos y seguimiento de estado.
--
-- Requiere 0012 (foliador). Se registra el módulo en el catálogo de
-- foliadores y se le adjunta el trigger de folio.
-- =====================================================================

create table if not exists equipo (
  id                    uuid primary key default gen_random_uuid(),
  folio                 text,
  tipo                  text,             -- arma, radio, bodycam, patrulla, motocicleta, etc.
  marca                 text,
  modelo                text,
  numero_serie          text,
  asignado_personal_id  uuid references personal(id),   -- a quién está asignado (opcional)
  estado_equipo         text not null default 'operativo'
                          check (estado_equipo in ('operativo','asignado','en_reparacion','baja')),
  fecha_alta            date,
  fotografias           jsonb default '[]'::jsonb,
  datos_adicionales     jsonb default '{}'::jsonb,

  estatus               text not null default 'activo' check (estatus in ('activo','cancelado')),
  cancelado_en          timestamptz,
  motivo_cancelacion    text,

  creado_en             timestamptz not null default now(),
  actualizado_en        timestamptz not null default now()
);

comment on table equipo is 'Inventario de equipo policial (armas, radios, bodycams, patrullas, motos). Asignable a personal; folio automático.';

create index if not exists idx_equipo_tipo on equipo (tipo);
create index if not exists idx_equipo_estado on equipo (estado_equipo);
create index if not exists idx_equipo_asignado on equipo (asignado_personal_id);

create or replace view equipo_activo as
  select * from equipo where estatus = 'activo';

-- Política "cancelar, nunca borrar" + bitácora
drop trigger if exists trg_no_delete_equipo on equipo;
create trigger trg_no_delete_equipo before delete on equipo
  for each row execute function fn_bloquear_delete();

revoke delete on equipo from authenticated, anon;

drop trigger if exists trg_auditoria_equipo on equipo;
create trigger trg_auditoria_equipo after insert or update on equipo
  for each row execute function fn_bitacora_generica();

-- Foliador para equipo (iniciales EQ) + trigger de folio.
insert into foliadores (modulo, nombre, iniciales) values
  ('equipo', 'Equipo policial', 'EQ')
on conflict (modulo) do nothing;

drop trigger if exists trg_folio_equipo on equipo;
create trigger trg_folio_equipo before insert on equipo
  for each row execute function fn_asignar_folio();

-- Ampliar rpc_cancelar_registro con 'equipo' (conservando el guard de AI).
create or replace function rpc_cancelar_registro(
  p_tabla   text,
  p_id      uuid,
  p_motivo  text
) returns void as $$
begin
  if p_tabla not in ('personas','vehiculos','ubicaciones','vinculos','casos','personal',
                     'ordenes','evidencias','asuntos_internos','llamadas_cad','despachos',
                     'barandilla','equipo') then
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

-- RLS (patrón estándar)
alter table equipo enable row level security;

drop policy if exists sel_equipo on equipo;
create policy sel_equipo on equipo for select to authenticated
  using (estatus = 'activo' or fn_rol_actual() in ('supervisor','investigador','administrador'));
drop policy if exists ins_equipo on equipo;
create policy ins_equipo on equipo for insert to authenticated with check (true);
drop policy if exists upd_equipo on equipo;
create policy upd_equipo on equipo for update to authenticated using (true) with check (true);


-- ########################################################################
-- ###  0014_admin_usuarios.sql
-- ########################################################################

-- =====================================================================
-- 0014_admin_usuarios.sql
-- Administración de usuarios y roles (cierra un pendiente de la Fase 0).
--
-- El correo del usuario vive en auth.users (esquema no expuesto por
-- PostgREST). Se exponen dos RPC security definer, ambas restringidas al rol
-- 'administrador', para listar y actualizar usuarios desde el frontend sin
-- dar acceso directo al esquema auth ni al service_role.
-- =====================================================================

-- Lista de usuarios (id, correo, nombre, rol, activo) — solo administrador.
create or replace function rpc_listar_usuarios()
returns table (
  id        uuid,
  email     text,
  nombre    text,
  rol       text,
  activo    boolean,
  creado_en timestamptz
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if coalesce(fn_rol_actual(), '') <> 'administrador' then
    raise exception 'Solo el administrador puede listar usuarios.';
  end if;

  return query
    select u.id, u.email::text, p.nombre, p.rol, p.activo, p.creado_en
    from auth.users u
    join usuarios_perfil p on p.id = u.id
    order by p.creado_en;
end;
$$;

-- Actualiza nombre/rol/activo de un usuario — solo administrador.
-- Guard anti-autobloqueo: un admin no puede quitarse su propio rol de
-- administrador ni desactivarse a sí mismo.
create or replace function rpc_admin_actualizar_usuario(
  p_user   uuid,
  p_nombre text,
  p_rol    text,
  p_activo boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(fn_rol_actual(), '') <> 'administrador' then
    raise exception 'Solo el administrador puede modificar usuarios.';
  end if;

  if p_rol not in ('oficial','supervisor','investigador','administrador','asuntos_internos') then
    raise exception 'Rol no válido: %', p_rol;
  end if;

  if p_user = auth.uid() and (p_rol <> 'administrador' or p_activo = false) then
    raise exception 'No puedes quitarte tu propio acceso de administrador.';
  end if;

  update usuarios_perfil
     set nombre = p_nombre, rol = p_rol, activo = p_activo
   where id = p_user;
end;
$$;


-- ########################################################################
-- ###  0015_incidentes.sql
-- ########################################################################

-- =====================================================================
-- 0015_incidentes.sql
-- Módulo de Incidentes (informe de incidente) + Novedades, y alineación de
-- los estados de despacho al flujo del policía en la app móvil.
--
-- Flujo: una llamada llega a CAD → se despacha una unidad → el policía, desde
-- el móvil, cambia el estado del despacho (Enterado → En Ruta → En el Lugar →
-- Cerrado), reporta novedades y, en ciertos tipos (robo, etc.), levanta un
-- INFORME DE INCIDENTE. El informe se registra/consulta también desde la web.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Estados de despacho alineados al flujo movil del policía.
-- ---------------------------------------------------------------------
alter table despachos drop constraint if exists despachos_estado_check;
update despachos set estado = 'en_lugar' where estado = 'en_sitio';
update despachos set estado = 'cerrado'  where estado = 'liberada';
alter table despachos
  alter column estado set default 'asignada';
alter table despachos add constraint despachos_estado_check
  check (estado in ('asignada','enterado','en_ruta','en_lugar','cerrado'));

-- ---------------------------------------------------------------------
-- 2) INCIDENTES (informe de incidente)
-- ---------------------------------------------------------------------
create table if not exists incidentes (
  id                    uuid primary key default gen_random_uuid(),
  folio                 text,
  llamada_cad_id        uuid references llamadas_cad(id),   -- reporte de CAD que origina el informe
  tipo                  text,
  narrativa             text,
  oficial_personal_id   uuid references personal(id),       -- policía que reporta
  direccion             text,
  latitud               double precision,
  longitud              double precision,
  estado                text not null default 'abierto'
                          check (estado in ('abierto','en_proceso','cerrado')),
  fecha_incidente       timestamptz not null default now(),
  fotografias           jsonb default '[]'::jsonb,
  datos_adicionales     jsonb default '{}'::jsonb,

  estatus               text not null default 'activo' check (estatus in ('activo','cancelado')),
  cancelado_en          timestamptz,
  motivo_cancelacion    text,

  creado_en             timestamptz not null default now(),
  actualizado_en        timestamptz not null default now()
);

comment on table incidentes is 'Informe de incidente levantado por el policía a partir de un reporte de CAD (o directo). Se llena/consulta en web y móvil.';

create index if not exists idx_incidentes_llamada on incidentes (llamada_cad_id);
create index if not exists idx_incidentes_estado on incidentes (estado);

create or replace view incidentes_activos as
  select * from incidentes where estatus = 'activo';

drop trigger if exists trg_no_delete_incidentes on incidentes;
create trigger trg_no_delete_incidentes before delete on incidentes
  for each row execute function fn_bloquear_delete();

revoke delete on incidentes from authenticated, anon;

drop trigger if exists trg_auditoria_incidentes on incidentes;
create trigger trg_auditoria_incidentes after insert or update on incidentes
  for each row execute function fn_bitacora_generica();

-- Foliador para incidentes (iniciales IN) + trigger de folio.
insert into foliadores (modulo, nombre, iniciales) values
  ('incidentes', 'Informes de Incidente', 'IN')
on conflict (modulo) do nothing;

drop trigger if exists trg_folio_incidentes on incidentes;
create trigger trg_folio_incidentes before insert on incidentes
  for each row execute function fn_asignar_folio();

-- ---------------------------------------------------------------------
-- 3) NOVEDADES (append-only): actualizaciones del policía sobre un incidente.
-- ---------------------------------------------------------------------
create table if not exists novedades (
  id            bigint generated always as identity primary key,
  incidente_id  uuid not null references incidentes(id),
  texto         text not null,
  reportado_por text,
  fecha         timestamptz not null default now(),
  creado_en     timestamptz not null default now()
);

comment on table novedades is 'Novedades (bitácora append-only) reportadas por el policía sobre un incidente.';

create index if not exists idx_novedades_incidente on novedades (incidente_id, fecha);

create or replace function fn_bloquear_cambios_append_only()
returns trigger as $$
begin
  raise exception 'Registro de solo escritura (append-only): no se puede modificar ni borrar (operación %).', tg_op;
end;
$$ language plpgsql;

drop trigger if exists trg_novedades_worm on novedades;
create trigger trg_novedades_worm before update or delete on novedades
  for each row execute function fn_bloquear_cambios_append_only();

revoke update, delete on novedades from authenticated, anon;

-- ---------------------------------------------------------------------
-- 4) Ampliar rpc_cancelar_registro con 'incidentes'.
-- ---------------------------------------------------------------------
create or replace function rpc_cancelar_registro(
  p_tabla   text,
  p_id      uuid,
  p_motivo  text
) returns void as $$
begin
  if p_tabla not in ('personas','vehiculos','ubicaciones','vinculos','casos','personal',
                     'ordenes','evidencias','asuntos_internos','llamadas_cad','despachos',
                     'barandilla','equipo','incidentes') then
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

-- ---------------------------------------------------------------------
-- 5) RLS
-- ---------------------------------------------------------------------
alter table incidentes enable row level security;

drop policy if exists sel_incidentes on incidentes;
create policy sel_incidentes on incidentes for select to authenticated
  using (estatus = 'activo' or fn_rol_actual() in ('supervisor','investigador','administrador'));
drop policy if exists ins_incidentes on incidentes;
create policy ins_incidentes on incidentes for insert to authenticated with check (true);
drop policy if exists upd_incidentes on incidentes;
create policy upd_incidentes on incidentes for update to authenticated using (true) with check (true);

alter table novedades enable row level security;

drop policy if exists sel_novedades on novedades;
create policy sel_novedades on novedades for select to authenticated using (true);
drop policy if exists ins_novedades on novedades;
create policy ins_novedades on novedades for insert to authenticated with check (true);


-- ########################################################################
-- ###  0016_catalogos.sql
-- ########################################################################

-- 0016_catalogos.sql
-- Catalogos del sistema: incidentes 9-1-1 y municipios de Mexico.
-- Reference data (solo lectura para autenticados). Generado desde los xlsx.

create table if not exists cat_incidentes_911 (codigo text primary key, incidente text not null, prioridad text, tipo text, subtipo text);
create index if not exists idx_cat_inc911_tipo on cat_incidentes_911 (tipo, subtipo);
create table if not exists cat_municipios (estado_id int not null, municipio_id int not null, municipio text not null, estado text not null, pais text default 'MEXICO', primary key (estado_id, municipio_id));
create index if not exists idx_cat_muni_estado on cat_municipios (estado);
alter table cat_incidentes_911 enable row level security;
alter table cat_municipios enable row level security;
drop policy if exists sel_cat_inc911 on cat_incidentes_911;
create policy sel_cat_inc911 on cat_incidentes_911 for select to authenticated using (true);
drop policy if exists sel_cat_muni on cat_municipios;
create policy sel_cat_muni on cat_municipios for select to authenticated using (true);

insert into cat_incidentes_911 (codigo, incidente, prioridad, tipo, subtipo) values
('10101','ACCIDENTE ACUATICO CON LESIONADOS','ALTA','MEDICOS','ACCIDENTES'),
('10102','ACCIDENTE DE AERONAVE CON LESIONADOS','ALTA','MEDICOS','ACCIDENTES'),
('10103','ACCIDENTE DE MOTOCICLETA CON LESIONADOS','ALTA','MEDICOS','ACCIDENTES'),
('10104','ACCIDENTE DE VEHICULO AUTOMOTOR CON LESIONADOS','ALTA','MEDICOS','ACCIDENTES'),
('10105','ACCIDENTE FERROVIARIO CON LESIONADOS','ALTA','MEDICOS','ACCIDENTES'),
('10106','ACCIDENTE FERROVIARIO CON FALLECIDO','ALTA','MEDICOS','ACCIDENTES'),
('10107','ACCIDENTE MULTIPLE CON LESIONADOS','ALTA','MEDICOS','ACCIDENTES'),
('10108','ACCIDENTE MULTIPLE CON FALLECIDO','ALTA','MEDICOS','ACCIDENTES'),
('10109','ACCIDENTE DE VEHICULO DE PASAJEROS CON LESIONADOS','ALTA','MEDICOS','ACCIDENTES'),
('10110','ACCIDENTE DE VEHICULO DE PASAJEROS CON FALLECIDO','ALTA','MEDICOS','ACCIDENTES'),
('10111','ACCIDENTE DE MOTOCICLETA CON FALLECIDO','ALTA','MEDICOS','ACCIDENTES'),
('10112','ACCIDENTE DE VEHICULO AUTOMOTOR CON FALLECIDO','ALTA','MEDICOS','ACCIDENTES'),
('10113','ACCIDENTE DE AERONAVE CON FALLECIDO','ALTA','MEDICOS','ACCIDENTES'),
('10114','ACCIDENTE DE EMBARCACIONES CON LESIONADOS','ALTA','MEDICOS','ACCIDENTES'),
('10115','ACCIDENTE DE EMBARCACIONES CON FALLECIDO','ALTA','MEDICOS','ACCIDENTES'),
('10116','ATROPELLAMIENTO','ALTA','MEDICOS','TRAUMATICOS'),
('10117','ACCIDENTE ACUATICO CON FALLECIDO','ALTA','MEDICOS','TRAUMATICOS'),
('10118','ACCIDENTES CON MATERIALES PELIGROSOS','ALTA','MEDICOS','TRAUMATICOS'),
('10119','ACCIDENTES CON MATERIALES RADIOACTIVOS','ALTA','MEDICOS','TRAUMATICOS'),
('10120','ACCIDENTES CON RIESGO BIOLOGICO INFECTO-CONTAGIOSO','ALTA','MEDICOS','TRAUMATICOS'),
('10121','OTROS ACCIDENTES CON LESIONADOS','ALTA','MEDICOS','TRAUMATICOS'),
('10201','AHOGAMIENTO','ALTA','MEDICOS','TRAUMATICOS'),
('10202','AMPUTACION','ALTA','MEDICOS','TRAUMATICOS'),
('10203','ASFIXIA','ALTA','MEDICOS','TRAUMATICOS'),
('10204','CAIDA','ALTA','MEDICOS','TRAUMATICOS'),
('10205','ELECTROCUTADO/LESION POR CORRIENTE ELECTRICA','ALTA','MEDICOS','TRAUMATICOS'),
('10206','FRACTURADO/TRAUMATISMO DE EXTREMIDADES','ALTA','MEDICOS','TRAUMATICOS'),
('10207','HEMORRAGIA','ALTA','MEDICOS','TRAUMATICOS'),
('10208','LESIONADO POR ARMA BLANCA','ALTA','MEDICOS','TRAUMATICOS'),
('10209','LESIONADO POR PROYECTIL DE ARMA DE FUEGO','ALTA','MEDICOS','TRAUMATICOS'),
('10210','MORDEDURA DE ANIMAL','ALTA','MEDICOS','TRAUMATICOS'),
('10211','QUEMADURAS','ALTA','MEDICOS','TRAUMATICOS'),
('10212','TRAUMATISMOS MULTIPLES','ALTA','MEDICOS','TRAUMATICOS'),
('10213','TRAUMATISMO DE CRANEO','ALTA','MEDICOS','TRAUMATICOS'),
('10214','TRAUMATISMO DE TORAX (PECHO Y/O ESPALDA)','ALTA','MEDICOS','TRAUMATICOS'),
('10215','TRAUMATISMO ABDOMINAL','ALTA','MEDICOS','TRAUMATICOS'),
('10216','TRAUMATISMO GENITAL Y/O URINARIO','ALTA','MEDICOS','TRAUMATICOS'),
('10217','CONGELAMIENTO/LESIONADO POR CONDICIONES AMBIENTALES','ALTA','MEDICOS','TRAUMATICOS'),
('10301','TRABAJO DE PARTO','ALTA','MEDICOS','CLINICOS'),
('10302','AMENAZA DE ABORTO','ALTA','MEDICOS','CLINICOS'),
('10303','URGENCIA EN PACIENTE EMBARAZADA','ALTA','MEDICOS','CLINICOS'),
('10304','INFARTO CEREBRAL','ALTA','MEDICOS','CLINICOS'),
('10305','DIFICULTAD RESPIRATORIA/URGENCIA RESPIRATORIA','ALTA','MEDICOS','CLINICOS'),
('10306','INTOXICACION ETILICA','ALTA','MEDICOS','CLINICOS'),
('10307','CONVULSIONES','ALTA','MEDICOS','CLINICOS'),
('10308','PERSONA INCONSCIENTE/URGENCIA NEUROLOGICA','ALTA','MEDICOS','CLINICOS'),
('10309','ENVENENAMIENTO POR ANIMAL DE PONZOÃ‘A','ALTA','MEDICOS','CLINICOS'),
('10310','URGENCIA POR ENFERMEDAD GENERAL','ALTA','MEDICOS','CLINICOS'),
('10311','DOLOR ABDOMINAL/URGENCIA ABDOMINAL','ALTA','MEDICOS','CLINICOS'),
('10312','DESCOMPENSACION DE LA DIABETES/DESHIDRATACION','ALTA','MEDICOS','CLINICOS'),
('10313','PARO CARDIORRESPIRATORIO','ALTA','MEDICOS','CLINICOS'),
('10314','INFARTO/URGENCIA CARDIOLOGICA','ALTA','MEDICOS','CLINICOS'),
('10315','INTOXICACION/SOBREDOSIS/ENVENENAMIENTO POR SUSTANCIAS','ALTA','MEDICOS','CLINICOS'),
('10316','OTROS INCIDENTES MEDICOS CLINICOS','ALTA','MEDICOS','CLINICOS'),
('10317','FALLECIDO DE CAUSA NATURAL','BAJA','MEDICOS','CLINICOS'),
('10318','PERSONA EN CRISIS POR TRASTORNO MENTAL','MEDIA','MEDICOS','CLINICOS'),
('10319','EPIDEMIAS','ALTA','MEDICOS','CLINICOS'),
('20101','ACCIDENTE FERROVIARIO SIN LESIONADOS','MEDIA','PROTECCION CIVIL','AUXILIOS'),
('20102','ALMACENAMIENTO DE SUSTANCIAS PELIGROSAS','ALTA','PROTECCION CIVIL','AUXILIOS'),
('20103','ANIMAL PELIGROSO','ALTA','PROTECCION CIVIL','AUXILIOS'),
('20104','ANIMALES SUELTOS','MEDIA','PROTECCION CIVIL','AUXILIOS'),
('20105','FUGAS Y DERRAMES EN ESCUELA','ALTA','PROTECCION CIVIL','AUXILIOS'),
('20106','ENCHARCAMIENTO/ DESBORDAMIENTO DE RIO','ALTA','PROTECCION CIVIL','AUXILIOS'),
('20107','EXPLOSION','ALTA','PROTECCION CIVIL','AUXILIOS'),
('20108','FUGAS Y DERRAMES DE SUSTANCIAS QUIMICAS','ALTA','PROTECCION CIVIL','AUXILIOS'),
('20109','HUNDIMIENTOS / AGRIETAMIENTOS/ INESTABILIDAD DE LADERA','ALTA','PROTECCION CIVIL','AUXILIOS'),
('20110','GASES TOXICOS','MEDIA','PROTECCION CIVIL','AUXILIOS'),
('20111','OLORES FETIDOS','MEDIA','PROTECCION CIVIL','AUXILIOS'),
('20112','MATERIALES PELIGROSOS O RADIOACTIVOS (EXPOSICION)','ALTA','PROTECCION CIVIL','AUXILIOS'),
('20113','CAIDA DE ANUNCIO O ESPECTACULAR','MEDIA','PROTECCION CIVIL','AUXILIOS'),
('20114','TRANSPORTE DE SUSTANCIAS PELIGROSAS','ALTA','PROTECCION CIVIL','AUXILIOS'),
('20201','CONTAMINACION DE SUELO, AIRE Y AGUA','ALTA','PROTECCION CIVIL','MEDIO AMBIENTE'),
('20202','DERRUMBES','ALTA','PROTECCION CIVIL','MEDIO AMBIENTE'),
('20203','ENJAMBRE DE ABEJAS','MEDIA','PROTECCION CIVIL','MEDIO AMBIENTE'),
('20204','ERUPCION O EMISIONES VOLCANICAS','ALTA','PROTECCION CIVIL','MEDIO AMBIENTE'),
('20205','FRENTES FRIOS, TEMPERATURAS, NEVADAS Y HELADAS','ALTA','PROTECCION CIVIL','MEDIO AMBIENTE'),
('20206','HURACANES','ALTA','PROTECCION CIVIL','MEDIO AMBIENTE'),
('20207','INUNDACIONES','ALTA','PROTECCION CIVIL','MEDIO AMBIENTE'),
('20208','PLAGAS','MEDIA','PROTECCION CIVIL','MEDIO AMBIENTE'),
('20209','SISMO','ALTA','PROTECCION CIVIL','MEDIO AMBIENTE'),
('20210','ARBOL CAIDO O POR CAER','ALTA','PROTECCION CIVIL','MEDIO AMBIENTE'),
('20211','TORMENTAS DE GRANIZO/DE NIEVE','ALTA','PROTECCION CIVIL','MEDIO AMBIENTE'),
('20212','TORNADOS','ALTA','PROTECCION CIVIL','MEDIO AMBIENTE'),
('20213','TSUNAMI','MEDIA','PROTECCION CIVIL','MEDIO AMBIENTE'),
('20214','VIENTO/TORMENTA DE POLVO','MEDIA','PROTECCION CIVIL','MEDIO AMBIENTE'),
('20301','INCENDIO DE CASA HABITACION','ALTA','PROTECCION CIVIL','INCENDIO'),
('20302','INCENDIO EN ESCUELA','ALTA','PROTECCION CIVIL','INCENDIO'),
('20303','INCENDIO DE VEHICULO','ALTA','PROTECCION CIVIL','INCENDIO'),
('20304','INCENDIO DE COMERCIO','ALTA','PROTECCION CIVIL','INCENDIO'),
('20305','INCENDIO DE EDIFICIO','ALTA','PROTECCION CIVIL','INCENDIO'),
('20306','INCENDIO A BORDO DE EMBARCACION','ALTA','PROTECCION CIVIL','INCENDIO'),
('20307','INCENDIO FORESTAL','ALTA','PROTECCION CIVIL','INCENDIO'),
('20308','QUEMA URBANA','ALTA','PROTECCION CIVIL','INCENDIO'),
('20309','QUEMA AGROPECUARIA','ALTA','PROTECCION CIVIL','INCENDIO'),
('20310','INCENDIO DE FABRICA O INDUSTRIA','ALTA','PROTECCION CIVIL','INCENDIO'),
('20311','OTROS INCENDIOS','ALTA','PROTECCION CIVIL','INCENDIO'),
('20401','NAUFRAGIO/HUNDIMIENTO/VARADURA DE EMBARCACION','ALTA','PROTECCION CIVIL','RESCATE'),
('20402','PERSONA ATRAPADA','ALTA','PROTECCION CIVIL','RESCATE'),
('20403','RESCATE ANIMAL','MEDIA','PROTECCION CIVIL','RESCATE'),
('20404','OTROS RESCATES','MEDIA','PROTECCION CIVIL','RESCATE'),
('30101','VEHICULO ABANDONADO','MEDIA','SEGURIDAD','ABANDONO'),
('30102','OBJETO SOSPECHOSO O PELIGROSO','MEDIA','SEGURIDAD','ABANDONO'),
('30103','PERSONA TIRADA EN VIA PUBLICA','MEDIA','SEGURIDAD','ABANDONO'),
('30201','DETONACION DE EXPLOSIVOS','ALTA','SEGURIDAD','ACTOS RELACIONADOS CON ARMAS/EXPLOSIVOS'),
('30202','DETONACION DE ARMA DE FUEGO','ALTA','SEGURIDAD','ACTOS RELACIONADOS CON ARMAS/EXPLOSIVOS'),
('30203','PERSONA ARMADA EN ESCUELA','ALTA','SEGURIDAD','ACTOS RELACIONADOS CON ARMAS/EXPLOSIVOS'),
('30204','PORTACION DE ARMAS O CARTUCHOS','MEDIA','SEGURIDAD','ACTOS RELACIONADOS CON ARMAS/EXPLOSIVOS'),
('30205','DETONACION DE COHETES O FUEGOS ARTIFICIALES','MEDIA','SEGURIDAD','ACTOS RELACIONADOS CON ARMAS/EXPLOSIVOS'),
('30206','DETONACION DE ARMA DE FUEGO EN ESCUELA','ALTA','SEGURIDAD','ACTOS RELACIONADOS CON ARMAS/EXPLOSIVOS'),
('30207','TRAFICO DE ARMAS','ALTA','SEGURIDAD','ACTOS RELACIONADOS CON ARMAS/EXPLOSIVOS'),
('30301','AERONAVE SOSPECHOSA','MEDIA','SEGURIDAD','ACTOS RELACIONADOS CON LAS VIAS DE COMUNICACION'),
('30302','ARRANCONES O CARRERAS DE VEHICULOS','MEDIA','SEGURIDAD','ACTOS RELACIONADOS CON LAS VIAS DE COMUNICACION'),
('30303','BLOQUEO O CORTE DE VIAS DE COMUNICACION','MEDIA','SEGURIDAD','ACTOS RELACIONADOS CON LAS VIAS DE COMUNICACION'),
('30304','CIRCULAR EN SENTIDO CONTRARIO','ALTA','SEGURIDAD','ACTOS RELACIONADOS CON LAS VIAS DE COMUNICACION'),
('30305','VEHICULO A EXCESO DE VELOCIDAD','MEDIA','SEGURIDAD','ACTOS RELACIONADOS CON LAS VIAS DE COMUNICACION'),
('30306','VEHICULO EN HUIDA','MEDIA','SEGURIDAD','ACTOS RELACIONADOS CON LAS VIAS DE COMUNICACION'),
('30307','VEHICULO SOSPECHOSO','MEDIA','SEGURIDAD','ACTOS RELACIONADOS CON LAS VIAS DE COMUNICACION'),
('30308','VEHICULO DESCOMPUESTO','MEDIA','SEGURIDAD','ACTOS RELACIONADOS CON LAS VIAS DE COMUNICACION'),
('30309','ACCIDENTE DE TRANSITO SIN LESIONADOS','ALTA','SEGURIDAD','ACTOS RELACIONADOS CON LAS VIAS DE COMUNICACION'),
('30310','OTRAS FALTAS A REGLAMENTO DE TRANSITO','BAJA','SEGURIDAD','ACTOS RELACIONADOS CON LAS VIAS DE COMUNICACION'),
('30401','OTRAS ALARMAS DE EMERGENCIAS ACTIVADAS','ALTA','SEGURIDAD','ACTOS RELACIONADOS CON EL PATRIMONIO'),
('30402','BOTON DE EMERGENCIA ACTIVADO','ALTA','SEGURIDAD','ACTOS RELACIONADOS CON EL PATRIMONIO'),
('30403','CRISTALAZO O ROBO AL INTERIOR DE VEHICULO','ALTA','SEGURIDAD','ACTOS RELACIONADOS CON EL PATRIMONIO'),
('30404','DAÃ‘O A PROPIEDAD AJENA','MEDIA','SEGURIDAD','ACTOS RELACIONADOS CON EL PATRIMONIO'),
('30405','DESPOJO','MEDIA','SEGURIDAD','ACTOS RELACIONADOS CON EL PATRIMONIO'),
('30406','EXTORSION','MEDIA','SEGURIDAD','ACTOS RELACIONADOS CON EL PATRIMONIO'),
('30407','EXTORSION TELEFONICA','MEDIA','SEGURIDAD','ACTOS RELACIONADOS CON EL PATRIMONIO'),
('30408','ACTIVACION DE ALARMA EN ESCUELA','MEDIA','SEGURIDAD','ACTOS RELACIONADOS CON EL PATRIMONIO'),
('30409','ROBO DE COMBUSTIBLE O TOMA CLANDESTINA DE DUCTOS','ALTA','SEGURIDAD','ACTOS RELACIONADOS CON EL PATRIMONIO'),
('30410','ROBO A CAJERO AUTOMATICO','MEDIA','SEGURIDAD','ACTOS RELACIONADOS CON EL PATRIMONIO'),
('30411','ROBO DE AUTOPARTES O ACCESORIOS','MEDIA','SEGURIDAD','ACTOS RELACIONADOS CON EL PATRIMONIO'),
('30412','ROBO DE GANADO','MEDIA','SEGURIDAD','ACTOS RELACIONADOS CON EL PATRIMONIO'),
('30413','ROBO A CASA HABITACION CON VIOLENCIA','ALTA','SEGURIDAD','ACTOS RELACIONADOS CON EL PATRIMONIO'),
('30414','ROBO A CASA HABITACION SIN VIOLENCIA','ALTA','SEGURIDAD','ACTOS RELACIONADOS CON EL PATRIMONIO'),
('30415','ROBO A ESCUELA CON VIOLENCIA','ALTA','SEGURIDAD','ACTOS RELACIONADOS CON EL PATRIMONIO'),
('30416','ROBO A ESCUELA SIN VIOLENCIA','MEDIA','SEGURIDAD','ACTOS RELACIONADOS CON EL PATRIMONIO'),
('30417','ROBO A GASOLINERA CON VIOLENCIA','ALTA','SEGURIDAD','ACTOS RELACIONADOS CON EL PATRIMONIO'),
('30418','ROBO A GASOLINERA SIN VIOLENCIA','MEDIA','SEGURIDAD','ACTOS RELACIONADOS CON EL PATRIMONIO'),
('30419','ROBO A NEGOCIO CON VIOLENCIA','ALTA','SEGURIDAD','ACTOS RELACIONADOS CON EL PATRIMONIO'),
('30420','ROBO A NEGOCIO SIN VIOLENCIA','MEDIA','SEGURIDAD','ACTOS RELACIONADOS CON EL PATRIMONIO'),
('30421','ROBO A TRANSEUNTE CON VIOLENCIA','ALTA','SEGURIDAD','ACTOS RELACIONADOS CON EL PATRIMONIO'),
('30422','ROBO A TRANSEUNTE SIN VIOLENCIA','MEDIA','SEGURIDAD','ACTOS RELACIONADOS CON EL PATRIMONIO'),
('30423','ROBO EN TRANSPORTE PUBLICO COLECTIVO CON VIOLENCIA','ALTA','SEGURIDAD','ACTOS RELACIONADOS CON EL PATRIMONIO'),
('30424','ROBO EN TRANSPORTE PUBLICO COLECTIVO SIN VIOLENCIA','MEDIA','SEGURIDAD','ACTOS RELACIONADOS CON EL PATRIMONIO'),
('30425','ROBO EN TRANSPORTE PUBLICO INDIVIDUAL CON VIOLENCIA','ALTA','SEGURIDAD','ACTOS RELACIONADOS CON EL PATRIMONIO'),
('30426','ROBO EN TRANSPORTE PUBLICO INDIVIDUAL SIN VIOLENCIA','MEDIA','SEGURIDAD','ACTOS RELACIONADOS CON EL PATRIMONIO'),
('30427','ROBO A TRANSPORTISTA CON VIOLENCIA','ALTA','SEGURIDAD','ACTOS RELACIONADOS CON EL PATRIMONIO'),
('30428','ROBO A TRANSPORTISTA SIN VIOLENCIA','MEDIA','SEGURIDAD','ACTOS RELACIONADOS CON EL PATRIMONIO'),
('30429','ROBO DE VEHICULO PARTICULAR CON VIOLENCIA','ALTA','SEGURIDAD','ACTOS RELACIONADOS CON EL PATRIMONIO'),
('30430','ROBO DE VEHICULO PARTICULAR SIN VIOLENCIA','MEDIA','SEGURIDAD','ACTOS RELACIONADOS CON EL PATRIMONIO'),
('30431','ROBO EN CARRETERA CON VIOLENCIA','ALTA','SEGURIDAD','ACTOS RELACIONADOS CON EL PATRIMONIO'),
('30432','ROBO EN CARRETERA SIN VIOLENCIA','ALTA','SEGURIDAD','ACTOS RELACIONADOS CON EL PATRIMONIO'),
('30433','ROBO A BANCO CON VIOLENCIA','ALTA','SEGURIDAD','ACTOS RELACIONADOS CON EL PATRIMONIO'),
('30434','ROBO A BANCO SIN VIOLENCIA','MEDIA','SEGURIDAD','ACTOS RELACIONADOS CON EL PATRIMONIO'),
('30435','ROBO A CASA DE CAMBIO CON VIOLENCIA','ALTA','SEGURIDAD','ACTOS RELACIONADOS CON EL PATRIMONIO'),
('30436','ROBO A CASA DE CAMBIO SIN VIOLENCIA','MEDIA','SEGURIDAD','ACTOS RELACIONADOS CON EL PATRIMONIO'),
('30437','ROBO A EMPRESA DE TRASLADO DE VALORES CON VIOLENCIA','ALTA','SEGURIDAD','ACTOS RELACIONADOS CON EL PATRIMONIO'),
('30438','ROBO A EMPRESA DE TRASLADO DE VALORES SIN VIOLENCIA','MEDIA','SEGURIDAD','ACTOS RELACIONADOS CON EL PATRIMONIO'),
('30439','ROBO A FERROCARRIL','ALTA','SEGURIDAD','ACTOS RELACIONADOS CON EL PATRIMONIO'),
('30440','ROBO DE PLACA','MEDIA','SEGURIDAD','ACTOS RELACIONADOS CON EL PATRIMONIO'),
('30441','ROBO A TRANSPORTE ESCOLAR CON VIOLENCIA','ALTA','SEGURIDAD','ACTOS RELACIONADOS CON EL PATRIMONIO'),
('30442','ROBO A TRANSPORTE ESCOLAR SIN VIOLENCIA','MEDIA','SEGURIDAD','ACTOS RELACIONADOS CON EL PATRIMONIO'),
('30443','ROBO A EMBARCACIONES Y PIRATERIA','MEDIA','SEGURIDAD','ACTOS RELACIONADOS CON EL PATRIMONIO'),
('30444','TRANSPORTE ILEGAL DE COMBUSTIBLE','ALTA','SEGURIDAD','ACTOS RELACIONADOS CON EL PATRIMONIO'),
('30445','ROBO DE ARTE SACRO','MEDIA','SEGURIDAD','ACTOS RELACIONADOS CON EL PATRIMONIO'),
('30446','OTROS ACTOS RELACIONADOS CON EL PATRIMONIO','MEDIA','SEGURIDAD','ACTOS RELACIONADOS CON EL PATRIMONIO'),
('30501','ABANDONO DE PERSONA','MEDIA','SEGURIDAD','ACTOS RELACIONADOS CON LA FAMILIA'),
('30502','VIOLENCIA DE PAREJA','ALTA','SEGURIDAD','ACTOS RELACIONADOS CON LA FAMILIA'),
('30503','VIOLENCIA FAMILIAR','ALTA','SEGURIDAD','ACTOS RELACIONADOS CON LA FAMILIA'),
('30504','OTROS ACTOS RELACIONADOS CON LA FAMILIA','ALTA','SEGURIDAD','ACTOS RELACIONADOS CON LA FAMILIA'),
('30505','MALTRATO INFANTIL','ALTA','SEGURIDAD','ACTOS RELACIONADOS CON LA FAMILIA'),
('30601','MENOR EXTRAVIADO','ALTA','SEGURIDAD','ACTOS RELACIONADOS CON LA LIBERTAD PERSONAL'),
('30602','PERSONA NO LOCALIZADA','ALTA','SEGURIDAD','ACTOS RELACIONADOS CON LA LIBERTAD PERSONAL'),
('30603','PRIVACION DE LA LIBERTAD','ALTA','SEGURIDAD','ACTOS RELACIONADOS CON LA LIBERTAD PERSONAL'),
('30604','REHENES','ALTA','SEGURIDAD','ACTOS RELACIONADOS CON LA LIBERTAD PERSONAL'),
('30605','ROBO DE INFANTE','ALTA','SEGURIDAD','ACTOS RELACIONADOS CON LA LIBERTAD PERSONAL'),
('30606','PERSONA DETENIDA','ALTA','SEGURIDAD','ACTOS RELACIONADOS CON LA LIBERTAD PERSONAL'),
('30607','SUSTRACCION DE MENORES','ALTA','SEGURIDAD','ACTOS RELACIONADOS CON LA LIBERTAD PERSONAL'),
('30608','TRAFICO DE MENORES','ALTA','SEGURIDAD','ACTOS RELACIONADOS CON LA LIBERTAD PERSONAL'),
('30609','OTROS ACTOS RELACIONADOS CON LA LIBERTAD PERSONAL','ALTA','SEGURIDAD','ACTOS RELACIONADOS CON LA LIBERTAD PERSONAL'),
('30610','TENTATIVA DE PRIVACION DE LA LIBERTAD','MEDIA','SEGURIDAD','ACTOS RELACIONADOS CON LA LIBERTAD PERSONAL'),
('30611','NOTIFICACION DE CIBER INCIDENTE','MEDIA','SEGURIDAD','ACTOS RELACIONADOS CON LA LIBERTAD PERSONAL'),
('30701','ABUSO SEXUAL','ALTA','SEGURIDAD','ACTOS RELACIONADOS CON LA LIBERTAD Y SEGURIDAD SEXUAL'),
('30702','ACOSO U HOSTIGAMIENTO SEXUAL','MEDIA','SEGURIDAD','ACTOS RELACIONADOS CON LA LIBERTAD Y SEGURIDAD SEXUAL'),
('30703','ATAQUES AL PUDOR','MEDIA','SEGURIDAD','ACTOS RELACIONADOS CON LA LIBERTAD Y SEGURIDAD SEXUAL'),
('30704','ESTUPRO','ALTA','SEGURIDAD','ACTOS RELACIONADOS CON LA LIBERTAD Y SEGURIDAD SEXUAL'),
('30705','EXPLOTACION DE MENORES','ALTA','SEGURIDAD','ACTOS RELACIONADOS CON LA LIBERTAD Y SEGURIDAD SEXUAL'),
('30706','TRATA DE MENORES','ALTA','SEGURIDAD','ACTOS RELACIONADOS CON LA LIBERTAD Y SEGURIDAD SEXUAL'),
('30707','VIOLACION','ALTA','SEGURIDAD','ACTOS RELACIONADOS CON LA LIBERTAD Y SEGURIDAD SEXUAL'),
('30708','OTROS ACTOS RELACIONADOS CON LA LIBERTAD Y LA SEXUALIDAD','ALTA','SEGURIDAD','ACTOS RELACIONADOS CON LA LIBERTAD Y SEGURIDAD SEXUAL'),
('30709','TRATA DE PERSONAS','ALTA','SEGURIDAD','ACTOS RELACIONADOS CON LA LIBERTAD Y SEGURIDAD SEXUAL'),
('30710','TRAFICO DE PERSONAS/INDOCUMENTADAS','ALTA','SEGURIDAD','ACTOS RELACIONADOS CON LA LIBERTAD Y SEGURIDAD SEXUAL'),
('30711','CORRUPCION DE MENORES','ALTA','SEGURIDAD','ACTOS RELACIONADOS CON LA LIBERTAD Y SEGURIDAD SEXUAL'),
('30801','ACTOS DE COMERCIALIZACION ILEGAL DE SANGRE, ORGANOS Y TEJIDOS HUMANOS','ALTA','SEGURIDAD','ACTOS RELACIONADOS CON LA SEGURIDAD COLECTIVA'),
('30802','ASOCIACION DELICTUOSA O PANDILLERISMO','MEDIA','SEGURIDAD','ACTOS RELACIONADOS CON LA SEGURIDAD COLECTIVA'),
('30803','ENFRENTAMIENTO DE GRUPOS ARMADOS','ALTA','SEGURIDAD','ACTOS RELACIONADOS CON LA SEGURIDAD COLECTIVA'),
('30804','TERRORISMO O ATENTADO','ALTA','SEGURIDAD','ACTOS RELACIONADOS CON LA SEGURIDAD COLECTIVA'),
('30805','AMENAZA DE BOMBA','ALTA','SEGURIDAD','ACTOS RELACIONADOS CON LA SEGURIDAD COLECTIVA'),
('30806','OTROS ACTOS RELACIONADOS CON LA SEGURIDAD COLECTIVA','ALTA','SEGURIDAD','ACTOS RELACIONADOS CON LA SEGURIDAD COLECTIVA'),
('30807','MOTIN','ALTA','SEGURIDAD','ACTOS RELACIONADOS CON LA SEGURIDAD COLECTIVA'),
('30808','VENTA CLANDESTINA DE PIROTECNIA, COHETES O FUEGOS ARTIFICIALES','MEDIA','SEGURIDAD','ACTOS RELACIONADOS CON LA SEGURIDAD COLECTIVA'),
('30809','VENTA ILEGAL DE COMBUSTIBLE','ALTA','SEGURIDAD','ACTOS RELACIONADOS CON LA SEGURIDAD COLECTIVA'),
('30810','AMENAZA DE BOMBA EN ESCUELA','ALTA','SEGURIDAD','ACTOS RELACIONADOS CON LA SEGURIDAD COLECTIVA'),
('30901','OTROS ACTOS RELACIONADOS CON LA VIDA Y LA INTEGRIDAD PERSONAL','ALTA','SEGURIDAD','ACTOS RELACIONADOS CON LA VIDA Y LA INTEGRIDAD PERSONAL'),
('30902','ACCIDENTE DE TRANSITO CON MUERTOS','ALTA','SEGURIDAD','ACTOS RELACIONADOS CON LA VIDA Y LA INTEGRIDAD PERSONAL'),
('30903','VIOLENCIA CONTRA LA MUJER','ALTA','SEGURIDAD','ACTOS RELACIONADOS CON LA VIDA Y LA INTEGRIDAD PERSONAL'),
('30904','PERSONA SOSPECHOSA','MEDIA','SEGURIDAD','ACTOS RELACIONADOS CON LA VIDA Y LA INTEGRIDAD PERSONAL'),
('30905','AMENAZA DE SUICIDIO','ALTA','SEGURIDAD','ACTOS RELACIONADOS CON LA VIDA Y LA INTEGRIDAD PERSONAL'),
('30906','HOMICIDIO','ALTA','SEGURIDAD','ACTOS RELACIONADOS CON LA VIDA Y LA INTEGRIDAD PERSONAL'),
('30907','PERSONA AGRESIVA','ALTA','SEGURIDAD','ACTOS RELACIONADOS CON LA VIDA Y LA INTEGRIDAD PERSONAL'),
('30908','SUICIDIO','ALTA','SEGURIDAD','ACTOS RELACIONADOS CON LA VIDA Y LA INTEGRIDAD PERSONAL'),
('30909','AGRESION FISICA EN PANDILLA','ALTA','SEGURIDAD','ACTOS RELACIONADOS CON LA VIDA Y LA INTEGRIDAD PERSONAL'),
('31001','ALLANAMIENTO DE MORADA','MEDIA','SEGURIDAD','ACTOS RELACIONADOS CON OTROS BIENES JURIDICOS'),
('31002','AMENAZA','MEDIA','SEGURIDAD','ACTOS RELACIONADOS CON OTROS BIENES JURIDICOS'),
('31003','DAÃ‘O A BIENES PUBLICOS, INSTITUCIONES, MONUMENTOS, ENTRE OTROS','MEDIA','SEGURIDAD','ACTOS RELACIONADOS CON OTROS BIENES JURIDICOS'),
('31004','DESCARGA DE DESECHOS SIN PERMISOS','ALTA','SEGURIDAD','ACTOS RELACIONADOS CON OTROS BIENES JURIDICOS'),
('31005','ELECTORALES','MEDIA','SEGURIDAD','ACTOS RELACIONADOS CON OTROS BIENES JURIDICOS'),
('31006','FUGA DE REOS','ALTA','SEGURIDAD','ACTOS RELACIONADOS CON OTROS BIENES JURIDICOS'),
('31007','NARCOMENUDEO','ALTA','SEGURIDAD','ACTOS RELACIONADOS CON OTROS BIENES JURIDICOS'),
('31008','TOMA DE EDIFICIO PUBLICO','ALTA','SEGURIDAD','ACTOS RELACIONADOS CON OTROS BIENES JURIDICOS'),
('31009','TOMA DE INSTALACIONES EDUCATIVAS CON VIOLENCIA','ALTA','SEGURIDAD','ACTOS RELACIONADOS CON OTROS BIENES JURIDICOS'),
('31010','TALA ILEGAL','ALTA','SEGURIDAD','ACTOS RELACIONADOS CON OTROS BIENES JURIDICOS'),
('31011','TRAFICO DE MADERA','ALTA','SEGURIDAD','ACTOS RELACIONADOS CON OTROS BIENES JURIDICOS'),
('31012','TRAFICO Y/O VENTA CLANDESTINA DE ANIMALES','ALTA','SEGURIDAD','ACTOS RELACIONADOS CON OTROS BIENES JURIDICOS'),
('31013','TRAFICO DE DROGAS Y ESTUPEFACIENTES EN LA MAR','ALTA','SEGURIDAD','ACTOS RELACIONADOS CON OTROS BIENES JURIDICOS'),
('31014','TRAFICO DE DROGAS Y ESTUPEFACIENTES EN VIA PUBLICA','ALTA','SEGURIDAD','ACTOS RELACIONADOS CON OTROS BIENES JURIDICOS'),
('31015','OTROS ACTOS RELACIONADOS CON OTROS BIENES JURIDICOS','MEDIA','SEGURIDAD','ACTOS RELACIONADOS CON OTROS BIENES JURIDICOS'),
('31101','ALTERACION DEL ORDEN PUBLICO POR PERSONA ALCOHOLIZADA','BAJA','SEGURIDAD','DISTURBIOS Y ALTERACION DEL ORDEN PUBLICO'),
('31102','ALTERACION DEL ORDEN PUBLICO POR PERSONA DROGADA','BAJA','SEGURIDAD','DISTURBIOS Y ALTERACION DEL ORDEN PUBLICO'),
('31103','CONDUCTOR EBRIO','BAJA','SEGURIDAD','DISTURBIOS Y ALTERACION DEL ORDEN PUBLICO'),
('31104','CONSUMO DE ALCOHOL EN VIA PUBLICA','BAJA','SEGURIDAD','DISTURBIOS Y ALTERACION DEL ORDEN PUBLICO'),
('31105','CONSUMO DE DROGAS EN VIA PUBLICA','BAJA','SEGURIDAD','DISTURBIOS Y ALTERACION DEL ORDEN PUBLICO'),
('31106','CONSUMO DE ALCOHOL EN ESCUELA','ALTA','SEGURIDAD','DISTURBIOS Y ALTERACION DEL ORDEN PUBLICO'),
('31107','CONSUMO DE DROGAS EN ESCUELA','ALTA','SEGURIDAD','DISTURBIOS Y ALTERACION DEL ORDEN PUBLICO'),
('31108','GRAFITIS','BAJA','SEGURIDAD','DISTURBIOS Y ALTERACION DEL ORDEN PUBLICO'),
('31109','MANIFESTACION CON DISTURBIOS O BLOQUEOS','ALTA','SEGURIDAD','DISTURBIOS Y ALTERACION DEL ORDEN PUBLICO'),
('31110','MITIN','ALTA','SEGURIDAD','DISTURBIOS Y ALTERACION DEL ORDEN PUBLICO'),
('31111','PELEA CLANDESTINA CON ANIMALES','MEDIA','SEGURIDAD','DISTURBIOS Y ALTERACION DEL ORDEN PUBLICO'),
('31112','RIÃ‘A/PELEA CLANDESTINA','ALTA','SEGURIDAD','DISTURBIOS Y ALTERACION DEL ORDEN PUBLICO'),
('31113','PERSONA EXHIBICIONISTA','BAJA','SEGURIDAD','DISTURBIOS Y ALTERACION DEL ORDEN PUBLICO'),
('31114','OTROS TIPOS DE ALTERACION AL ORDEN PUBLICO','BAJA','SEGURIDAD','DISTURBIOS Y ALTERACION DEL ORDEN PUBLICO'),
('40101','CAIDA DE BARDA','MEDIA','SERVICIOS PUBLICOS','INFRAESTRUCTURA'),
('40102','CAIDA DE POSTE','MEDIA','SERVICIOS PUBLICOS','INFRAESTRUCTURA'),
('40103','FALLA DE ALUMBRADO PUBLICO','MEDIA','SERVICIOS PUBLICOS','INFRAESTRUCTURA'),
('40104','FALLAS DE SEMAFORO','MEDIA','SERVICIOS PUBLICOS','INFRAESTRUCTURA'),
('40105','ALCANTARILLA SIN TAPA','MEDIA','SERVICIOS PUBLICOS','INFRAESTRUCTURA'),
('40106','CABLES COLGANDO','MEDIA','SERVICIOS PUBLICOS','INFRAESTRUCTURA'),
('40107','CORTO CIRCUITO','MEDIA','SERVICIOS PUBLICOS','INFRAESTRUCTURA'),
('40108','GRAVA SUELTA','MEDIA','SERVICIOS PUBLICOS','INFRAESTRUCTURA'),
('40109','AFECTACION DE LOS SERVICIOS BASICOS O DE INFRAESTRUCTURA ESTRATEGICA','ALTA','SERVICIOS PUBLICOS','INFRAESTRUCTURA'),
('40110','VIALIDAD EN MAL ESTADO','MEDIA','SERVICIOS PUBLICOS','INFRAESTRUCTURA'),
('50101','CONCENTRACION PACIFICA DE PERSONAS','BAJA','ASISTENCIA','PROTECCION'),
('50102','TENTATIVA DE ROBO','MEDIA','ASISTENCIA','PROTECCION'),
('50103','EXTRAVIO DE PLACA','BAJA','ASISTENCIA','PROTECCION'),
('50104','FRAUDE','BAJA','ASISTENCIA','PROTECCION'),
('50105','RUIDO EXCESIVO','BAJA','ASISTENCIA','PROTECCION'),
('50106','USURPACION DE IDENTIDAD','BAJA','ASISTENCIA','PROTECCION'),
('50107','ABUSO DE CONFIANZA','BAJA','ASISTENCIA','PROTECCION'),
('50108','ABUSO DE AUTORIDAD','MEDIA','ASISTENCIA','PROTECCION'),
('50201','RESTOS HUMANOS','MEDIA','ASISTENCIA','NOTIFICACION DE HALLAZGO'),
('50202','DE ARMA','MEDIA','ASISTENCIA','NOTIFICACION DE HALLAZGO'),
('50203','VEHICULO RECUPERADO','BAJA','ASISTENCIA','NOTIFICACION DE HALLAZGO'),
('50301','APOYO A LA CIUDADANIA','BAJA','ASISTENCIA','APOYO'),
('50302','PERSONA LOCALIZADA','BAJA','ASISTENCIA','APOYO'),
('50303','MALTRATO DE ANIMALES','MEDIA','ASISTENCIA','APOYO'),
('50304','PERSONA EN SITUACION DE CALLE','BAJA','ASISTENCIA','APOYO'),
('50305','SOLICITUD DE RONDIN','BAJA','ASISTENCIA','APOYO'),
('50306','QUEJA CONTRA SERVIDORES PUBLICOS','BAJA','ASISTENCIA','APOYO'),
('60101','ALCANTARILLA OBSTRUIDA','BAJA','OTROS SERVICIOS','OTROS SERVICIOS PUBLICOS'),
('60102','ANIMAL MUERTO','BAJA','IMPROCEDENTES','LLAMADAS IMPROCEDENTES'),
('60103','SOLICITUD DE OTROS SERVICIOS PUBLICOS','BAJA','IMPROCEDENTES','LLAMADAS IMPROCEDENTES'),
('70101','LLAMADA DE BROMA POR NIÃ‘OS','BAJA','IMPROCEDENTES','LLAMADAS IMPROCEDENTES'),
('70102','LLAMADA DE PRUEBA','BAJA','IMPROCEDENTES','LLAMADAS IMPROCEDENTES'),
('70103','LLAMADA INCOMPLETA','BAJA','IMPROCEDENTES','LLAMADAS IMPROCEDENTES'),
('70104','LLAMADA MUDA','BAJA','IMPROCEDENTES','LLAMADAS IMPROCEDENTES'),
('70105','TRANSFERENCIA DE LLAMADA','BAJA','IMPROCEDENTES','LLAMADAS IMPROCEDENTES'),
('70106','INSULTOS POR ADULTOS/LLAMADA OBSCENA','BAJA','IMPROCEDENTES','LLAMADAS IMPROCEDENTES'),
('70107','JOVENES/ADULTOS JUGANDO','BAJA','IMPROCEDENTES','LLAMADAS IMPROCEDENTES'),
('70108','OTRAS LLAMADAS IMPROCEDENTES','BAJA','IMPROCEDENTES','LLAMADAS IMPROCEDENTES')
on conflict (codigo) do nothing;

insert into cat_municipios (municipio, municipio_id, estado, estado_id, pais) values
('AGUASCALIENTES',1,'AGUASCALIENTES',1,'MEXICO'),
('ASIENTOS',2,'AGUASCALIENTES',1,'MEXICO'),
('CALVILLO',3,'AGUASCALIENTES',1,'MEXICO'),
('COSIO',4,'AGUASCALIENTES',1,'MEXICO'),
('EL LLANO',11,'AGUASCALIENTES',1,'MEXICO'),
('JESUS MARIA',5,'AGUASCALIENTES',1,'MEXICO'),
('PABELLON DE ARTEAGA',6,'AGUASCALIENTES',1,'MEXICO'),
('RINCON DE ROMOS',7,'AGUASCALIENTES',1,'MEXICO'),
('SAN FRANCISCO DE LOS ROMO',10,'AGUASCALIENTES',1,'MEXICO'),
('SAN JOSE DE GRACIA',8,'AGUASCALIENTES',1,'MEXICO'),
('TEPEZALA',9,'AGUASCALIENTES',1,'MEXICO'),
('ENSENADA',1,'BAJA CALIFORNIA',2,'MEXICO'),
('MEXICALI',2,'BAJA CALIFORNIA',2,'MEXICO'),
('PLAYAS DE ROSARITO',5,'BAJA CALIFORNIA',2,'MEXICO'),
('TECATE',3,'BAJA CALIFORNIA',2,'MEXICO'),
('TIJUANA',4,'BAJA CALIFORNIA',2,'MEXICO'),
('COMONDU',1,'BAJA CALIFORNIA SUR',3,'MEXICO'),
('LA PAZ',3,'BAJA CALIFORNIA SUR',3,'MEXICO'),
('LORETO',5,'BAJA CALIFORNIA SUR',3,'MEXICO'),
('LOS CABOS',4,'BAJA CALIFORNIA SUR',3,'MEXICO'),
('MULEGE',2,'BAJA CALIFORNIA SUR',3,'MEXICO'),
('CALAKMUL',11,'CAMPECHE',4,'MEXICO'),
('CALKINI',2,'CAMPECHE',4,'MEXICO'),
('CAMPECHE',1,'CAMPECHE',4,'MEXICO'),
('CANDELARIA',10,'CAMPECHE',4,'MEXICO'),
('CARMEN',3,'CAMPECHE',4,'MEXICO'),
('CHAMPOTON',4,'CAMPECHE',4,'MEXICO'),
('ESCARCEGA',9,'CAMPECHE',4,'MEXICO'),
('HECELCHAKAN',5,'CAMPECHE',4,'MEXICO'),
('HOPELCHEN',6,'CAMPECHE',4,'MEXICO'),
('PALIZADA',7,'CAMPECHE',4,'MEXICO'),
('TENABO',8,'CAMPECHE',4,'MEXICO'),
('ACACOYAGUA',1,'CHIAPAS',7,'MEXICO'),
('ACALA',2,'CHIAPAS',7,'MEXICO'),
('ACAPETAHUA',3,'CHIAPAS',7,'MEXICO'),
('ALDAMA',112,'CHIAPAS',7,'MEXICO'),
('ALTAMIRANO',4,'CHIAPAS',7,'MEXICO'),
('AMATAN',5,'CHIAPAS',7,'MEXICO'),
('AMATENANGO DE LA FRONTERA',6,'CHIAPAS',7,'MEXICO'),
('AMATENANGO DEL VALLE',7,'CHIAPAS',7,'MEXICO'),
('ANGEL ALBINO CORZO',8,'CHIAPAS',7,'MEXICO'),
('ARRIAGA',9,'CHIAPAS',7,'MEXICO'),
('BEJUCAL DE OCAMPO',10,'CHIAPAS',7,'MEXICO'),
('BELLA VISTA',11,'CHIAPAS',7,'MEXICO'),
('BENEMERITO DE LAS AMERICAS',113,'CHIAPAS',7,'MEXICO'),
('BERRIOZABAL',12,'CHIAPAS',7,'MEXICO'),
('BOCHIL',13,'CHIAPAS',7,'MEXICO'),
('CACAHOATAN',15,'CHIAPAS',7,'MEXICO'),
('CATAZAJA',16,'CHIAPAS',7,'MEXICO'),
('CHALCHIHUITAN',22,'CHIAPAS',7,'MEXICO'),
('CHAMULA',23,'CHIAPAS',7,'MEXICO'),
('CHANAL',24,'CHIAPAS',7,'MEXICO'),
('CHAPULTENANGO',25,'CHIAPAS',7,'MEXICO'),
('CHENALHO',26,'CHIAPAS',7,'MEXICO'),
('CHIAPA DE CORZO',27,'CHIAPAS',7,'MEXICO'),
('CHIAPILLA',28,'CHIAPAS',7,'MEXICO'),
('CHICOASEN',29,'CHIAPAS',7,'MEXICO'),
('CHICOMUSELO',30,'CHIAPAS',7,'MEXICO'),
('CHILON',31,'CHIAPAS',7,'MEXICO'),
('CINTALAPA',17,'CHIAPAS',7,'MEXICO'),
('COAPILLA',18,'CHIAPAS',7,'MEXICO'),
('COMITAN DE DOMINGUEZ',19,'CHIAPAS',7,'MEXICO'),
('COPAINALA',21,'CHIAPAS',7,'MEXICO'),
('EL BOSQUE',14,'CHIAPAS',7,'MEXICO'),
('EL PORVENIR',70,'CHIAPAS',7,'MEXICO'),
('ESCUINTLA',32,'CHIAPAS',7,'MEXICO'),
('FRANCISCO LEON',33,'CHIAPAS',7,'MEXICO'),
('FRONTERA COMALAPA',34,'CHIAPAS',7,'MEXICO'),
('FRONTERA HIDALGO',35,'CHIAPAS',7,'MEXICO'),
('HUEHUETAN',37,'CHIAPAS',7,'MEXICO'),
('HUITIUPAN',38,'CHIAPAS',7,'MEXICO'),
('HUIXTAN',39,'CHIAPAS',7,'MEXICO'),
('HUIXTLA',40,'CHIAPAS',7,'MEXICO'),
('IXHUATAN',42,'CHIAPAS',7,'MEXICO'),
('IXTACOMITAN',43,'CHIAPAS',7,'MEXICO'),
('IXTAPA',44,'CHIAPAS',7,'MEXICO'),
('IXTAPANGAJOYA',45,'CHIAPAS',7,'MEXICO'),
('JIQUIPILAS',46,'CHIAPAS',7,'MEXICO'),
('JITOTOL',47,'CHIAPAS',7,'MEXICO'),
('JUAREZ',48,'CHIAPAS',7,'MEXICO'),
('LA CONCORDIA',20,'CHIAPAS',7,'MEXICO'),
('LA GRANDEZA',36,'CHIAPAS',7,'MEXICO'),
('LA INDEPENDENCIA',41,'CHIAPAS',7,'MEXICO'),
('LA LIBERTAD',50,'CHIAPAS',7,'MEXICO'),
('LA TRINITARIA',99,'CHIAPAS',7,'MEXICO'),
('LARRAINZAR',49,'CHIAPAS',7,'MEXICO'),
('LAS MARGARITAS',52,'CHIAPAS',7,'MEXICO'),
('LAS ROSAS',74,'CHIAPAS',7,'MEXICO'),
('MAPASTEPEC',51,'CHIAPAS',7,'MEXICO'),
('MARAVILLA TENEJAPA',114,'CHIAPAS',7,'MEXICO'),
('MARQUES DE COMILLAS',115,'CHIAPAS',7,'MEXICO'),
('MAZAPA DE MADERO',53,'CHIAPAS',7,'MEXICO'),
('MAZATAN',54,'CHIAPAS',7,'MEXICO'),
('METAPA',55,'CHIAPAS',7,'MEXICO'),
('MITONTIC',56,'CHIAPAS',7,'MEXICO'),
('MONTECRISTO DE GUERRERO',116,'CHIAPAS',7,'MEXICO'),
('MOTOZINTLA',57,'CHIAPAS',7,'MEXICO'),
('NICOLAS RUIZ',58,'CHIAPAS',7,'MEXICO'),
('OCOSINGO',59,'CHIAPAS',7,'MEXICO'),
('OCOTEPEC',60,'CHIAPAS',7,'MEXICO'),
('OCOZOCOAUTLA DE ESPINOSA',61,'CHIAPAS',7,'MEXICO'),
('OSTUACAN',62,'CHIAPAS',7,'MEXICO'),
('OSUMACINTA',63,'CHIAPAS',7,'MEXICO'),
('OXCHUC',64,'CHIAPAS',7,'MEXICO'),
('PALENQUE',65,'CHIAPAS',7,'MEXICO'),
('PANTELHO',66,'CHIAPAS',7,'MEXICO'),
('PANTEPEC',67,'CHIAPAS',7,'MEXICO'),
('PICHUCALCO',68,'CHIAPAS',7,'MEXICO'),
('PIJIJIAPAN',69,'CHIAPAS',7,'MEXICO'),
('PUEBLO NUEVO SOLISTAHUACAN',71,'CHIAPAS',7,'MEXICO'),
('RAYON',72,'CHIAPAS',7,'MEXICO'),
('REFORMA',73,'CHIAPAS',7,'MEXICO'),
('SABANILLA',75,'CHIAPAS',7,'MEXICO'),
('SALTO DE AGUA',76,'CHIAPAS',7,'MEXICO'),
('SAN ANDRES DURAZNAL',117,'CHIAPAS',7,'MEXICO'),
('SAN CRISTOBAL DE LAS CASAS',77,'CHIAPAS',7,'MEXICO'),
('SAN FERNANDO',78,'CHIAPAS',7,'MEXICO'),
('SAN JUAN CANCUC',79,'CHIAPAS',7,'MEXICO'),
('SAN LUCAS',80,'CHIAPAS',7,'MEXICO'),
('SANTIAGO EL PINAR',118,'CHIAPAS',7,'MEXICO'),
('SILTEPEC',81,'CHIAPAS',7,'MEXICO'),
('SIMOJOVEL',82,'CHIAPAS',7,'MEXICO'),
('SITALA',83,'CHIAPAS',7,'MEXICO'),
('SOCOLTENANGO',84,'CHIAPAS',7,'MEXICO'),
('SOLOSUCHIAPA',85,'CHIAPAS',7,'MEXICO'),
('SOYALO',86,'CHIAPAS',7,'MEXICO'),
('SUCHIAPA',87,'CHIAPAS',7,'MEXICO'),
('SUCHIATE',88,'CHIAPAS',7,'MEXICO'),
('SUNUAPA',89,'CHIAPAS',7,'MEXICO'),
('TAPACHULA',90,'CHIAPAS',7,'MEXICO'),
('TAPALAPA',91,'CHIAPAS',7,'MEXICO'),
('TAPILULA',92,'CHIAPAS',7,'MEXICO'),
('TECPATAN',93,'CHIAPAS',7,'MEXICO'),
('TENEJAPA',94,'CHIAPAS',7,'MEXICO'),
('TEOPISCA',95,'CHIAPAS',7,'MEXICO'),
('TILA',96,'CHIAPAS',7,'MEXICO'),
('TONALA',97,'CHIAPAS',7,'MEXICO'),
('TOTOLAPA',98,'CHIAPAS',7,'MEXICO'),
('TUMBALA',100,'CHIAPAS',7,'MEXICO'),
('TUXTLA CHICO',101,'CHIAPAS',7,'MEXICO'),
('TUXTLA GUTIERREZ',102,'CHIAPAS',7,'MEXICO'),
('TUZANTAN',103,'CHIAPAS',7,'MEXICO'),
('TZIMOL',104,'CHIAPAS',7,'MEXICO'),
('UNION JUAREZ',105,'CHIAPAS',7,'MEXICO'),
('VENUSTIANO CARRANZA',106,'CHIAPAS',7,'MEXICO'),
('VILLA CORZO',108,'CHIAPAS',7,'MEXICO'),
('VILLACOMALTITLAN',107,'CHIAPAS',7,'MEXICO'),
('VILLAFLORES',109,'CHIAPAS',7,'MEXICO'),
('YAJALON',110,'CHIAPAS',7,'MEXICO'),
('ZINACANTAN',111,'CHIAPAS',7,'MEXICO'),
('AHUMADA',1,'CHIHUAHUA',8,'MEXICO'),
('ALDAMA',2,'CHIHUAHUA',8,'MEXICO'),
('ALLENDE',3,'CHIHUAHUA',8,'MEXICO'),
('AQUILES SERDAN',4,'CHIHUAHUA',8,'MEXICO'),
('ASCENSION',5,'CHIHUAHUA',8,'MEXICO'),
('BACHINIVA',6,'CHIHUAHUA',8,'MEXICO'),
('BALLEZA',7,'CHIHUAHUA',8,'MEXICO'),
('BATOPILAS',8,'CHIHUAHUA',8,'MEXICO'),
('BOCOYNA',9,'CHIHUAHUA',8,'MEXICO'),
('BUENAVENTURA',10,'CHIHUAHUA',8,'MEXICO'),
('CAMARGO',11,'CHIHUAHUA',8,'MEXICO'),
('CARICHI',12,'CHIHUAHUA',8,'MEXICO'),
('CASAS GRANDES',13,'CHIHUAHUA',8,'MEXICO'),
('CHIHUAHUA',19,'CHIHUAHUA',8,'MEXICO'),
('CHINIPAS',20,'CHIHUAHUA',8,'MEXICO'),
('CORONADO',14,'CHIHUAHUA',8,'MEXICO'),
('COYAME DEL SOTOL',15,'CHIHUAHUA',8,'MEXICO'),
('CUAUHTEMOC',17,'CHIHUAHUA',8,'MEXICO'),
('CUSIHUIRIACHI',18,'CHIHUAHUA',8,'MEXICO'),
('DELICIAS',21,'CHIHUAHUA',8,'MEXICO'),
('DR. BELISARIO DOMINGUEZ',22,'CHIHUAHUA',8,'MEXICO'),
('EL TULE',64,'CHIHUAHUA',8,'MEXICO'),
('GALEANA',23,'CHIHUAHUA',8,'MEXICO'),
('GOMEZ FARIAS',25,'CHIHUAHUA',8,'MEXICO'),
('GRAN MORELOS',26,'CHIHUAHUA',8,'MEXICO'),
('GUACHOCHI',27,'CHIHUAHUA',8,'MEXICO'),
('GUADALUPE',28,'CHIHUAHUA',8,'MEXICO'),
('GUADALUPE Y CALVO',29,'CHIHUAHUA',8,'MEXICO'),
('GUAZAPARES',30,'CHIHUAHUA',8,'MEXICO'),
('GUERRERO',31,'CHIHUAHUA',8,'MEXICO'),
('HIDALGO DEL PARRAL',32,'CHIHUAHUA',8,'MEXICO'),
('HUEJOTITAN',33,'CHIHUAHUA',8,'MEXICO'),
('IGNACIO ZARAGOZA',34,'CHIHUAHUA',8,'MEXICO'),
('JANOS',35,'CHIHUAHUA',8,'MEXICO'),
('JIMENEZ',36,'CHIHUAHUA',8,'MEXICO'),
('JUAREZ',37,'CHIHUAHUA',8,'MEXICO'),
('JULIMES',38,'CHIHUAHUA',8,'MEXICO'),
('LA CRUZ',16,'CHIHUAHUA',8,'MEXICO'),
('LOPEZ',39,'CHIHUAHUA',8,'MEXICO'),
('MADERA',40,'CHIHUAHUA',8,'MEXICO'),
('MAGUARICHI',41,'CHIHUAHUA',8,'MEXICO'),
('MANUEL BENAVIDES',42,'CHIHUAHUA',8,'MEXICO'),
('MATACHI',43,'CHIHUAHUA',8,'MEXICO'),
('MATAMOROS',44,'CHIHUAHUA',8,'MEXICO'),
('MEOQUI',45,'CHIHUAHUA',8,'MEXICO'),
('MORELOS',46,'CHIHUAHUA',8,'MEXICO'),
('MORIS',47,'CHIHUAHUA',8,'MEXICO'),
('NAMIQUIPA',48,'CHIHUAHUA',8,'MEXICO'),
('NONOAVA',49,'CHIHUAHUA',8,'MEXICO'),
('NUEVO CASAS GRANDES',50,'CHIHUAHUA',8,'MEXICO'),
('OCAMPO',51,'CHIHUAHUA',8,'MEXICO'),
('OJINAGA',52,'CHIHUAHUA',8,'MEXICO'),
('PRAXEDIS G. GUERRERO',53,'CHIHUAHUA',8,'MEXICO'),
('RIVA PALACIO',54,'CHIHUAHUA',8,'MEXICO'),
('ROSALES',55,'CHIHUAHUA',8,'MEXICO'),
('ROSARIO',56,'CHIHUAHUA',8,'MEXICO'),
('SAN FRANCISCO DE BORJA',57,'CHIHUAHUA',8,'MEXICO'),
('SAN FRANCISCO DE CONCHOS',58,'CHIHUAHUA',8,'MEXICO'),
('SAN FRANCISCO DEL ORO',59,'CHIHUAHUA',8,'MEXICO'),
('SANTA BARBARA',60,'CHIHUAHUA',8,'MEXICO'),
('SANTA ISABEL',24,'CHIHUAHUA',8,'MEXICO'),
('SATEVO',61,'CHIHUAHUA',8,'MEXICO'),
('SAUCILLO',62,'CHIHUAHUA',8,'MEXICO'),
('TEMOSACHIC',63,'CHIHUAHUA',8,'MEXICO'),
('URIQUE',65,'CHIHUAHUA',8,'MEXICO'),
('URUACHI',66,'CHIHUAHUA',8,'MEXICO'),
('VALLE DE ZARAGOZA',67,'CHIHUAHUA',8,'MEXICO'),
('ABASOLO',1,'COAHUILA',5,'MEXICO'),
('ACUÃ‘A',2,'COAHUILA',5,'MEXICO'),
('ALLENDE',3,'COAHUILA',5,'MEXICO'),
('ARTEAGA',4,'COAHUILA',5,'MEXICO'),
('CANDELA',5,'COAHUILA',5,'MEXICO'),
('CASTAÃ‘OS',6,'COAHUILA',5,'MEXICO'),
('CUATROCIENEGAS',7,'COAHUILA',5,'MEXICO'),
('ESCOBEDO',8,'COAHUILA',5,'MEXICO'),
('FRANCISCO I. MADERO',9,'COAHUILA',5,'MEXICO'),
('FRONTERA',10,'COAHUILA',5,'MEXICO'),
('GENERAL CEPEDA',11,'COAHUILA',5,'MEXICO'),
('GUERRERO',12,'COAHUILA',5,'MEXICO'),
('HIDALGO',13,'COAHUILA',5,'MEXICO'),
('JIMENEZ',14,'COAHUILA',5,'MEXICO'),
('JUAREZ',15,'COAHUILA',5,'MEXICO'),
('LAMADRID',16,'COAHUILA',5,'MEXICO'),
('MATAMOROS',17,'COAHUILA',5,'MEXICO'),
('MONCLOVA',18,'COAHUILA',5,'MEXICO'),
('MORELOS',19,'COAHUILA',5,'MEXICO'),
('MUZQUIZ',20,'COAHUILA',5,'MEXICO'),
('NADADORES',21,'COAHUILA',5,'MEXICO'),
('NAVA',22,'COAHUILA',5,'MEXICO'),
('OCAMPO',23,'COAHUILA',5,'MEXICO'),
('PARRAS',24,'COAHUILA',5,'MEXICO'),
('PIEDRAS NEGRAS',25,'COAHUILA',5,'MEXICO'),
('PROGRESO',26,'COAHUILA',5,'MEXICO'),
('RAMOS ARIZPE',27,'COAHUILA',5,'MEXICO'),
('SABINAS',28,'COAHUILA',5,'MEXICO'),
('SACRAMENTO',29,'COAHUILA',5,'MEXICO'),
('SALTILLO',30,'COAHUILA',5,'MEXICO'),
('SAN BUENAVENTURA',31,'COAHUILA',5,'MEXICO'),
('SAN JUAN DE SABINAS',32,'COAHUILA',5,'MEXICO'),
('SAN PEDRO',33,'COAHUILA',5,'MEXICO'),
('SIERRA MOJADA',34,'COAHUILA',5,'MEXICO'),
('TORREON',35,'COAHUILA',5,'MEXICO'),
('VIESCA',36,'COAHUILA',5,'MEXICO'),
('VILLA UNION',37,'COAHUILA',5,'MEXICO'),
('ZARAGOZA',38,'COAHUILA',5,'MEXICO'),
('ARMERIA',6,'COLIMA',6,'MEXICO'),
('COLIMA',1,'COLIMA',6,'MEXICO'),
('COMALA',2,'COLIMA',6,'MEXICO'),
('COQUIMATLAN',3,'COLIMA',6,'MEXICO'),
('CUAUHTEMOC',4,'COLIMA',6,'MEXICO'),
('IXTLAHUACAN',7,'COLIMA',6,'MEXICO'),
('MANZANILLO',8,'COLIMA',6,'MEXICO'),
('MINATITLAN',9,'COLIMA',6,'MEXICO'),
('TECOMAN',10,'COLIMA',6,'MEXICO'),
('VILLA DE ALVAREZ',5,'COLIMA',6,'MEXICO'),
('ALVARO OBREGON',10,'DISTRITO FEDERAL',9,'MEXICO'),
('AZCAPOTZALCO',2,'DISTRITO FEDERAL',9,'MEXICO'),
('BENITO JUAREZ',14,'DISTRITO FEDERAL',9,'MEXICO'),
('COYOACAN',3,'DISTRITO FEDERAL',9,'MEXICO'),
('CUAJIMALPA DE MORELOS',4,'DISTRITO FEDERAL',9,'MEXICO'),
('CUAUHTEMOC',15,'DISTRITO FEDERAL',9,'MEXICO'),
('GUSTAVO A. MADERO',5,'DISTRITO FEDERAL',9,'MEXICO'),
('IZTACALCO',6,'DISTRITO FEDERAL',9,'MEXICO'),
('IZTAPALAPA',7,'DISTRITO FEDERAL',9,'MEXICO'),
('LA MAGDALENA CONTRERAS',8,'DISTRITO FEDERAL',9,'MEXICO'),
('MIGUEL HIDALGO',16,'DISTRITO FEDERAL',9,'MEXICO'),
('MILPA ALTA',9,'DISTRITO FEDERAL',9,'MEXICO'),
('TLAHUAC',11,'DISTRITO FEDERAL',9,'MEXICO'),
('TLALPAN',12,'DISTRITO FEDERAL',9,'MEXICO'),
('VENUSTIANO CARRANZA',17,'DISTRITO FEDERAL',9,'MEXICO'),
('XOCHIMILCO',13,'DISTRITO FEDERAL',9,'MEXICO'),
('CANATLAN',1,'DURANGO',10,'MEXICO'),
('CANELAS',2,'DURANGO',10,'MEXICO'),
('CONETO DE COMONFORT',3,'DURANGO',10,'MEXICO'),
('CUENCAME',4,'DURANGO',10,'MEXICO'),
('DURANGO',5,'DURANGO',10,'MEXICO'),
('EL ORO',19,'DURANGO',10,'MEXICO'),
('GOMEZ PALACIO',7,'DURANGO',10,'MEXICO'),
('GUADALUPE VICTORIA',8,'DURANGO',10,'MEXICO'),
('GUANACEVI',9,'DURANGO',10,'MEXICO'),
('HIDALGO',10,'DURANGO',10,'MEXICO'),
('INDE',11,'DURANGO',10,'MEXICO'),
('LERDO',12,'DURANGO',10,'MEXICO'),
('MAPIMI',13,'DURANGO',10,'MEXICO'),
('MEZQUITAL',14,'DURANGO',10,'MEXICO'),
('NAZAS',15,'DURANGO',10,'MEXICO'),
('NOMBRE DE DIOS',16,'DURANGO',10,'MEXICO'),
('NUEVO IDEAL',17,'DURANGO',10,'MEXICO'),
('OCAMPO',18,'DURANGO',10,'MEXICO'),
('OTAEZ',20,'DURANGO',10,'MEXICO'),
('PANUCO DE CORONADO',21,'DURANGO',10,'MEXICO'),
('PEÃ‘ON BLANCO',22,'DURANGO',10,'MEXICO'),
('POANAS',23,'DURANGO',10,'MEXICO'),
('PUEBLO NUEVO',24,'DURANGO',10,'MEXICO'),
('RODEO',25,'DURANGO',10,'MEXICO'),
('SAN BERNARDO',26,'DURANGO',10,'MEXICO'),
('SAN DIMAS',27,'DURANGO',10,'MEXICO'),
('SAN JUAN DE GUADALUPE',28,'DURANGO',10,'MEXICO'),
('SAN JUAN DEL RIO',29,'DURANGO',10,'MEXICO'),
('SAN LUIS DEL CORDERO',30,'DURANGO',10,'MEXICO'),
('SAN PEDRO DEL GALLO',31,'DURANGO',10,'MEXICO'),
('SANTA CLARA',32,'DURANGO',10,'MEXICO'),
('SANTIAGO PAPASQUIARO',33,'DURANGO',10,'MEXICO'),
('SIMON BOLIVAR',6,'DURANGO',10,'MEXICO'),
('SUCHIL',34,'DURANGO',10,'MEXICO'),
('TAMAZULA',35,'DURANGO',10,'MEXICO'),
('TEPEHUANES',36,'DURANGO',10,'MEXICO'),
('TLAHUALILO',37,'DURANGO',10,'MEXICO'),
('TOPIA',38,'DURANGO',10,'MEXICO'),
('VICENTE GUERRERO',39,'DURANGO',10,'MEXICO'),
('ABASOLO',1,'GUANAJUATO',11,'MEXICO'),
('ACAMBARO',2,'GUANAJUATO',11,'MEXICO'),
('APASEO EL ALTO',4,'GUANAJUATO',11,'MEXICO'),
('APASEO EL GRANDE',5,'GUANAJUATO',11,'MEXICO'),
('ATARJEA',6,'GUANAJUATO',11,'MEXICO'),
('CELAYA',7,'GUANAJUATO',11,'MEXICO'),
('COMONFORT',9,'GUANAJUATO',11,'MEXICO'),
('CORONEO',10,'GUANAJUATO',11,'MEXICO'),
('CORTAZAR',11,'GUANAJUATO',11,'MEXICO'),
('CUERAMARO',12,'GUANAJUATO',11,'MEXICO'),
('DOCTOR MORA',13,'GUANAJUATO',11,'MEXICO'),
('DOLORES HIDALGO CUNA DE LA INDEPENDENCIA NACIONAL',14,'GUANAJUATO',11,'MEXICO'),
('GUANAJUATO',15,'GUANAJUATO',11,'MEXICO'),
('HUANIMARO',16,'GUANAJUATO',11,'MEXICO'),
('IRAPUATO',17,'GUANAJUATO',11,'MEXICO'),
('JARAL DEL PROGRESO',18,'GUANAJUATO',11,'MEXICO'),
('JERECUARO',19,'GUANAJUATO',11,'MEXICO'),
('LEON',20,'GUANAJUATO',11,'MEXICO'),
('MANUEL DOBLADO',8,'GUANAJUATO',11,'MEXICO'),
('MOROLEON',21,'GUANAJUATO',11,'MEXICO'),
('OCAMPO',22,'GUANAJUATO',11,'MEXICO'),
('PENJAMO',23,'GUANAJUATO',11,'MEXICO'),
('PUEBLO NUEVO',24,'GUANAJUATO',11,'MEXICO'),
('PURISIMA DEL RINCON',25,'GUANAJUATO',11,'MEXICO'),
('ROMITA',26,'GUANAJUATO',11,'MEXICO'),
('SALAMANCA',27,'GUANAJUATO',11,'MEXICO'),
('SALVATIERRA',28,'GUANAJUATO',11,'MEXICO'),
('SAN DIEGO DE LA UNION',29,'GUANAJUATO',11,'MEXICO'),
('SAN FELIPE',30,'GUANAJUATO',11,'MEXICO'),
('SAN FRANCISCO DEL RINCON',31,'GUANAJUATO',11,'MEXICO'),
('SAN JOSE ITURBIDE',32,'GUANAJUATO',11,'MEXICO'),
('SAN LUIS DE LA PAZ',33,'GUANAJUATO',11,'MEXICO'),
('SAN MIGUEL DE ALLENDE',3,'GUANAJUATO',11,'MEXICO'),
('SANTA CATARINA',34,'GUANAJUATO',11,'MEXICO'),
('SANTA CRUZ DE JUVENTINO ROSAS',35,'GUANAJUATO',11,'MEXICO'),
('SANTIAGO MARAVATIO',36,'GUANAJUATO',11,'MEXICO'),
('SILAO DE LA VICTORIA',37,'GUANAJUATO',11,'MEXICO'),
('TARANDACUAO',38,'GUANAJUATO',11,'MEXICO'),
('TARIMORO',39,'GUANAJUATO',11,'MEXICO'),
('TIERRA BLANCA',40,'GUANAJUATO',11,'MEXICO'),
('URIANGATO',41,'GUANAJUATO',11,'MEXICO'),
('VALLE DE SANTIAGO',42,'GUANAJUATO',11,'MEXICO'),
('VICTORIA',43,'GUANAJUATO',11,'MEXICO'),
('VILLAGRAN',44,'GUANAJUATO',11,'MEXICO'),
('XICHU',45,'GUANAJUATO',11,'MEXICO'),
('YURIRIA',46,'GUANAJUATO',11,'MEXICO'),
('ACAPULCO DE JUAREZ',1,'GUERRERO',12,'MEXICO'),
('ACATEPEC',76,'GUERRERO',12,'MEXICO'),
('AHUACUOTZINGO',2,'GUERRERO',12,'MEXICO'),
('AJUCHITLAN DEL PROGRESO',3,'GUERRERO',12,'MEXICO'),
('ALCOZAUCA DE GUERRERO',4,'GUERRERO',12,'MEXICO'),
('ALPOYECA',5,'GUERRERO',12,'MEXICO'),
('APAXTLA',6,'GUERRERO',12,'MEXICO'),
('ARCELIA',7,'GUERRERO',12,'MEXICO'),
('ATENANGO DEL RIO',8,'GUERRERO',12,'MEXICO'),
('ATLAMAJALCINGO DEL MONTE',9,'GUERRERO',12,'MEXICO'),
('ATLIXTAC',10,'GUERRERO',12,'MEXICO'),
('ATOYAC DE ALVAREZ',11,'GUERRERO',12,'MEXICO'),
('AYUTLA DE LOS LIBRES',12,'GUERRERO',12,'MEXICO'),
('AZOYU',13,'GUERRERO',12,'MEXICO'),
('BENITO JUAREZ',14,'GUERRERO',12,'MEXICO'),
('BUENAVISTA DE CUELLAR',15,'GUERRERO',12,'MEXICO'),
('CHILAPA DE ALVAREZ',28,'GUERRERO',12,'MEXICO'),
('CHILPANCINGO DE LOS BRAVO',29,'GUERRERO',12,'MEXICO'),
('COAHUAYUTLA DE JOSE MARIA IZAZAGA',16,'GUERRERO',12,'MEXICO'),
('COCHOAPA EL GRANDE',79,'GUERRERO',12,'MEXICO'),
('COCULA',17,'GUERRERO',12,'MEXICO'),
('COPALA',18,'GUERRERO',12,'MEXICO'),
('COPALILLO',19,'GUERRERO',12,'MEXICO'),
('COPANATOYAC',20,'GUERRERO',12,'MEXICO'),
('COYUCA DE BENITEZ',21,'GUERRERO',12,'MEXICO'),
('COYUCA DE CATALAN',22,'GUERRERO',12,'MEXICO'),
('CUAJINICUILAPA',23,'GUERRERO',12,'MEXICO'),
('CUALAC',24,'GUERRERO',12,'MEXICO'),
('CUAUTEPEC',25,'GUERRERO',12,'MEXICO'),
('CUETZALA DEL PROGRESO',26,'GUERRERO',12,'MEXICO'),
('CUTZAMALA DE PINZON',27,'GUERRERO',12,'MEXICO'),
('EDUARDO NERI',30,'GUERRERO',12,'MEXICO'),
('FLORENCIO VILLARREAL',31,'GUERRERO',12,'MEXICO'),
('GENERAL CANUTO A. NERI',32,'GUERRERO',12,'MEXICO'),
('GENERAL HELIODORO CASTILLO',33,'GUERRERO',12,'MEXICO'),
('HUAMUXTITLAN',34,'GUERRERO',12,'MEXICO'),
('HUITZUCO DE LOS FIGUEROA',35,'GUERRERO',12,'MEXICO'),
('IGUALA DE LA INDEPENDENCIA',36,'GUERRERO',12,'MEXICO'),
('IGUALAPA',37,'GUERRERO',12,'MEXICO'),
('ILIATENCO',78,'GUERRERO',12,'MEXICO'),
('IXCATEOPAN DE CUAUHTEMOC',38,'GUERRERO',12,'MEXICO'),
('JOSE JOAQUIN DE HERRERA',77,'GUERRERO',12,'MEXICO'),
('JUAN R. ESCUDERO',40,'GUERRERO',12,'MEXICO'),
('JUCHITAN',81,'GUERRERO',12,'MEXICO'),
('LA UNION DE ISIDORO MONTES DE OCA',69,'GUERRERO',12,'MEXICO'),
('LEONARDO BRAVO',41,'GUERRERO',12,'MEXICO'),
('MALINALTEPEC',42,'GUERRERO',12,'MEXICO'),
('MARQUELIA',80,'GUERRERO',12,'MEXICO'),
('MARTIR DE CUILAPAN',43,'GUERRERO',12,'MEXICO'),
('METLATONOC',44,'GUERRERO',12,'MEXICO'),
('MOCHITLAN',45,'GUERRERO',12,'MEXICO'),
('OLINALA',46,'GUERRERO',12,'MEXICO'),
('OMETEPEC',47,'GUERRERO',12,'MEXICO'),
('PEDRO ASCENCIO ALQUISIRAS',48,'GUERRERO',12,'MEXICO'),
('PETATLAN',49,'GUERRERO',12,'MEXICO'),
('PILCAYA',50,'GUERRERO',12,'MEXICO'),
('PUNGARABATO',51,'GUERRERO',12,'MEXICO'),
('QUECHULTENANGO',52,'GUERRERO',12,'MEXICO'),
('SAN LUIS ACATLAN',53,'GUERRERO',12,'MEXICO'),
('SAN MARCOS',54,'GUERRERO',12,'MEXICO'),
('SAN MIGUEL TOTOLAPAN',55,'GUERRERO',12,'MEXICO'),
('TAXCO DE ALARCON',56,'GUERRERO',12,'MEXICO'),
('TECOANAPA',57,'GUERRERO',12,'MEXICO'),
('TECPAN DE GALEANA',58,'GUERRERO',12,'MEXICO'),
('TELOLOAPAN',59,'GUERRERO',12,'MEXICO'),
('TEPECOACUILCO DE TRUJANO',60,'GUERRERO',12,'MEXICO'),
('TETIPAC',61,'GUERRERO',12,'MEXICO'),
('TIXTLA DE GUERRERO',62,'GUERRERO',12,'MEXICO'),
('TLACOACHISTLAHUACA',63,'GUERRERO',12,'MEXICO'),
('TLACOAPA',64,'GUERRERO',12,'MEXICO'),
('TLALCHAPA',65,'GUERRERO',12,'MEXICO'),
('TLALIXTAQUILLA DE MALDONADO',66,'GUERRERO',12,'MEXICO'),
('TLAPA DE COMONFORT',67,'GUERRERO',12,'MEXICO'),
('TLAPEHUALA',68,'GUERRERO',12,'MEXICO'),
('XALPATLAHUAC',70,'GUERRERO',12,'MEXICO'),
('XOCHIHUEHUETLAN',71,'GUERRERO',12,'MEXICO'),
('XOCHISTLAHUACA',72,'GUERRERO',12,'MEXICO'),
('ZAPOTITLAN TABLAS',73,'GUERRERO',12,'MEXICO'),
('ZIHUATANEJO DE AZUETA',39,'GUERRERO',12,'MEXICO'),
('ZIRANDARO',74,'GUERRERO',12,'MEXICO'),
('ZITLALA',75,'GUERRERO',12,'MEXICO'),
('ACATLAN',1,'HIDALGO',13,'MEXICO'),
('ACAXOCHITLAN',2,'HIDALGO',13,'MEXICO'),
('ACTOPAN',3,'HIDALGO',13,'MEXICO'),
('AGUA BLANCA DE ITURBIDE',4,'HIDALGO',13,'MEXICO'),
('AJACUBA',5,'HIDALGO',13,'MEXICO'),
('ALFAJAYUCAN',6,'HIDALGO',13,'MEXICO'),
('ALMOLOYA',7,'HIDALGO',13,'MEXICO'),
('APAN',8,'HIDALGO',13,'MEXICO'),
('ATITALAQUIA',9,'HIDALGO',13,'MEXICO'),
('ATLAPEXCO',10,'HIDALGO',13,'MEXICO'),
('ATOTONILCO DE TULA',12,'HIDALGO',13,'MEXICO'),
('ATOTONILCO EL GRANDE',11,'HIDALGO',13,'MEXICO'),
('CALNALI',13,'HIDALGO',13,'MEXICO'),
('CARDONAL',14,'HIDALGO',13,'MEXICO'),
('CHAPANTONGO',16,'HIDALGO',13,'MEXICO'),
('CHAPULHUACAN',17,'HIDALGO',13,'MEXICO'),
('CHILCUAUTLA',18,'HIDALGO',13,'MEXICO'),
('CUAUTEPEC DE HINOJOSA',15,'HIDALGO',13,'MEXICO'),
('EL ARENAL',19,'HIDALGO',13,'MEXICO'),
('ELOXOCHITLAN',20,'HIDALGO',13,'MEXICO'),
('EMILIANO ZAPATA',21,'HIDALGO',13,'MEXICO'),
('EPAZOYUCAN',22,'HIDALGO',13,'MEXICO'),
('FRANCISCO I. MADERO',23,'HIDALGO',13,'MEXICO'),
('HUASCA DE OCAMPO',24,'HIDALGO',13,'MEXICO'),
('HUAUTLA',25,'HIDALGO',13,'MEXICO'),
('HUAZALINGO',26,'HIDALGO',13,'MEXICO'),
('HUEHUETLA',27,'HIDALGO',13,'MEXICO'),
('HUEJUTLA DE REYES',28,'HIDALGO',13,'MEXICO'),
('HUICHAPAN',29,'HIDALGO',13,'MEXICO'),
('IXMIQUILPAN',30,'HIDALGO',13,'MEXICO'),
('JACALA DE LEDEZMA',31,'HIDALGO',13,'MEXICO'),
('JALTOCAN',32,'HIDALGO',13,'MEXICO'),
('JUAREZ HIDALGO',33,'HIDALGO',13,'MEXICO'),
('LA MISION',34,'HIDALGO',13,'MEXICO'),
('LOLOTLA',35,'HIDALGO',13,'MEXICO'),
('METEPEC',36,'HIDALGO',13,'MEXICO'),
('METZTITLAN',37,'HIDALGO',13,'MEXICO'),
('MINERAL DE LA REFORMA',40,'HIDALGO',13,'MEXICO'),
('MINERAL DEL CHICO',38,'HIDALGO',13,'MEXICO'),
('MINERAL DEL MONTE',39,'HIDALGO',13,'MEXICO'),
('MIXQUIAHUALA DE JUAREZ',41,'HIDALGO',13,'MEXICO'),
('MOLANGO DE ESCAMILLA',42,'HIDALGO',13,'MEXICO'),
('NICOLAS FLORES',43,'HIDALGO',13,'MEXICO'),
('NOPALA DE VILLAGRAN',44,'HIDALGO',13,'MEXICO'),
('OMITLAN DE JUAREZ',45,'HIDALGO',13,'MEXICO'),
('PACHUCA DE SOTO',47,'HIDALGO',13,'MEXICO'),
('PACULA',46,'HIDALGO',13,'MEXICO'),
('PISAFLORES',48,'HIDALGO',13,'MEXICO'),
('PROGRESO DE OBREGON',49,'HIDALGO',13,'MEXICO'),
('SAN AGUSTIN METZQUITITLAN',50,'HIDALGO',13,'MEXICO'),
('SAN AGUSTIN TLAXIACA',51,'HIDALGO',13,'MEXICO'),
('SAN BARTOLO TUTOTEPEC',52,'HIDALGO',13,'MEXICO'),
('SAN FELIPE ORIZATLAN',53,'HIDALGO',13,'MEXICO'),
('SAN SALVADOR',54,'HIDALGO',13,'MEXICO'),
('SANTIAGO DE ANAYA',55,'HIDALGO',13,'MEXICO'),
('SANTIAGO TULANTEPEC DE LUGO GUERRERO',56,'HIDALGO',13,'MEXICO'),
('SINGUILUCAN',57,'HIDALGO',13,'MEXICO'),
('TASQUILLO',58,'HIDALGO',13,'MEXICO'),
('TECOZAUTLA',59,'HIDALGO',13,'MEXICO'),
('TENANGO DE DORIA',60,'HIDALGO',13,'MEXICO'),
('TEPEAPULCO',61,'HIDALGO',13,'MEXICO'),
('TEPEHUACAN DE GUERRERO',62,'HIDALGO',13,'MEXICO'),
('TEPEJI DEL RIO DE OCAMPO',63,'HIDALGO',13,'MEXICO'),
('TEPETITLAN',64,'HIDALGO',13,'MEXICO'),
('TETEPANGO',65,'HIDALGO',13,'MEXICO'),
('TEZONTEPEC DE ALDAMA',66,'HIDALGO',13,'MEXICO'),
('TIANGUISTENGO',67,'HIDALGO',13,'MEXICO'),
('TIZAYUCA',68,'HIDALGO',13,'MEXICO'),
('TLAHUELILPAN',69,'HIDALGO',13,'MEXICO'),
('TLAHUILTEPA',70,'HIDALGO',13,'MEXICO'),
('TLANALAPA',71,'HIDALGO',13,'MEXICO'),
('TLANCHINOL',72,'HIDALGO',13,'MEXICO'),
('TLAXCOAPAN',73,'HIDALGO',13,'MEXICO'),
('TOLCAYUCA',74,'HIDALGO',13,'MEXICO'),
('TULA DE ALLENDE',75,'HIDALGO',13,'MEXICO'),
('TULANCINGO DE BRAVO',76,'HIDALGO',13,'MEXICO'),
('VILLA DE TEZONTEPEC',77,'HIDALGO',13,'MEXICO'),
('XOCHIATIPAN',78,'HIDALGO',13,'MEXICO'),
('XOCHICOATLAN',79,'HIDALGO',13,'MEXICO'),
('YAHUALICA',80,'HIDALGO',13,'MEXICO'),
('ZACUALTIPAN DE ANGELES',81,'HIDALGO',13,'MEXICO'),
('ZAPOTLAN DE JUAREZ',82,'HIDALGO',13,'MEXICO'),
('ZEMPOALA',83,'HIDALGO',13,'MEXICO'),
('ZIMAPAN',84,'HIDALGO',13,'MEXICO'),
('ACATIC',1,'JALISCO',14,'MEXICO'),
('ACATLAN DE JUAREZ',2,'JALISCO',14,'MEXICO'),
('AHUALULCO DE MERCADO',3,'JALISCO',14,'MEXICO'),
('AMACUECA',4,'JALISCO',14,'MEXICO'),
('AMATITAN',5,'JALISCO',14,'MEXICO'),
('AMECA',6,'JALISCO',14,'MEXICO'),
('ARANDAS',8,'JALISCO',14,'MEXICO'),
('ATEMAJAC DE BRIZUELA',10,'JALISCO',14,'MEXICO'),
('ATENGO',11,'JALISCO',14,'MEXICO'),
('ATENGUILLO',12,'JALISCO',14,'MEXICO'),
('ATOTONILCO EL ALTO',13,'JALISCO',14,'MEXICO'),
('ATOYAC',14,'JALISCO',14,'MEXICO'),
('AUTLAN DE NAVARRO',15,'JALISCO',14,'MEXICO'),
('AYOTLAN',16,'JALISCO',14,'MEXICO'),
('AYUTLA',17,'JALISCO',14,'MEXICO'),
('BOLAÃ‘OS',19,'JALISCO',14,'MEXICO'),
('CABO CORRIENTES',20,'JALISCO',14,'MEXICO'),
('CAÃ‘ADAS DE OBREGON',117,'JALISCO',14,'MEXICO'),
('CASIMIRO CASTILLO',21,'JALISCO',14,'MEXICO'),
('CHAPALA',31,'JALISCO',14,'MEXICO'),
('CHIMALTITAN',32,'JALISCO',14,'MEXICO'),
('CHIQUILISTLAN',33,'JALISCO',14,'MEXICO'),
('CIHUATLAN',22,'JALISCO',14,'MEXICO'),
('COCULA',25,'JALISCO',14,'MEXICO'),
('COLOTLAN',26,'JALISCO',14,'MEXICO'),
('CONCEPCION DE BUENOS AIRES',27,'JALISCO',14,'MEXICO'),
('CUAUTITLAN DE GARCIA BARRAGAN',28,'JALISCO',14,'MEXICO'),
('CUAUTLA',29,'JALISCO',14,'MEXICO'),
('CUQUIO',30,'JALISCO',14,'MEXICO'),
('DEGOLLADO',34,'JALISCO',14,'MEXICO'),
('EJUTLA',35,'JALISCO',14,'MEXICO'),
('EL ARENAL',9,'JALISCO',14,'MEXICO'),
('EL GRULLO',39,'JALISCO',14,'MEXICO'),
('EL LIMON',56,'JALISCO',14,'MEXICO'),
('EL SALTO',72,'JALISCO',14,'MEXICO'),
('ENCARNACION DE DIAZ',36,'JALISCO',14,'MEXICO'),
('ETZATLAN',37,'JALISCO',14,'MEXICO'),
('GOMEZ FARIAS',38,'JALISCO',14,'MEXICO'),
('GUACHINANGO',40,'JALISCO',14,'MEXICO'),
('GUADALAJARA',41,'JALISCO',14,'MEXICO'),
('HOSTOTIPAQUILLO',42,'JALISCO',14,'MEXICO'),
('HUEJUCAR',43,'JALISCO',14,'MEXICO'),
('HUEJUQUILLA EL ALTO',44,'JALISCO',14,'MEXICO'),
('IXTLAHUACAN DE LOS MEMBRILLOS',46,'JALISCO',14,'MEXICO'),
('IXTLAHUACAN DEL RIO',47,'JALISCO',14,'MEXICO'),
('JALOSTOTITLAN',48,'JALISCO',14,'MEXICO'),
('JAMAY',49,'JALISCO',14,'MEXICO'),
('JESUS MARIA',50,'JALISCO',14,'MEXICO'),
('JILOTLAN DE LOS DOLORES',51,'JALISCO',14,'MEXICO'),
('JOCOTEPEC',52,'JALISCO',14,'MEXICO'),
('JUANACATLAN',53,'JALISCO',14,'MEXICO'),
('JUCHITLAN',54,'JALISCO',14,'MEXICO'),
('LA BARCA',18,'JALISCO',14,'MEXICO'),
('LA HUERTA',45,'JALISCO',14,'MEXICO'),
('LA MANZANILLA DE LA PAZ',59,'JALISCO',14,'MEXICO'),
('LAGOS DE MORENO',55,'JALISCO',14,'MEXICO'),
('MAGDALENA',57,'JALISCO',14,'MEXICO'),
('MASCOTA',60,'JALISCO',14,'MEXICO'),
('MAZAMITLA',61,'JALISCO',14,'MEXICO'),
('MEXTICACAN',62,'JALISCO',14,'MEXICO'),
('MEZQUITIC',63,'JALISCO',14,'MEXICO'),
('MIXTLAN',64,'JALISCO',14,'MEXICO'),
('OCOTLAN',65,'JALISCO',14,'MEXICO'),
('OJUELOS DE JALISCO',66,'JALISCO',14,'MEXICO'),
('PIHUAMO',67,'JALISCO',14,'MEXICO'),
('PONCITLAN',68,'JALISCO',14,'MEXICO'),
('PUERTO VALLARTA',69,'JALISCO',14,'MEXICO'),
('QUITUPAN',71,'JALISCO',14,'MEXICO'),
('SAN CRISTOBAL DE LA BARRANCA',73,'JALISCO',14,'MEXICO'),
('SAN DIEGO DE ALEJANDRIA',74,'JALISCO',14,'MEXICO'),
('SAN GABRIEL',24,'JALISCO',14,'MEXICO'),
('SAN IGNACIO CERRO GORDO',125,'JALISCO',14,'MEXICO'),
('SAN JUAN DE LOS LAGOS',75,'JALISCO',14,'MEXICO'),
('SAN JUANITO DE ESCOBEDO',7,'JALISCO',14,'MEXICO'),
('SAN JULIAN',76,'JALISCO',14,'MEXICO'),
('SAN MARCOS',77,'JALISCO',14,'MEXICO'),
('SAN MARTIN DE BOLAÃ‘OS',78,'JALISCO',14,'MEXICO'),
('SAN MARTIN HIDALGO',79,'JALISCO',14,'MEXICO'),
('SAN MIGUEL EL ALTO',80,'JALISCO',14,'MEXICO'),
('SAN PEDRO TLAQUEPAQUE',99,'JALISCO',14,'MEXICO'),
('SAN SEBASTIAN DEL OESTE',81,'JALISCO',14,'MEXICO'),
('SANTA MARIA DE LOS ANGELES',82,'JALISCO',14,'MEXICO'),
('SANTA MARIA DEL ORO',58,'JALISCO',14,'MEXICO'),
('SAYULA',83,'JALISCO',14,'MEXICO'),
('TALA',84,'JALISCO',14,'MEXICO'),
('TALPA DE ALLENDE',85,'JALISCO',14,'MEXICO'),
('TAMAZULA DE GORDIANO',86,'JALISCO',14,'MEXICO'),
('TAPALPA',87,'JALISCO',14,'MEXICO'),
('TECALITLAN',88,'JALISCO',14,'MEXICO'),
('TECHALUTA DE MONTENEGRO',90,'JALISCO',14,'MEXICO'),
('TECOLOTLAN',89,'JALISCO',14,'MEXICO'),
('TENAMAXTLAN',91,'JALISCO',14,'MEXICO'),
('TEOCALTICHE',92,'JALISCO',14,'MEXICO'),
('TEOCUITATLAN DE CORONA',93,'JALISCO',14,'MEXICO'),
('TEPATITLAN DE MORELOS',94,'JALISCO',14,'MEXICO'),
('TEQUILA',95,'JALISCO',14,'MEXICO'),
('TEUCHITLAN',96,'JALISCO',14,'MEXICO'),
('TIZAPAN EL ALTO',97,'JALISCO',14,'MEXICO'),
('TLAJOMULCO DE ZUÃ‘IGA',98,'JALISCO',14,'MEXICO'),
('TOLIMAN',100,'JALISCO',14,'MEXICO'),
('TOMATLAN',101,'JALISCO',14,'MEXICO'),
('TONALA',102,'JALISCO',14,'MEXICO'),
('TONAYA',103,'JALISCO',14,'MEXICO'),
('TONILA',104,'JALISCO',14,'MEXICO'),
('TOTATICHE',105,'JALISCO',14,'MEXICO'),
('TOTOTLAN',106,'JALISCO',14,'MEXICO'),
('TUXCACUESCO',107,'JALISCO',14,'MEXICO'),
('TUXCUECA',108,'JALISCO',14,'MEXICO'),
('TUXPAN',109,'JALISCO',14,'MEXICO'),
('UNION DE SAN ANTONIO',110,'JALISCO',14,'MEXICO'),
('UNION DE TULA',111,'JALISCO',14,'MEXICO'),
('VALLE DE GUADALUPE',112,'JALISCO',14,'MEXICO'),
('VALLE DE JUAREZ',113,'JALISCO',14,'MEXICO'),
('VILLA CORONA',114,'JALISCO',14,'MEXICO'),
('VILLA GUERRERO',115,'JALISCO',14,'MEXICO'),
('VILLA HIDALGO',116,'JALISCO',14,'MEXICO'),
('VILLA PURIFICACION',70,'JALISCO',14,'MEXICO'),
('YAHUALICA DE GONZALEZ GALLO',118,'JALISCO',14,'MEXICO'),
('ZACOALCO DE TORRES',119,'JALISCO',14,'MEXICO'),
('ZAPOPAN',120,'JALISCO',14,'MEXICO'),
('ZAPOTILTIC',121,'JALISCO',14,'MEXICO'),
('ZAPOTITLAN DE VADILLO',122,'JALISCO',14,'MEXICO'),
('ZAPOTLAN DEL REY',123,'JALISCO',14,'MEXICO'),
('ZAPOTLAN EL GRANDE',23,'JALISCO',14,'MEXICO'),
('ZAPOTLANEJO',124,'JALISCO',14,'MEXICO'),
('ACAMBAY DE RUIZ CASTAÃ‘EDA',1,'MEXICO',15,'MEXICO'),
('ACOLMAN',2,'MEXICO',15,'MEXICO'),
('ACULCO',3,'MEXICO',15,'MEXICO'),
('ALMOLOYA DE ALQUISIRAS',4,'MEXICO',15,'MEXICO'),
('ALMOLOYA DE JUAREZ',5,'MEXICO',15,'MEXICO'),
('ALMOLOYA DEL RIO',6,'MEXICO',15,'MEXICO'),
('AMANALCO',7,'MEXICO',15,'MEXICO'),
('AMATEPEC',8,'MEXICO',15,'MEXICO'),
('AMECAMECA',9,'MEXICO',15,'MEXICO'),
('APAXCO',10,'MEXICO',15,'MEXICO'),
('ATENCO',11,'MEXICO',15,'MEXICO'),
('ATIZAPAN',12,'MEXICO',15,'MEXICO'),
('ATIZAPAN DE ZARAGOZA',13,'MEXICO',15,'MEXICO'),
('ATLACOMULCO',14,'MEXICO',15,'MEXICO'),
('ATLAUTLA',15,'MEXICO',15,'MEXICO'),
('AXAPUSCO',16,'MEXICO',15,'MEXICO'),
('AYAPANGO',17,'MEXICO',15,'MEXICO'),
('CALIMAYA',18,'MEXICO',15,'MEXICO'),
('CAPULHUAC',19,'MEXICO',15,'MEXICO'),
('CHALCO',26,'MEXICO',15,'MEXICO'),
('CHAPA DE MOTA',27,'MEXICO',15,'MEXICO'),
('CHAPULTEPEC',28,'MEXICO',15,'MEXICO'),
('CHIAUTLA',29,'MEXICO',15,'MEXICO'),
('CHICOLOAPAN',30,'MEXICO',15,'MEXICO'),
('CHICONCUAC',31,'MEXICO',15,'MEXICO'),
('CHIMALHUACAN',32,'MEXICO',15,'MEXICO'),
('COACALCO DE BERRIOZABAL',20,'MEXICO',15,'MEXICO'),
('COATEPEC HARINAS',21,'MEXICO',15,'MEXICO'),
('COCOTITLAN',22,'MEXICO',15,'MEXICO'),
('COYOTEPEC',23,'MEXICO',15,'MEXICO'),
('CUAUTITLAN',24,'MEXICO',15,'MEXICO'),
('CUAUTITLAN IZCALLI',25,'MEXICO',15,'MEXICO'),
('DONATO GUERRA',33,'MEXICO',15,'MEXICO'),
('ECATEPEC DE MORELOS',34,'MEXICO',15,'MEXICO'),
('ECATZINGO',35,'MEXICO',15,'MEXICO'),
('EL ORO',65,'MEXICO',15,'MEXICO'),
('HUEHUETOCA',36,'MEXICO',15,'MEXICO'),
('HUEYPOXTLA',37,'MEXICO',15,'MEXICO'),
('HUIXQUILUCAN',38,'MEXICO',15,'MEXICO'),
('ISIDRO FABELA',39,'MEXICO',15,'MEXICO'),
('IXTAPALUCA',40,'MEXICO',15,'MEXICO'),
('IXTAPAN DE LA SAL',41,'MEXICO',15,'MEXICO'),
('IXTAPAN DEL ORO',42,'MEXICO',15,'MEXICO'),
('IXTLAHUACA',43,'MEXICO',15,'MEXICO'),
('JALTENCO',45,'MEXICO',15,'MEXICO'),
('JILOTEPEC',46,'MEXICO',15,'MEXICO'),
('JILOTZINGO',47,'MEXICO',15,'MEXICO'),
('JIQUIPILCO',48,'MEXICO',15,'MEXICO'),
('JOCOTITLAN',49,'MEXICO',15,'MEXICO'),
('JOQUICINGO',50,'MEXICO',15,'MEXICO'),
('JUCHITEPEC',51,'MEXICO',15,'MEXICO'),
('LA PAZ',71,'MEXICO',15,'MEXICO'),
('LERMA',52,'MEXICO',15,'MEXICO'),
('LUVIANOS',123,'MEXICO',15,'MEXICO'),
('MALINALCO',53,'MEXICO',15,'MEXICO'),
('MELCHOR OCAMPO',54,'MEXICO',15,'MEXICO'),
('METEPEC',55,'MEXICO',15,'MEXICO'),
('MEXICALTZINGO',56,'MEXICO',15,'MEXICO'),
('MORELOS',57,'MEXICO',15,'MEXICO'),
('NAUCALPAN DE JUAREZ',58,'MEXICO',15,'MEXICO'),
('NEXTLALPAN',59,'MEXICO',15,'MEXICO'),
('NEZAHUALCOYOTL',60,'MEXICO',15,'MEXICO'),
('NICOLAS ROMERO',61,'MEXICO',15,'MEXICO'),
('NOPALTEPEC',62,'MEXICO',15,'MEXICO'),
('OCOYOACAC',63,'MEXICO',15,'MEXICO'),
('OCUILAN',64,'MEXICO',15,'MEXICO'),
('OTUMBA',66,'MEXICO',15,'MEXICO'),
('OTZOLOAPAN',67,'MEXICO',15,'MEXICO'),
('OTZOLOTEPEC',68,'MEXICO',15,'MEXICO'),
('OZUMBA',69,'MEXICO',15,'MEXICO'),
('PAPALOTLA',70,'MEXICO',15,'MEXICO'),
('POLOTITLAN',72,'MEXICO',15,'MEXICO'),
('RAYON',73,'MEXICO',15,'MEXICO'),
('SAN ANTONIO LA ISLA',74,'MEXICO',15,'MEXICO'),
('SAN FELIPE DEL PROGRESO',75,'MEXICO',15,'MEXICO'),
('SAN JOSE DEL RINCON',124,'MEXICO',15,'MEXICO'),
('SAN MARTIN DE LAS PIRAMIDES',76,'MEXICO',15,'MEXICO'),
('SAN MATEO ATENCO',77,'MEXICO',15,'MEXICO'),
('SAN SIMON DE GUERRERO',78,'MEXICO',15,'MEXICO'),
('SANTO TOMAS',79,'MEXICO',15,'MEXICO'),
('SOYANIQUILPAN DE JUAREZ',80,'MEXICO',15,'MEXICO'),
('SULTEPEC',81,'MEXICO',15,'MEXICO'),
('TECAMAC',82,'MEXICO',15,'MEXICO'),
('TEJUPILCO',83,'MEXICO',15,'MEXICO'),
('TEMAMATLA',84,'MEXICO',15,'MEXICO'),
('TEMASCALAPA',85,'MEXICO',15,'MEXICO'),
('TEMASCALCINGO',86,'MEXICO',15,'MEXICO'),
('TEMASCALTEPEC',87,'MEXICO',15,'MEXICO'),
('TEMOAYA',88,'MEXICO',15,'MEXICO'),
('TENANCINGO',89,'MEXICO',15,'MEXICO'),
('TENANGO DEL AIRE',90,'MEXICO',15,'MEXICO'),
('TENANGO DEL VALLE',91,'MEXICO',15,'MEXICO'),
('TEOLOYUCAN',92,'MEXICO',15,'MEXICO'),
('TEOTIHUACAN',93,'MEXICO',15,'MEXICO'),
('TEPETLAOXTOC',94,'MEXICO',15,'MEXICO'),
('TEPETLIXPA',95,'MEXICO',15,'MEXICO'),
('TEPOTZOTLAN',96,'MEXICO',15,'MEXICO'),
('TEQUIXQUIAC',97,'MEXICO',15,'MEXICO'),
('TEXCALTITLAN',98,'MEXICO',15,'MEXICO'),
('TEXCALYACAC',99,'MEXICO',15,'MEXICO'),
('TEXCOCO',100,'MEXICO',15,'MEXICO'),
('TEZOYUCA',101,'MEXICO',15,'MEXICO'),
('TIANGUISTENCO',102,'MEXICO',15,'MEXICO'),
('TIMILPAN',103,'MEXICO',15,'MEXICO'),
('TLALMANALCO',104,'MEXICO',15,'MEXICO'),
('TLALNEPANTLA DE BAZ',105,'MEXICO',15,'MEXICO'),
('TLATLAYA',106,'MEXICO',15,'MEXICO'),
('TOLUCA',107,'MEXICO',15,'MEXICO'),
('TONANITLA',125,'MEXICO',15,'MEXICO'),
('TONATICO',108,'MEXICO',15,'MEXICO'),
('TULTEPEC',109,'MEXICO',15,'MEXICO'),
('TULTITLAN',110,'MEXICO',15,'MEXICO'),
('VALLE DE BRAVO',111,'MEXICO',15,'MEXICO'),
('VALLE DE CHALCO SOLIDARIDAD',122,'MEXICO',15,'MEXICO'),
('VILLA DE ALLENDE',112,'MEXICO',15,'MEXICO'),
('VILLA DEL CARBON',113,'MEXICO',15,'MEXICO'),
('VILLA GUERRERO',114,'MEXICO',15,'MEXICO'),
('VILLA VICTORIA',115,'MEXICO',15,'MEXICO'),
('XALATLACO',44,'MEXICO',15,'MEXICO'),
('XONACATLAN',116,'MEXICO',15,'MEXICO'),
('ZACAZONAPAN',117,'MEXICO',15,'MEXICO'),
('ZACUALPAN',118,'MEXICO',15,'MEXICO'),
('ZINACANTEPEC',119,'MEXICO',15,'MEXICO'),
('ZUMPAHUACAN',120,'MEXICO',15,'MEXICO'),
('ZUMPANGO',121,'MEXICO',15,'MEXICO'),
('ACUITZIO',1,'MICHOACAN',16,'MEXICO'),
('AGUILILLA',2,'MICHOACAN',16,'MEXICO'),
('ALVARO OBREGON',3,'MICHOACAN',16,'MEXICO'),
('ANGAMACUTIRO',4,'MICHOACAN',16,'MEXICO'),
('ANGANGUEO',5,'MICHOACAN',16,'MEXICO'),
('APATZINGAN',6,'MICHOACAN',16,'MEXICO'),
('APORO',7,'MICHOACAN',16,'MEXICO'),
('AQUILA',8,'MICHOACAN',16,'MEXICO'),
('ARIO',9,'MICHOACAN',16,'MEXICO'),
('ARTEAGA',10,'MICHOACAN',16,'MEXICO'),
('BRISEÃ‘AS',11,'MICHOACAN',16,'MEXICO'),
('BUENAVISTA',12,'MICHOACAN',16,'MEXICO'),
('CARACUARO',13,'MICHOACAN',16,'MEXICO'),
('CHARAPAN',21,'MICHOACAN',16,'MEXICO'),
('CHARO',22,'MICHOACAN',16,'MEXICO'),
('CHAVINDA',23,'MICHOACAN',16,'MEXICO'),
('CHERAN',24,'MICHOACAN',16,'MEXICO'),
('CHILCHOTA',25,'MICHOACAN',16,'MEXICO'),
('CHINICUILA',26,'MICHOACAN',16,'MEXICO'),
('CHUCANDIRO',27,'MICHOACAN',16,'MEXICO'),
('CHURINTZIO',28,'MICHOACAN',16,'MEXICO'),
('CHURUMUCO',29,'MICHOACAN',16,'MEXICO'),
('COAHUAYANA',14,'MICHOACAN',16,'MEXICO'),
('COALCOMAN DE VAZQUEZ PALLARES',15,'MICHOACAN',16,'MEXICO'),
('COENEO',16,'MICHOACAN',16,'MEXICO'),
('COJUMATLAN DE REGULES',75,'MICHOACAN',16,'MEXICO'),
('CONTEPEC',17,'MICHOACAN',16,'MEXICO'),
('COPANDARO',18,'MICHOACAN',16,'MEXICO'),
('COTIJA',19,'MICHOACAN',16,'MEXICO'),
('CUITZEO',20,'MICHOACAN',16,'MEXICO'),
('ECUANDUREO',30,'MICHOACAN',16,'MEXICO'),
('EPITACIO HUERTA',31,'MICHOACAN',16,'MEXICO'),
('ERONGARICUARO',32,'MICHOACAN',16,'MEXICO'),
('GABRIEL ZAMORA',33,'MICHOACAN',16,'MEXICO'),
('HIDALGO',34,'MICHOACAN',16,'MEXICO'),
('HUANDACAREO',36,'MICHOACAN',16,'MEXICO'),
('HUANIQUEO',37,'MICHOACAN',16,'MEXICO'),
('HUETAMO',38,'MICHOACAN',16,'MEXICO'),
('HUIRAMBA',39,'MICHOACAN',16,'MEXICO'),
('INDAPARAPEO',40,'MICHOACAN',16,'MEXICO'),
('IRIMBO',41,'MICHOACAN',16,'MEXICO'),
('IXTLAN',42,'MICHOACAN',16,'MEXICO'),
('JACONA',43,'MICHOACAN',16,'MEXICO'),
('JIMENEZ',44,'MICHOACAN',16,'MEXICO'),
('JIQUILPAN',45,'MICHOACAN',16,'MEXICO'),
('JOSE SIXTO VERDUZCO',46,'MICHOACAN',16,'MEXICO'),
('JUAREZ',47,'MICHOACAN',16,'MEXICO'),
('JUNGAPEO',48,'MICHOACAN',16,'MEXICO'),
('LA HUACANA',35,'MICHOACAN',16,'MEXICO'),
('LA PIEDAD',70,'MICHOACAN',16,'MEXICO'),
('LAGUNILLAS',49,'MICHOACAN',16,'MEXICO'),
('LAZARO CARDENAS',50,'MICHOACAN',16,'MEXICO'),
('LOS REYES',76,'MICHOACAN',16,'MEXICO'),
('MADERO',51,'MICHOACAN',16,'MEXICO'),
('MARAVATIO',52,'MICHOACAN',16,'MEXICO'),
('MARCOS CASTELLANOS',53,'MICHOACAN',16,'MEXICO'),
('MORELIA',54,'MICHOACAN',16,'MEXICO'),
('MORELOS',55,'MICHOACAN',16,'MEXICO'),
('MUGICA',56,'MICHOACAN',16,'MEXICO'),
('NAHUATZEN',57,'MICHOACAN',16,'MEXICO'),
('NOCUPETARO',58,'MICHOACAN',16,'MEXICO'),
('NUEVO PARANGARICUTIRO',59,'MICHOACAN',16,'MEXICO'),
('NUEVO URECHO',60,'MICHOACAN',16,'MEXICO'),
('NUMARAN',61,'MICHOACAN',16,'MEXICO'),
('OCAMPO',62,'MICHOACAN',16,'MEXICO'),
('PAJACUARAN',63,'MICHOACAN',16,'MEXICO'),
('PANINDICUARO',64,'MICHOACAN',16,'MEXICO'),
('PARACHO',66,'MICHOACAN',16,'MEXICO'),
('PARACUARO',65,'MICHOACAN',16,'MEXICO'),
('PATZCUARO',67,'MICHOACAN',16,'MEXICO'),
('PENJAMILLO',68,'MICHOACAN',16,'MEXICO'),
('PERIBAN',69,'MICHOACAN',16,'MEXICO'),
('PUREPERO',71,'MICHOACAN',16,'MEXICO'),
('PURUANDIRO',72,'MICHOACAN',16,'MEXICO'),
('QUERENDARO',73,'MICHOACAN',16,'MEXICO'),
('QUIROGA',74,'MICHOACAN',16,'MEXICO'),
('SAHUAYO',77,'MICHOACAN',16,'MEXICO'),
('SALVADOR ESCALANTE',80,'MICHOACAN',16,'MEXICO'),
('SAN LUCAS',78,'MICHOACAN',16,'MEXICO'),
('SANTA ANA MAYA',79,'MICHOACAN',16,'MEXICO'),
('SENGUIO',81,'MICHOACAN',16,'MEXICO'),
('SUSUPUATO',82,'MICHOACAN',16,'MEXICO'),
('TACAMBARO',83,'MICHOACAN',16,'MEXICO'),
('TANCITARO',84,'MICHOACAN',16,'MEXICO'),
('TANGAMANDAPIO',85,'MICHOACAN',16,'MEXICO'),
('TANGANCICUARO',86,'MICHOACAN',16,'MEXICO'),
('TANHUATO',87,'MICHOACAN',16,'MEXICO'),
('TARETAN',88,'MICHOACAN',16,'MEXICO'),
('TARIMBARO',89,'MICHOACAN',16,'MEXICO'),
('TEPALCATEPEC',90,'MICHOACAN',16,'MEXICO'),
('TING?INDIN',92,'MICHOACAN',16,'MEXICO'),
('TINGAMBATO',91,'MICHOACAN',16,'MEXICO'),
('TIQUICHEO DE NICOLAS ROMERO',93,'MICHOACAN',16,'MEXICO'),
('TLALPUJAHUA',94,'MICHOACAN',16,'MEXICO'),
('TLAZAZALCA',95,'MICHOACAN',16,'MEXICO'),
('TOCUMBO',96,'MICHOACAN',16,'MEXICO'),
('TUMBISCATIO',97,'MICHOACAN',16,'MEXICO'),
('TURICATO',98,'MICHOACAN',16,'MEXICO'),
('TUXPAN',99,'MICHOACAN',16,'MEXICO'),
('TUZANTLA',100,'MICHOACAN',16,'MEXICO'),
('TZINTZUNTZAN',101,'MICHOACAN',16,'MEXICO'),
('TZITZIO',102,'MICHOACAN',16,'MEXICO'),
('URUAPAN',103,'MICHOACAN',16,'MEXICO'),
('VENUSTIANO CARRANZA',104,'MICHOACAN',16,'MEXICO'),
('VILLAMAR',105,'MICHOACAN',16,'MEXICO'),
('VISTA HERMOSA',106,'MICHOACAN',16,'MEXICO'),
('YURECUARO',107,'MICHOACAN',16,'MEXICO'),
('ZACAPU',108,'MICHOACAN',16,'MEXICO'),
('ZAMORA',109,'MICHOACAN',16,'MEXICO'),
('ZINAPARO',110,'MICHOACAN',16,'MEXICO'),
('ZINAPECUARO',111,'MICHOACAN',16,'MEXICO'),
('ZIRACUARETIRO',112,'MICHOACAN',16,'MEXICO'),
('ZITACUARO',113,'MICHOACAN',16,'MEXICO'),
('AMACUZAC',1,'MORELOS',17,'MEXICO'),
('ATLATLAHUCAN',2,'MORELOS',17,'MEXICO'),
('AXOCHIAPAN',3,'MORELOS',17,'MEXICO'),
('AYALA',4,'MORELOS',17,'MEXICO'),
('COATLAN DEL RIO',5,'MORELOS',17,'MEXICO'),
('CUAUTLA',6,'MORELOS',17,'MEXICO'),
('CUERNAVACA',7,'MORELOS',17,'MEXICO'),
('EMILIANO ZAPATA',8,'MORELOS',17,'MEXICO'),
('HUITZILAC',9,'MORELOS',17,'MEXICO'),
('JANTETELCO',10,'MORELOS',17,'MEXICO'),
('JIUTEPEC',11,'MORELOS',17,'MEXICO'),
('JOJUTLA',12,'MORELOS',17,'MEXICO'),
('JONACATEPEC',13,'MORELOS',17,'MEXICO'),
('MAZATEPEC',14,'MORELOS',17,'MEXICO'),
('MIACATLAN',15,'MORELOS',17,'MEXICO'),
('OCUITUCO',16,'MORELOS',17,'MEXICO'),
('PUENTE DE IXTLA',17,'MORELOS',17,'MEXICO'),
('TEMIXCO',18,'MORELOS',17,'MEXICO'),
('TEMOAC',33,'MORELOS',17,'MEXICO'),
('TEPALCINGO',19,'MORELOS',17,'MEXICO'),
('TEPOZTLAN',20,'MORELOS',17,'MEXICO'),
('TETECALA',21,'MORELOS',17,'MEXICO'),
('TETELA DEL VOLCAN',22,'MORELOS',17,'MEXICO'),
('TLALNEPANTLA',23,'MORELOS',17,'MEXICO'),
('TLALTIZAPAN DE ZAPATA',24,'MORELOS',17,'MEXICO'),
('TLAQUILTENANGO',25,'MORELOS',17,'MEXICO'),
('TLAYACAPAN',26,'MORELOS',17,'MEXICO'),
('TOTOLAPAN',27,'MORELOS',17,'MEXICO'),
('XOCHITEPEC',28,'MORELOS',17,'MEXICO'),
('YAUTEPEC',29,'MORELOS',17,'MEXICO'),
('YECAPIXTLA',30,'MORELOS',17,'MEXICO'),
('ZACATEPEC',31,'MORELOS',17,'MEXICO'),
('ZACUALPAN DE AMILPAS',32,'MORELOS',17,'MEXICO'),
('ACAPONETA',1,'NAYARIT',18,'MEXICO'),
('AHUACATLAN',2,'NAYARIT',18,'MEXICO'),
('AMATLAN DE CAÃ‘AS',3,'NAYARIT',18,'MEXICO'),
('BAHIA DE BANDERAS',4,'NAYARIT',18,'MEXICO'),
('COMPOSTELA',5,'NAYARIT',18,'MEXICO'),
('DEL NAYAR',9,'NAYARIT',18,'MEXICO'),
('HUAJICORI',6,'NAYARIT',18,'MEXICO'),
('IXTLAN DEL RIO',7,'NAYARIT',18,'MEXICO'),
('JALA',8,'NAYARIT',18,'MEXICO'),
('LA YESCA',20,'NAYARIT',18,'MEXICO'),
('ROSAMORADA',10,'NAYARIT',18,'MEXICO'),
('RUIZ',11,'NAYARIT',18,'MEXICO'),
('SAN BLAS',12,'NAYARIT',18,'MEXICO'),
('SAN PEDRO LAGUNILLAS',13,'NAYARIT',18,'MEXICO'),
('SANTA MARIA DEL ORO',14,'NAYARIT',18,'MEXICO'),
('SANTIAGO IXCUINTLA',15,'NAYARIT',18,'MEXICO'),
('TECUALA',16,'NAYARIT',18,'MEXICO'),
('TEPIC',17,'NAYARIT',18,'MEXICO'),
('TUXPAN',18,'NAYARIT',18,'MEXICO'),
('XALISCO',19,'NAYARIT',18,'MEXICO'),
('ABASOLO',1,'NUEVO LEON',19,'MEXICO'),
('AGUALEGUAS',2,'NUEVO LEON',19,'MEXICO'),
('ALLENDE',4,'NUEVO LEON',19,'MEXICO'),
('ANAHUAC',5,'NUEVO LEON',19,'MEXICO'),
('APODACA',6,'NUEVO LEON',19,'MEXICO'),
('ARAMBERRI',7,'NUEVO LEON',19,'MEXICO'),
('BUSTAMANTE',8,'NUEVO LEON',19,'MEXICO'),
('CADEREYTA JIMENEZ',9,'NUEVO LEON',19,'MEXICO'),
('CARMEN',10,'NUEVO LEON',19,'MEXICO'),
('CERRALVO',11,'NUEVO LEON',19,'MEXICO'),
('CHINA',13,'NUEVO LEON',19,'MEXICO'),
('CIENEGA DE FLORES',12,'NUEVO LEON',19,'MEXICO'),
('DR. ARROYO',14,'NUEVO LEON',19,'MEXICO'),
('DR. COSS',15,'NUEVO LEON',19,'MEXICO'),
('DR. GONZALEZ',16,'NUEVO LEON',19,'MEXICO'),
('GALEANA',17,'NUEVO LEON',19,'MEXICO'),
('GARCIA',18,'NUEVO LEON',19,'MEXICO'),
('GRAL. BRAVO',20,'NUEVO LEON',19,'MEXICO'),
('GRAL. ESCOBEDO',21,'NUEVO LEON',19,'MEXICO'),
('GRAL. TERAN',22,'NUEVO LEON',19,'MEXICO'),
('GRAL. TREVIÃ‘O',23,'NUEVO LEON',19,'MEXICO'),
('GRAL. ZARAGOZA',24,'NUEVO LEON',19,'MEXICO'),
('GRAL. ZUAZUA',25,'NUEVO LEON',19,'MEXICO'),
('GUADALUPE',26,'NUEVO LEON',19,'MEXICO'),
('HIDALGO',28,'NUEVO LEON',19,'MEXICO'),
('HIGUERAS',29,'NUEVO LEON',19,'MEXICO'),
('HUALAHUISES',30,'NUEVO LEON',19,'MEXICO'),
('ITURBIDE',31,'NUEVO LEON',19,'MEXICO'),
('JUAREZ',32,'NUEVO LEON',19,'MEXICO'),
('LAMPAZOS DE NARANJO',33,'NUEVO LEON',19,'MEXICO'),
('LINARES',34,'NUEVO LEON',19,'MEXICO'),
('LOS ALDAMAS',3,'NUEVO LEON',19,'MEXICO'),
('LOS HERRERAS',27,'NUEVO LEON',19,'MEXICO'),
('LOS RAMONES',43,'NUEVO LEON',19,'MEXICO'),
('MARIN',35,'NUEVO LEON',19,'MEXICO'),
('MELCHOR OCAMPO',36,'NUEVO LEON',19,'MEXICO'),
('MIER Y NORIEGA',37,'NUEVO LEON',19,'MEXICO'),
('MINA',38,'NUEVO LEON',19,'MEXICO'),
('MONTEMORELOS',39,'NUEVO LEON',19,'MEXICO'),
('MONTERREY',40,'NUEVO LEON',19,'MEXICO'),
('PARAS',41,'NUEVO LEON',19,'MEXICO'),
('PESQUERIA',42,'NUEVO LEON',19,'MEXICO'),
('RAYONES',44,'NUEVO LEON',19,'MEXICO'),
('SABINAS HIDALGO',45,'NUEVO LEON',19,'MEXICO'),
('SALINAS VICTORIA',46,'NUEVO LEON',19,'MEXICO'),
('SAN NICOLAS DE LOS GARZA',47,'NUEVO LEON',19,'MEXICO'),
('SAN PEDRO GARZA GARCIA',19,'NUEVO LEON',19,'MEXICO'),
('SANTA CATARINA',48,'NUEVO LEON',19,'MEXICO'),
('SANTIAGO',49,'NUEVO LEON',19,'MEXICO'),
('VALLECILLO',50,'NUEVO LEON',19,'MEXICO'),
('VILLALDAMA',51,'NUEVO LEON',19,'MEXICO'),
('ABEJONES',1,'OAXACA',20,'MEXICO'),
('ACATLAN DE PEREZ FIGUEROA',2,'OAXACA',20,'MEXICO'),
('ANIMAS TRUJANO',3,'OAXACA',20,'MEXICO'),
('ASUNCION CACALOTEPEC',4,'OAXACA',20,'MEXICO'),
('ASUNCION CUYOTEPEJI',5,'OAXACA',20,'MEXICO'),
('ASUNCION IXTALTEPEC',6,'OAXACA',20,'MEXICO'),
('ASUNCION NOCHIXTLAN',7,'OAXACA',20,'MEXICO'),
('ASUNCION OCOTLAN',8,'OAXACA',20,'MEXICO'),
('ASUNCION TLACOLULITA',9,'OAXACA',20,'MEXICO'),
('AYOQUEZCO DE ALDAMA',10,'OAXACA',20,'MEXICO'),
('AYOTZINTEPEC',11,'OAXACA',20,'MEXICO'),
('CALIHUALA',13,'OAXACA',20,'MEXICO'),
('CANDELARIA LOXICHA',14,'OAXACA',20,'MEXICO'),
('CAPULALPAM DE MENDEZ',559,'OAXACA',20,'MEXICO'),
('CHAHUITES',15,'OAXACA',20,'MEXICO'),
('CHALCATONGO DE HIDALGO',16,'OAXACA',20,'MEXICO'),
('CHIQUIHUITLAN DE BENITO JUAREZ',187,'OAXACA',20,'MEXICO'),
('CIENEGA DE ZIMATLAN',17,'OAXACA',20,'MEXICO'),
('CIUDAD IXTEPEC',41,'OAXACA',20,'MEXICO'),
('COATECAS ALTAS',18,'OAXACA',20,'MEXICO'),
('COICOYAN DE LAS FLORES',19,'OAXACA',20,'MEXICO'),
('CONCEPCION BUENAVISTA',21,'OAXACA',20,'MEXICO'),
('CONCEPCION PAPALO',22,'OAXACA',20,'MEXICO'),
('CONSTANCIA DEL ROSARIO',23,'OAXACA',20,'MEXICO'),
('COSOLAPA',24,'OAXACA',20,'MEXICO'),
('COSOLTEPEC',25,'OAXACA',20,'MEXICO'),
('CUILAPAM DE GUERRERO',26,'OAXACA',20,'MEXICO'),
('CUYAMECALCO VILLA DE ZARAGOZA',27,'OAXACA',20,'MEXICO'),
('EL BARRIO DE LA SOLEDAD',12,'OAXACA',20,'MEXICO'),
('EL ESPINAL',30,'OAXACA',20,'MEXICO'),
('ELOXOCHITLAN DE FLORES MAGON',29,'OAXACA',20,'MEXICO'),
('FRESNILLO DE TRUJANO',31,'OAXACA',20,'MEXICO'),
('GUADALUPE DE RAMIREZ',32,'OAXACA',20,'MEXICO'),
('GUADALUPE ETLA',33,'OAXACA',20,'MEXICO'),
('GUELATAO DE JUAREZ',34,'OAXACA',20,'MEXICO'),
('GUEVEA DE HUMBOLDT',35,'OAXACA',20,'MEXICO'),
('H VILLA TEZOATLAN SEGURA Y LUNA CUNA IND OAX',549,'OAXACA',20,'MEXICO'),
('HEROICA CIUDAD DE EJUTLA DE CRESPO',28,'OAXACA',20,'MEXICO'),
('HEROICA CIUDAD DE HUAJUAPAN DE LEON',37,'OAXACA',20,'MEXICO'),
('HEROICA CIUDAD DE JUCHITAN DE ZARAGOZA',43,'OAXACA',20,'MEXICO'),
('HEROICA CIUDAD DE TLAXIACO',553,'OAXACA',20,'MEXICO'),
('HUAUTEPEC',38,'OAXACA',20,'MEXICO'),
('HUAUTLA DE JIMENEZ',39,'OAXACA',20,'MEXICO'),
('IXPANTEPEC NIEVES',40,'OAXACA',20,'MEXICO'),
('IXTLAN DE JUAREZ',42,'OAXACA',20,'MEXICO'),
('LA COMPAÃ‘IA',20,'OAXACA',20,'MEXICO'),
('LA PE',68,'OAXACA',20,'MEXICO'),
('LA REFORMA',73,'OAXACA',20,'MEXICO'),
('LA TRINIDAD VISTA HERMOSA',556,'OAXACA',20,'MEXICO'),
('LOMA BONITA',44,'OAXACA',20,'MEXICO'),
('MAGDALENA APASCO',45,'OAXACA',20,'MEXICO'),
('MAGDALENA JALTEPEC',46,'OAXACA',20,'MEXICO'),
('MAGDALENA MIXTEPEC',47,'OAXACA',20,'MEXICO'),
('MAGDALENA OCOTLAN',48,'OAXACA',20,'MEXICO'),
('MAGDALENA PEÃ‘ASCO',49,'OAXACA',20,'MEXICO'),
('MAGDALENA TEITIPAC',50,'OAXACA',20,'MEXICO'),
('MAGDALENA TEQUISISTLAN',51,'OAXACA',20,'MEXICO'),
('MAGDALENA TLACOTEPEC',52,'OAXACA',20,'MEXICO'),
('MAGDALENA YODOCONO DE PORFIRIO DIAZ',53,'OAXACA',20,'MEXICO'),
('MAGDALENA ZAHUATLAN',54,'OAXACA',20,'MEXICO'),
('MARISCALA DE JUAREZ',55,'OAXACA',20,'MEXICO'),
('MARTIRES DE TACUBAYA',56,'OAXACA',20,'MEXICO'),
('MATIAS ROMERO AVENDAÃ‘O',57,'OAXACA',20,'MEXICO'),
('MAZATLAN VILLA DE FLORES',58,'OAXACA',20,'MEXICO'),
('MESONES HIDALGO',36,'OAXACA',20,'MEXICO'),
('MIAHUATLAN DE PORFIRIO DIAZ',59,'OAXACA',20,'MEXICO'),
('MIXISTLAN DE LA REFORMA',60,'OAXACA',20,'MEXICO'),
('MONJAS',61,'OAXACA',20,'MEXICO'),
('NATIVIDAD',62,'OAXACA',20,'MEXICO'),
('NAZARENO ETLA',63,'OAXACA',20,'MEXICO'),
('NEJAPA DE MADERO',64,'OAXACA',20,'MEXICO'),
('NUEVO ZOQUIAPAM',65,'OAXACA',20,'MEXICO'),
('OAXACA DE JUAREZ',66,'OAXACA',20,'MEXICO'),
('OCOTLAN DE MORELOS',67,'OAXACA',20,'MEXICO'),
('PINOTEPA DE DON LUIS',69,'OAXACA',20,'MEXICO'),
('PLUMA HIDALGO',70,'OAXACA',20,'MEXICO'),
('PUTLA VILLA DE GUERRERO',71,'OAXACA',20,'MEXICO'),
('REFORMA DE PINEDA',72,'OAXACA',20,'MEXICO'),
('REYES ETLA',74,'OAXACA',20,'MEXICO'),
('ROJAS DE CUAUHTEMOC',75,'OAXACA',20,'MEXICO'),
('SALINA CRUZ',76,'OAXACA',20,'MEXICO'),
('SAN AGUSTIN AMATENGO',77,'OAXACA',20,'MEXICO'),
('SAN AGUSTIN ATENANGO',78,'OAXACA',20,'MEXICO'),
('SAN AGUSTIN CHAYUCO',79,'OAXACA',20,'MEXICO'),
('SAN AGUSTIN DE LAS JUNTAS',80,'OAXACA',20,'MEXICO'),
('SAN AGUSTIN ETLA',81,'OAXACA',20,'MEXICO'),
('SAN AGUSTIN LOXICHA',82,'OAXACA',20,'MEXICO'),
('SAN AGUSTIN TLACOTEPEC',83,'OAXACA',20,'MEXICO'),
('SAN AGUSTIN YATARENI',84,'OAXACA',20,'MEXICO'),
('SAN ANDRES CABECERA NUEVA',85,'OAXACA',20,'MEXICO'),
('SAN ANDRES DINICUITI',86,'OAXACA',20,'MEXICO'),
('SAN ANDRES HUAXPALTEPEC',87,'OAXACA',20,'MEXICO'),
('SAN ANDRES HUAYAPAM',88,'OAXACA',20,'MEXICO'),
('SAN ANDRES IXTLAHUACA',89,'OAXACA',20,'MEXICO'),
('SAN ANDRES LAGUNAS',90,'OAXACA',20,'MEXICO'),
('SAN ANDRES NUXIÃ‘O',91,'OAXACA',20,'MEXICO'),
('SAN ANDRES PAXTLAN',92,'OAXACA',20,'MEXICO'),
('SAN ANDRES SINAXTLA',93,'OAXACA',20,'MEXICO'),
('SAN ANDRES SOLAGA',94,'OAXACA',20,'MEXICO'),
('SAN ANDRES TEOTILALPAM',95,'OAXACA',20,'MEXICO'),
('SAN ANDRES TEPETLAPA',96,'OAXACA',20,'MEXICO'),
('SAN ANDRES YAA',97,'OAXACA',20,'MEXICO'),
('SAN ANDRES ZABACHE',98,'OAXACA',20,'MEXICO'),
('SAN ANDRES ZAUTLA',99,'OAXACA',20,'MEXICO'),
('SAN ANTONINO CASTILLO VELASCO',100,'OAXACA',20,'MEXICO'),
('SAN ANTONINO EL ALTO',101,'OAXACA',20,'MEXICO'),
('SAN ANTONINO MONTE VERDE',102,'OAXACA',20,'MEXICO'),
('SAN ANTONIO ACUTLA',103,'OAXACA',20,'MEXICO'),
('SAN ANTONIO DE LA CAL',104,'OAXACA',20,'MEXICO'),
('SAN ANTONIO HUITEPEC',105,'OAXACA',20,'MEXICO'),
('SAN ANTONIO NANAHUATIPAM',106,'OAXACA',20,'MEXICO'),
('SAN ANTONIO SINICAHUA',107,'OAXACA',20,'MEXICO'),
('SAN ANTONIO TEPETLAPA',108,'OAXACA',20,'MEXICO'),
('SAN BALTAZAR CHICHICAPAM',109,'OAXACA',20,'MEXICO'),
('SAN BALTAZAR LOXICHA',110,'OAXACA',20,'MEXICO'),
('SAN BALTAZAR YATZACHI EL BAJO',111,'OAXACA',20,'MEXICO'),
('SAN BARTOLO COYOTEPEC',112,'OAXACA',20,'MEXICO'),
('SAN BARTOLO SOYALTEPEC',113,'OAXACA',20,'MEXICO'),
('SAN BARTOLO YAUTEPEC',114,'OAXACA',20,'MEXICO'),
('SAN BARTOLOME AYAUTLA',115,'OAXACA',20,'MEXICO'),
('SAN BARTOLOME LOXICHA',116,'OAXACA',20,'MEXICO'),
('SAN BARTOLOME QUIALANA',117,'OAXACA',20,'MEXICO'),
('SAN BARTOLOME YUCUAÃ‘E',118,'OAXACA',20,'MEXICO'),
('SAN BARTOLOME ZOOGOCHO',119,'OAXACA',20,'MEXICO'),
('SAN BERNARDO MIXTEPEC',120,'OAXACA',20,'MEXICO'),
('SAN BLAS ATEMPA',121,'OAXACA',20,'MEXICO'),
('SAN CARLOS YAUTEPEC',122,'OAXACA',20,'MEXICO'),
('SAN CRISTOBAL AMATLAN',123,'OAXACA',20,'MEXICO'),
('SAN CRISTOBAL AMOLTEPEC',124,'OAXACA',20,'MEXICO'),
('SAN CRISTOBAL LACHIRIOAG',125,'OAXACA',20,'MEXICO'),
('SAN CRISTOBAL SUCHIXTLAHUACA',126,'OAXACA',20,'MEXICO'),
('SAN DIONISIO DEL MAR',127,'OAXACA',20,'MEXICO'),
('SAN DIONISIO OCOTEPEC',128,'OAXACA',20,'MEXICO'),
('SAN DIONISIO OCOTLAN',129,'OAXACA',20,'MEXICO'),
('SAN ESTEBAN ATATLAHUCA',130,'OAXACA',20,'MEXICO'),
('SAN FELIPE JALAPA DE DIAZ',131,'OAXACA',20,'MEXICO'),
('SAN FELIPE TEJALAPAM',132,'OAXACA',20,'MEXICO'),
('SAN FELIPE USILA',133,'OAXACA',20,'MEXICO'),
('SAN FRANCISCO CAHUACUA',134,'OAXACA',20,'MEXICO'),
('SAN FRANCISCO CAJONOS',135,'OAXACA',20,'MEXICO'),
('SAN FRANCISCO CHAPULAPA',136,'OAXACA',20,'MEXICO'),
('SAN FRANCISCO CHINDUA',137,'OAXACA',20,'MEXICO'),
('SAN FRANCISCO DEL MAR',138,'OAXACA',20,'MEXICO'),
('SAN FRANCISCO HUEHUETLAN',139,'OAXACA',20,'MEXICO'),
('SAN FRANCISCO IXHUATAN',140,'OAXACA',20,'MEXICO'),
('SAN FRANCISCO JALTEPETONGO',141,'OAXACA',20,'MEXICO'),
('SAN FRANCISCO LACHIGOLO',142,'OAXACA',20,'MEXICO'),
('SAN FRANCISCO LOGUECHE',143,'OAXACA',20,'MEXICO'),
('SAN FRANCISCO NUXAÃ‘O',144,'OAXACA',20,'MEXICO'),
('SAN FRANCISCO OZOLOTEPEC',145,'OAXACA',20,'MEXICO'),
('SAN FRANCISCO SOLA',146,'OAXACA',20,'MEXICO'),
('SAN FRANCISCO TELIXTLAHUACA',147,'OAXACA',20,'MEXICO'),
('SAN FRANCISCO TEOPAN',148,'OAXACA',20,'MEXICO'),
('SAN FRANCISCO TLAPANCINGO',149,'OAXACA',20,'MEXICO'),
('SAN GABRIEL MIXTEPEC',150,'OAXACA',20,'MEXICO'),
('SAN ILDEFONSO AMATLAN',151,'OAXACA',20,'MEXICO'),
('SAN ILDEFONSO SOLA',152,'OAXACA',20,'MEXICO'),
('SAN ILDEFONSO VILLA ALTA',153,'OAXACA',20,'MEXICO'),
('SAN JACINTO AMILPAS',154,'OAXACA',20,'MEXICO'),
('SAN JACINTO TLACOTEPEC',155,'OAXACA',20,'MEXICO'),
('SAN JERONIMO COATLAN',156,'OAXACA',20,'MEXICO'),
('SAN JERONIMO SILACAYOAPILLA',157,'OAXACA',20,'MEXICO'),
('SAN JERONIMO SOSOLA',158,'OAXACA',20,'MEXICO'),
('SAN JERONIMO TAVICHE',159,'OAXACA',20,'MEXICO'),
('SAN JERONIMO TECOATL',160,'OAXACA',20,'MEXICO'),
('SAN JERONIMO TLACOCHAHUAYA',161,'OAXACA',20,'MEXICO'),
('SAN JORGE NUCHITA',162,'OAXACA',20,'MEXICO'),
('SAN JOSE AYUQUILA',163,'OAXACA',20,'MEXICO'),
('SAN JOSE CHILTEPEC',164,'OAXACA',20,'MEXICO'),
('SAN JOSE DEL PEÃ‘ASCO',165,'OAXACA',20,'MEXICO'),
('SAN JOSE DEL PROGRESO',169,'OAXACA',20,'MEXICO'),
('SAN JOSE ESTANCIA GRANDE',166,'OAXACA',20,'MEXICO'),
('SAN JOSE INDEPENDENCIA',167,'OAXACA',20,'MEXICO'),
('SAN JOSE LACHIGUIRI',168,'OAXACA',20,'MEXICO'),
('SAN JOSE TENANGO',170,'OAXACA',20,'MEXICO'),
('SAN JUAN ACHIUTLA',171,'OAXACA',20,'MEXICO'),
('SAN JUAN ATEPEC',172,'OAXACA',20,'MEXICO'),
('SAN JUAN BAUTISTA ATATLAHUCA',173,'OAXACA',20,'MEXICO'),
('SAN JUAN BAUTISTA COIXTLAHUACA',174,'OAXACA',20,'MEXICO'),
('SAN JUAN BAUTISTA CUICATLAN',175,'OAXACA',20,'MEXICO'),
('SAN JUAN BAUTISTA GUELACHE',176,'OAXACA',20,'MEXICO'),
('SAN JUAN BAUTISTA JAYACATLAN',177,'OAXACA',20,'MEXICO'),
('SAN JUAN BAUTISTA LO DE SOTO',178,'OAXACA',20,'MEXICO'),
('SAN JUAN BAUTISTA SUCHITEPEC',179,'OAXACA',20,'MEXICO'),
('SAN JUAN BAUTISTA TLACHICHILCO',180,'OAXACA',20,'MEXICO'),
('SAN JUAN BAUTISTA TLACOATZINTEPEC',181,'OAXACA',20,'MEXICO'),
('SAN JUAN BAUTISTA TUXTEPEC',182,'OAXACA',20,'MEXICO'),
('SAN JUAN BAUTISTA VALLE NACIONAL',183,'OAXACA',20,'MEXICO'),
('SAN JUAN CACAHUATEPEC',184,'OAXACA',20,'MEXICO'),
('SAN JUAN CHICOMEZUCHIL',185,'OAXACA',20,'MEXICO'),
('SAN JUAN CHILATECA',186,'OAXACA',20,'MEXICO'),
('SAN JUAN CIENEGUILLA',188,'OAXACA',20,'MEXICO'),
('SAN JUAN COATZOSPAM',189,'OAXACA',20,'MEXICO'),
('SAN JUAN COLORADO',190,'OAXACA',20,'MEXICO'),
('SAN JUAN COMALTEPEC',191,'OAXACA',20,'MEXICO'),
('SAN JUAN COTZOCON',192,'OAXACA',20,'MEXICO'),
('SAN JUAN DE LOS CUES',193,'OAXACA',20,'MEXICO'),
('SAN JUAN DEL ESTADO',194,'OAXACA',20,'MEXICO'),
('SAN JUAN DEL RIO',195,'OAXACA',20,'MEXICO'),
('SAN JUAN DIUXI',196,'OAXACA',20,'MEXICO'),
('SAN JUAN EVANGELISTA ANALCO',197,'OAXACA',20,'MEXICO'),
('SAN JUAN GUELAVIA',198,'OAXACA',20,'MEXICO'),
('SAN JUAN GUICHICOVI',199,'OAXACA',20,'MEXICO'),
('SAN JUAN IHUALTEPEC',200,'OAXACA',20,'MEXICO'),
('SAN JUAN JUQUILA MIXES',201,'OAXACA',20,'MEXICO'),
('SAN JUAN JUQUILA VIJANOS',202,'OAXACA',20,'MEXICO'),
('SAN JUAN LACHAO',203,'OAXACA',20,'MEXICO'),
('SAN JUAN LACHIGALLA',204,'OAXACA',20,'MEXICO'),
('SAN JUAN LAJARCIA',205,'OAXACA',20,'MEXICO'),
('SAN JUAN LALANA',206,'OAXACA',20,'MEXICO'),
('SAN JUAN MAZATLAN',207,'OAXACA',20,'MEXICO'),
('SAN JUAN MIXTEPEC',208,'OAXACA',20,'MEXICO'),
('SAN JUAN MIXTEPEC',209,'OAXACA',20,'MEXICO'),
('SAN JUAN Ã‘UMI',210,'OAXACA',20,'MEXICO'),
('SAN JUAN OZOLOTEPEC',211,'OAXACA',20,'MEXICO'),
('SAN JUAN PETLAPA',212,'OAXACA',20,'MEXICO'),
('SAN JUAN QUIAHIJE',213,'OAXACA',20,'MEXICO'),
('SAN JUAN QUIOTEPEC',214,'OAXACA',20,'MEXICO'),
('SAN JUAN SAYULTEPEC',215,'OAXACA',20,'MEXICO'),
('SAN JUAN TABAA',216,'OAXACA',20,'MEXICO'),
('SAN JUAN TAMAZOLA',217,'OAXACA',20,'MEXICO'),
('SAN JUAN TEITA',218,'OAXACA',20,'MEXICO'),
('SAN JUAN TEITIPAC',219,'OAXACA',20,'MEXICO'),
('SAN JUAN TEPEUXILA',220,'OAXACA',20,'MEXICO'),
('SAN JUAN TEPOSCOLULA',221,'OAXACA',20,'MEXICO'),
('SAN JUAN YAEE',222,'OAXACA',20,'MEXICO'),
('SAN JUAN YATZONA',223,'OAXACA',20,'MEXICO'),
('SAN JUAN YUCUITA',224,'OAXACA',20,'MEXICO'),
('SAN LORENZO',225,'OAXACA',20,'MEXICO'),
('SAN LORENZO ALBARRADAS',226,'OAXACA',20,'MEXICO'),
('SAN LORENZO CACAOTEPEC',227,'OAXACA',20,'MEXICO'),
('SAN LORENZO CUAUNECUILTITLA',228,'OAXACA',20,'MEXICO'),
('SAN LORENZO TEXMELUCAN',229,'OAXACA',20,'MEXICO'),
('SAN LORENZO VICTORIA',230,'OAXACA',20,'MEXICO'),
('SAN LUCAS CAMOTLAN',231,'OAXACA',20,'MEXICO'),
('SAN LUCAS OJITLAN',232,'OAXACA',20,'MEXICO'),
('SAN LUCAS QUIAVINI',233,'OAXACA',20,'MEXICO'),
('SAN LUCAS ZOQUIAPAM',234,'OAXACA',20,'MEXICO'),
('SAN LUIS AMATLAN',235,'OAXACA',20,'MEXICO'),
('SAN MARCIAL OZOLOTEPEC',236,'OAXACA',20,'MEXICO'),
('SAN MARCOS ARTEAGA',237,'OAXACA',20,'MEXICO'),
('SAN MARTIN DE LOS CANSECOS',238,'OAXACA',20,'MEXICO'),
('SAN MARTIN HUAMELULPAM',239,'OAXACA',20,'MEXICO'),
('SAN MARTIN ITUNYOSO',240,'OAXACA',20,'MEXICO'),
('SAN MARTIN LACHILA',241,'OAXACA',20,'MEXICO'),
('SAN MARTIN PERAS',242,'OAXACA',20,'MEXICO'),
('SAN MARTIN TILCAJETE',243,'OAXACA',20,'MEXICO'),
('SAN MARTIN TOXPALAN',244,'OAXACA',20,'MEXICO'),
('SAN MARTIN ZACATEPEC',245,'OAXACA',20,'MEXICO'),
('SAN MATEO CAJONOS',246,'OAXACA',20,'MEXICO'),
('SAN MATEO DEL MAR',247,'OAXACA',20,'MEXICO'),
('SAN MATEO ETLATONGO',248,'OAXACA',20,'MEXICO'),
('SAN MATEO NEJAPAM',249,'OAXACA',20,'MEXICO'),
('SAN MATEO PEÃ‘ASCO',250,'OAXACA',20,'MEXICO'),
('SAN MATEO PIÃ‘AS',251,'OAXACA',20,'MEXICO'),
('SAN MATEO RIO HONDO',252,'OAXACA',20,'MEXICO'),
('SAN MATEO SINDIHUI',253,'OAXACA',20,'MEXICO'),
('SAN MATEO TLAPILTEPEC',254,'OAXACA',20,'MEXICO'),
('SAN MATEO YOLOXOCHITLAN',255,'OAXACA',20,'MEXICO'),
('SAN MATEO YUCUTINDOO',567,'OAXACA',20,'MEXICO'),
('SAN MELCHOR BETAZA',256,'OAXACA',20,'MEXICO'),
('SAN MIGUEL ACHIUTLA',257,'OAXACA',20,'MEXICO'),
('SAN MIGUEL AHUEHUETITLAN',258,'OAXACA',20,'MEXICO'),
('SAN MIGUEL ALOAPAM',259,'OAXACA',20,'MEXICO'),
('SAN MIGUEL AMATITLAN',260,'OAXACA',20,'MEXICO'),
('SAN MIGUEL AMATLAN',261,'OAXACA',20,'MEXICO'),
('SAN MIGUEL CHICAHUA',262,'OAXACA',20,'MEXICO'),
('SAN MIGUEL CHIMALAPA',263,'OAXACA',20,'MEXICO'),
('SAN MIGUEL COATLAN',264,'OAXACA',20,'MEXICO'),
('SAN MIGUEL DEL PUERTO',265,'OAXACA',20,'MEXICO'),
('SAN MIGUEL DEL RIO',266,'OAXACA',20,'MEXICO'),
('SAN MIGUEL EJUTLA',267,'OAXACA',20,'MEXICO'),
('SAN MIGUEL EL GRANDE',268,'OAXACA',20,'MEXICO'),
('SAN MIGUEL HUAUTLA',269,'OAXACA',20,'MEXICO'),
('SAN MIGUEL MIXTEPEC',270,'OAXACA',20,'MEXICO'),
('SAN MIGUEL PANIXTLAHUACA',271,'OAXACA',20,'MEXICO'),
('SAN MIGUEL PERAS',272,'OAXACA',20,'MEXICO'),
('SAN MIGUEL PIEDRAS',273,'OAXACA',20,'MEXICO'),
('SAN MIGUEL QUETZALTEPEC',274,'OAXACA',20,'MEXICO'),
('SAN MIGUEL SANTA FLOR',275,'OAXACA',20,'MEXICO'),
('SAN MIGUEL SOYALTEPEC',276,'OAXACA',20,'MEXICO'),
('SAN MIGUEL SUCHIXTEPEC',277,'OAXACA',20,'MEXICO'),
('SAN MIGUEL TECOMATLAN',279,'OAXACA',20,'MEXICO'),
('SAN MIGUEL TENANGO',280,'OAXACA',20,'MEXICO'),
('SAN MIGUEL TEQUIXTEPEC',281,'OAXACA',20,'MEXICO'),
('SAN MIGUEL TILQUIAPAM',282,'OAXACA',20,'MEXICO'),
('SAN MIGUEL TLACAMAMA',283,'OAXACA',20,'MEXICO'),
('SAN MIGUEL TLACOTEPEC',284,'OAXACA',20,'MEXICO'),
('SAN MIGUEL TULANCINGO',285,'OAXACA',20,'MEXICO'),
('SAN MIGUEL YOTAO',286,'OAXACA',20,'MEXICO'),
('SAN NICOLAS',287,'OAXACA',20,'MEXICO'),
('SAN NICOLAS HIDALGO',288,'OAXACA',20,'MEXICO'),
('SAN PABLO COATLAN',289,'OAXACA',20,'MEXICO'),
('SAN PABLO CUATRO VENADOS',290,'OAXACA',20,'MEXICO'),
('SAN PABLO ETLA',291,'OAXACA',20,'MEXICO'),
('SAN PABLO HUITZO',292,'OAXACA',20,'MEXICO'),
('SAN PABLO HUIXTEPEC',293,'OAXACA',20,'MEXICO'),
('SAN PABLO MACUILTIANGUIS',294,'OAXACA',20,'MEXICO'),
('SAN PABLO TIJALTEPEC',295,'OAXACA',20,'MEXICO'),
('SAN PABLO VILLA DE MITLA',296,'OAXACA',20,'MEXICO'),
('SAN PABLO YAGANIZA',297,'OAXACA',20,'MEXICO'),
('SAN PEDRO AMUZGOS',298,'OAXACA',20,'MEXICO'),
('SAN PEDRO APOSTOL',299,'OAXACA',20,'MEXICO'),
('SAN PEDRO ATOYAC',300,'OAXACA',20,'MEXICO'),
('SAN PEDRO CAJONOS',301,'OAXACA',20,'MEXICO'),
('SAN PEDRO COMITANCILLO',303,'OAXACA',20,'MEXICO'),
('SAN PEDRO COXCALTEPEC CANTAROS',302,'OAXACA',20,'MEXICO'),
('SAN PEDRO EL ALTO',304,'OAXACA',20,'MEXICO'),
('SAN PEDRO HUAMELULA',305,'OAXACA',20,'MEXICO'),
('SAN PEDRO HUILOTEPEC',306,'OAXACA',20,'MEXICO'),
('SAN PEDRO IXCATLAN',307,'OAXACA',20,'MEXICO'),
('SAN PEDRO IXTLAHUACA',308,'OAXACA',20,'MEXICO'),
('SAN PEDRO JALTEPETONGO',309,'OAXACA',20,'MEXICO'),
('SAN PEDRO JICAYAN',310,'OAXACA',20,'MEXICO'),
('SAN PEDRO JOCOTIPAC',311,'OAXACA',20,'MEXICO'),
('SAN PEDRO JUCHATENGO',312,'OAXACA',20,'MEXICO'),
('SAN PEDRO MARTIR',313,'OAXACA',20,'MEXICO'),
('SAN PEDRO MARTIR QUIECHAPA',314,'OAXACA',20,'MEXICO'),
('SAN PEDRO MARTIR YUCUXACO',315,'OAXACA',20,'MEXICO'),
('SAN PEDRO MIXTEPEC',317,'OAXACA',20,'MEXICO'),
('SAN PEDRO MIXTEPEC',316,'OAXACA',20,'MEXICO'),
('SAN PEDRO MOLINOS',318,'OAXACA',20,'MEXICO'),
('SAN PEDRO NOPALA',319,'OAXACA',20,'MEXICO'),
('SAN PEDRO OCOPETATILLO',320,'OAXACA',20,'MEXICO'),
('SAN PEDRO OCOTEPEC',321,'OAXACA',20,'MEXICO'),
('SAN PEDRO POCHUTLA',322,'OAXACA',20,'MEXICO'),
('SAN PEDRO QUIATONI',323,'OAXACA',20,'MEXICO'),
('SAN PEDRO SOCHIAPAM',324,'OAXACA',20,'MEXICO'),
('SAN PEDRO TAPANATEPEC',325,'OAXACA',20,'MEXICO'),
('SAN PEDRO TAVICHE',326,'OAXACA',20,'MEXICO'),
('SAN PEDRO TEOZACOALCO',327,'OAXACA',20,'MEXICO'),
('SAN PEDRO TEUTILA',328,'OAXACA',20,'MEXICO'),
('SAN PEDRO TIDAA',329,'OAXACA',20,'MEXICO'),
('SAN PEDRO TOPILTEPEC',330,'OAXACA',20,'MEXICO'),
('SAN PEDRO TOTOLAPAM',331,'OAXACA',20,'MEXICO'),
('SAN PEDRO Y SAN PABLO AYUTLA',333,'OAXACA',20,'MEXICO'),
('SAN PEDRO Y SAN PABLO TEPOSCOLULA',334,'OAXACA',20,'MEXICO'),
('SAN PEDRO Y SAN PABLO TEQUIXTEPEC',335,'OAXACA',20,'MEXICO'),
('SAN PEDRO YANERI',336,'OAXACA',20,'MEXICO'),
('SAN PEDRO YOLOX',337,'OAXACA',20,'MEXICO'),
('SAN PEDRO YUCUNAMA',338,'OAXACA',20,'MEXICO'),
('SAN RAYMUNDO JALPAN',339,'OAXACA',20,'MEXICO'),
('SAN SEBASTIAN ABASOLO',340,'OAXACA',20,'MEXICO'),
('SAN SEBASTIAN COATLAN',341,'OAXACA',20,'MEXICO'),
('SAN SEBASTIAN IXCAPA',342,'OAXACA',20,'MEXICO'),
('SAN SEBASTIAN NICANANDUTA',343,'OAXACA',20,'MEXICO'),
('SAN SEBASTIAN RIO HONDO',344,'OAXACA',20,'MEXICO'),
('SAN SEBASTIAN TECOMAXTLAHUACA',345,'OAXACA',20,'MEXICO'),
('SAN SEBASTIAN TEITIPAC',346,'OAXACA',20,'MEXICO'),
('SAN SEBASTIAN TUTLA',347,'OAXACA',20,'MEXICO'),
('SAN SIMON ALMOLONGAS',348,'OAXACA',20,'MEXICO'),
('SAN SIMON ZAHUATLAN',349,'OAXACA',20,'MEXICO'),
('SAN VICENTE COATLAN',350,'OAXACA',20,'MEXICO'),
('SAN VICENTE LACHIXIO',351,'OAXACA',20,'MEXICO'),
('SAN VICENTE NUÃ‘U',352,'OAXACA',20,'MEXICO'),
('SANTA ANA',353,'OAXACA',20,'MEXICO'),
('SANTA ANA ATEIXTLAHUACA',354,'OAXACA',20,'MEXICO'),
('SANTA ANA CUAUHTEMOC',355,'OAXACA',20,'MEXICO'),
('SANTA ANA DEL VALLE',356,'OAXACA',20,'MEXICO'),
('SANTA ANA TAVELA',357,'OAXACA',20,'MEXICO'),
('SANTA ANA TLAPACOYAN',358,'OAXACA',20,'MEXICO'),
('SANTA ANA YARENI',359,'OAXACA',20,'MEXICO'),
('SANTA ANA ZEGACHE',360,'OAXACA',20,'MEXICO'),
('SANTA CATALINA QUIERI',361,'OAXACA',20,'MEXICO'),
('SANTA CATARINA CUIXTLA',362,'OAXACA',20,'MEXICO'),
('SANTA CATARINA IXTEPEJI',363,'OAXACA',20,'MEXICO'),
('SANTA CATARINA JUQUILA',364,'OAXACA',20,'MEXICO'),
('SANTA CATARINA LACHATAO',365,'OAXACA',20,'MEXICO'),
('SANTA CATARINA LOXICHA',366,'OAXACA',20,'MEXICO'),
('SANTA CATARINA MECHOACAN',367,'OAXACA',20,'MEXICO'),
('SANTA CATARINA MINAS',368,'OAXACA',20,'MEXICO'),
('SANTA CATARINA QUIANE',369,'OAXACA',20,'MEXICO'),
('SANTA CATARINA QUIOQUITANI',370,'OAXACA',20,'MEXICO'),
('SANTA CATARINA TAYATA',371,'OAXACA',20,'MEXICO'),
('SANTA CATARINA TICUA',372,'OAXACA',20,'MEXICO'),
('SANTA CATARINA YOSONOTU',373,'OAXACA',20,'MEXICO'),
('SANTA CATARINA ZAPOQUILA',374,'OAXACA',20,'MEXICO'),
('SANTA CRUZ ACATEPEC',375,'OAXACA',20,'MEXICO'),
('SANTA CRUZ AMILPAS',376,'OAXACA',20,'MEXICO'),
('SANTA CRUZ DE BRAVO',377,'OAXACA',20,'MEXICO'),
('SANTA CRUZ ITUNDUJIA',378,'OAXACA',20,'MEXICO'),
('SANTA CRUZ MIXTEPEC',379,'OAXACA',20,'MEXICO'),
('SANTA CRUZ NUNDACO',380,'OAXACA',20,'MEXICO'),
('SANTA CRUZ PAPALUTLA',381,'OAXACA',20,'MEXICO'),
('SANTA CRUZ TACACHE DE MINA',382,'OAXACA',20,'MEXICO'),
('SANTA CRUZ TACAHUA',383,'OAXACA',20,'MEXICO'),
('SANTA CRUZ TAYATA',384,'OAXACA',20,'MEXICO'),
('SANTA CRUZ XITLA',385,'OAXACA',20,'MEXICO'),
('SANTA CRUZ XOXOCOTLAN',386,'OAXACA',20,'MEXICO'),
('SANTA CRUZ ZENZONTEPEC',387,'OAXACA',20,'MEXICO'),
('SANTA GERTRUDIS',388,'OAXACA',20,'MEXICO'),
('SANTA INES DE ZARAGOZA',391,'OAXACA',20,'MEXICO'),
('SANTA INES DEL MONTE',389,'OAXACA',20,'MEXICO'),
('SANTA INES YATZECHE',390,'OAXACA',20,'MEXICO'),
('SANTA LUCIA DEL CAMINO',392,'OAXACA',20,'MEXICO'),
('SANTA LUCIA MIAHUATLAN',393,'OAXACA',20,'MEXICO'),
('SANTA LUCIA MONTEVERDE',394,'OAXACA',20,'MEXICO'),
('SANTA LUCIA OCOTLAN',395,'OAXACA',20,'MEXICO'),
('SANTA MAGDALENA JICOTLAN',396,'OAXACA',20,'MEXICO'),
('SANTA MARIA ALOTEPEC',397,'OAXACA',20,'MEXICO'),
('SANTA MARIA APAZCO',398,'OAXACA',20,'MEXICO'),
('SANTA MARIA ATZOMPA',400,'OAXACA',20,'MEXICO'),
('SANTA MARIA CAMOTLAN',401,'OAXACA',20,'MEXICO'),
('SANTA MARIA CHACHOAPAM',402,'OAXACA',20,'MEXICO'),
('SANTA MARIA CHILCHOTLA',404,'OAXACA',20,'MEXICO'),
('SANTA MARIA CHIMALAPA',405,'OAXACA',20,'MEXICO'),
('SANTA MARIA COLOTEPEC',406,'OAXACA',20,'MEXICO'),
('SANTA MARIA CORTIJO',407,'OAXACA',20,'MEXICO'),
('SANTA MARIA COYOTEPEC',408,'OAXACA',20,'MEXICO'),
('SANTA MARIA DEL ROSARIO',409,'OAXACA',20,'MEXICO'),
('SANTA MARIA DEL TULE',410,'OAXACA',20,'MEXICO'),
('SANTA MARIA ECATEPEC',411,'OAXACA',20,'MEXICO'),
('SANTA MARIA GUELACE',412,'OAXACA',20,'MEXICO'),
('SANTA MARIA GUIENAGATI',413,'OAXACA',20,'MEXICO'),
('SANTA MARIA HUATULCO',414,'OAXACA',20,'MEXICO'),
('SANTA MARIA HUAZOLOTITLAN',415,'OAXACA',20,'MEXICO'),
('SANTA MARIA IPALAPA',416,'OAXACA',20,'MEXICO'),
('SANTA MARIA IXCATLAN',417,'OAXACA',20,'MEXICO'),
('SANTA MARIA JACATEPEC',418,'OAXACA',20,'MEXICO'),
('SANTA MARIA JALAPA DEL MARQUES',419,'OAXACA',20,'MEXICO'),
('SANTA MARIA JALTIANGUIS',420,'OAXACA',20,'MEXICO'),
('SANTA MARIA LA ASUNCION',399,'OAXACA',20,'MEXICO'),
('SANTA MARIA LACHIXIO',421,'OAXACA',20,'MEXICO'),
('SANTA MARIA MIXTEQUILLA',422,'OAXACA',20,'MEXICO'),
('SANTA MARIA NATIVITAS',423,'OAXACA',20,'MEXICO'),
('SANTA MARIA NDUAYACO',424,'OAXACA',20,'MEXICO'),
('SANTA MARIA OZOLOTEPEC',425,'OAXACA',20,'MEXICO'),
('SANTA MARIA PAPALO',426,'OAXACA',20,'MEXICO'),
('SANTA MARIA PEÃ‘OLES',428,'OAXACA',20,'MEXICO'),
('SANTA MARIA PETAPA',427,'OAXACA',20,'MEXICO'),
('SANTA MARIA QUIEGOLANI',429,'OAXACA',20,'MEXICO'),
('SANTA MARIA SOLA',430,'OAXACA',20,'MEXICO'),
('SANTA MARIA TATALTEPEC',431,'OAXACA',20,'MEXICO'),
('SANTA MARIA TECOMAVACA',432,'OAXACA',20,'MEXICO'),
('SANTA MARIA TEMAXCALAPA',433,'OAXACA',20,'MEXICO'),
('SANTA MARIA TEMAXCALTEPEC',434,'OAXACA',20,'MEXICO'),
('SANTA MARIA TEOPOXCO',435,'OAXACA',20,'MEXICO'),
('SANTA MARIA TEPANTLALI',436,'OAXACA',20,'MEXICO'),
('SANTA MARIA TEXCATITLAN',437,'OAXACA',20,'MEXICO'),
('SANTA MARIA TLAHUITOLTEPEC',438,'OAXACA',20,'MEXICO'),
('SANTA MARIA TLALIXTAC',439,'OAXACA',20,'MEXICO'),
('SANTA MARIA TONAMECA',440,'OAXACA',20,'MEXICO'),
('SANTA MARIA TOTOLAPILLA',441,'OAXACA',20,'MEXICO'),
('SANTA MARIA XADANI',442,'OAXACA',20,'MEXICO'),
('SANTA MARIA YALINA',443,'OAXACA',20,'MEXICO'),
('SANTA MARIA YAVESIA',444,'OAXACA',20,'MEXICO'),
('SANTA MARIA YOLOTEPEC',445,'OAXACA',20,'MEXICO'),
('SANTA MARIA YOSOYUA',446,'OAXACA',20,'MEXICO'),
('SANTA MARIA YUCUHITI',447,'OAXACA',20,'MEXICO'),
('SANTA MARIA ZACATEPEC',448,'OAXACA',20,'MEXICO'),
('SANTA MARIA ZANIZA',449,'OAXACA',20,'MEXICO'),
('SANTA MARIA ZOQUITLAN',450,'OAXACA',20,'MEXICO'),
('SANTIAGO AMOLTEPEC',451,'OAXACA',20,'MEXICO'),
('SANTIAGO APOALA',452,'OAXACA',20,'MEXICO'),
('SANTIAGO APOSTOL',453,'OAXACA',20,'MEXICO'),
('SANTIAGO ASTATA',454,'OAXACA',20,'MEXICO'),
('SANTIAGO ATITLAN',455,'OAXACA',20,'MEXICO'),
('SANTIAGO AYUQUILILLA',456,'OAXACA',20,'MEXICO'),
('SANTIAGO CACALOXTEPEC',457,'OAXACA',20,'MEXICO'),
('SANTIAGO CAMOTLAN',458,'OAXACA',20,'MEXICO'),
('SANTIAGO CHAZUMBA',459,'OAXACA',20,'MEXICO'),
('SANTIAGO CHOAPAM',460,'OAXACA',20,'MEXICO'),
('SANTIAGO COMALTEPEC',461,'OAXACA',20,'MEXICO'),
('SANTIAGO DEL RIO',462,'OAXACA',20,'MEXICO'),
('SANTIAGO HUAJOLOTITLAN',463,'OAXACA',20,'MEXICO'),
('SANTIAGO HUAUCLILLA',464,'OAXACA',20,'MEXICO'),
('SANTIAGO IHUITLAN PLUMAS',465,'OAXACA',20,'MEXICO'),
('SANTIAGO IXCUINTEPEC',466,'OAXACA',20,'MEXICO'),
('SANTIAGO IXTAYUTLA',467,'OAXACA',20,'MEXICO'),
('SANTIAGO JAMILTEPEC',468,'OAXACA',20,'MEXICO'),
('SANTIAGO JOCOTEPEC',469,'OAXACA',20,'MEXICO'),
('SANTIAGO JUXTLAHUACA',470,'OAXACA',20,'MEXICO'),
('SANTIAGO LACHIGUIRI',471,'OAXACA',20,'MEXICO'),
('SANTIAGO LALOPA',472,'OAXACA',20,'MEXICO'),
('SANTIAGO LAOLLAGA',473,'OAXACA',20,'MEXICO'),
('SANTIAGO LAXOPA',474,'OAXACA',20,'MEXICO'),
('SANTIAGO LLANO GRANDE',475,'OAXACA',20,'MEXICO'),
('SANTIAGO MATATLAN',476,'OAXACA',20,'MEXICO'),
('SANTIAGO MILTEPEC',477,'OAXACA',20,'MEXICO'),
('SANTIAGO MINAS',478,'OAXACA',20,'MEXICO'),
('SANTIAGO NACALTEPEC',479,'OAXACA',20,'MEXICO'),
('SANTIAGO NEJAPILLA',480,'OAXACA',20,'MEXICO'),
('SANTIAGO NILTEPEC',481,'OAXACA',20,'MEXICO'),
('SANTIAGO NUNDICHE',482,'OAXACA',20,'MEXICO'),
('SANTIAGO NUYOO',483,'OAXACA',20,'MEXICO'),
('SANTIAGO PINOTEPA NACIONAL',484,'OAXACA',20,'MEXICO'),
('SANTIAGO SUCHILQUITONGO',485,'OAXACA',20,'MEXICO'),
('SANTIAGO TAMAZOLA',486,'OAXACA',20,'MEXICO'),
('SANTIAGO TAPEXTLA',487,'OAXACA',20,'MEXICO'),
('SANTIAGO TENANGO',488,'OAXACA',20,'MEXICO'),
('SANTIAGO TEPETLAPA',489,'OAXACA',20,'MEXICO'),
('SANTIAGO TETEPEC',490,'OAXACA',20,'MEXICO'),
('SANTIAGO TEXCALCINGO',491,'OAXACA',20,'MEXICO'),
('SANTIAGO TEXTITLAN',492,'OAXACA',20,'MEXICO'),
('SANTIAGO TILANTONGO',493,'OAXACA',20,'MEXICO'),
('SANTIAGO TILLO',494,'OAXACA',20,'MEXICO'),
('SANTIAGO TLAZOYALTEPEC',495,'OAXACA',20,'MEXICO'),
('SANTIAGO XANICA',496,'OAXACA',20,'MEXICO'),
('SANTIAGO XIACUI',497,'OAXACA',20,'MEXICO'),
('SANTIAGO YAITEPEC',498,'OAXACA',20,'MEXICO'),
('SANTIAGO YAVEO',499,'OAXACA',20,'MEXICO'),
('SANTIAGO YOLOMECATL',500,'OAXACA',20,'MEXICO'),
('SANTIAGO YOSONDUA',501,'OAXACA',20,'MEXICO'),
('SANTIAGO YUCUYACHI',502,'OAXACA',20,'MEXICO'),
('SANTIAGO ZACATEPEC',503,'OAXACA',20,'MEXICO'),
('SANTIAGO ZOOCHILA',504,'OAXACA',20,'MEXICO'),
('SANTO DOMINGO ALBARRADAS',505,'OAXACA',20,'MEXICO'),
('SANTO DOMINGO ARMENTA',506,'OAXACA',20,'MEXICO'),
('SANTO DOMINGO CHIHUITAN',507,'OAXACA',20,'MEXICO'),
('SANTO DOMINGO DE MORELOS',508,'OAXACA',20,'MEXICO'),
('SANTO DOMINGO INGENIO',509,'OAXACA',20,'MEXICO'),
('SANTO DOMINGO IXCATLAN',510,'OAXACA',20,'MEXICO'),
('SANTO DOMINGO NUXAA',511,'OAXACA',20,'MEXICO'),
('SANTO DOMINGO OZOLOTEPEC',512,'OAXACA',20,'MEXICO'),
('SANTO DOMINGO PETAPA',513,'OAXACA',20,'MEXICO'),
('SANTO DOMINGO ROAYAGA',514,'OAXACA',20,'MEXICO'),
('SANTO DOMINGO TEHUANTEPEC',515,'OAXACA',20,'MEXICO'),
('SANTO DOMINGO TEOJOMULCO',516,'OAXACA',20,'MEXICO'),
('SANTO DOMINGO TEPUXTEPEC',517,'OAXACA',20,'MEXICO'),
('SANTO DOMINGO TLATAYAPAM',518,'OAXACA',20,'MEXICO'),
('SANTO DOMINGO TOMALTEPEC',519,'OAXACA',20,'MEXICO'),
('SANTO DOMINGO TONALA',520,'OAXACA',20,'MEXICO'),
('SANTO DOMINGO TONALTEPEC',521,'OAXACA',20,'MEXICO'),
('SANTO DOMINGO XAGACIA',522,'OAXACA',20,'MEXICO'),
('SANTO DOMINGO YANHUITLAN',523,'OAXACA',20,'MEXICO'),
('SANTO DOMINGO YODOHINO',524,'OAXACA',20,'MEXICO'),
('SANTO DOMINGO ZANATEPEC',525,'OAXACA',20,'MEXICO'),
('SANTO TOMAS JALIEZA',526,'OAXACA',20,'MEXICO'),
('SANTO TOMAS MAZALTEPEC',527,'OAXACA',20,'MEXICO'),
('SANTO TOMAS OCOTEPEC',528,'OAXACA',20,'MEXICO'),
('SANTO TOMAS TAMAZULAPAN',529,'OAXACA',20,'MEXICO'),
('SANTOS REYES NOPALA',530,'OAXACA',20,'MEXICO'),
('SANTOS REYES PAPALO',531,'OAXACA',20,'MEXICO'),
('SANTOS REYES TEPEJILLO',532,'OAXACA',20,'MEXICO'),
('SANTOS REYES YUCUNA',533,'OAXACA',20,'MEXICO'),
('SILACAYOAPAM',534,'OAXACA',20,'MEXICO'),
('SITIO DE XITLAPEHUA',535,'OAXACA',20,'MEXICO'),
('SOLEDAD ETLA',537,'OAXACA',20,'MEXICO'),
('TAMAZULAPAM DEL ESPIRITU SANTO',540,'OAXACA',20,'MEXICO'),
('TANETZE DE ZARAGOZA',541,'OAXACA',20,'MEXICO'),
('TANICHE',538,'OAXACA',20,'MEXICO'),
('TATALTEPEC DE VALDES',542,'OAXACA',20,'MEXICO'),
('TEOCOCUILCO DE MARCOS PEREZ',544,'OAXACA',20,'MEXICO'),
('TEOTITLAN DE FLORES MAGON',545,'OAXACA',20,'MEXICO'),
('TEOTITLAN DEL VALLE',546,'OAXACA',20,'MEXICO'),
('TEOTONGO',547,'OAXACA',20,'MEXICO'),
('TEPELMEME VILLA DE MORELOS',548,'OAXACA',20,'MEXICO'),
('TLACOLULA DE MATAMOROS',550,'OAXACA',20,'MEXICO'),
('TLACOTEPEC PLUMAS',551,'OAXACA',20,'MEXICO'),
('TLALIXTAC DE CABRERA',552,'OAXACA',20,'MEXICO'),
('TOTONTEPEC VILLA DE MORELOS',554,'OAXACA',20,'MEXICO'),
('TRINIDAD ZAACHILA',555,'OAXACA',20,'MEXICO'),
('UNION HIDALGO',557,'OAXACA',20,'MEXICO'),
('VALERIO TRUJANO',558,'OAXACA',20,'MEXICO'),
('VILLA DE CHILAPA DE DIAZ',403,'OAXACA',20,'MEXICO'),
('VILLA DE ETLA',560,'OAXACA',20,'MEXICO'),
('VILLA DE TAMAZULAPAM DEL PROGRESO',539,'OAXACA',20,'MEXICO'),
('VILLA DE TUTUTEPEC DE MELCHOR OCAMPO',332,'OAXACA',20,'MEXICO'),
('VILLA DE ZAACHILA',566,'OAXACA',20,'MEXICO'),
('VILLA DIAZ ORDAZ',561,'OAXACA',20,'MEXICO'),
('VILLA HIDALGO',562,'OAXACA',20,'MEXICO'),
('VILLA SOLA DE VEGA',536,'OAXACA',20,'MEXICO'),
('VILLA TALEA DE CASTRO',278,'OAXACA',20,'MEXICO'),
('VILLA TEJUPAM DE LA UNION',543,'OAXACA',20,'MEXICO'),
('YAXE',563,'OAXACA',20,'MEXICO'),
('YOGANA',564,'OAXACA',20,'MEXICO'),
('YUTANDUCHI DE GUERRERO',565,'OAXACA',20,'MEXICO'),
('ZAPOTITLAN LAGUNAS',568,'OAXACA',20,'MEXICO'),
('ZAPOTITLAN PALMAS',569,'OAXACA',20,'MEXICO'),
('ZIMATLAN DE ALVAREZ',570,'OAXACA',20,'MEXICO'),
('ACAJETE',1,'PUEBLA',21,'MEXICO'),
('ACATENO',2,'PUEBLA',21,'MEXICO'),
('ACATLAN',3,'PUEBLA',21,'MEXICO'),
('ACATZINGO',4,'PUEBLA',21,'MEXICO'),
('ACTEOPAN',5,'PUEBLA',21,'MEXICO'),
('AHUACATLAN',6,'PUEBLA',21,'MEXICO'),
('AHUATLAN',7,'PUEBLA',21,'MEXICO'),
('AHUAZOTEPEC',8,'PUEBLA',21,'MEXICO'),
('AHUEHUETITLA',9,'PUEBLA',21,'MEXICO'),
('AJALPAN',10,'PUEBLA',21,'MEXICO'),
('ALBINO ZERTUCHE',11,'PUEBLA',21,'MEXICO'),
('ALJOJUCA',12,'PUEBLA',21,'MEXICO'),
('ALTEPEXI',13,'PUEBLA',21,'MEXICO'),
('AMIXTLAN',14,'PUEBLA',21,'MEXICO'),
('AMOZOC',15,'PUEBLA',21,'MEXICO'),
('AQUIXTLA',16,'PUEBLA',21,'MEXICO'),
('ATEMPAN',17,'PUEBLA',21,'MEXICO'),
('ATEXCAL',18,'PUEBLA',21,'MEXICO'),
('ATLEQUIZAYAN',82,'PUEBLA',21,'MEXICO'),
('ATLIXCO',19,'PUEBLA',21,'MEXICO'),
('ATOYATEMPAN',20,'PUEBLA',21,'MEXICO'),
('ATZALA',21,'PUEBLA',21,'MEXICO'),
('ATZITZIHUACAN',22,'PUEBLA',21,'MEXICO'),
('ATZITZINTLA',23,'PUEBLA',21,'MEXICO'),
('AXUTLA',24,'PUEBLA',21,'MEXICO'),
('AYOTOXCO DE GUERRERO',25,'PUEBLA',21,'MEXICO'),
('CALPAN',26,'PUEBLA',21,'MEXICO'),
('CALTEPEC',27,'PUEBLA',21,'MEXICO'),
('CAMOCUAUTLA',28,'PUEBLA',21,'MEXICO'),
('CAÃ‘ADA MORELOS',29,'PUEBLA',21,'MEXICO'),
('CAXHUACAN',30,'PUEBLA',21,'MEXICO'),
('CHALCHICOMULA DE SESMA',46,'PUEBLA',21,'MEXICO'),
('CHAPULCO',47,'PUEBLA',21,'MEXICO'),
('CHIAUTLA',48,'PUEBLA',21,'MEXICO'),
('CHIAUTZINGO',49,'PUEBLA',21,'MEXICO'),
('CHICHIQUILA',51,'PUEBLA',21,'MEXICO'),
('CHICONCUAUTLA',50,'PUEBLA',21,'MEXICO'),
('CHIETLA',52,'PUEBLA',21,'MEXICO'),
('CHIGMECATITLAN',53,'PUEBLA',21,'MEXICO'),
('CHIGNAHUAPAN',54,'PUEBLA',21,'MEXICO'),
('CHIGNAUTLA',55,'PUEBLA',21,'MEXICO'),
('CHILA',56,'PUEBLA',21,'MEXICO'),
('CHILA DE LA SAL',57,'PUEBLA',21,'MEXICO'),
('CHILCHOTLA',59,'PUEBLA',21,'MEXICO'),
('CHINANTLA',60,'PUEBLA',21,'MEXICO'),
('COATEPEC',31,'PUEBLA',21,'MEXICO'),
('COATZINGO',32,'PUEBLA',21,'MEXICO'),
('COHETZALA',33,'PUEBLA',21,'MEXICO'),
('COHUECAN',34,'PUEBLA',21,'MEXICO'),
('CORONANGO',35,'PUEBLA',21,'MEXICO'),
('COXCATLAN',36,'PUEBLA',21,'MEXICO'),
('COYOMEAPAN',37,'PUEBLA',21,'MEXICO'),
('COYOTEPEC',38,'PUEBLA',21,'MEXICO'),
('CUAPIAXTLA DE MADERO',39,'PUEBLA',21,'MEXICO'),
('CUAUTEMPAN',40,'PUEBLA',21,'MEXICO'),
('CUAUTINCHAN',41,'PUEBLA',21,'MEXICO'),
('CUAUTLANCINGO',42,'PUEBLA',21,'MEXICO'),
('CUAYUCA DE ANDRADE',43,'PUEBLA',21,'MEXICO'),
('CUETZALAN DEL PROGRESO',44,'PUEBLA',21,'MEXICO'),
('CUYOACO',45,'PUEBLA',21,'MEXICO'),
('DOMINGO ARENAS',61,'PUEBLA',21,'MEXICO'),
('ELOXOCHITLAN',62,'PUEBLA',21,'MEXICO'),
('EPATLAN',63,'PUEBLA',21,'MEXICO'),
('ESPERANZA',64,'PUEBLA',21,'MEXICO'),
('FRANCISCO Z. MENA',65,'PUEBLA',21,'MEXICO'),
('GENERAL FELIPE ANGELES',66,'PUEBLA',21,'MEXICO'),
('GUADALUPE',67,'PUEBLA',21,'MEXICO'),
('GUADALUPE VICTORIA',68,'PUEBLA',21,'MEXICO'),
('HERMENEGILDO GALEANA',69,'PUEBLA',21,'MEXICO'),
('HONEY',58,'PUEBLA',21,'MEXICO'),
('HUAQUECHULA',70,'PUEBLA',21,'MEXICO'),
('HUATLATLAUCA',71,'PUEBLA',21,'MEXICO'),
('HUAUCHINANGO',72,'PUEBLA',21,'MEXICO'),
('HUEHUETLA',73,'PUEBLA',21,'MEXICO'),
('HUEHUETLAN EL CHICO',74,'PUEBLA',21,'MEXICO'),
('HUEHUETLAN EL GRANDE',75,'PUEBLA',21,'MEXICO'),
('HUEJOTZINGO',76,'PUEBLA',21,'MEXICO'),
('HUEYAPAN',77,'PUEBLA',21,'MEXICO'),
('HUEYTAMALCO',78,'PUEBLA',21,'MEXICO'),
('HUEYTLALPAN',79,'PUEBLA',21,'MEXICO'),
('HUITZILAN DE SERDAN',80,'PUEBLA',21,'MEXICO'),
('HUITZILTEPEC',81,'PUEBLA',21,'MEXICO'),
('IXCAMILPA DE GUERRERO',83,'PUEBLA',21,'MEXICO'),
('IXCAQUIXTLA',84,'PUEBLA',21,'MEXICO'),
('IXTACAMAXTITLAN',85,'PUEBLA',21,'MEXICO'),
('IXTEPEC',86,'PUEBLA',21,'MEXICO'),
('IZUCAR DE MATAMOROS',87,'PUEBLA',21,'MEXICO'),
('JALPAN',88,'PUEBLA',21,'MEXICO'),
('JOLALPAN',89,'PUEBLA',21,'MEXICO'),
('JONOTLA',90,'PUEBLA',21,'MEXICO'),
('JOPALA',91,'PUEBLA',21,'MEXICO'),
('JUAN C. BONILLA',92,'PUEBLA',21,'MEXICO'),
('JUAN GALINDO',93,'PUEBLA',21,'MEXICO'),
('JUAN N. MENDEZ',94,'PUEBLA',21,'MEXICO'),
('LA MAGDALENA TLATLAUQUITEPEC',97,'PUEBLA',21,'MEXICO'),
('LAFRAGUA',95,'PUEBLA',21,'MEXICO'),
('LIBRES',96,'PUEBLA',21,'MEXICO'),
('LOS REYES DE JUAREZ',119,'PUEBLA',21,'MEXICO'),
('MAZAPILTEPEC DE JUAREZ',98,'PUEBLA',21,'MEXICO'),
('MIXTLA',99,'PUEBLA',21,'MEXICO'),
('MOLCAXAC',100,'PUEBLA',21,'MEXICO'),
('NAUPAN',101,'PUEBLA',21,'MEXICO'),
('NAUZONTLA',102,'PUEBLA',21,'MEXICO'),
('NEALTICAN',103,'PUEBLA',21,'MEXICO'),
('NICOLAS BRAVO',104,'PUEBLA',21,'MEXICO'),
('NOPALUCAN',105,'PUEBLA',21,'MEXICO'),
('OCOTEPEC',106,'PUEBLA',21,'MEXICO'),
('OCOYUCAN',107,'PUEBLA',21,'MEXICO'),
('OLINTLA',108,'PUEBLA',21,'MEXICO'),
('ORIENTAL',109,'PUEBLA',21,'MEXICO'),
('PAHUATLAN',110,'PUEBLA',21,'MEXICO'),
('PALMAR DE BRAVO',111,'PUEBLA',21,'MEXICO'),
('PANTEPEC',112,'PUEBLA',21,'MEXICO'),
('PETLALCINGO',113,'PUEBLA',21,'MEXICO'),
('PIAXTLA',114,'PUEBLA',21,'MEXICO'),
('PUEBLA',115,'PUEBLA',21,'MEXICO'),
('QUECHOLAC',116,'PUEBLA',21,'MEXICO'),
('QUIMIXTLAN',117,'PUEBLA',21,'MEXICO'),
('RAFAEL LARA GRAJALES',118,'PUEBLA',21,'MEXICO'),
('SAN ANDRES CHOLULA',120,'PUEBLA',21,'MEXICO'),
('SAN ANTONIO CAÃ‘ADA',121,'PUEBLA',21,'MEXICO'),
('SAN DIEGO LA MESA TOCHIMILTZINGO',122,'PUEBLA',21,'MEXICO'),
('SAN FELIPE TEOTLALCINGO',123,'PUEBLA',21,'MEXICO'),
('SAN FELIPE TEPATLAN',124,'PUEBLA',21,'MEXICO'),
('SAN GABRIEL CHILAC',125,'PUEBLA',21,'MEXICO'),
('SAN GREGORIO ATZOMPA',126,'PUEBLA',21,'MEXICO'),
('SAN JERONIMO TECUANIPAN',127,'PUEBLA',21,'MEXICO'),
('SAN JERONIMO XAYACATLAN',128,'PUEBLA',21,'MEXICO'),
('SAN JOSE CHIAPA',129,'PUEBLA',21,'MEXICO'),
('SAN JOSE MIAHUATLAN',130,'PUEBLA',21,'MEXICO'),
('SAN JUAN ATENCO',131,'PUEBLA',21,'MEXICO'),
('SAN JUAN ATZOMPA',132,'PUEBLA',21,'MEXICO'),
('SAN MARTIN TEXMELUCAN',133,'PUEBLA',21,'MEXICO'),
('SAN MARTIN TOTOLTEPEC',134,'PUEBLA',21,'MEXICO'),
('SAN MATIAS TLALANCALECA',135,'PUEBLA',21,'MEXICO'),
('SAN MIGUEL IXITLAN',136,'PUEBLA',21,'MEXICO'),
('SAN MIGUEL XOXTLA',137,'PUEBLA',21,'MEXICO'),
('SAN NICOLAS BUENOS AIRES',138,'PUEBLA',21,'MEXICO'),
('SAN NICOLAS DE LOS RANCHOS',139,'PUEBLA',21,'MEXICO'),
('SAN PABLO ANICANO',140,'PUEBLA',21,'MEXICO'),
('SAN PEDRO CHOLULA',141,'PUEBLA',21,'MEXICO'),
('SAN PEDRO YELOIXTLAHUACA',142,'PUEBLA',21,'MEXICO'),
('SAN SALVADOR EL SECO',143,'PUEBLA',21,'MEXICO'),
('SAN SALVADOR EL VERDE',144,'PUEBLA',21,'MEXICO'),
('SAN SALVADOR HUIXCOLOTLA',145,'PUEBLA',21,'MEXICO'),
('SAN SEBASTIAN TLACOTEPEC',177,'PUEBLA',21,'MEXICO'),
('SANTA CATARINA TLALTEMPAN',146,'PUEBLA',21,'MEXICO'),
('SANTA INES AHUATEMPAN',147,'PUEBLA',21,'MEXICO'),
('SANTA ISABEL CHOLULA',148,'PUEBLA',21,'MEXICO'),
('SANTIAGO MIAHUATLAN',149,'PUEBLA',21,'MEXICO'),
('SANTO TOMAS HUEYOTLIPAN',150,'PUEBLA',21,'MEXICO'),
('SOLTEPEC',151,'PUEBLA',21,'MEXICO'),
('TECALI DE HERRERA',152,'PUEBLA',21,'MEXICO'),
('TECAMACHALCO',153,'PUEBLA',21,'MEXICO'),
('TECOMATLAN',154,'PUEBLA',21,'MEXICO'),
('TEHUACAN',155,'PUEBLA',21,'MEXICO'),
('TEHUITZINGO',156,'PUEBLA',21,'MEXICO'),
('TENAMPULCO',157,'PUEBLA',21,'MEXICO'),
('TEOPANTLAN',158,'PUEBLA',21,'MEXICO'),
('TEOTLALCO',159,'PUEBLA',21,'MEXICO'),
('TEPANCO DE LOPEZ',160,'PUEBLA',21,'MEXICO'),
('TEPANGO DE RODRIGUEZ',161,'PUEBLA',21,'MEXICO'),
('TEPATLAXCO DE HIDALGO',162,'PUEBLA',21,'MEXICO'),
('TEPEACA',163,'PUEBLA',21,'MEXICO'),
('TEPEMAXALCO',164,'PUEBLA',21,'MEXICO'),
('TEPEOJUMA',165,'PUEBLA',21,'MEXICO'),
('TEPETZINTLA',166,'PUEBLA',21,'MEXICO'),
('TEPEXCO',167,'PUEBLA',21,'MEXICO'),
('TEPEXI DE RODRIGUEZ',168,'PUEBLA',21,'MEXICO'),
('TEPEYAHUALCO',169,'PUEBLA',21,'MEXICO'),
('TEPEYAHUALCO DE CUAUHTEMOC',170,'PUEBLA',21,'MEXICO'),
('TETELA DE OCAMPO',171,'PUEBLA',21,'MEXICO'),
('TETELES DE AVILA CASTILLO',172,'PUEBLA',21,'MEXICO'),
('TEZIUTLAN',173,'PUEBLA',21,'MEXICO'),
('TIANGUISMANALCO',174,'PUEBLA',21,'MEXICO'),
('TILAPA',175,'PUEBLA',21,'MEXICO'),
('TLACHICHUCA',179,'PUEBLA',21,'MEXICO'),
('TLACOTEPEC DE BENITO JUAREZ',176,'PUEBLA',21,'MEXICO'),
('TLACUILOTEPEC',178,'PUEBLA',21,'MEXICO'),
('TLAHUAPAN',180,'PUEBLA',21,'MEXICO'),
('TLALTENANGO',181,'PUEBLA',21,'MEXICO'),
('TLANEPANTLA',182,'PUEBLA',21,'MEXICO'),
('TLAOLA',183,'PUEBLA',21,'MEXICO'),
('TLAPACOYA',184,'PUEBLA',21,'MEXICO'),
('TLAPANALA',185,'PUEBLA',21,'MEXICO'),
('TLATLAUQUITEPEC',186,'PUEBLA',21,'MEXICO'),
('TLAXCO',187,'PUEBLA',21,'MEXICO'),
('TOCHIMILCO',188,'PUEBLA',21,'MEXICO'),
('TOCHTEPEC',189,'PUEBLA',21,'MEXICO'),
('TOTOLTEPEC DE GUERRERO',190,'PUEBLA',21,'MEXICO'),
('TULCINGO',191,'PUEBLA',21,'MEXICO'),
('TUZAMAPAN DE GALEANA',192,'PUEBLA',21,'MEXICO'),
('TZICATLACOYAN',193,'PUEBLA',21,'MEXICO'),
('VENUSTIANO CARRANZA',194,'PUEBLA',21,'MEXICO'),
('VICENTE GUERRERO',195,'PUEBLA',21,'MEXICO'),
('XAYACATLAN DE BRAVO',196,'PUEBLA',21,'MEXICO'),
('XICOTEPEC',197,'PUEBLA',21,'MEXICO'),
('XICOTLAN',198,'PUEBLA',21,'MEXICO'),
('XIUTETELCO',199,'PUEBLA',21,'MEXICO'),
('XOCHIAPULCO',200,'PUEBLA',21,'MEXICO'),
('XOCHILTEPEC',201,'PUEBLA',21,'MEXICO'),
('XOCHITLAN DE VICENTE SUAREZ',202,'PUEBLA',21,'MEXICO'),
('XOCHITLAN TODOS SANTOS',203,'PUEBLA',21,'MEXICO'),
('YAONAHUAC',204,'PUEBLA',21,'MEXICO'),
('YEHUALTEPEC',205,'PUEBLA',21,'MEXICO'),
('ZACAPALA',206,'PUEBLA',21,'MEXICO'),
('ZACAPOAXTLA',207,'PUEBLA',21,'MEXICO'),
('ZACATLAN',208,'PUEBLA',21,'MEXICO'),
('ZAPOTITLAN',209,'PUEBLA',21,'MEXICO'),
('ZAPOTITLAN DE MENDEZ',210,'PUEBLA',21,'MEXICO'),
('ZARAGOZA',211,'PUEBLA',21,'MEXICO'),
('ZAUTLA',212,'PUEBLA',21,'MEXICO'),
('ZIHUATEUTLA',213,'PUEBLA',21,'MEXICO'),
('ZINACATEPEC',214,'PUEBLA',21,'MEXICO'),
('ZONGOZOTLA',215,'PUEBLA',21,'MEXICO'),
('ZOQUIAPAN',216,'PUEBLA',21,'MEXICO'),
('ZOQUITLAN',217,'PUEBLA',21,'MEXICO'),
('AMEALCO DE BONFIL',1,'QUERETARO',22,'MEXICO'),
('ARROYO SECO',2,'QUERETARO',22,'MEXICO'),
('CADEREYTA DE MONTES',3,'QUERETARO',22,'MEXICO'),
('COLON',4,'QUERETARO',22,'MEXICO'),
('CORREGIDORA',5,'QUERETARO',22,'MEXICO'),
('EL MARQUES',10,'QUERETARO',22,'MEXICO'),
('EZEQUIEL MONTES',6,'QUERETARO',22,'MEXICO'),
('HUIMILPAN',7,'QUERETARO',22,'MEXICO'),
('JALPAN DE SERRA',8,'QUERETARO',22,'MEXICO'),
('LANDA DE MATAMOROS',9,'QUERETARO',22,'MEXICO'),
('PEDRO ESCOBEDO',11,'QUERETARO',22,'MEXICO'),
('PEÃ‘AMILLER',12,'QUERETARO',22,'MEXICO'),
('PINAL DE AMOLES',13,'QUERETARO',22,'MEXICO'),
('QUERETARO',14,'QUERETARO',22,'MEXICO'),
('SAN JOAQUIN',15,'QUERETARO',22,'MEXICO'),
('SAN JUAN DEL RIO',16,'QUERETARO',22,'MEXICO'),
('TEQUISQUIAPAN',17,'QUERETARO',22,'MEXICO'),
('TOLIMAN',18,'QUERETARO',22,'MEXICO'),
('BACALAR',10,'QUINTANA ROO',23,'MEXICO'),
('BENITO JUAREZ',1,'QUINTANA ROO',23,'MEXICO'),
('COZUMEL',2,'QUINTANA ROO',23,'MEXICO'),
('FELIPE CARRILLO PUERTO',3,'QUINTANA ROO',23,'MEXICO'),
('ISLA MUJERES',4,'QUINTANA ROO',23,'MEXICO'),
('JOSE MARIA MORELOS',5,'QUINTANA ROO',23,'MEXICO'),
('LAZARO CARDENAS',6,'QUINTANA ROO',23,'MEXICO'),
('OTHON P. BLANCO',7,'QUINTANA ROO',23,'MEXICO'),
('SOLIDARIDAD',8,'QUINTANA ROO',23,'MEXICO'),
('TULUM',9,'QUINTANA ROO',23,'MEXICO'),
('AHUALULCO',1,'SAN LUIS POTOSI',24,'MEXICO'),
('ALAQUINES',2,'SAN LUIS POTOSI',24,'MEXICO'),
('AQUISMON',3,'SAN LUIS POTOSI',24,'MEXICO'),
('ARMADILLO DE LOS INFANTE',4,'SAN LUIS POTOSI',24,'MEXICO'),
('AXTLA DE TERRAZAS',54,'SAN LUIS POTOSI',24,'MEXICO'),
('CARDENAS',5,'SAN LUIS POTOSI',24,'MEXICO'),
('CATORCE',6,'SAN LUIS POTOSI',24,'MEXICO'),
('CEDRAL',7,'SAN LUIS POTOSI',24,'MEXICO'),
('CERRITOS',8,'SAN LUIS POTOSI',24,'MEXICO'),
('CERRO DE SAN PEDRO',9,'SAN LUIS POTOSI',24,'MEXICO'),
('CHARCAS',15,'SAN LUIS POTOSI',24,'MEXICO'),
('CIUDAD DEL MAIZ',10,'SAN LUIS POTOSI',24,'MEXICO'),
('CIUDAD FERNANDEZ',11,'SAN LUIS POTOSI',24,'MEXICO'),
('CIUDAD VALLES',13,'SAN LUIS POTOSI',24,'MEXICO'),
('COXCATLAN',14,'SAN LUIS POTOSI',24,'MEXICO'),
('EBANO',16,'SAN LUIS POTOSI',24,'MEXICO'),
('EL NARANJO',57,'SAN LUIS POTOSI',24,'MEXICO'),
('GUADALCAZAR',17,'SAN LUIS POTOSI',24,'MEXICO'),
('HUEHUETLAN',18,'SAN LUIS POTOSI',24,'MEXICO'),
('LAGUNILLAS',19,'SAN LUIS POTOSI',24,'MEXICO'),
('MATEHUALA',20,'SAN LUIS POTOSI',24,'MEXICO'),
('MATLAPA',58,'SAN LUIS POTOSI',24,'MEXICO'),
('MEXQUITIC DE CARMONA',21,'SAN LUIS POTOSI',24,'MEXICO'),
('MOCTEZUMA',22,'SAN LUIS POTOSI',24,'MEXICO'),
('RAYON',23,'SAN LUIS POTOSI',24,'MEXICO'),
('RIOVERDE',24,'SAN LUIS POTOSI',24,'MEXICO'),
('SALINAS',25,'SAN LUIS POTOSI',24,'MEXICO'),
('SAN ANTONIO',26,'SAN LUIS POTOSI',24,'MEXICO'),
('SAN CIRO DE ACOSTA',27,'SAN LUIS POTOSI',24,'MEXICO'),
('SAN LUIS POTOSI',28,'SAN LUIS POTOSI',24,'MEXICO'),
('SAN MARTIN CHALCHICUAUTLA',29,'SAN LUIS POTOSI',24,'MEXICO'),
('SAN NICOLAS TOLENTINO',30,'SAN LUIS POTOSI',24,'MEXICO'),
('SAN VICENTE TANCUAYALAB',31,'SAN LUIS POTOSI',24,'MEXICO'),
('SANTA CATARINA',32,'SAN LUIS POTOSI',24,'MEXICO'),
('SANTA MARIA DEL RIO',33,'SAN LUIS POTOSI',24,'MEXICO'),
('SANTO DOMINGO',34,'SAN LUIS POTOSI',24,'MEXICO'),
('SOLEDAD DE GRACIANO SANCHEZ',35,'SAN LUIS POTOSI',24,'MEXICO'),
('TAMASOPO',36,'SAN LUIS POTOSI',24,'MEXICO'),
('TAMAZUNCHALE',37,'SAN LUIS POTOSI',24,'MEXICO'),
('TAMPACAN',38,'SAN LUIS POTOSI',24,'MEXICO'),
('TAMPAMOLON CORONA',39,'SAN LUIS POTOSI',24,'MEXICO'),
('TAMUIN',40,'SAN LUIS POTOSI',24,'MEXICO'),
('TANCANHUITZ',12,'SAN LUIS POTOSI',24,'MEXICO'),
('TANLAJAS',41,'SAN LUIS POTOSI',24,'MEXICO'),
('TANQUIAN DE ESCOBEDO',42,'SAN LUIS POTOSI',24,'MEXICO'),
('TIERRA NUEVA',43,'SAN LUIS POTOSI',24,'MEXICO'),
('VANEGAS',44,'SAN LUIS POTOSI',24,'MEXICO'),
('VENADO',45,'SAN LUIS POTOSI',24,'MEXICO'),
('VILLA DE ARISTA',46,'SAN LUIS POTOSI',24,'MEXICO'),
('VILLA DE ARRIAGA',47,'SAN LUIS POTOSI',24,'MEXICO'),
('VILLA DE GUADALUPE',48,'SAN LUIS POTOSI',24,'MEXICO'),
('VILLA DE LA PAZ',49,'SAN LUIS POTOSI',24,'MEXICO'),
('VILLA DE RAMOS',50,'SAN LUIS POTOSI',24,'MEXICO'),
('VILLA DE REYES',51,'SAN LUIS POTOSI',24,'MEXICO'),
('VILLA HIDALGO',52,'SAN LUIS POTOSI',24,'MEXICO'),
('VILLA JUAREZ',53,'SAN LUIS POTOSI',24,'MEXICO'),
('XILITLA',55,'SAN LUIS POTOSI',24,'MEXICO'),
('ZARAGOZA',56,'SAN LUIS POTOSI',24,'MEXICO'),
('AHOME',1,'SINALOA',25,'MEXICO'),
('ANGOSTURA',2,'SINALOA',25,'MEXICO'),
('BADIRAGUATO',3,'SINALOA',25,'MEXICO'),
('CHOIX',7,'SINALOA',25,'MEXICO'),
('CONCORDIA',4,'SINALOA',25,'MEXICO'),
('COSALA',5,'SINALOA',25,'MEXICO'),
('CULIACAN',6,'SINALOA',25,'MEXICO'),
('EL FUERTE',10,'SINALOA',25,'MEXICO'),
('ELOTA',8,'SINALOA',25,'MEXICO'),
('ESCUINAPA',9,'SINALOA',25,'MEXICO'),
('GUASAVE',11,'SINALOA',25,'MEXICO'),
('MAZATLAN',12,'SINALOA',25,'MEXICO'),
('MOCORITO',13,'SINALOA',25,'MEXICO'),
('NAVOLATO',18,'SINALOA',25,'MEXICO'),
('ROSARIO',14,'SINALOA',25,'MEXICO'),
('SALVADOR ALVARADO',15,'SINALOA',25,'MEXICO'),
('SAN IGNACIO',16,'SINALOA',25,'MEXICO'),
('SINALOA',17,'SINALOA',25,'MEXICO'),
('ACONCHI',1,'SONORA',26,'MEXICO'),
('AGUA PRIETA',2,'SONORA',26,'MEXICO'),
('ALAMOS',62,'SONORA',26,'MEXICO'),
('ALTAR',3,'SONORA',26,'MEXICO'),
('ARIVECHI',4,'SONORA',26,'MEXICO'),
('ARIZPE',5,'SONORA',26,'MEXICO'),
('ATIL',6,'SONORA',26,'MEXICO'),
('BACADEHUACHI',7,'SONORA',26,'MEXICO'),
('BACANORA',8,'SONORA',26,'MEXICO'),
('BACERAC',9,'SONORA',26,'MEXICO'),
('BACOACHI',10,'SONORA',26,'MEXICO'),
('BACUM',58,'SONORA',26,'MEXICO'),
('BANAMICHI',11,'SONORA',26,'MEXICO'),
('BAVIACORA',12,'SONORA',26,'MEXICO'),
('BAVISPE',13,'SONORA',26,'MEXICO'),
('BENITO JUAREZ',71,'SONORA',26,'MEXICO'),
('BENJAMIN HILL',14,'SONORA',26,'MEXICO'),
('CABORCA',46,'SONORA',26,'MEXICO'),
('CAJEME',59,'SONORA',26,'MEXICO'),
('CANANEA',15,'SONORA',26,'MEXICO'),
('CARBO',47,'SONORA',26,'MEXICO'),
('CUCURPE',16,'SONORA',26,'MEXICO'),
('CUMPAS',17,'SONORA',26,'MEXICO'),
('DIVISADEROS',18,'SONORA',26,'MEXICO'),
('EMPALME',60,'SONORA',26,'MEXICO'),
('ETCHOJOA',63,'SONORA',26,'MEXICO'),
('FRONTERAS',19,'SONORA',26,'MEXICO'),
('GENERAL PLUTARCO ELIAS CALLES',70,'SONORA',26,'MEXICO'),
('GRANADOS',20,'SONORA',26,'MEXICO'),
('GUAYMAS',61,'SONORA',26,'MEXICO'),
('HERMOSILLO',49,'SONORA',26,'MEXICO'),
('HUACHINERA',21,'SONORA',26,'MEXICO'),
('HUASABAS',22,'SONORA',26,'MEXICO'),
('HUATABAMPO',64,'SONORA',26,'MEXICO'),
('HUEPAC',23,'SONORA',26,'MEXICO'),
('IMURIS',24,'SONORA',26,'MEXICO'),
('LA COLORADA',48,'SONORA',26,'MEXICO'),
('MAGDALENA',25,'SONORA',26,'MEXICO'),
('MAZATAN',50,'SONORA',26,'MEXICO'),
('MOCTEZUMA',26,'SONORA',26,'MEXICO'),
('NACO',27,'SONORA',26,'MEXICO'),
('NACORI CHICO',28,'SONORA',26,'MEXICO'),
('NACOZARI DE GARCIA',29,'SONORA',26,'MEXICO'),
('NAVOJOA',65,'SONORA',26,'MEXICO'),
('NOGALES',30,'SONORA',26,'MEXICO'),
('ONAVAS',66,'SONORA',26,'MEXICO'),
('OPODEPE',51,'SONORA',26,'MEXICO'),
('OQUITOA',31,'SONORA',26,'MEXICO'),
('PITIQUITO',52,'SONORA',26,'MEXICO'),
('PUERTO PEÃ‘ASCO',53,'SONORA',26,'MEXICO'),
('QUIRIEGO',67,'SONORA',26,'MEXICO'),
('RAYON',54,'SONORA',26,'MEXICO'),
('ROSARIO',68,'SONORA',26,'MEXICO'),
('SAHUARIPA',32,'SONORA',26,'MEXICO'),
('SAN FELIPE DE JESUS',33,'SONORA',26,'MEXICO'),
('SAN IGNACIO RIO MUERTO',72,'SONORA',26,'MEXICO'),
('SAN JAVIER',34,'SONORA',26,'MEXICO'),
('SAN LUIS RIO COLORADO',55,'SONORA',26,'MEXICO'),
('SAN MIGUEL DE HORCASITAS',56,'SONORA',26,'MEXICO'),
('SAN PEDRO DE LA CUEVA',35,'SONORA',26,'MEXICO'),
('SANTA ANA',36,'SONORA',26,'MEXICO'),
('SANTA CRUZ',37,'SONORA',26,'MEXICO'),
('SARIC',38,'SONORA',26,'MEXICO'),
('SOYOPA',39,'SONORA',26,'MEXICO'),
('SUAQUI GRANDE',40,'SONORA',26,'MEXICO'),
('TEPACHE',41,'SONORA',26,'MEXICO'),
('TRINCHERAS',42,'SONORA',26,'MEXICO'),
('TUBUTAMA',43,'SONORA',26,'MEXICO'),
('URES',57,'SONORA',26,'MEXICO'),
('VILLA HIDALGO',44,'SONORA',26,'MEXICO'),
('VILLA PESQUEIRA',45,'SONORA',26,'MEXICO'),
('YECORA',69,'SONORA',26,'MEXICO'),
('BALANCAN',1,'TABASCO',27,'MEXICO'),
('CARDENAS',2,'TABASCO',27,'MEXICO'),
('CENTLA',3,'TABASCO',27,'MEXICO'),
('CENTRO',4,'TABASCO',27,'MEXICO'),
('COMALCALCO',5,'TABASCO',27,'MEXICO'),
('CUNDUACAN',6,'TABASCO',27,'MEXICO'),
('EMILIANO ZAPATA',7,'TABASCO',27,'MEXICO'),
('HUIMANGUILLO',8,'TABASCO',27,'MEXICO'),
('JALAPA',9,'TABASCO',27,'MEXICO'),
('JALPA DE MENDEZ',10,'TABASCO',27,'MEXICO'),
('JONUTA',11,'TABASCO',27,'MEXICO'),
('MACUSPANA',12,'TABASCO',27,'MEXICO'),
('NACAJUCA',13,'TABASCO',27,'MEXICO'),
('PARAISO',14,'TABASCO',27,'MEXICO'),
('TACOTALPA',15,'TABASCO',27,'MEXICO'),
('TEAPA',16,'TABASCO',27,'MEXICO'),
('TENOSIQUE',17,'TABASCO',27,'MEXICO'),
('ABASOLO',1,'TAMAULIPAS',28,'MEXICO'),
('ALDAMA',2,'TAMAULIPAS',28,'MEXICO'),
('ALTAMIRA',3,'TAMAULIPAS',28,'MEXICO'),
('ANTIGUO MORELOS',4,'TAMAULIPAS',28,'MEXICO'),
('BURGOS',5,'TAMAULIPAS',28,'MEXICO'),
('BUSTAMANTE',6,'TAMAULIPAS',28,'MEXICO'),
('CAMARGO',7,'TAMAULIPAS',28,'MEXICO'),
('CASAS',8,'TAMAULIPAS',28,'MEXICO'),
('CIUDAD MADERO',9,'TAMAULIPAS',28,'MEXICO'),
('CRUILLAS',10,'TAMAULIPAS',28,'MEXICO'),
('EL MANTE',21,'TAMAULIPAS',28,'MEXICO'),
('G?EMEZ',13,'TAMAULIPAS',28,'MEXICO'),
('GOMEZ FARIAS',11,'TAMAULIPAS',28,'MEXICO'),
('GONZALEZ',12,'TAMAULIPAS',28,'MEXICO'),
('GUERRERO',14,'TAMAULIPAS',28,'MEXICO'),
('GUSTAVO DIAZ ORDAZ',15,'TAMAULIPAS',28,'MEXICO'),
('HIDALGO',16,'TAMAULIPAS',28,'MEXICO'),
('JAUMAVE',17,'TAMAULIPAS',28,'MEXICO'),
('JIMENEZ',18,'TAMAULIPAS',28,'MEXICO'),
('LLERA',19,'TAMAULIPAS',28,'MEXICO'),
('MAINERO',20,'TAMAULIPAS',28,'MEXICO'),
('MATAMOROS',22,'TAMAULIPAS',28,'MEXICO'),
('MENDEZ',23,'TAMAULIPAS',28,'MEXICO'),
('MIER',24,'TAMAULIPAS',28,'MEXICO'),
('MIGUEL ALEMAN',25,'TAMAULIPAS',28,'MEXICO'),
('MIQUIHUANA',26,'TAMAULIPAS',28,'MEXICO'),
('NUEVO LAREDO',27,'TAMAULIPAS',28,'MEXICO'),
('NUEVO MORELOS',28,'TAMAULIPAS',28,'MEXICO'),
('OCAMPO',29,'TAMAULIPAS',28,'MEXICO'),
('PADILLA',30,'TAMAULIPAS',28,'MEXICO'),
('PALMILLAS',31,'TAMAULIPAS',28,'MEXICO'),
('REYNOSA',32,'TAMAULIPAS',28,'MEXICO'),
('RIO BRAVO',33,'TAMAULIPAS',28,'MEXICO'),
('SAN CARLOS',34,'TAMAULIPAS',28,'MEXICO'),
('SAN FERNANDO',35,'TAMAULIPAS',28,'MEXICO'),
('SAN NICOLAS',36,'TAMAULIPAS',28,'MEXICO'),
('SOTO LA MARINA',37,'TAMAULIPAS',28,'MEXICO'),
('TAMPICO',38,'TAMAULIPAS',28,'MEXICO'),
('TULA',39,'TAMAULIPAS',28,'MEXICO'),
('VALLE HERMOSO',40,'TAMAULIPAS',28,'MEXICO'),
('VICTORIA',41,'TAMAULIPAS',28,'MEXICO'),
('VILLAGRAN',42,'TAMAULIPAS',28,'MEXICO'),
('XICOTENCATL',43,'TAMAULIPAS',28,'MEXICO'),
('ACUAMANALA DE MIGUEL HIDALGO',22,'TLAXCALA',29,'MEXICO'),
('ALTZAYANCA',5,'TLAXCALA',29,'MEXICO'),
('AMAXAC DE GUERRERO',1,'TLAXCALA',29,'MEXICO'),
('APETATITLAN DE ANTONIO CARVAJAL',2,'TLAXCALA',29,'MEXICO'),
('APIZACO',3,'TLAXCALA',29,'MEXICO'),
('ATLANGATEPEC',4,'TLAXCALA',29,'MEXICO'),
('BENITO JUAREZ',60,'TLAXCALA',29,'MEXICO'),
('CALPULALPAN',6,'TLAXCALA',29,'MEXICO'),
('CHIAUTEMPAN',10,'TLAXCALA',29,'MEXICO'),
('CONTLA DE JUAN CUAMATZI',18,'TLAXCALA',29,'MEXICO'),
('CUAPIAXTLA',8,'TLAXCALA',29,'MEXICO'),
('CUAXOMULCO',9,'TLAXCALA',29,'MEXICO'),
('EL CARMEN TEQUEXQUITLA',7,'TLAXCALA',29,'MEXICO'),
('EMILIANO ZAPATA',54,'TLAXCALA',29,'MEXICO'),
('ESPAÃ‘ITA',12,'TLAXCALA',29,'MEXICO'),
('HUAMANTLA',13,'TLAXCALA',29,'MEXICO'),
('HUEYOTLIPAN',14,'TLAXCALA',29,'MEXICO'),
('IXTACUIXTLA DE MARIANO MATAMOROS',15,'TLAXCALA',29,'MEXICO'),
('IXTENCO',16,'TLAXCALA',29,'MEXICO'),
('LA MAGDALENA TLALTELULCO',52,'TLAXCALA',29,'MEXICO'),
('LAZARO CARDENAS',55,'TLAXCALA',29,'MEXICO'),
('MAZATECOCHCO DE JOSE MARIA MORELOS',17,'TLAXCALA',29,'MEXICO'),
('MUÃ‘OZ DE DOMINGO ARENAS',11,'TLAXCALA',29,'MEXICO'),
('NANACAMILPA DE MARIANO ARISTA',21,'TLAXCALA',29,'MEXICO'),
('NATIVITAS',23,'TLAXCALA',29,'MEXICO'),
('PANOTLA',24,'TLAXCALA',29,'MEXICO'),
('PAPALOTLA DE XICOHTENCATL',41,'TLAXCALA',29,'MEXICO'),
('SAN DAMIAN TEXOLOC',53,'TLAXCALA',29,'MEXICO'),
('SAN FRANCISCO TETLANOHCAN',51,'TLAXCALA',29,'MEXICO'),
('SAN JERONIMO ZACUALPAN',56,'TLAXCALA',29,'MEXICO'),
('SAN JOSE TEACALCO',50,'TLAXCALA',29,'MEXICO'),
('SAN JUAN HUACTZINCO',47,'TLAXCALA',29,'MEXICO'),
('SAN LORENZO AXOCOMANITLA',59,'TLAXCALA',29,'MEXICO'),
('SAN LUCAS TECOPILCO',57,'TLAXCALA',29,'MEXICO'),
('SAN PABLO DEL MONTE',25,'TLAXCALA',29,'MEXICO'),
('SANCTORUM DE LAZARO CARDENAS',20,'TLAXCALA',29,'MEXICO'),
('SANTA ANA NOPALUCAN',58,'TLAXCALA',29,'MEXICO'),
('SANTA APOLONIA TEACALCO',45,'TLAXCALA',29,'MEXICO'),
('SANTA CATARINA AYOMETLA',48,'TLAXCALA',29,'MEXICO'),
('SANTA CRUZ QUILEHTLA',46,'TLAXCALA',29,'MEXICO'),
('SANTA CRUZ TLAXCALA',26,'TLAXCALA',29,'MEXICO'),
('SANTA ISABEL XILOXOXTLA',49,'TLAXCALA',29,'MEXICO'),
('TENANCINGO',27,'TLAXCALA',29,'MEXICO'),
('TEOLOCHOLCO',28,'TLAXCALA',29,'MEXICO'),
('TEPETITLA DE LARDIZABAL',19,'TLAXCALA',29,'MEXICO'),
('TEPEYANCO',29,'TLAXCALA',29,'MEXICO'),
('TERRENATE',30,'TLAXCALA',29,'MEXICO'),
('TETLA DE LA SOLIDARIDAD',31,'TLAXCALA',29,'MEXICO'),
('TETLATLAHUCA',32,'TLAXCALA',29,'MEXICO'),
('TLAXCALA',33,'TLAXCALA',29,'MEXICO'),
('TLAXCO',34,'TLAXCALA',29,'MEXICO'),
('TOCATLAN',35,'TLAXCALA',29,'MEXICO'),
('TOTOLAC',36,'TLAXCALA',29,'MEXICO'),
('TZOMPANTEPEC',38,'TLAXCALA',29,'MEXICO'),
('XALOZTOC',39,'TLAXCALA',29,'MEXICO'),
('XALTOCAN',40,'TLAXCALA',29,'MEXICO'),
('XICOHTZINCO',42,'TLAXCALA',29,'MEXICO'),
('YAUHQUEMECAN',43,'TLAXCALA',29,'MEXICO'),
('ZACATELCO',44,'TLAXCALA',29,'MEXICO'),
('ZITLALTEPEC DE TRINIDAD SANCHEZ SANTOS',37,'TLAXCALA',29,'MEXICO'),
('ACAJETE',1,'VERACRUZ',30,'MEXICO'),
('ACATLAN',2,'VERACRUZ',30,'MEXICO'),
('ACAYUCAN',3,'VERACRUZ',30,'MEXICO'),
('ACTOPAN',4,'VERACRUZ',30,'MEXICO'),
('ACULA',5,'VERACRUZ',30,'MEXICO'),
('ACULTZINGO',6,'VERACRUZ',30,'MEXICO'),
('AGUA DULCE',206,'VERACRUZ',30,'MEXICO'),
('ALAMO TEMAPACHE',8,'VERACRUZ',30,'MEXICO'),
('ALPATLAHUAC',9,'VERACRUZ',30,'MEXICO'),
('ALTO LUCERO DE GUTIERREZ BARRIOS',10,'VERACRUZ',30,'MEXICO'),
('ALTOTONGA',11,'VERACRUZ',30,'MEXICO'),
('ALVARADO',12,'VERACRUZ',30,'MEXICO'),
('AMATITLAN',13,'VERACRUZ',30,'MEXICO'),
('AMATLAN DE LOS REYES',14,'VERACRUZ',30,'MEXICO'),
('ANGEL R. CABADA',16,'VERACRUZ',30,'MEXICO'),
('APAZAPAN',18,'VERACRUZ',30,'MEXICO'),
('AQUILA',19,'VERACRUZ',30,'MEXICO'),
('ASTACINGA',20,'VERACRUZ',30,'MEXICO'),
('ATLAHUILCO',21,'VERACRUZ',30,'MEXICO'),
('ATOYAC',22,'VERACRUZ',30,'MEXICO'),
('ATZACAN',23,'VERACRUZ',30,'MEXICO'),
('ATZALAN',24,'VERACRUZ',30,'MEXICO'),
('AYAHUALULCO',26,'VERACRUZ',30,'MEXICO'),
('BANDERILLA',27,'VERACRUZ',30,'MEXICO'),
('BENITO JUAREZ',28,'VERACRUZ',30,'MEXICO'),
('BOCA DEL RIO',29,'VERACRUZ',30,'MEXICO'),
('CALCAHUALCO',30,'VERACRUZ',30,'MEXICO'),
('CAMARON DE TEJEDA',7,'VERACRUZ',30,'MEXICO'),
('CAMERINO Z. MENDOZA',31,'VERACRUZ',30,'MEXICO'),
('CARLOS A. CARRILLO',208,'VERACRUZ',30,'MEXICO'),
('CARRILLO PUERTO',32,'VERACRUZ',30,'MEXICO'),
('CASTILLO DE TEAYO',33,'VERACRUZ',30,'MEXICO'),
('CATEMACO',34,'VERACRUZ',30,'MEXICO'),
('CAZONES DE HERRERA',35,'VERACRUZ',30,'MEXICO'),
('CERRO AZUL',36,'VERACRUZ',30,'MEXICO'),
('CHACALTIANGUIS',56,'VERACRUZ',30,'MEXICO'),
('CHALMA',57,'VERACRUZ',30,'MEXICO'),
('CHICONAMEL',58,'VERACRUZ',30,'MEXICO'),
('CHICONQUIACO',59,'VERACRUZ',30,'MEXICO'),
('CHICONTEPEC',60,'VERACRUZ',30,'MEXICO'),
('CHINAMECA',61,'VERACRUZ',30,'MEXICO'),
('CHINAMPA DE GOROSTIZA',62,'VERACRUZ',30,'MEXICO'),
('CHOCAMAN',64,'VERACRUZ',30,'MEXICO'),
('CHONTLA',65,'VERACRUZ',30,'MEXICO'),
('CHUMATLAN',66,'VERACRUZ',30,'MEXICO'),
('CITLALTEPETL',37,'VERACRUZ',30,'MEXICO'),
('COACOATZINTLA',38,'VERACRUZ',30,'MEXICO'),
('COAHUITLAN',39,'VERACRUZ',30,'MEXICO'),
('COATEPEC',40,'VERACRUZ',30,'MEXICO'),
('COATZACOALCOS',41,'VERACRUZ',30,'MEXICO'),
('COATZINTLA',42,'VERACRUZ',30,'MEXICO'),
('COETZALA',43,'VERACRUZ',30,'MEXICO'),
('COLIPA',44,'VERACRUZ',30,'MEXICO'),
('COMAPA',45,'VERACRUZ',30,'MEXICO'),
('CORDOBA',46,'VERACRUZ',30,'MEXICO'),
('COSAMALOAPAN',47,'VERACRUZ',30,'MEXICO'),
('COSAUTLAN DE CARVAJAL',48,'VERACRUZ',30,'MEXICO'),
('COSCOMATEPEC',49,'VERACRUZ',30,'MEXICO'),
('COSOLEACAQUE',50,'VERACRUZ',30,'MEXICO'),
('COTAXTLA',51,'VERACRUZ',30,'MEXICO'),
('COXQUIHUI',52,'VERACRUZ',30,'MEXICO'),
('COYUTLA',53,'VERACRUZ',30,'MEXICO'),
('CUICHAPA',54,'VERACRUZ',30,'MEXICO'),
('CUITLAHUAC',55,'VERACRUZ',30,'MEXICO'),
('EL HIGO',207,'VERACRUZ',30,'MEXICO'),
('EMILIANO ZAPATA',67,'VERACRUZ',30,'MEXICO'),
('ESPINAL',68,'VERACRUZ',30,'MEXICO'),
('FILOMENO MATA',69,'VERACRUZ',30,'MEXICO'),
('FORTIN',70,'VERACRUZ',30,'MEXICO'),
('GUTIERREZ ZAMORA',71,'VERACRUZ',30,'MEXICO'),
('HIDALGOTITLAN',72,'VERACRUZ',30,'MEXICO'),
('HUATUSCO',73,'VERACRUZ',30,'MEXICO'),
('HUAYACOCOTLA',74,'VERACRUZ',30,'MEXICO'),
('HUEYAPAN DE OCAMPO',75,'VERACRUZ',30,'MEXICO'),
('HUILOAPAN DE CUAUHTEMOC',76,'VERACRUZ',30,'MEXICO'),
('IGNACIO DE LA LLAVE',77,'VERACRUZ',30,'MEXICO'),
('ILAMATLAN',78,'VERACRUZ',30,'MEXICO'),
('ISLA',79,'VERACRUZ',30,'MEXICO'),
('IXCATEPEC',80,'VERACRUZ',30,'MEXICO'),
('IXHUACAN DE LOS REYES',81,'VERACRUZ',30,'MEXICO'),
('IXHUATLAN DE MADERO',82,'VERACRUZ',30,'MEXICO'),
('IXHUATLAN DEL CAFE',83,'VERACRUZ',30,'MEXICO'),
('IXHUATLAN DEL SURESTE',84,'VERACRUZ',30,'MEXICO'),
('IXHUATLANCILLO',85,'VERACRUZ',30,'MEXICO'),
('IXMATLAHUACAN',86,'VERACRUZ',30,'MEXICO'),
('IXTACZOQUITLAN',87,'VERACRUZ',30,'MEXICO'),
('JALACINGO',88,'VERACRUZ',30,'MEXICO'),
('JALCOMULCO',90,'VERACRUZ',30,'MEXICO'),
('JALTIPAN',91,'VERACRUZ',30,'MEXICO'),
('JAMAPA',92,'VERACRUZ',30,'MEXICO'),
('JESUS CARRANZA',93,'VERACRUZ',30,'MEXICO'),
('JILOTEPEC',94,'VERACRUZ',30,'MEXICO'),
('JOSE AZUETA',168,'VERACRUZ',30,'MEXICO'),
('JUAN RODRIGUEZ CLARA',95,'VERACRUZ',30,'MEXICO'),
('JUCHIQUE DE FERRER',96,'VERACRUZ',30,'MEXICO'),
('LA ANTIGUA',17,'VERACRUZ',30,'MEXICO'),
('LA PERLA',128,'VERACRUZ',30,'MEXICO'),
('LANDERO Y COSS',97,'VERACRUZ',30,'MEXICO'),
('LAS CHOAPAS',63,'VERACRUZ',30,'MEXICO'),
('LAS MINAS',108,'VERACRUZ',30,'MEXICO'),
('LAS VIGAS DE RAMIREZ',137,'VERACRUZ',30,'MEXICO'),
('LERDO DE TEJADA',98,'VERACRUZ',30,'MEXICO'),
('LOS REYES',138,'VERACRUZ',30,'MEXICO'),
('MAGDALENA',99,'VERACRUZ',30,'MEXICO'),
('MALTRATA',100,'VERACRUZ',30,'MEXICO'),
('MANLIO FABIO ALTAMIRANO',101,'VERACRUZ',30,'MEXICO'),
('MARIANO ESCOBEDO',102,'VERACRUZ',30,'MEXICO'),
('MARTINEZ DE LA TORRE',103,'VERACRUZ',30,'MEXICO'),
('MECATLAN',104,'VERACRUZ',30,'MEXICO'),
('MECAYAPAN',105,'VERACRUZ',30,'MEXICO'),
('MEDELLIN',106,'VERACRUZ',30,'MEXICO'),
('MIAHUATLAN',107,'VERACRUZ',30,'MEXICO'),
('MINATITLAN',109,'VERACRUZ',30,'MEXICO'),
('MISANTLA',110,'VERACRUZ',30,'MEXICO'),
('MIXTLA DE ALTAMIRANO',111,'VERACRUZ',30,'MEXICO'),
('MOLOACAN',112,'VERACRUZ',30,'MEXICO'),
('NANCHITAL DE LAZARO CARDENAS DEL RIO',205,'VERACRUZ',30,'MEXICO'),
('NAOLINCO',113,'VERACRUZ',30,'MEXICO'),
('NARANJAL',114,'VERACRUZ',30,'MEXICO'),
('NARANJOS AMATLAN',15,'VERACRUZ',30,'MEXICO'),
('NAUTLA',115,'VERACRUZ',30,'MEXICO'),
('NOGALES',116,'VERACRUZ',30,'MEXICO'),
('OLUTA',117,'VERACRUZ',30,'MEXICO'),
('OMEALCA',118,'VERACRUZ',30,'MEXICO'),
('ORIZABA',119,'VERACRUZ',30,'MEXICO'),
('OTATITLAN',120,'VERACRUZ',30,'MEXICO'),
('OTEAPAN',121,'VERACRUZ',30,'MEXICO'),
('OZULUAMA',122,'VERACRUZ',30,'MEXICO'),
('PAJAPAN',123,'VERACRUZ',30,'MEXICO'),
('PANUCO',124,'VERACRUZ',30,'MEXICO'),
('PAPANTLA',125,'VERACRUZ',30,'MEXICO'),
('PASO DE OVEJAS',127,'VERACRUZ',30,'MEXICO'),
('PASO DEL MACHO',126,'VERACRUZ',30,'MEXICO'),
('PEROTE',129,'VERACRUZ',30,'MEXICO'),
('PLATON SANCHEZ',130,'VERACRUZ',30,'MEXICO'),
('PLAYA VICENTE',131,'VERACRUZ',30,'MEXICO'),
('POZA RICA DE HIDALGO',132,'VERACRUZ',30,'MEXICO'),
('PUEBLO VIEJO',133,'VERACRUZ',30,'MEXICO'),
('PUENTE NACIONAL',134,'VERACRUZ',30,'MEXICO'),
('RAFAEL DELGADO',135,'VERACRUZ',30,'MEXICO'),
('RAFAEL LUCIO',136,'VERACRUZ',30,'MEXICO'),
('RIO BLANCO',139,'VERACRUZ',30,'MEXICO'),
('SALTABARRANCA',140,'VERACRUZ',30,'MEXICO'),
('SAN ANDRES TENEJAPAN',141,'VERACRUZ',30,'MEXICO'),
('SAN ANDRES TUXTLA',142,'VERACRUZ',30,'MEXICO'),
('SAN JUAN EVANGELISTA',143,'VERACRUZ',30,'MEXICO'),
('SAN RAFAEL',211,'VERACRUZ',30,'MEXICO'),
('SANTIAGO SOCHIAPAN',212,'VERACRUZ',30,'MEXICO'),
('SANTIAGO TUXTLA',144,'VERACRUZ',30,'MEXICO'),
('SAYULA DE ALEMAN',145,'VERACRUZ',30,'MEXICO'),
('SOCHIAPA',147,'VERACRUZ',30,'MEXICO'),
('SOCONUSCO',146,'VERACRUZ',30,'MEXICO'),
('SOLEDAD ATZOMPA',148,'VERACRUZ',30,'MEXICO'),
('SOLEDAD DE DOBLADO',149,'VERACRUZ',30,'MEXICO'),
('SOTEAPAN',150,'VERACRUZ',30,'MEXICO'),
('TAMALIN',151,'VERACRUZ',30,'MEXICO'),
('TAMIAHUA',152,'VERACRUZ',30,'MEXICO'),
('TAMPICO ALTO',153,'VERACRUZ',30,'MEXICO'),
('TANCOCO',154,'VERACRUZ',30,'MEXICO'),
('TANTIMA',155,'VERACRUZ',30,'MEXICO'),
('TANTOYUCA',156,'VERACRUZ',30,'MEXICO'),
('TATAHUICAPAN DE JUAREZ',210,'VERACRUZ',30,'MEXICO'),
('TATATILA',157,'VERACRUZ',30,'MEXICO'),
('TECOLUTLA',158,'VERACRUZ',30,'MEXICO'),
('TEHUIPANGO',159,'VERACRUZ',30,'MEXICO'),
('TEMPOAL',160,'VERACRUZ',30,'MEXICO'),
('TENAMPA',161,'VERACRUZ',30,'MEXICO'),
('TENOCHTITLAN',162,'VERACRUZ',30,'MEXICO'),
('TEOCELO',163,'VERACRUZ',30,'MEXICO'),
('TEPATLAXCO',164,'VERACRUZ',30,'MEXICO'),
('TEPETLAN',165,'VERACRUZ',30,'MEXICO'),
('TEPETZINTLA',166,'VERACRUZ',30,'MEXICO'),
('TEQUILA',167,'VERACRUZ',30,'MEXICO'),
('TEXCATEPEC',169,'VERACRUZ',30,'MEXICO'),
('TEXHUACAN',170,'VERACRUZ',30,'MEXICO'),
('TEXISTEPEC',171,'VERACRUZ',30,'MEXICO'),
('TEZONAPA',172,'VERACRUZ',30,'MEXICO'),
('TIERRA BLANCA',173,'VERACRUZ',30,'MEXICO'),
('TIHUATLAN',174,'VERACRUZ',30,'MEXICO'),
('TLACHICHILCO',179,'VERACRUZ',30,'MEXICO'),
('TLACOJALPAN',175,'VERACRUZ',30,'MEXICO'),
('TLACOLULAN',176,'VERACRUZ',30,'MEXICO'),
('TLACOTALPAN',177,'VERACRUZ',30,'MEXICO'),
('TLACOTEPEC DE MEJIA',178,'VERACRUZ',30,'MEXICO'),
('TLALIXCOYAN',180,'VERACRUZ',30,'MEXICO'),
('TLALNELHUAYOCAN',181,'VERACRUZ',30,'MEXICO'),
('TLALTETELA',25,'VERACRUZ',30,'MEXICO'),
('TLAPACOYAN',182,'VERACRUZ',30,'MEXICO'),
('TLAQUILPA',183,'VERACRUZ',30,'MEXICO'),
('TLILAPAN',184,'VERACRUZ',30,'MEXICO'),
('TOMATLAN',185,'VERACRUZ',30,'MEXICO'),
('TONAYAN',186,'VERACRUZ',30,'MEXICO'),
('TOTUTLA',187,'VERACRUZ',30,'MEXICO'),
('TRES VALLES',204,'VERACRUZ',30,'MEXICO'),
('TUXPAN',188,'VERACRUZ',30,'MEXICO'),
('TUXTILLA',189,'VERACRUZ',30,'MEXICO'),
('URSULO GALVAN',190,'VERACRUZ',30,'MEXICO'),
('UXPANAPA',209,'VERACRUZ',30,'MEXICO'),
('VEGA DE ALATORRE',191,'VERACRUZ',30,'MEXICO'),
('VERACRUZ',192,'VERACRUZ',30,'MEXICO'),
('VILLA ALDAMA',193,'VERACRUZ',30,'MEXICO'),
('XALAPA',89,'VERACRUZ',30,'MEXICO'),
('XICO',194,'VERACRUZ',30,'MEXICO'),
('XOXOCOTLA',195,'VERACRUZ',30,'MEXICO'),
('YANGA',196,'VERACRUZ',30,'MEXICO'),
('YECUATLA',197,'VERACRUZ',30,'MEXICO'),
('ZACUALPAN',198,'VERACRUZ',30,'MEXICO'),
('ZARAGOZA',199,'VERACRUZ',30,'MEXICO'),
('ZENTLA',200,'VERACRUZ',30,'MEXICO'),
('ZONGOLICA',201,'VERACRUZ',30,'MEXICO'),
('ZONTECOMATLAN',202,'VERACRUZ',30,'MEXICO'),
('ZOZOCOLCO DE HIDALGO',203,'VERACRUZ',30,'MEXICO'),
('ABALA',1,'YUCATAN',31,'MEXICO'),
('ACANCEH',2,'YUCATAN',31,'MEXICO'),
('AKIL',3,'YUCATAN',31,'MEXICO'),
('BACA',4,'YUCATAN',31,'MEXICO'),
('BOKOBA',5,'YUCATAN',31,'MEXICO'),
('BUCTZOTZ',6,'YUCATAN',31,'MEXICO'),
('CACALCHEN',7,'YUCATAN',31,'MEXICO'),
('CALOTMUL',8,'YUCATAN',31,'MEXICO'),
('CANSAHCAB',9,'YUCATAN',31,'MEXICO'),
('CANTAMAYEC',10,'YUCATAN',31,'MEXICO'),
('CELESTUN',11,'YUCATAN',31,'MEXICO'),
('CENOTILLO',12,'YUCATAN',31,'MEXICO'),
('CHACSINKIN',16,'YUCATAN',31,'MEXICO'),
('CHANKOM',17,'YUCATAN',31,'MEXICO'),
('CHAPAB',18,'YUCATAN',31,'MEXICO'),
('CHEMAX',19,'YUCATAN',31,'MEXICO'),
('CHICHIMILA',21,'YUCATAN',31,'MEXICO'),
('CHICXULUB PUEBLO',20,'YUCATAN',31,'MEXICO'),
('CHIKINDZONOT',22,'YUCATAN',31,'MEXICO'),
('CHOCHOLA',23,'YUCATAN',31,'MEXICO'),
('CHUMAYEL',24,'YUCATAN',31,'MEXICO'),
('CONKAL',13,'YUCATAN',31,'MEXICO'),
('CUNCUNUL',14,'YUCATAN',31,'MEXICO'),
('CUZAMA',15,'YUCATAN',31,'MEXICO'),
('DZAN',25,'YUCATAN',31,'MEXICO'),
('DZEMUL',26,'YUCATAN',31,'MEXICO'),
('DZIDZANTUN',27,'YUCATAN',31,'MEXICO'),
('DZILAM DE BRAVO',28,'YUCATAN',31,'MEXICO'),
('DZILAM GONZALEZ',29,'YUCATAN',31,'MEXICO'),
('DZITAS',30,'YUCATAN',31,'MEXICO'),
('DZONCAUICH',31,'YUCATAN',31,'MEXICO'),
('ESPITA',32,'YUCATAN',31,'MEXICO'),
('HALACHO',33,'YUCATAN',31,'MEXICO'),
('HOCABA',34,'YUCATAN',31,'MEXICO'),
('HOCTUN',35,'YUCATAN',31,'MEXICO'),
('HOMUN',36,'YUCATAN',31,'MEXICO'),
('HUHI',37,'YUCATAN',31,'MEXICO'),
('HUNUCMA',38,'YUCATAN',31,'MEXICO'),
('IXIL',39,'YUCATAN',31,'MEXICO'),
('IZAMAL',40,'YUCATAN',31,'MEXICO'),
('KANASIN',41,'YUCATAN',31,'MEXICO'),
('KANTUNIL',42,'YUCATAN',31,'MEXICO'),
('KAUA',43,'YUCATAN',31,'MEXICO'),
('KINCHIL',44,'YUCATAN',31,'MEXICO'),
('KOPOMA',45,'YUCATAN',31,'MEXICO'),
('MAMA',46,'YUCATAN',31,'MEXICO'),
('MANI',47,'YUCATAN',31,'MEXICO'),
('MAXCANU',48,'YUCATAN',31,'MEXICO'),
('MAYAPAN',49,'YUCATAN',31,'MEXICO'),
('MERIDA',50,'YUCATAN',31,'MEXICO'),
('MOCOCHA',51,'YUCATAN',31,'MEXICO'),
('MOTUL',52,'YUCATAN',31,'MEXICO'),
('MUNA',53,'YUCATAN',31,'MEXICO'),
('MUXUPIP',54,'YUCATAN',31,'MEXICO'),
('OPICHEN',55,'YUCATAN',31,'MEXICO'),
('OXKUTZCAB',56,'YUCATAN',31,'MEXICO'),
('PANABA',57,'YUCATAN',31,'MEXICO'),
('PETO',58,'YUCATAN',31,'MEXICO'),
('PROGRESO',59,'YUCATAN',31,'MEXICO'),
('QUINTANA ROO',60,'YUCATAN',31,'MEXICO'),
('RIO LAGARTOS',61,'YUCATAN',31,'MEXICO'),
('SACALUM',62,'YUCATAN',31,'MEXICO'),
('SAMAHIL',63,'YUCATAN',31,'MEXICO'),
('SAN FELIPE',65,'YUCATAN',31,'MEXICO'),
('SANAHCAT',64,'YUCATAN',31,'MEXICO'),
('SANTA ELENA',66,'YUCATAN',31,'MEXICO'),
('SEYE',67,'YUCATAN',31,'MEXICO'),
('SINANCHE',68,'YUCATAN',31,'MEXICO'),
('SOTUTA',69,'YUCATAN',31,'MEXICO'),
('SUCILA',70,'YUCATAN',31,'MEXICO'),
('SUDZAL',71,'YUCATAN',31,'MEXICO'),
('SUMA',72,'YUCATAN',31,'MEXICO'),
('TAHDZIU',73,'YUCATAN',31,'MEXICO'),
('TAHMEK',74,'YUCATAN',31,'MEXICO'),
('TEABO',75,'YUCATAN',31,'MEXICO'),
('TECOH',76,'YUCATAN',31,'MEXICO'),
('TEKAL DE VENEGAS',77,'YUCATAN',31,'MEXICO'),
('TEKANTO',78,'YUCATAN',31,'MEXICO'),
('TEKAX',79,'YUCATAN',31,'MEXICO'),
('TEKIT',80,'YUCATAN',31,'MEXICO'),
('TEKOM',81,'YUCATAN',31,'MEXICO'),
('TELCHAC PUEBLO',82,'YUCATAN',31,'MEXICO'),
('TELCHAC PUERTO',83,'YUCATAN',31,'MEXICO'),
('TEMAX',84,'YUCATAN',31,'MEXICO'),
('TEMOZON',85,'YUCATAN',31,'MEXICO'),
('TEPAKAN',86,'YUCATAN',31,'MEXICO'),
('TETIZ',87,'YUCATAN',31,'MEXICO'),
('TEYA',88,'YUCATAN',31,'MEXICO'),
('TICUL',89,'YUCATAN',31,'MEXICO'),
('TIMUCUY',90,'YUCATAN',31,'MEXICO'),
('TINUM',91,'YUCATAN',31,'MEXICO'),
('TIXCACALCUPUL',92,'YUCATAN',31,'MEXICO'),
('TIXKOKOB',93,'YUCATAN',31,'MEXICO'),
('TIXMEHUAC',94,'YUCATAN',31,'MEXICO'),
('TIXPEHUAL',95,'YUCATAN',31,'MEXICO'),
('TIZIMIN',96,'YUCATAN',31,'MEXICO'),
('TUNKAS',97,'YUCATAN',31,'MEXICO'),
('TZUCACAB',98,'YUCATAN',31,'MEXICO'),
('UAYMA',99,'YUCATAN',31,'MEXICO'),
('UCU',100,'YUCATAN',31,'MEXICO'),
('UMAN',101,'YUCATAN',31,'MEXICO'),
('VALLADOLID',102,'YUCATAN',31,'MEXICO'),
('XOCCHEL',103,'YUCATAN',31,'MEXICO'),
('YAXCABA',104,'YUCATAN',31,'MEXICO'),
('YAXKUKUL',105,'YUCATAN',31,'MEXICO'),
('YOBAIN',106,'YUCATAN',31,'MEXICO'),
('APOZOL',1,'ZACATECAS',32,'MEXICO'),
('APULCO',2,'ZACATECAS',32,'MEXICO'),
('ATOLINGA',3,'ZACATECAS',32,'MEXICO'),
('BENITO JUAREZ',4,'ZACATECAS',32,'MEXICO'),
('CALERA',5,'ZACATECAS',32,'MEXICO'),
('CAÃ‘ITAS DE FELIPE PESCADOR',6,'ZACATECAS',32,'MEXICO'),
('CHALCHIHUITES',9,'ZACATECAS',32,'MEXICO'),
('CONCEPCION DEL ORO',7,'ZACATECAS',32,'MEXICO'),
('CUAUHTEMOC',8,'ZACATECAS',32,'MEXICO'),
('EL PLATEADO DE JOAQUIN AMARO',15,'ZACATECAS',32,'MEXICO'),
('EL SALVADOR',41,'ZACATECAS',32,'MEXICO'),
('FRESNILLO',10,'ZACATECAS',32,'MEXICO'),
('GENARO CODINA',12,'ZACATECAS',32,'MEXICO'),
('GENERAL ENRIQUE ESTRADA',13,'ZACATECAS',32,'MEXICO'),
('GENERAL FRANCISCO R. MURGUIA',14,'ZACATECAS',32,'MEXICO'),
('GENERAL PANFILO NATERA',16,'ZACATECAS',32,'MEXICO'),
('GUADALUPE',17,'ZACATECAS',32,'MEXICO'),
('HUANUSCO',18,'ZACATECAS',32,'MEXICO'),
('JALPA',19,'ZACATECAS',32,'MEXICO'),
('JEREZ',20,'ZACATECAS',32,'MEXICO'),
('JIMENEZ DEL TEUL',21,'ZACATECAS',32,'MEXICO'),
('JUAN ALDAMA',22,'ZACATECAS',32,'MEXICO'),
('JUCHIPILA',23,'ZACATECAS',32,'MEXICO'),
('LORETO',24,'ZACATECAS',32,'MEXICO'),
('LUIS MOYA',25,'ZACATECAS',32,'MEXICO'),
('MAZAPIL',26,'ZACATECAS',32,'MEXICO'),
('MELCHOR OCAMPO',27,'ZACATECAS',32,'MEXICO'),
('MEZQUITAL DEL ORO',28,'ZACATECAS',32,'MEXICO'),
('MIGUEL AUZA',29,'ZACATECAS',32,'MEXICO'),
('MOMAX',30,'ZACATECAS',32,'MEXICO'),
('MONTE ESCOBEDO',31,'ZACATECAS',32,'MEXICO'),
('MORELOS',32,'ZACATECAS',32,'MEXICO'),
('MOYAHUA DE ESTRADA',33,'ZACATECAS',32,'MEXICO'),
('NOCHISTLAN DE MEJIA',34,'ZACATECAS',32,'MEXICO'),
('NORIA DE ANGELES',35,'ZACATECAS',32,'MEXICO'),
('OJOCALIENTE',36,'ZACATECAS',32,'MEXICO'),
('PANUCO',37,'ZACATECAS',32,'MEXICO'),
('PINOS',38,'ZACATECAS',32,'MEXICO'),
('RIO GRANDE',39,'ZACATECAS',32,'MEXICO'),
('SAIN ALTO',40,'ZACATECAS',32,'MEXICO'),
('SANTA MARIA DE LA PAZ',58,'ZACATECAS',32,'MEXICO'),
('SOMBRERETE',42,'ZACATECAS',32,'MEXICO'),
('SUSTICACAN',43,'ZACATECAS',32,'MEXICO'),
('TABASCO',44,'ZACATECAS',32,'MEXICO'),
('TEPECHITLAN',45,'ZACATECAS',32,'MEXICO'),
('TEPETONGO',46,'ZACATECAS',32,'MEXICO'),
('TEUL DE GONZALEZ ORTEGA',47,'ZACATECAS',32,'MEXICO'),
('TLALTENANGO DE SANCHEZ ROMAN',48,'ZACATECAS',32,'MEXICO'),
('TRANCOSO',57,'ZACATECAS',32,'MEXICO'),
('TRINIDAD GARCIA DE LA CADENA',11,'ZACATECAS',32,'MEXICO'),
('VALPARAISO',49,'ZACATECAS',32,'MEXICO'),
('VETAGRANDE',50,'ZACATECAS',32,'MEXICO'),
('VILLA DE COS',51,'ZACATECAS',32,'MEXICO'),
('VILLA GARCIA',52,'ZACATECAS',32,'MEXICO'),
('VILLA GONZALEZ ORTEGA',53,'ZACATECAS',32,'MEXICO'),
('VILLA HIDALGO',54,'ZACATECAS',32,'MEXICO'),
('VILLANUEVA',55,'ZACATECAS',32,'MEXICO'),
('ZACATECAS',56,'ZACATECAS',32,'MEXICO')
on conflict (estado_id, municipio_id) do nothing;


-- ########################################################################
-- ###  0017_barandilla_campos.sql
-- ########################################################################

-- =====================================================================
-- 0017_barandilla_campos.sql
-- Amplía Barandilla con todos los campos del formato SCP360, y agrega un
-- catálogo genérico de opciones cortas (cat_opciones), administrable.
--
-- Campos según el formato de captura: datos de la detención (fecha, lugar,
-- ubicación, puesta a disposición, motivo, delito 911, folio de informe) y
-- media filiación del detenido (alias, nacimiento, sexo, complexión,
-- estatura, peso, color de piel, antecedentes, tatuajes, cicatrices, huellas)
-- y familiar de contacto. Los policías de la detención se registran como
-- vínculos (personal ↔ barandilla). Las fotos, con FotosPanel.
-- =====================================================================

-- Catálogo genérico de opciones cortas (enums administrables).
create table if not exists cat_opciones (
  categoria text not null,
  valor     text not null,
  orden     int  not null default 0,
  activo    boolean not null default true,
  primary key (categoria, valor)
);

comment on table cat_opciones is 'Catálogo genérico de opciones cortas (sexo, complexión, color de piel, etc.) usadas en los formularios. Administrable.';

insert into cat_opciones (categoria, valor, orden) values
  ('puesta_disposicion','CODE',1),
  ('puesta_disposicion','FLAGRANCIA',2),
  ('puesta_disposicion','TORITO',3),
  ('puesta_disposicion','SECRETARIA DE SEGURIDAD',4),
  ('puesta_disposicion','MINISTERIAL',5),
  ('motivo_detencion','FLAGRANCIA',1),
  ('motivo_detencion','ORDEN DE APREHENSION',2),
  ('motivo_detencion','ORDEN JUDICIAL',3),
  ('motivo_detencion','FALTA ADMINISTRATIVA',4),
  ('motivo_detencion','OTRO',5),
  ('sexo','HOMBRE',1),
  ('sexo','MUJER',2),
  ('complexion','DELGADA',1),
  ('complexion','MEDIANA',2),
  ('complexion','ROBUSTA',3),
  ('complexion','ATLETICA',4),
  ('color_piel','BLANCA',1),
  ('color_piel','APERLADA',2),
  ('color_piel','MORENA CLARA',3),
  ('color_piel','MORENA',4),
  ('color_piel','MORENA OSCURA',5),
  ('color_piel','NEGRA',6)
on conflict (categoria, valor) do nothing;

alter table cat_opciones enable row level security;
drop policy if exists sel_cat_opciones on cat_opciones;
create policy sel_cat_opciones on cat_opciones for select to authenticated using (true);
drop policy if exists upd_cat_opciones on cat_opciones;
create policy upd_cat_opciones on cat_opciones for all to authenticated
  using (fn_rol_actual() = 'administrador') with check (fn_rol_actual() = 'administrador');

-- ---------------------------------------------------------------------
-- Nuevos campos en barandilla.
-- ---------------------------------------------------------------------
alter table barandilla add column if not exists fecha_detencion      timestamptz;
alter table barandilla add column if not exists lugar_detencion      text;
alter table barandilla add column if not exists latitud              double precision;
alter table barandilla add column if not exists longitud             double precision;
alter table barandilla add column if not exists puesta_disposicion   text;
alter table barandilla add column if not exists delito               text;   -- cat_incidentes_911.incidente
alter table barandilla add column if not exists folio_informe        text;
alter table barandilla add column if not exists alias                text;
alter table barandilla add column if not exists fecha_nacimiento     date;
alter table barandilla add column if not exists sexo                 text;
alter table barandilla add column if not exists complexion           text;
alter table barandilla add column if not exists estatura             numeric;
alter table barandilla add column if not exists peso                 numeric;
alter table barandilla add column if not exists color_piel           text;
alter table barandilla add column if not exists antecedentes         text;
alter table barandilla add column if not exists tatuajes             boolean not null default false;
alter table barandilla add column if not exists descripcion_tatuajes text;
alter table barandilla add column if not exists cicatrices           boolean not null default false;
alter table barandilla add column if not exists descripcion_cicatrices text;
alter table barandilla add column if not exists mano_izquierda       text;
alter table barandilla add column if not exists mano_derecha         text;
alter table barandilla add column if not exists proporciona_familiar boolean not null default false;
alter table barandilla add column if not exists nombre_familiar      text;
alter table barandilla add column if not exists telefono_familiar    text;
alter table barandilla add column if not exists fotografias          jsonb default '[]'::jsonb;


-- ########################################################################
-- ###  0018_incidentes_informe.sql
-- ########################################################################

-- =====================================================================
-- 0018_incidentes_informe.sql
-- Amplía el módulo de Incidentes (Informe Policial) con todos los campos del
-- formato SCP360. El informe se produce a partir de un incidente/reporte CAD
-- (ya ligado por llamada_cad_id) y lo llena el policía (web o app móvil).
--
-- Las listas de personas (entrevistados, detenidos/sospechosos) se registran
-- como vínculos (persona ↔ incidente, tipo_relacion). Las fotos con FotosPanel.
-- =====================================================================

-- Primer respondiente
alter table incidentes add column if not exists unidad             text;
alter table incidentes add column if not exists bodycam            text;

-- Conocimiento de los hechos
alter table incidentes add column if not exists via_conocimiento   text;
alter table incidentes add column if not exists fecha_conocimiento timestamptz;
alter table incidentes add column if not exists fecha_arribo       timestamptz;
alter table incidentes add column if not exists delito             text;   -- cat_incidentes_911.incidente
alter table incidentes add column if not exists acciones           text;   -- multi (coma-separado)

-- Lugar de los hechos
alter table incidentes add column if not exists tipo_lugar         text;
alter table incidentes add column if not exists negocio_operando   boolean;
alter table incidentes add column if not exists tipo_negocio       text;
alter table incidentes add column if not exists nombre_lugar       text;

-- Inspecciones
alter table incidentes add column if not exists objetos_encontrados boolean;
alter table incidentes add column if not exists objetos_faltantes   boolean;
alter table incidentes add column if not exists tipo_objeto         text;
alter table incidentes add column if not exists detalle_objetos     text;

-- Solicitud de apoyo
alter table incidentes add column if not exists solicito_apoyo      boolean;
alter table incidentes add column if not exists dependencias_apoyo  text;

-- Catálogos cortos usados por el informe.
insert into cat_opciones (categoria, valor, orden) values
  ('via_conocimiento','LLAMADA 911',1),
  ('via_conocimiento','PUESTA A DISPOSICION',2),
  ('via_conocimiento','DETENCION EN FLAGRANCIA',3),
  ('via_conocimiento','ALARMA',4),
  ('via_conocimiento','PATRULLAJE',5),
  ('via_conocimiento','OTRO',6),
  ('tipo_lugar','NEGOCIO',1),
  ('tipo_lugar','CASA HABITACION',2),
  ('tipo_lugar','VIA PUBLICA',3),
  ('tipo_lugar','ESCUELA',4),
  ('tipo_lugar','VEHICULO',5),
  ('tipo_lugar','TERRENO BALDIO',6),
  ('tipo_lugar','OTRO',7),
  ('dependencias_apoyo','MINISTERIAL',1),
  ('dependencias_apoyo','BOMBEROS',2),
  ('dependencias_apoyo','CRUZ ROJA',3),
  ('dependencias_apoyo','PROTECCION CIVIL',4),
  ('dependencias_apoyo','TRANSITO',5),
  ('dependencias_apoyo','FUERZAS FEDERALES',6),
  ('dependencias_apoyo','OTRO',7),
  ('acciones_realizadas','DETENCION',1),
  ('acciones_realizadas','INSPECCION',2),
  ('acciones_realizadas','ENTREVISTA',3),
  ('acciones_realizadas','ASEGURAMIENTO',4),
  ('acciones_realizadas','CANALIZACION',5),
  ('acciones_realizadas','TRASLADO',6)
on conflict (categoria, valor) do nothing;


-- ########################################################################
-- ###  0019_casos_campos.sql
-- ########################################################################

-- =====================================================================
-- 0019_casos_campos.sql
-- Amplía Casos/Carpetas con todos los campos del formato SCP360.
--
-- Generales (apertura, ubicación, distrito, delito 911, oficial responsable,
-- tipo de hechos), narrativa + resumen, descripciones del lugar/interior/zona,
-- quebranto (producto del robo) e hipótesis (desarrollo/reconstrucción).
-- Entrevistados y presuntos se registran como vínculos (persona/vehículo ↔
-- caso). Las fotos con FotosPanel.
-- =====================================================================

-- Generales del caso
alter table casos add column if not exists fecha_apertura       timestamptz default now();
alter table casos add column if not exists direccion            text;
alter table casos add column if not exists latitud              double precision;
alter table casos add column if not exists longitud             double precision;
alter table casos add column if not exists distrito             text;
alter table casos add column if not exists delito               text;   -- cat_incidentes_911.incidente
alter table casos add column if not exists oficial_personal_id  uuid references personal(id);
alter table casos add column if not exists tipo_hechos          text;

-- Narrativa
alter table casos add column if not exists resumen              text;

-- Lugar / interior / zona
alter table casos add column if not exists descripcion_lugar    text;
alter table casos add column if not exists descripcion_interior text;
alter table casos add column if not exists descripcion_zona     text;

-- Quebranto
alter table casos add column if not exists producto_robo        text;

-- Hipótesis de hechos
alter table casos add column if not exists desarrollo_delito    text;
alter table casos add column if not exists reconstruccion       text;

-- Fotos (lugar, exterior, interior, zona, vehículo, etc.)
alter table casos add column if not exists fotografias          jsonb default '[]'::jsonb;


-- ########################################################################
-- ###  0020_presuntos.sql
-- ########################################################################

-- =====================================================================
-- 0020_presuntos.sql
-- Sub-ficha de PRESUNTOS de un caso: cada presunto con su media filiación,
-- vestimenta, tatuajes/señas, producto del robo, vehículo y fotos propias.
-- Es una lista dentro del caso (uno a muchos).
-- =====================================================================

create table if not exists presuntos (
  id                  uuid primary key default gen_random_uuid(),
  caso_id             uuid not null references casos(id),
  persona_id          uuid references personas(id),   -- si está identificado en el índice maestro
  alias               text,
  sexo                text,
  complexion          text,
  estatura            numeric,
  color_piel          text,
  vestimenta          text,               -- multi (coma-separado)
  tatuajes            text,
  senas_particulares  text,
  producto_robo       text,
  veh_marca           text,
  veh_modelo          text,
  veh_anio            int,
  veh_color           text,
  veh_placas          text,
  notas               text,
  fotografias         jsonb default '[]'::jsonb,

  estatus             text not null default 'activo' check (estatus in ('activo','cancelado')),
  cancelado_en        timestamptz,
  motivo_cancelacion  text,

  creado_en           timestamptz not null default now(),
  actualizado_en      timestamptz not null default now()
);

comment on table presuntos is 'Presuntos responsables de un caso, con media filiación, vestimenta, vehículo y fotos.';

create index if not exists idx_presuntos_caso on presuntos (caso_id);

drop trigger if exists trg_no_delete_presuntos on presuntos;
create trigger trg_no_delete_presuntos before delete on presuntos
  for each row execute function fn_bloquear_delete();

revoke delete on presuntos from authenticated, anon;

drop trigger if exists trg_auditoria_presuntos on presuntos;
create trigger trg_auditoria_presuntos after insert or update on presuntos
  for each row execute function fn_bitacora_generica();

-- Ampliar rpc_cancelar_registro con 'presuntos'.
create or replace function rpc_cancelar_registro(
  p_tabla   text,
  p_id      uuid,
  p_motivo  text
) returns void as $$
begin
  if p_tabla not in ('personas','vehiculos','ubicaciones','vinculos','casos','personal',
                     'ordenes','evidencias','asuntos_internos','llamadas_cad','despachos',
                     'barandilla','equipo','incidentes','presuntos') then
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

alter table presuntos enable row level security;
drop policy if exists sel_presuntos on presuntos;
create policy sel_presuntos on presuntos for select to authenticated
  using (estatus = 'activo' or fn_rol_actual() in ('supervisor','investigador','administrador'));
drop policy if exists ins_presuntos on presuntos;
create policy ins_presuntos on presuntos for insert to authenticated with check (true);
drop policy if exists upd_presuntos on presuntos;
create policy upd_presuntos on presuntos for update to authenticated using (true) with check (true);

-- Catálogo de vestimenta (multi-select).
insert into cat_opciones (categoria, valor, orden) values
  ('vestimenta','CAMISA MANGA CORTA',1),
  ('vestimenta','CAMISA MANGA LARGA',2),
  ('vestimenta','PLAYERA',3),
  ('vestimenta','SUDADERA',4),
  ('vestimenta','CHAMARRA',5),
  ('vestimenta','PANTALON DE MEZCLILLA',6),
  ('vestimenta','PANTALON DE VESTIR',7),
  ('vestimenta','BERMUDA',8),
  ('vestimenta','SHORT',9),
  ('vestimenta','GORRA',10),
  ('vestimenta','TENIS',11),
  ('vestimenta','ZAPATOS',12),
  ('vestimenta','BOTAS',13)
on conflict (categoria, valor) do nothing;


-- ########################################################################
-- ###  0021_ubicaciones_patrulla.sql
-- ########################################################################

-- =====================================================================
-- 0021_ubicaciones_patrulla.sql
-- Posiciones GPS enviadas por el elemento desde la app móvil ("Enviar
-- ubicación"). Es una bitácora append-only (WORM) de pings de posición:
-- cada envío es un renglón inmutable. El centro de mando (web) puede leer
-- la última posición de cada patrulla desde la vista de abajo.
-- =====================================================================

create table if not exists ubicaciones_patrulla (
  id            bigint generated always as identity primary key,
  usuario_id    uuid,                                   -- auth.uid() de quien envía
  personal_id   uuid references personal(id),           -- elemento (si se vincula usuario↔personal)
  latitud       double precision not null,
  longitud      double precision not null,
  precision_m   double precision,                       -- exactitud reportada por el GPS (metros)
  origen        text not null default 'movil',
  enviado_en    timestamptz not null default now()
);

comment on table ubicaciones_patrulla is 'Pings de posición GPS enviados por el elemento en campo (append-only / WORM). La última fila por usuario es la posición actual de la patrulla.';

create index if not exists idx_ubic_patrulla_usuario on ubicaciones_patrulla (usuario_id, enviado_en desc);
create index if not exists idx_ubic_patrulla_fecha on ubicaciones_patrulla (enviado_en desc);

-- Última posición conocida por usuario (para el mapa del dashboard web).
create or replace view ubicaciones_patrulla_ultimas as
  select distinct on (usuario_id) *
  from ubicaciones_patrulla
  order by usuario_id, enviado_en desc;

-- WORM: un ping, una vez enviado, no se modifica ni se borra.
-- (fn_bloquear_cambios_append_only se definió en 0015_incidentes.sql)
drop trigger if exists trg_ubic_patrulla_worm on ubicaciones_patrulla;
create trigger trg_ubic_patrulla_worm
  before update or delete on ubicaciones_patrulla
  for each row execute function fn_bloquear_cambios_append_only();

revoke update, delete on ubicaciones_patrulla from authenticated, anon;

-- RLS: lectura para autenticados; sólo inserción (append-only).
alter table ubicaciones_patrulla enable row level security;

drop policy if exists sel_ubic_patrulla on ubicaciones_patrulla;
create policy sel_ubic_patrulla on ubicaciones_patrulla for select to authenticated using (true);

drop policy if exists ins_ubic_patrulla on ubicaciones_patrulla;
create policy ins_ubic_patrulla on ubicaciones_patrulla for insert to authenticated with check (true);

-- Registro del ping con el usuario resuelto en el servidor (auth.uid()).
create or replace function rpc_registrar_ubicacion(
  p_lat       double precision,
  p_lng       double precision,
  p_precision double precision default null
) returns bigint as $$
declare
  v_id bigint;
begin
  insert into ubicaciones_patrulla (usuario_id, latitud, longitud, precision_m, origen)
  values (auth.uid(), p_lat, p_lng, p_precision, 'movil')
  returning id into v_id;
  return v_id;
end;
$$ language plpgsql security definer;


-- ########################################################################
-- ###  0022_kardex.sql
-- ########################################################################

-- =====================================================================
-- 0022_kardex.sql
-- Kardex Policial: expediente laboral extendido de un elemento de Personal.
-- Modelado a partir del formato "KARDEX POLICIAL" (PDF PP00001).
--
-- Se vincula 1:1 a `personal` (que a su vez apunta a `personas`): NO duplica
-- los datos generales del elemento (nombre, CURP, RFC, grado, matrícula, fecha
-- de ingreso ya viven en personas/personal). Agrega los datos de trayectoria
-- profesional. Las secciones repetibles (formación, reconocimientos, sanciones,
-- ascensos, control y confianza, porte de arma, expediente documental) se
-- guardan como arreglos jsonb, coherente con el uso de jsonb del sistema.
-- =====================================================================

create table if not exists kardex (
  id                    uuid primary key default gen_random_uuid(),
  folio                 text,
  personal_id           uuid not null references personal(id),

  -- Contacto
  direccion             text,
  telefono              text,
  email                 text,

  -- Datos fisiológicos
  altura_cm             numeric,
  peso_kg               numeric,
  tipo_sangre           text,
  moscova               text,      -- talla del formato ("Moscova")
  talla_camisa          text,
  talla_pantalon        text,
  talla_zapato          text,

  -- CUP (Certificado Único Policial)
  cup                   text,
  cup_requisitos        text,
  cup_fin_vigencia      date,

  -- Evaluación del desempeño
  desempeno_puntaje     int,
  desempeno_productividad text,
  desempeno_fin_vigencia  date,

  -- Secciones repetibles (arreglos de objetos jsonb)
  formacion             jsonb default '[]'::jsonb,  -- [{tipo:'policial|academica|curso', institucion, formacion, fecha_fin, horas}]
  reconocimientos       jsonb default '[]'::jsonb,  -- [{reconocimiento, fecha}]
  sanciones             jsonb default '[]'::jsonb,  -- [{sancion, tipo, fecha}]
  ascensos              jsonb default '[]'::jsonb,  -- [{ascenso, resultado, grado}]
  control_confianza     jsonb default '[]'::jsonb,  -- [{examen, fecha, resultado}]
  armas                 jsonb default '[]'::jsonb,  -- [{arma, calibre, serie}]
  documentos            jsonb default '[]'::jsonb,  -- [{documento, completo, fin_vigencia}]

  datos_adicionales     jsonb default '{}'::jsonb,

  estatus               text not null default 'activo' check (estatus in ('activo','cancelado')),
  cancelado_en          timestamptz,
  motivo_cancelacion    text,

  creado_en             timestamptz not null default now(),
  actualizado_en        timestamptz not null default now()
);

comment on table kardex is 'Kardex Policial: expediente de trayectoria profesional de un elemento (1:1 con personal). No duplica datos generales.';

create index if not exists idx_kardex_personal on kardex (personal_id);
-- Un solo kardex activo por elemento.
create unique index if not exists uq_kardex_personal_activo on kardex (personal_id) where estatus = 'activo';

create or replace view kardex_activo as
  select * from kardex where estatus = 'activo';

drop trigger if exists trg_no_delete_kardex on kardex;
create trigger trg_no_delete_kardex before delete on kardex
  for each row execute function fn_bloquear_delete();

revoke delete on kardex from authenticated, anon;

drop trigger if exists trg_auditoria_kardex on kardex;
create trigger trg_auditoria_kardex after insert or update on kardex
  for each row execute function fn_bitacora_generica();

-- Foliador (iniciales KA) + trigger de folio.
insert into foliadores (modulo, nombre, iniciales) values
  ('kardex', 'Kardex Policial', 'KA')
on conflict (modulo) do nothing;

drop trigger if exists trg_folio_kardex on kardex;
create trigger trg_folio_kardex before insert on kardex
  for each row execute function fn_asignar_folio();

-- Ampliar rpc_cancelar_registro con 'kardex'.
create or replace function rpc_cancelar_registro(
  p_tabla   text,
  p_id      uuid,
  p_motivo  text
) returns void as $$
begin
  if p_tabla not in ('personas','vehiculos','ubicaciones','vinculos','casos','personal',
                     'ordenes','evidencias','asuntos_internos','llamadas_cad','despachos',
                     'barandilla','equipo','incidentes','presuntos','kardex') then
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

-- RLS
alter table kardex enable row level security;

drop policy if exists sel_kardex on kardex;
create policy sel_kardex on kardex for select to authenticated
  using (estatus = 'activo' or fn_rol_actual() in ('supervisor','investigador','administrador'));
drop policy if exists ins_kardex on kardex;
create policy ins_kardex on kardex for insert to authenticated with check (true);
drop policy if exists upd_kardex on kardex;
create policy upd_kardex on kardex for update to authenticated using (true) with check (true);


-- ########################################################################
-- ###  0023_cad_narrativas.sql
-- ########################################################################

-- =====================================================================
-- 0023_cad_narrativas.sql
-- Narrativas del CAD: registro append-only (WORM) de lo que reporta el oficial
-- que atiende un incidente/llamada. Cada narrativa guarda fecha/hora y usuario.
-- Se usa desde la web (detalle de la llamada) y desde la app móvil (despacho).
-- =====================================================================

create table if not exists narrativas_cad (
  id            bigint generated always as identity primary key,
  llamada_id    uuid not null references llamadas_cad(id),
  texto         text not null,
  usuario_id    uuid,
  usuario_email text,
  creado_en     timestamptz not null default now()
);

comment on table narrativas_cad is 'Narrativas (bitácora append-only) del oficial que atiende una llamada/incidente del CAD.';

create index if not exists idx_narrativas_cad_llamada on narrativas_cad (llamada_id, creado_en desc);

-- WORM: una vez registrada, no se modifica ni se borra.
-- (fn_bloquear_cambios_append_only se definió en 0015_incidentes.sql)
drop trigger if exists trg_narrativas_cad_worm on narrativas_cad;
create trigger trg_narrativas_cad_worm before update or delete on narrativas_cad
  for each row execute function fn_bloquear_cambios_append_only();

revoke update, delete on narrativas_cad from authenticated, anon;

alter table narrativas_cad enable row level security;

drop policy if exists sel_narrativas_cad on narrativas_cad;
create policy sel_narrativas_cad on narrativas_cad for select to authenticated using (true);
drop policy if exists ins_narrativas_cad on narrativas_cad;
create policy ins_narrativas_cad on narrativas_cad for insert to authenticated with check (true);

-- Registra una narrativa resolviendo el usuario (auth.uid + correo) en el
-- servidor, y devuelve la fila insertada.
create or replace function rpc_registrar_narrativa_cad(p_llamada uuid, p_texto text)
returns table (id bigint, llamada_id uuid, texto text, usuario_email text, creado_en timestamptz)
language plpgsql security definer set search_path = public, auth as $$
declare v_email text;
begin
  if coalesce(trim(p_texto), '') = '' then
    raise exception 'La narrativa no puede estar vacía.';
  end if;
  select u.email into v_email from auth.users u where u.id = auth.uid();
  return query
  insert into narrativas_cad (llamada_id, texto, usuario_id, usuario_email)
  values (p_llamada, p_texto, auth.uid(), v_email)
  returning narrativas_cad.id, narrativas_cad.llamada_id, narrativas_cad.texto, narrativas_cad.usuario_email, narrativas_cad.creado_en;
end;
$$;


-- ########################################################################
-- ###  0024_flota_patrullas.sql
-- ########################################################################

-- =====================================================================
-- 0024_flota_patrullas.sql   (Fase 1: esquema de flota/equipo dividido)
--
-- Divide el módulo "equipo" en 5 tablas: patrullas, armamento, comunicacion,
-- bodycams y otros. Las patrullas llevan un ESTATUS OPERATIVO
-- (disponible/fuera_servicio/en_rutina/en_pausa) para el despacho.
--
-- Migra los datos del `equipo` actual a las tablas nuevas, reclasifica los
-- `vehiculos` cuya descripción (modelo) dice 'Police' como patrullas, y agrega
-- `patrulla_id` a `despachos` (el despacho se asigna por patrulla; el oficial
-- se deriva del Rol de Servicio — ver 0025).
--
-- El `equipo` legado NO se borra (WORM); queda como histórico hasta retirar su
-- UI en la Fase 4. Los `vehiculos` reclasificados SÍ se cancelan (dejan de ser
-- vehículos civiles) con motivo, por petición explícita.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) PATRULLAS
-- ---------------------------------------------------------------------
create table if not exists patrullas (
  id                  uuid primary key default gen_random_uuid(),
  folio               text,
  numero              text,           -- número económico / de unidad
  tipo                text,           -- auto | motocicleta | bicicleta
  marca               text,
  modelo              text,
  placas              text,
  anio                int,
  color               text,
  numero_serie        text,
  estatus_unidad      text not null default 'fuera_servicio'
                        check (estatus_unidad in ('disponible','fuera_servicio','en_rutina','en_pausa')),
  fotografias         jsonb default '[]'::jsonb,
  datos_adicionales   jsonb default '{}'::jsonb,

  estatus             text not null default 'activo' check (estatus in ('activo','cancelado')),
  cancelado_en        timestamptz,
  motivo_cancelacion  text,
  creado_en           timestamptz not null default now(),
  actualizado_en      timestamptz not null default now()
);
comment on table patrullas is 'Unidades (auto/moto/bici) de la flota policial, con estatus operativo para el despacho.';
create index if not exists idx_patrullas_estatus_unidad on patrullas (estatus_unidad);
create index if not exists idx_patrullas_numero on patrullas (numero);
create or replace view patrullas_activas as select * from patrullas where estatus = 'activo';

-- ---------------------------------------------------------------------
-- 2) ARMAMENTO / COMUNICACION / BODYCAMS / OTROS (inventario uniforme)
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['armamento','comunicacion','bodycams','otros'] loop
    execute format($f$
      create table if not exists %I (
        id                  uuid primary key default gen_random_uuid(),
        folio               text,
        tipo                text,
        marca               text,
        modelo              text,
        numero_serie        text,
        descripcion         text,
        asignado_personal_id uuid references personal(id),
        estado_equipo       text not null default 'operativo'
                              check (estado_equipo in ('operativo','asignado','en_reparacion','baja')),
        fecha_alta          date,
        fotografias         jsonb default '[]'::jsonb,
        datos_adicionales   jsonb default '{}'::jsonb,
        estatus             text not null default 'activo' check (estatus in ('activo','cancelado')),
        cancelado_en        timestamptz,
        motivo_cancelacion  text,
        creado_en           timestamptz not null default now(),
        actualizado_en      timestamptz not null default now()
      );
      create or replace view %I as select * from %I where estatus = 'activo';
    $f$, t, t || '_activo', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 3) Triggers (no-delete + bitácora + folio), RLS y foliador por tabla.
-- ---------------------------------------------------------------------
do $$
declare
  cfg record;
begin
  for cfg in
    select * from (values
      ('patrullas','Patrullas','PT'),
      ('armamento','Armamento','AM'),
      ('comunicacion','Equipo de comunicación','CM'),
      ('bodycams','Bodycams','BC'),
      ('otros','Otros equipos','OT')
    ) as v(tabla, nombre, iniciales)
  loop
    -- no-delete
    execute format('drop trigger if exists trg_no_delete_%1$s on %1$s;', cfg.tabla);
    execute format('create trigger trg_no_delete_%1$s before delete on %1$s for each row execute function fn_bloquear_delete();', cfg.tabla);
    execute format('revoke delete on %I from authenticated, anon;', cfg.tabla);
    -- bitácora
    execute format('drop trigger if exists trg_auditoria_%1$s on %1$s;', cfg.tabla);
    execute format('create trigger trg_auditoria_%1$s after insert or update on %1$s for each row execute function fn_bitacora_generica();', cfg.tabla);
    -- foliador + trigger de folio
    insert into foliadores (modulo, nombre, iniciales) values (cfg.tabla, cfg.nombre, cfg.iniciales) on conflict (modulo) do nothing;
    execute format('drop trigger if exists trg_folio_%1$s on %1$s;', cfg.tabla);
    execute format('create trigger trg_folio_%1$s before insert on %1$s for each row execute function fn_asignar_folio();', cfg.tabla);
    -- RLS
    execute format('alter table %I enable row level security;', cfg.tabla);
    execute format('drop policy if exists sel_%1$s on %1$s;', cfg.tabla);
    execute format($p$create policy sel_%1$s on %1$s for select to authenticated using (estatus = 'activo' or fn_rol_actual() in ('supervisor','investigador','administrador'));$p$, cfg.tabla);
    execute format('drop policy if exists ins_%1$s on %1$s;', cfg.tabla);
    execute format('create policy ins_%1$s on %1$s for insert to authenticated with check (true);', cfg.tabla);
    execute format('drop policy if exists upd_%1$s on %1$s;', cfg.tabla);
    execute format('create policy upd_%1$s on %1$s for update to authenticated using (true) with check (true);', cfg.tabla);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 4) Ampliar rpc_cancelar_registro con las tablas nuevas.
-- ---------------------------------------------------------------------
create or replace function rpc_cancelar_registro(p_tabla text, p_id uuid, p_motivo text)
returns void as $$
begin
  if p_tabla not in ('personas','vehiculos','ubicaciones','vinculos','casos','personal',
                     'ordenes','evidencias','asuntos_internos','llamadas_cad','despachos',
                     'barandilla','equipo','incidentes','presuntos','kardex',
                     'patrullas','armamento','comunicacion','bodycams','otros') then
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

-- ---------------------------------------------------------------------
-- 5) despachos: asignación por patrulla.
-- ---------------------------------------------------------------------
alter table despachos add column if not exists patrulla_id uuid references patrullas(id);
create index if not exists idx_despachos_patrulla on despachos (patrulla_id);

-- ---------------------------------------------------------------------
-- 6) MIGRACIÓN DE DATOS
-- ---------------------------------------------------------------------
-- 6a) equipo -> inventarios (arma/radio/bodycam/otro). Legado NO se cancela.
insert into armamento (tipo, marca, modelo, numero_serie, asignado_personal_id, estado_equipo, fecha_alta, fotografias, datos_adicionales)
  select 'arma', marca, modelo, numero_serie, asignado_personal_id, estado_equipo, fecha_alta, fotografias,
         coalesce(datos_adicionales,'{}'::jsonb) || jsonb_build_object('origen_equipo_id', id::text)
  from equipo where estatus='activo' and lower(coalesce(tipo,'')) = 'arma';

insert into comunicacion (tipo, marca, modelo, numero_serie, asignado_personal_id, estado_equipo, fecha_alta, fotografias, datos_adicionales)
  select lower(tipo), marca, modelo, numero_serie, asignado_personal_id, estado_equipo, fecha_alta, fotografias,
         coalesce(datos_adicionales,'{}'::jsonb) || jsonb_build_object('origen_equipo_id', id::text)
  from equipo where estatus='activo' and lower(coalesce(tipo,'')) in ('radio','celular');

insert into bodycams (tipo, marca, modelo, numero_serie, asignado_personal_id, estado_equipo, fecha_alta, fotografias, datos_adicionales)
  select 'bodycam', marca, modelo, numero_serie, asignado_personal_id, estado_equipo, fecha_alta, fotografias,
         coalesce(datos_adicionales,'{}'::jsonb) || jsonb_build_object('origen_equipo_id', id::text)
  from equipo where estatus='activo' and lower(coalesce(tipo,'')) = 'bodycam';

insert into otros (tipo, marca, modelo, numero_serie, asignado_personal_id, estado_equipo, fecha_alta, fotografias, datos_adicionales)
  select coalesce(tipo,'otro'), marca, modelo, numero_serie, asignado_personal_id, estado_equipo, fecha_alta, fotografias,
         coalesce(datos_adicionales,'{}'::jsonb) || jsonb_build_object('origen_equipo_id', id::text)
  from equipo where estatus='activo' and lower(coalesce(tipo,'')) not in ('arma','radio','celular','bodycam','patrulla','motocicleta');

-- 6b) equipo tipo patrulla/motocicleta -> patrullas (jala datos del vehículo ligado).
insert into patrullas (numero, tipo, marca, modelo, placas, anio, color, numero_serie, fotografias, datos_adicionales)
  select
    coalesce(v.datos_adicionales->>'numero_economico', e.numero_serie),
    case when lower(e.tipo)='motocicleta' then 'motocicleta' else 'auto' end,
    coalesce(v.marca, e.marca), coalesce(v.modelo, e.modelo), v.placas, v.anio, v.color, e.numero_serie,
    coalesce(v.fotografias, e.fotografias, '[]'::jsonb),
    jsonb_build_object('origen_equipo_id', e.id::text, 'origen_vehiculo_id', v.id::text)
  from equipo e
  left join vehiculos v on v.id = (e.datos_adicionales->>'vehiculo_id')::uuid
  where e.estatus='activo' and lower(coalesce(e.tipo,'')) in ('patrulla','motocicleta');

-- 6c) vehiculos con 'Police' en la descripción (modelo) -> patrullas; cancelar el vehículo origen.
insert into patrullas (numero, tipo, marca, modelo, placas, anio, color, fotografias, datos_adicionales)
  select datos_adicionales->>'numero_economico', 'auto', marca, modelo, placas, anio, color,
         coalesce(fotografias,'[]'::jsonb),
         coalesce(datos_adicionales,'{}'::jsonb) || jsonb_build_object('origen_vehiculo_id', id::text)
  from vehiculos
  where estatus='activo' and modelo ilike '%police%';

update vehiculos
  set estatus='cancelado', cancelado_en=now(), motivo_cancelacion='Reclasificado a patrullas (flota policial)', actualizado_en=now()
  where estatus='activo' and modelo ilike '%police%';


-- ########################################################################
-- ###  0025_rol_servicio.sql
-- ########################################################################

-- =====================================================================
-- 0025_rol_servicio.sql   (Fase 2: Rol de Servicio)
--
-- Un supervisor elabora, antes de cada turno de 12 h, el ROL DE SERVICIO:
-- las parejas oficial ↔ patrulla que estarán en servicio. El módulo de
-- despacho lee de aquí qué unidades (y con qué oficial) están disponibles en
-- el día y horario en que se despacha.
-- =====================================================================

create table if not exists rol_servicio (
  id                     uuid primary key default gen_random_uuid(),
  folio                  text,
  fecha                  date not null,
  turno                  text not null check (turno in ('diurno','nocturno')),
  inicio                 timestamptz,
  fin                    timestamptz,
  supervisor_personal_id uuid references personal(id),
  notas                  text,
  estatus                text not null default 'activo' check (estatus in ('activo','cancelado')),
  cancelado_en           timestamptz,
  motivo_cancelacion     text,
  creado_en              timestamptz not null default now(),
  actualizado_en         timestamptz not null default now()
);
comment on table rol_servicio is 'Rol de servicio por turno de 12 h (elaborado por un supervisor).';
create index if not exists idx_rol_servicio_fecha on rol_servicio (fecha, turno);

create table if not exists rol_servicio_asignaciones (
  id             uuid primary key default gen_random_uuid(),
  rol_id         uuid not null references rol_servicio(id),
  patrulla_id    uuid not null references patrullas(id),
  personal_id    uuid not null references personal(id),
  rol_en_unidad  text,            -- conductor | acompañante | jefe de unidad, etc.
  notas          text,
  estatus        text not null default 'activo' check (estatus in ('activo','cancelado')),
  cancelado_en   timestamptz,
  motivo_cancelacion text,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index if not exists idx_rol_asig_rol on rol_servicio_asignaciones (rol_id);
create index if not exists idx_rol_asig_patrulla on rol_servicio_asignaciones (patrulla_id);

-- Triggers (no-delete + bitácora), foliador (RS) y RLS.
drop trigger if exists trg_no_delete_rol_servicio on rol_servicio;
create trigger trg_no_delete_rol_servicio before delete on rol_servicio for each row execute function fn_bloquear_delete();
drop trigger if exists trg_no_delete_rol_asig on rol_servicio_asignaciones;
create trigger trg_no_delete_rol_asig before delete on rol_servicio_asignaciones for each row execute function fn_bloquear_delete();
revoke delete on rol_servicio, rol_servicio_asignaciones from authenticated, anon;

drop trigger if exists trg_auditoria_rol_servicio on rol_servicio;
create trigger trg_auditoria_rol_servicio after insert or update on rol_servicio for each row execute function fn_bitacora_generica();
drop trigger if exists trg_auditoria_rol_asig on rol_servicio_asignaciones;
create trigger trg_auditoria_rol_asig after insert or update on rol_servicio_asignaciones for each row execute function fn_bitacora_generica();

insert into foliadores (modulo, nombre, iniciales) values ('rol_servicio','Rol de Servicio','RS') on conflict (modulo) do nothing;
drop trigger if exists trg_folio_rol_servicio on rol_servicio;
create trigger trg_folio_rol_servicio before insert on rol_servicio for each row execute function fn_asignar_folio();

alter table rol_servicio enable row level security;
alter table rol_servicio_asignaciones enable row level security;

-- Lectura: cualquier autenticado (el despacho la necesita). Escritura: supervisor/administrador.
drop policy if exists sel_rol_servicio on rol_servicio;
create policy sel_rol_servicio on rol_servicio for select to authenticated using (true);
drop policy if exists ins_rol_servicio on rol_servicio;
create policy ins_rol_servicio on rol_servicio for insert to authenticated with check (fn_rol_actual() in ('supervisor','administrador'));
drop policy if exists upd_rol_servicio on rol_servicio;
create policy upd_rol_servicio on rol_servicio for update to authenticated using (fn_rol_actual() in ('supervisor','administrador')) with check (fn_rol_actual() in ('supervisor','administrador'));

drop policy if exists sel_rol_asig on rol_servicio_asignaciones;
create policy sel_rol_asig on rol_servicio_asignaciones for select to authenticated using (true);
drop policy if exists ins_rol_asig on rol_servicio_asignaciones;
create policy ins_rol_asig on rol_servicio_asignaciones for insert to authenticated with check (fn_rol_actual() in ('supervisor','administrador'));
drop policy if exists upd_rol_asig on rol_servicio_asignaciones;
create policy upd_rol_asig on rol_servicio_asignaciones for update to authenticated using (fn_rol_actual() in ('supervisor','administrador')) with check (fn_rol_actual() in ('supervisor','administrador'));

-- Ampliar rpc_cancelar_registro con las tablas del rol.
create or replace function rpc_cancelar_registro(p_tabla text, p_id uuid, p_motivo text)
returns void as $$
begin
  if p_tabla not in ('personas','vehiculos','ubicaciones','vinculos','casos','personal',
                     'ordenes','evidencias','asuntos_internos','llamadas_cad','despachos',
                     'barandilla','equipo','incidentes','presuntos','kardex',
                     'patrullas','armamento','comunicacion','bodycams','otros',
                     'rol_servicio','rol_servicio_asignaciones') then
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

-- Vista para el despacho: patrullas EN SERVICIO ahora (rol activo cuyo horario
-- cubre el momento actual), con su oficial y el estatus operativo de la unidad.
create or replace view patrullas_en_servicio as
  select
    p.id            as patrulla_id,
    p.numero, p.tipo, p.marca, p.modelo, p.placas, p.estatus_unidad,
    a.personal_id,
    r.id            as rol_id, r.fecha, r.turno, r.inicio, r.fin
  from rol_servicio_asignaciones a
  join rol_servicio r on r.id = a.rol_id and r.estatus = 'activo'
  join patrullas p    on p.id = a.patrulla_id and p.estatus = 'activo'
  where a.estatus = 'activo'
    and now() between r.inicio and r.fin;


-- ########################################################################
-- ###  0026_incidente_involucrados.sql
-- ########################################################################

-- =====================================================================
-- 0026_incidente_involucrados.sql
--
-- Los "involucrados" de un incidente (personas, vehículos, ubicaciones) se
-- registran como VÍNCULOS (vinculos) entre el incidente y cada entidad, con
-- tipo_relacion = participación. Cada entidad se crea/actualiza también en su
-- catálogo maestro (personas/vehiculos/ubicaciones) y su foto vive en la
-- columna `fotografias` de ese registro (no en el incidente).
--
-- Esta migración sólo agrega los catálogos de participación usados por la UI.
-- No hay cambios estructurales: vinculos y fotografias ya existen.
-- =====================================================================

insert into cat_opciones (categoria, valor, orden) values
  -- Participación de una PERSONA en el incidente
  ('participacion_persona','VICTIMA / AFECTADO',1),
  ('participacion_persona','ENTREVISTADO',2),
  ('participacion_persona','TESTIGO',3),
  ('participacion_persona','DENUNCIANTE',4),
  ('participacion_persona','PRESUNTO / SOSPECHOSO',5),
  ('participacion_persona','DETENIDO',6),
  ('participacion_persona','PROPIETARIO',7),
  ('participacion_persona','INVOLUCRADO',8),
  -- Participación de un VEHÍCULO en el incidente
  ('participacion_vehiculo','INVOLUCRADO',1),
  ('participacion_vehiculo','SOSPECHOSO',2),
  ('participacion_vehiculo','ROBADO',3),
  ('participacion_vehiculo','ASEGURADO',4),
  ('participacion_vehiculo','DE LA VICTIMA',5),
  ('participacion_vehiculo','DEL PRESUNTO',6),
  -- Participación de una UBICACIÓN/lugar en el incidente
  ('participacion_lugar','LUGAR DE LOS HECHOS',1),
  ('participacion_lugar','DOMICILIO RELACIONADO',2),
  ('participacion_lugar','RELACIONADO',3)
on conflict (categoria, valor) do nothing;


-- ########################################################################
-- ###  0027_fix_rol_servicio_horarios.sql
-- ########################################################################

-- =====================================================================
-- 0027_fix_rol_servicio_horarios.sql
--
-- Corrige los horarios de los roles de servicio ya creados.
--
-- Bug: la web calculaba inicio/fin restando el offset del huso antes de
-- serializar (truco válido para inputs datetime-local, NO para timestamptz).
-- Las 07:00 locales se guardaban como 07:00Z y se releían como 01:00 local
-- (UTC-6), por lo que el turno diurno aparecía 1am–1pm y el nocturno 1pm–1am.
--
-- Aquí NO se desplaza el valor guardado: se RECALCULA la ventana de 12 h a
-- partir de `fecha` (día en que inicia el turno) y `turno`, interpretando las
-- horas en la zona local de la agencia. Es idempotente: correr de nuevo deja
-- el mismo resultado.
--
--   diurno   : fecha 07:00  →  fecha 19:00
--   nocturno : fecha 19:00  →  (fecha + 1) 07:00
-- =====================================================================

update rol_servicio
set
  inicio = case
    when turno = 'nocturno' then (fecha + time '19:00') at time zone 'America/Mexico_City'
    else                         (fecha + time '07:00') at time zone 'America/Mexico_City'
  end,
  fin = case
    when turno = 'nocturno' then ((fecha + 1) + time '07:00') at time zone 'America/Mexico_City'
    else                          (fecha + time '19:00') at time zone 'America/Mexico_City'
  end,
  actualizado_en = now()
where fecha is not null and turno is not null;

comment on column rol_servicio.fecha is 'Día en que INICIA el turno (diurno 07:00-19:00 del mismo día; nocturno 19:00 a 07:00 del día siguiente).';


-- ########################################################################
-- ###  0028_ia_rag.sql
-- ########################################################################

-- =====================================================================
-- 0028_ia_rag.sql   (Fase 0: cimientos de IA / RAG)
--
-- Capa de recuperación semántica para el copiloto de investigación:
--   1) pgvector + tabla `documentos_ia` (texto troceado + embedding gte-small).
--   2) rpc_buscar_semantica(): búsqueda por similitud, RESPETANDO permisos
--      (nivel_acceso; Asuntos Internos y demás sensibles NO se indexan en la
--      POC, y aun así el RPC filtra por rol como segunda barrera).
--   3) `ia_consultas`: auditoría de cada consulta/respuesta del copiloto.
--
-- Embeddings: modelo `gte-small` (384 dims) ejecutado en una Edge Function de
-- Supabase (no sale información a terceros). El indexado y la generación viven
-- en supabase/functions/ (indexar-ia, buscar-ia).
-- =====================================================================

create extension if not exists vector;

-- ---------------------------------------------------------------------
-- 1) Índice documental para RAG.
-- ---------------------------------------------------------------------
create table if not exists documentos_ia (
  id            uuid primary key default gen_random_uuid(),
  fuente_tabla  text not null,               -- incidentes | novedades | casos | ...
  fuente_id     text not null,               -- id del registro origen
  folio         text,                        -- folio para citar (enlace verificable)
  titulo        text,                        -- etiqueta corta de la fuente
  chunk         int  not null default 0,     -- fragmento dentro del registro
  texto         text not null,               -- fragmento indexado
  embedding     vector(384),                 -- gte-small
  nivel_acceso  text not null default 'general'
                  check (nivel_acceso in ('general','sensible')),
  metadatos     jsonb default '{}'::jsonb,
  actualizado_en timestamptz not null default now(),
  creado_en     timestamptz not null default now(),
  unique (fuente_tabla, fuente_id, chunk)
);
comment on table documentos_ia is 'Índice semántico (RAG) del copiloto: texto troceado + embedding gte-small, con folio para citar la fuente.';

create index if not exists idx_documentos_ia_fuente on documentos_ia (fuente_tabla, fuente_id);
-- Índice ANN por distancia coseno (embeddings normalizados por gte-small).
create index if not exists idx_documentos_ia_embedding on documentos_ia
  using hnsw (embedding vector_cosine_ops);

alter table documentos_ia enable row level security;
-- Lectura: contenido 'general' para cualquier autenticado; 'sensible' sólo roles
-- de investigación. La escritura la hace el indexador con service_role (omite RLS).
drop policy if exists sel_documentos_ia on documentos_ia;
create policy sel_documentos_ia on documentos_ia for select to authenticated
  using (nivel_acceso = 'general' or fn_rol_actual() in ('investigador','supervisor','administrador'));

-- ---------------------------------------------------------------------
-- 2) Búsqueda semántica RLS-aware.
--    SECURITY INVOKER: corre con el JWT del usuario, por lo que la política de
--    documentos_ia y fn_rol_actual() se evalúan con SUS permisos.
-- ---------------------------------------------------------------------
create or replace function rpc_buscar_semantica(
  p_embedding  vector(384),
  p_k          int default 8,
  p_min_sim    float default 0.0
) returns table (
  fuente_tabla text,
  fuente_id    text,
  folio        text,
  titulo       text,
  texto        text,
  similitud    float
) language sql stable security invoker as $$
  select d.fuente_tabla, d.fuente_id, d.folio, d.titulo, d.texto,
         1 - (d.embedding <=> p_embedding) as similitud
  from documentos_ia d
  where d.embedding is not null
    and (1 - (d.embedding <=> p_embedding)) >= p_min_sim
  order by d.embedding <=> p_embedding
  limit greatest(p_k, 1);
$$;

-- ---------------------------------------------------------------------
-- 3) Auditoría de consultas del copiloto (trazabilidad obligatoria).
-- ---------------------------------------------------------------------
create table if not exists ia_consultas (
  id             bigint generated always as identity primary key,
  usuario_id     uuid default auth.uid(),
  pregunta       text not null,
  respuesta      text,
  citas          jsonb default '[]'::jsonb,   -- [{fuente_tabla, fuente_id, folio, similitud}]
  contexto_tipo  text,                        -- caso | incidente | global
  contexto_id    text,
  nivel_confianza text,                       -- alta | media | baja | sin_evidencia
  modelo         text,
  creado_en      timestamptz not null default now()
);
comment on table ia_consultas is 'Auditoría de cada consulta/respuesta del copiloto de IA (pregunta, citas, confianza).';
create index if not exists idx_ia_consultas_usuario on ia_consultas (usuario_id, creado_en desc);

alter table ia_consultas enable row level security;
-- Registro append-only (no update/delete desde el cliente).
drop trigger if exists trg_ia_consultas_worm on ia_consultas;
create trigger trg_ia_consultas_worm before update or delete on ia_consultas
  for each row execute function fn_bloquear_cambios_append_only();
revoke update, delete on ia_consultas from authenticated, anon;

drop policy if exists ins_ia_consultas on ia_consultas;
create policy ins_ia_consultas on ia_consultas for insert to authenticated with check (true);
drop policy if exists sel_ia_consultas on ia_consultas;
create policy sel_ia_consultas on ia_consultas for select to authenticated
  using (usuario_id = auth.uid() or fn_rol_actual() in ('supervisor','administrador'));


-- ########################################################################
-- ###  0029_abordamientos.sql
-- ########################################################################

-- =====================================================================
-- 0029_abordamientos.sql   (Módulo Abordamientos)
--
-- Un abordamiento documenta, a discreción del oficial, personas/vehículos en
-- circunstancias sospechosas o inusuales. Intercambia información con
-- Barandilla, Incidentes, Casos, Personas, Vehículos, Órdenes y Citatorios
-- (vía la tabla genérica `vinculos`; se agrega el tipo 'abordamiento').
--
-- Campos tomados de Tablas/Abordamientos.jpg. La persona y el vehículo abordados
-- se guardan en los catálogos maestros (personas/vehiculos) y se enlazan por
-- persona_id / vehiculo_id; sus atributos extra (ocupación, estado civil,
-- escolaridad, originario / estado del vehículo, seguro) viven en el
-- `datos_adicionales` de esos registros.
-- =====================================================================

create table if not exists abordamientos (
  id                   uuid primary key default gen_random_uuid(),
  folio                text,
  fecha_registro       timestamptz not null default now(),
  tipo_servicio        text check (tipo_servicio in ('operativo','rutina')),
  folio_operativo      text,                       -- folio del operativo (si aplica)

  -- Primer respondiente
  oficial_personal_id  uuid references personal(id),
  crp                  text,
  bodycam              text,

  -- Motivo (multi, del catálogo motivo_abordamiento; coma-separado)
  motivo               text,

  -- Ubicación
  direccion            text,
  colonia              text,
  latitud              double precision,
  longitud             double precision,

  -- Persona y vehículo abordados (índice maestro)
  persona_id           uuid references personas(id),
  vehiculo_id          uuid references vehiculos(id),

  -- Resultado / notas / fotos del abordamiento
  resultado            text,                       -- catálogo resultado_abordamiento
  observaciones        text,
  fotografias          jsonb default '[]'::jsonb,
  datos_adicionales    jsonb default '{}'::jsonb,

  estatus              text not null default 'activo' check (estatus in ('activo','cancelado')),
  cancelado_en         timestamptz,
  motivo_cancelacion   text,
  creado_en            timestamptz not null default now(),
  actualizado_en       timestamptz not null default now()
);
comment on table abordamientos is 'Abordamientos: registro discrecional de personas/vehículos en circunstancias sospechosas; insumo para análisis de delitos. Intercambia con barandilla/incidentes/casos/personas/vehiculos/ordenes vía vinculos.';

create index if not exists idx_abordamientos_oficial on abordamientos (oficial_personal_id);
create index if not exists idx_abordamientos_persona on abordamientos (persona_id);
create index if not exists idx_abordamientos_vehiculo on abordamientos (vehiculo_id);
create index if not exists idx_abordamientos_fecha on abordamientos (fecha_registro desc);

create or replace view abordamientos_activos as
  select * from abordamientos where estatus = 'activo';

-- Triggers: no-delete (WORM) + bitácora + foliador (AB).
drop trigger if exists trg_no_delete_abordamientos on abordamientos;
create trigger trg_no_delete_abordamientos before delete on abordamientos
  for each row execute function fn_bloquear_delete();
revoke delete on abordamientos from authenticated, anon;

drop trigger if exists trg_auditoria_abordamientos on abordamientos;
create trigger trg_auditoria_abordamientos after insert or update on abordamientos
  for each row execute function fn_bitacora_generica();

insert into foliadores (modulo, nombre, iniciales) values ('abordamientos','Abordamientos','AB')
  on conflict (modulo) do nothing;
drop trigger if exists trg_folio_abordamientos on abordamientos;
create trigger trg_folio_abordamientos before insert on abordamientos
  for each row execute function fn_asignar_folio();

-- RLS (patrón estándar).
alter table abordamientos enable row level security;
drop policy if exists sel_abordamientos on abordamientos;
create policy sel_abordamientos on abordamientos for select to authenticated
  using (estatus = 'activo' or fn_rol_actual() in ('supervisor','investigador','administrador'));
drop policy if exists ins_abordamientos on abordamientos;
create policy ins_abordamientos on abordamientos for insert to authenticated with check (true);
drop policy if exists upd_abordamientos on abordamientos;
create policy upd_abordamientos on abordamientos for update to authenticated using (true) with check (true);

-- Ampliar rpc_cancelar_registro con 'abordamientos'.
create or replace function rpc_cancelar_registro(p_tabla text, p_id uuid, p_motivo text)
returns void as $$
begin
  if p_tabla not in ('personas','vehiculos','ubicaciones','vinculos','casos','personal',
                     'ordenes','evidencias','asuntos_internos','llamadas_cad','despachos',
                     'barandilla','equipo','incidentes','presuntos','kardex',
                     'patrullas','armamento','comunicacion','bodycams','otros',
                     'rol_servicio','rol_servicio_asignaciones','abordamientos') then
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

-- Catálogos del módulo.
insert into cat_opciones (categoria, valor, orden) values
  ('motivo_abordamiento','PLACA FORANEA',1),
  ('motivo_abordamiento','PLACA OBSTRUIDA / FALTANTE',2),
  ('motivo_abordamiento','PLACA FALSA',3),
  ('motivo_abordamiento','POLARIZADO EXTRA',4),
  ('motivo_abordamiento','INCUMPLE REGLAMENTO',5),
  ('motivo_abordamiento','FALTA ADMINISTRATIVA',6),
  ('motivo_abordamiento','PERSONA SOSPECHOSA',7),
  ('motivo_abordamiento','VEHICULO SOSPECHOSO',8),
  ('motivo_abordamiento','ACTIVIDAD SOSPECHOSA',9),
  ('resultado_abordamiento','SIN NOVEDAD',1),
  ('resultado_abordamiento','INFORME DE INCIDENTE',2),
  ('resultado_abordamiento','REMISION / BARANDILLA',3),
  ('resultado_abordamiento','CITATORIO',4),
  ('resultado_abordamiento','ASEGURAMIENTO',5),
  ('resultado_abordamiento','OTRO',6),
  ('estado_civil','SOLTERO/A',1),
  ('estado_civil','CASADO/A',2),
  ('estado_civil','UNION LIBRE',3),
  ('estado_civil','DIVORCIADO/A',4),
  ('estado_civil','VIUDO/A',5),
  ('escolaridad','NINGUNA',1),
  ('escolaridad','PRIMARIA',2),
  ('escolaridad','SECUNDARIA',3),
  ('escolaridad','PREPARATORIA',4),
  ('escolaridad','LICENCIATURA',5),
  ('escolaridad','POSGRADO',6)
on conflict (categoria, valor) do nothing;


-- ########################################################################
-- ###  0030_configuracion.sql
-- ########################################################################

-- =====================================================================
-- 0030_configuracion.sql
-- Parámetros de configuración del sistema: datos de la Corporación Policial
-- y jurisdicción que rige la geocodificación de domicilios (búsqueda en mapa).
--
-- Tabla singleton: una sola fila (id = true). Lectura para cualquier usuario
-- autenticado (el CAD necesita la jurisdicción); edición solo administrador.
-- =====================================================================

create table if not exists config_sistema (
  id                boolean primary key default true check (id),  -- fuerza fila única
  corporacion       text not null default 'Secretaría de Seguridad Metropolitana',
  escudo            text not null default 'escudo.png',
  jurisdiccion      text not null default 'Nuevo León',   -- estado que rige la búsqueda de domicilios
  jurisdiccion_pais text not null default 'México',
  domicilio         text,
  telefono          text,
  correo            text,
  actualizado_en    timestamptz not null default now()
);

comment on table config_sistema is 'Parámetros del sistema: datos de la Corporación Policial y jurisdicción para geocodificación (tabla singleton).';
comment on column config_sistema.jurisdiccion is 'Estado/entidad que sesga la búsqueda de domicilios en el CAD (ej. Nuevo León).';

-- Fila única con los valores de esta corporación.
insert into config_sistema (id, corporacion, escudo, jurisdiccion, jurisdiccion_pais)
values (true, 'Secretaría de Seguridad Metropolitana', 'escudo.png', 'Nuevo León', 'México')
on conflict (id) do nothing;

alter table config_sistema enable row level security;

-- Lectura para cualquier usuario autenticado.
drop policy if exists sel_config on config_sistema;
create policy sel_config on config_sistema for select to authenticated using (true);

-- Alta/edición solo administrador.
drop policy if exists ins_config on config_sistema;
create policy ins_config on config_sistema for insert to authenticated
  with check (fn_rol_actual() = 'administrador');
drop policy if exists upd_config on config_sistema;
create policy upd_config on config_sistema for update to authenticated
  using (fn_rol_actual() = 'administrador') with check (fn_rol_actual() = 'administrador');


-- ########################################################################
-- ###  0031_accidentes.sql
-- ########################################################################

-- =====================================================================
-- 0031_accidentes.sql   (Módulo Accidentes viales)
--
-- Informe de accidente vial (parte de tránsito). Campos tomados de
-- Tablas/Accidentes1.jpg (GENERALES), Accidentes2.jpg (VEHÍCULOS) y
-- Accidentes3.jpg (PARTE: croquis + fotos).
--
-- Los vehículos participantes se guardan en el catálogo maestro `vehiculos` y
-- sus conductores en `personas`; el detalle específico del accidente (rol
-- responsable/afectado, tipo de servicio, aseguradora, foto) vive en la tabla
-- hija `accidente_vehiculos`. Puede iniciarse desde un reporte CAD (llamada_id).
-- =====================================================================

create table if not exists accidentes (
  id                   uuid primary key default gen_random_uuid(),
  folio                text,
  llamada_id           uuid references llamadas_cad(id),   -- si se inició de un reporte

  -- Generales
  fecha                date,
  hora                 time,
  dia                  text,                               -- día de la semana
  oficial_personal_id  uuid references personal(id),
  bodycam              text,
  tipo_hecho           text,                               -- catálogo tipo_hecho_transito
  latitud              double precision,
  longitud             double precision,
  direccion            text,
  sentido_circulacion  text,                               -- Nte-Sur / Sur-Nte / Ote-Pte / Pte-Ote
  entre_calles         text,
  tipo_via             text,                               -- Calle / Avenida / Boulevard / Carretera / Brecha
  pavimentada          boolean,
  total_vehiculos      text,                               -- '1'..'5' / '6-10'
  lesionados           boolean,
  fallecidos           boolean,
  condicion_clima      text,                               -- Seco / Lluvioso / ...
  estatus_atencion     text,                               -- Atendiendo / Cerrado sin lesionados / Cerrado con detenidos

  -- Parte
  croquis              text,                               -- ruta del dibujo en Storage
  fotografias          jsonb default '[]'::jsonb,          -- fotos para el parte
  descripcion          text,

  estatus              text not null default 'activo' check (estatus in ('activo','cancelado')),
  cancelado_en         timestamptz,
  motivo_cancelacion   text,
  creado_en            timestamptz not null default now(),
  actualizado_en       timestamptz not null default now()
);
comment on table accidentes is 'Informes de accidentes viales (parte de tránsito): generales, participantes (accidente_vehiculos), croquis y fotos.';

create index if not exists idx_accidentes_oficial on accidentes (oficial_personal_id);
create index if not exists idx_accidentes_llamada on accidentes (llamada_id);
create index if not exists idx_accidentes_fecha on accidentes (fecha desc);

-- Vehículos/participantes del accidente (vehículo + conductor + rol).
create table if not exists accidente_vehiculos (
  id                    uuid primary key default gen_random_uuid(),
  accidente_id          uuid not null references accidentes(id),
  orden                 int not null default 1,            -- Vehículo 1, 2, ...
  vehiculo_id           uuid references vehiculos(id),     -- índice maestro
  conductor_persona_id  uuid references personas(id),      -- índice maestro
  placa                 text,
  tipo_vehiculo         text,                              -- catálogo tipo_vehiculo_accidente
  tipo_servicio         text,                              -- Particular / Público
  rol                   text,                              -- catálogo rol_participante_accidente
  asegurado             boolean,
  compania              text,
  foto                  text,                              -- ruta de la foto del vehículo en Storage
  creado_en             timestamptz not null default now()
);
comment on table accidente_vehiculos is 'Vehículos participantes de un accidente, con su conductor (persona), rol (responsable/afectado), aseguradora y foto.';
create index if not exists idx_acc_veh_accidente on accidente_vehiculos (accidente_id);

-- Triggers del padre: no-delete (WORM) + bitácora + foliador (AV).
drop trigger if exists trg_no_delete_accidentes on accidentes;
create trigger trg_no_delete_accidentes before delete on accidentes
  for each row execute function fn_bloquear_delete();
revoke delete on accidentes from authenticated, anon;

drop trigger if exists trg_auditoria_accidentes on accidentes;
create trigger trg_auditoria_accidentes after insert or update on accidentes
  for each row execute function fn_bitacora_generica();

insert into foliadores (modulo, nombre, iniciales) values ('accidentes','Accidentes viales','AV')
  on conflict (modulo) do nothing;
drop trigger if exists trg_folio_accidentes on accidentes;
create trigger trg_folio_accidentes before insert on accidentes
  for each row execute function fn_asignar_folio();

-- RLS del padre (patrón estándar operativo).
alter table accidentes enable row level security;
drop policy if exists sel_accidentes on accidentes;
create policy sel_accidentes on accidentes for select to authenticated
  using (estatus = 'activo' or fn_rol_actual() in ('supervisor','investigador','administrador'));
drop policy if exists ins_accidentes on accidentes;
create policy ins_accidentes on accidentes for insert to authenticated with check (true);
drop policy if exists upd_accidentes on accidentes;
create policy upd_accidentes on accidentes for update to authenticated using (true) with check (true);

-- RLS de la tabla hija (se puede agregar/quitar participantes mientras se edita).
alter table accidente_vehiculos enable row level security;
drop policy if exists sel_acc_veh on accidente_vehiculos;
create policy sel_acc_veh on accidente_vehiculos for select to authenticated using (true);
drop policy if exists ins_acc_veh on accidente_vehiculos;
create policy ins_acc_veh on accidente_vehiculos for insert to authenticated with check (true);
drop policy if exists upd_acc_veh on accidente_vehiculos;
create policy upd_acc_veh on accidente_vehiculos for update to authenticated using (true) with check (true);
drop policy if exists del_acc_veh on accidente_vehiculos;
create policy del_acc_veh on accidente_vehiculos for delete to authenticated using (true);

-- Ampliar rpc_cancelar_registro con 'accidentes'.
create or replace function rpc_cancelar_registro(p_tabla text, p_id uuid, p_motivo text)
returns void as $$
begin
  if p_tabla not in ('personas','vehiculos','ubicaciones','vinculos','casos','personal',
                     'ordenes','evidencias','asuntos_internos','llamadas_cad','despachos',
                     'barandilla','equipo','incidentes','presuntos','kardex',
                     'patrullas','armamento','comunicacion','bodycams','otros',
                     'rol_servicio','rol_servicio_asignaciones','abordamientos','accidentes') then
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

-- Catálogos del módulo.
insert into cat_opciones (categoria, valor, orden) values
  ('tipo_hecho_transito','CHOQUE POR ALCANCE',1),
  ('tipo_hecho_transito','CHOQUE LATERAL',2),
  ('tipo_hecho_transito','CHOQUE FRONTAL',3),
  ('tipo_hecho_transito','CHOQUE POR PROYECCION',4),
  ('tipo_hecho_transito','VOLCADURA',5),
  ('tipo_hecho_transito','ATROPELLAMIENTO',6),
  ('tipo_hecho_transito','SALIDA DE CAMINO',7),
  ('tipo_hecho_transito','COLISION CON OBJETO FIJO',8),
  ('tipo_hecho_transito','CAIDA DE PASAJERO',9),
  ('tipo_hecho_transito','OTRO',10),
  ('sentido_circulacion','NTE-SUR',1),
  ('sentido_circulacion','SUR-NTE',2),
  ('sentido_circulacion','OTE-PTE',3),
  ('sentido_circulacion','PTE-OTE',4),
  ('tipo_via','CALLE',1),
  ('tipo_via','AVENIDA',2),
  ('tipo_via','BOULEVARD',3),
  ('tipo_via','CARRETERA',4),
  ('tipo_via','BRECHA',5),
  ('condicion_clima','SECO',1),
  ('condicion_clima','LLUVIOSO',2),
  ('condicion_clima','GRANIZO',3),
  ('condicion_clima','NIEVE',4),
  ('condicion_clima','NEBLINA',5),
  ('condicion_clima','HIELO',6),
  ('condicion_clima','OTRO',7),
  ('tipo_vehiculo_accidente','AUTOMOVIL',1),
  ('tipo_vehiculo_accidente','CAMIONETA',2),
  ('tipo_vehiculo_accidente','URBANO',3),
  ('tipo_vehiculo_accidente','TRAILER',4),
  ('tipo_vehiculo_accidente','MOTOCICLETA',5),
  ('tipo_vehiculo_accidente','BICICLETA',6),
  ('tipo_vehiculo_accidente','OTRO',7),
  ('tipo_servicio_vehiculo','PARTICULAR',1),
  ('tipo_servicio_vehiculo','PUBLICO',2),
  ('rol_participante_accidente','RESPONSABLE',1),
  ('rol_participante_accidente','AFECTADO',2),
  ('estatus_accidente','ATENDIENDO',1),
  ('estatus_accidente','CERRADO SIN LESIONADOS',2),
  ('estatus_accidente','CERRADO CON DETENIDOS',3)
on conflict (categoria, valor) do nothing;


-- ########################################################################
-- ###  0032_incidentes_v2.sql
-- ########################################################################

-- =====================================================================
-- 0032_incidentes_v2.sql
-- Rework del módulo Incidentes (Informe de Incidente):
--  * Estado UNIFICADO: se agrega 'cancelado' al campo estado y se sincroniza
--    con el estatus del registro (cancelar por cualquier vía deja ambos
--    consistentes). El informe cancelado queda de solo lectura y fuera de las
--    listas activas; desde el reporte CAD origen se puede levantar otro.
--  * Fecha de la Elaboración (nueva) vs Fecha del Incidente.
--  * Campos: habitada (casa habitación), a_donde_traslada, a_donde_canaliza.
--  * Catálogos: delitos (Delitos.txt), giro del negocio (nombre del lugar) y
--    dependencias de apoyo adicionales (Periciales, Semefo).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) estado: agregar 'cancelado'.
-- ---------------------------------------------------------------------
alter table incidentes drop constraint if exists incidentes_estado_check;
alter table incidentes add constraint incidentes_estado_check
  check (estado in ('abierto','en_proceso','cerrado','cancelado'));

-- ---------------------------------------------------------------------
-- 2) Nuevos campos.
-- ---------------------------------------------------------------------
alter table incidentes add column if not exists fecha_elaboracion timestamptz;
alter table incidentes add column if not exists habitada          boolean;
alter table incidentes add column if not exists a_donde_traslada  text;
alter table incidentes add column if not exists a_donde_canaliza  text;

-- La fecha de elaboración toma, en los registros existentes, la fecha del
-- incidente (o la de creación). En adelante, ambas fechas se capturan aparte.
update incidentes
  set fecha_elaboracion = coalesce(fecha_incidente, creado_en)
  where fecha_elaboracion is null;

-- ---------------------------------------------------------------------
-- 3) Sincronía estado <-> estatus.
--    - Marcar estado='cancelado' cancela el registro (estatus + cancelado_en).
--    - Cancelar por estatus (rpc_cancelar_registro) refleja estado='cancelado'.
--    - Reactivar (estatus='activo') saca del estado 'cancelado'.
-- ---------------------------------------------------------------------
create or replace function fn_sync_estado_incidente()
returns trigger as $$
begin
  if new.estado = 'cancelado' and coalesce(old.estado, '') <> 'cancelado' then
    new.estatus := 'cancelado';
    if new.cancelado_en is null then new.cancelado_en := now(); end if;
  end if;
  if new.estatus = 'cancelado' and coalesce(old.estatus, '') <> 'cancelado' then
    new.estado := 'cancelado';
  end if;
  if new.estatus = 'activo' and new.estado = 'cancelado' then
    new.estado := 'abierto';
    new.cancelado_en := null;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_sync_estado_incidente on incidentes;
create trigger trg_sync_estado_incidente before update on incidentes
  for each row execute function fn_sync_estado_incidente();

-- ---------------------------------------------------------------------
-- 4) Catálogos.
-- ---------------------------------------------------------------------
-- 4a) Delito del incidente (de Tablas/Delitos.txt). Reemplaza al catálogo 911
--     para este campo. "ROBO A INTERIOR DE VEHÍCULO O" se limpió a
--     "ROBO A INTERIOR DE VEHÍCULO" (el " O" del origen era un artefacto).
insert into cat_opciones (categoria, valor, orden) values
  ('delito_incidente','CORRUPCIÓN',1),
  ('delito_incidente','DAÑOS A PROPIEDAD',2),
  ('delito_incidente','DESAPARICIÓN FORZADA',3),
  ('delito_incidente','EXTORSIÓN',4),
  ('delito_incidente','FEMINICIDIO',5),
  ('delito_incidente','FRAUDE',6),
  ('delito_incidente','HOMICIDIO',7),
  ('delito_incidente','NARCOTRÁFICO',8),
  ('delito_incidente','PIRATERÍA',9),
  ('delito_incidente','ROBO A CASA HABITACIÓN',10),
  ('delito_incidente','ROBO A INTERIOR DE VEHÍCULO',11),
  ('delito_incidente','ROBO A NEGOCIO',12),
  ('delito_incidente','ROBO A PERSONA',13),
  ('delito_incidente','ROBO DE AUTOPARTES',14),
  ('delito_incidente','ROBO DE VEHÍCULO',15),
  ('delito_incidente','SECUESTRO',16),
  ('delito_incidente','TRATA DE PERSONAS',17),
  ('delito_incidente','USO DE ARMAS PROHIBIDAS',18),
  ('delito_incidente','VANDALISMO',19),
  ('delito_incidente','VIOLACIÓN',20),
  ('delito_incidente','VIOLENCIA FAMILIAR',21)
on conflict (categoria, valor) do nothing;

-- 4b) Giro del negocio (campo "Nombre del lugar" cuando el tipo de lugar es Negocio).
insert into cat_opciones (categoria, valor, orden) values
  ('giro_negocio','FARMACIA',1),
  ('giro_negocio','JOYERÍA',2),
  ('giro_negocio','OFICINAS',3),
  ('giro_negocio','PLAZA COMERCIAL',4),
  ('giro_negocio','RESTAURANTE',5),
  ('giro_negocio','TIENDA DE CONVENIENCIA',6),
  ('giro_negocio','SUPERMERCADO',7),
  ('giro_negocio','TIENDA DE ROPA',8),
  ('giro_negocio','CASA DE DIVISAS',9)
on conflict (categoria, valor) do nothing;

-- 4c) Dependencias de apoyo adicionales (Tránsito ya existía).
insert into cat_opciones (categoria, valor, orden) values
  ('dependencias_apoyo','PERICIALES',8),
  ('dependencias_apoyo','SEMEFO',9)
on conflict (categoria, valor) do nothing;


-- ########################################################################
-- ###  0033_ubicaciones_auto.sql
-- ########################################################################

-- =====================================================================
-- 0033_ubicaciones_auto.sql
-- Respalda en `ubicaciones` las direcciones de los reportes (llamadas_cad),
-- incidentes y accidentes, y las liga con `vinculos` (tipo_relacion 'LUGAR'),
-- para que al buscar un domicilio (en Ubicaciones o en la búsqueda general) se
-- encuentren todos los registros del mismo lugar.
--
-- Dedup POR TEXTO de dirección normalizado (minúsculas, sin espacios extra):
-- una misma dirección = una sola ubicación. Las ubicaciones creadas aquí llevan
-- datos_adicionales.origen = 'auto_registro' y la clave dir_norm para deduplicar.
-- Incluye trigger para ligar automáticamente los registros FUTUROS.
-- =====================================================================

-- Normaliza una dirección de texto libre (o null si queda vacía).
create or replace function fn_norm_dir(p text)
returns text language sql immutable as $$
  select nullif(lower(regexp_replace(btrim(coalesce(p, '')), '\s+', ' ', 'g')), '')
$$;

-- Encuentra (o crea) la ubicación de una dirección y la liga a un registro.
create or replace function fn_ligar_ubicacion(
  p_tipo text, p_id uuid, p_dir text, p_lat double precision, p_lng double precision
) returns void language plpgsql security definer set search_path = public as $$
declare v_norm text; v_ubic uuid;
begin
  v_norm := fn_norm_dir(p_dir);
  if v_norm is null then return; end if;

  select id into v_ubic from ubicaciones
    where estatus = 'activo' and datos_adicionales->>'dir_norm' = v_norm
    limit 1;

  if v_ubic is null then
    insert into ubicaciones (calle, latitud, longitud, datos_adicionales)
      values (btrim(p_dir), p_lat, p_lng, jsonb_build_object('origen', 'auto_registro', 'dir_norm', v_norm))
      returning id into v_ubic;
  elsif p_lat is not null then
    -- Completa coordenadas si la ubicación aún no las tenía.
    update ubicaciones set latitud = p_lat, longitud = p_lng, actualizado_en = now()
      where id = v_ubic and latitud is null;
  end if;

  if not exists (
    select 1 from vinculos
     where entidad_origen_tipo = p_tipo and entidad_origen_id = p_id
       and entidad_destino_tipo = 'ubicacion' and entidad_destino_id = v_ubic
       and estatus = 'activo'
  ) then
    insert into vinculos (entidad_origen_tipo, entidad_origen_id, entidad_destino_tipo, entidad_destino_id, tipo_relacion)
      values (p_tipo, p_id, 'ubicacion', v_ubic, 'LUGAR');
  end if;
end $$;

-- Trigger genérico: mapea la tabla a su tipo de entidad y liga la ubicación.
create or replace function fn_trg_ubicacion_registro()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_tipo text;
begin
  v_tipo := case tg_table_name
    when 'llamadas_cad' then 'cad'
    when 'incidentes'   then 'incidente'
    when 'accidentes'   then 'accidente'
    else tg_table_name end;
  perform fn_ligar_ubicacion(v_tipo, new.id, new.direccion, new.latitud, new.longitud);
  return new;
end $$;

-- Se dispara al crear el registro o al cambiar su dirección/coordenadas.
drop trigger if exists trg_ubicacion on llamadas_cad;
create trigger trg_ubicacion after insert or update of direccion, latitud, longitud on llamadas_cad
  for each row execute function fn_trg_ubicacion_registro();

drop trigger if exists trg_ubicacion on incidentes;
create trigger trg_ubicacion after insert or update of direccion, latitud, longitud on incidentes
  for each row execute function fn_trg_ubicacion_registro();

drop trigger if exists trg_ubicacion on accidentes;
create trigger trg_ubicacion after insert or update of direccion, latitud, longitud on accidentes
  for each row execute function fn_trg_ubicacion_registro();

-- Respaldo de lo YA existente (idempotente: se puede volver a correr sin duplicar).
do $$
declare r record; t text; v_tipo text;
begin
  foreach t in array array['llamadas_cad', 'incidentes', 'accidentes'] loop
    v_tipo := case t when 'llamadas_cad' then 'cad' when 'incidentes' then 'incidente' when 'accidentes' then 'accidente' end;
    for r in execute format(
      'select id, direccion, latitud, longitud from %I where estatus = ''activo'' and fn_norm_dir(direccion) is not null', t
    ) loop
      perform fn_ligar_ubicacion(v_tipo, r.id, r.direccion, r.latitud, r.longitud);
    end loop;
  end loop;
end $$;


-- ########################################################################
-- ###  0034_estatus_unidad.sql
-- ########################################################################

-- ---------------------------------------------------------------------
-- 0034 · Estatus operativo de la unidad (patrulla) desde el móvil
-- Amplía los estados permitidos y agrega el motivo cuando está "Ocupado".
-- Estados nuevos: en_camino, en_lugar, ocupado (se conservan los previos
-- para no romper datos existentes).
-- ---------------------------------------------------------------------

alter table patrullas
  drop constraint if exists patrullas_estatus_unidad_check;

alter table patrullas
  add constraint patrullas_estatus_unidad_check
  check (estatus_unidad in (
    'disponible', 'en_camino', 'en_lugar', 'ocupado', 'fuera_servicio',
    'en_rutina', 'en_pausa'
  ));

-- Detalle de "Ocupado" (p. ej. Alimentos, Sanitario, Carga combustible).
alter table patrullas
  add column if not exists motivo_estatus text;

comment on column patrullas.motivo_estatus is
  'Detalle libre del estatus operativo; se usa sobre todo cuando estatus_unidad = ocupado (ej. Alimentos, Sanitario).';

-- Recrea la vista de despacho incluyendo el motivo del estatus.
-- La nueva columna va AL FINAL: `create or replace view` no permite reordenar
-- ni insertar columnas en medio (solo agregarlas al final).
create or replace view patrullas_en_servicio as
  select
    p.id            as patrulla_id,
    p.numero, p.tipo, p.marca, p.modelo, p.placas, p.estatus_unidad,
    a.personal_id,
    r.id            as rol_id, r.fecha, r.turno, r.inicio, r.fin,
    p.motivo_estatus
  from rol_servicio_asignaciones a
  join rol_servicio r on r.id = a.rol_id and r.estatus = 'activo'
  join patrullas p    on p.id = a.patrulla_id and p.estatus = 'activo'
  where a.estatus = 'activo'
    and now() between r.inicio and r.fin;


-- ########################################################################
-- ###  0035_push_notificaciones.sql
-- ########################################################################

-- ---------------------------------------------------------------------
-- 0035 · Notificaciones push (Expo) para incidentes asignados/actualizados
-- ---------------------------------------------------------------------
-- Guarda el token de Expo por dispositivo y dispara una Edge Function
-- (enviar_push) cuando un despacho se asigna o cambia de estado.
--
-- Requiere configurar UNA vez (fuera del repo por ser secreto):
--   alter database postgres set app.push_secret = '<UN_SECRETO_LARGO>';
-- y el mismo valor como secreto de la función:
--   supabase secrets set PUSH_SECRET=<UN_SECRETO_LARGO>
-- Además desplegar la función sin verificación de JWT:
--   supabase functions deploy enviar_push --no-verify-jwt
-- ---------------------------------------------------------------------

-- pg_net expone sus funciones en el esquema `net` (net.http_post).
create extension if not exists pg_net;

-- 1) Tokens de push por dispositivo -----------------------------------
create table if not exists dispositivos_push (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  personal_id       uuid references personal(id) on delete set null,
  expo_push_token   text not null unique,
  plataforma        text,
  creado_en         timestamptz not null default now(),
  actualizado_en    timestamptz not null default now()
);
create index if not exists idx_dispositivos_push_personal on dispositivos_push (personal_id);

comment on table dispositivos_push is 'Token de Expo Push por dispositivo, ligado al usuario y a su elemento (personal) para dirigir notificaciones de asignación.';

alter table dispositivos_push enable row level security;

-- Cada usuario administra solo sus propios dispositivos.
drop policy if exists dp_select_own on dispositivos_push;
create policy dp_select_own on dispositivos_push for select using (user_id = auth.uid());
drop policy if exists dp_insert_own on dispositivos_push;
create policy dp_insert_own on dispositivos_push for insert with check (user_id = auth.uid());
drop policy if exists dp_update_own on dispositivos_push;
create policy dp_update_own on dispositivos_push for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists dp_delete_own on dispositivos_push;
create policy dp_delete_own on dispositivos_push for delete using (user_id = auth.uid());

-- 2) Disparador que invoca la Edge Function ---------------------------
create or replace function fn_push_despacho() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_secret text := current_setting('app.push_secret', true);
  v_url    text := 'https://rdyjjfbehjfggpldmmur.supabase.co/functions/v1/enviar_push';
  v_titulo text;
  v_cuerpo text;
  v_folio  text;
begin
  -- Sin destinatario o sin secreto configurado: no hace nada.
  if new.personal_id is null or coalesce(v_secret, '') = '' then
    return new;
  end if;

  -- En UPDATE solo notifica si cambió el estado.
  if tg_op = 'UPDATE' and new.estado is not distinct from old.estado then
    return new;
  end if;

  select l.folio into v_folio from llamadas_cad l where l.id = new.llamada_id;

  if tg_op = 'INSERT' then
    v_titulo := 'Nuevo incidente asignado';
    v_cuerpo := coalesce('Folio ' || v_folio || ' · ', '') || 'Se te asignó un despacho.';
  else
    v_titulo := 'Despacho actualizado';
    v_cuerpo := coalesce('Folio ' || v_folio || ' · ', '') || 'Estado: ' || coalesce(new.estado, '—') || '.';
  end if;

  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
    body    := jsonb_build_object(
      'personal_id', new.personal_id,
      'tipo',        'despacho',
      'titulo',      v_titulo,
      'cuerpo',      v_cuerpo,
      'data',        jsonb_build_object('tipo', 'despacho', 'despacho_id', new.id)
    )
  );
  return new;
end;
$$;

drop trigger if exists trg_push_despacho_ins on despachos;
create trigger trg_push_despacho_ins
  after insert on despachos
  for each row execute function fn_push_despacho();

drop trigger if exists trg_push_despacho_upd on despachos;
create trigger trg_push_despacho_upd
  after update on despachos
  for each row execute function fn_push_despacho();


-- ########################################################################
-- ###  0036_push_secreto_tabla.sql
-- ########################################################################

-- ---------------------------------------------------------------------
-- 0036 · Secreto de push en tabla privada (reemplaza el GUC app.push_secret)
-- ---------------------------------------------------------------------
-- En Supabase el rol del editor SQL no puede `alter database ... set ...`
-- (permission denied). Guardamos el secreto en una tabla privada que solo el
-- rol de servicio / funciones SECURITY DEFINER pueden leer.
--
-- Configurar el secreto (una vez), en el editor SQL:
--   insert into app_secretos (clave, valor) values ('push_secret', '<SECRETO>')
--   on conflict (clave) do update set valor = excluded.valor, actualizado_en = now();
-- Debe coincidir con el secreto de la función:  supabase secrets set PUSH_SECRET=<SECRETO>
-- ---------------------------------------------------------------------

create table if not exists app_secretos (
  clave           text primary key,
  valor           text not null,
  actualizado_en  timestamptz not null default now()
);
comment on table app_secretos is 'Secretos internos del backend (ej. push_secret). RLS sin políticas: solo el rol de servicio y funciones SECURITY DEFINER lo leen.';

-- RLS habilitado y SIN políticas: anon/authenticated no pueden leerlo.
alter table app_secretos enable row level security;

-- Reemplaza la función del disparador para leer el secreto de la tabla.
create or replace function fn_push_despacho() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_secret text := (select valor from app_secretos where clave = 'push_secret');
  v_url    text := 'https://rdyjjfbehjfggpldmmur.supabase.co/functions/v1/enviar_push';
  v_titulo text;
  v_cuerpo text;
  v_folio  text;
begin
  -- Sin destinatario o sin secreto configurado: no hace nada.
  if new.personal_id is null or coalesce(v_secret, '') = '' then
    return new;
  end if;

  -- En UPDATE solo notifica si cambió el estado.
  if tg_op = 'UPDATE' and new.estado is not distinct from old.estado then
    return new;
  end if;

  select l.folio into v_folio from llamadas_cad l where l.id = new.llamada_id;

  if tg_op = 'INSERT' then
    v_titulo := 'Nuevo incidente asignado';
    v_cuerpo := coalesce('Folio ' || v_folio || ' · ', '') || 'Se te asignó un despacho.';
  else
    v_titulo := 'Despacho actualizado';
    v_cuerpo := coalesce('Folio ' || v_folio || ' · ', '') || 'Estado: ' || coalesce(new.estado, '—') || '.';
  end if;

  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
    body    := jsonb_build_object(
      'personal_id', new.personal_id,
      'tipo',        'despacho',
      'titulo',      v_titulo,
      'cuerpo',      v_cuerpo,
      'data',        jsonb_build_object('tipo', 'despacho', 'despacho_id', new.id)
    )
  );
  return new;
end;
$$;


-- ########################################################################
-- ###  0037_tareas.sql
-- ########################################################################

-- =====================================================================
-- 0037_tareas.sql · Módulo de TAREAS (Operaciones)
--
-- Una TAREA es una solicitud de trabajo dirigida a una o varias unidades
-- (patrullas) que NO estén fuera de servicio: búsqueda de persona, acudir a un
-- domicilio por una orden de protección, verificación, etc.
--
-- Modelo:
--   tareas               → el qué (tipo, motivo, vigencia, lugar, instrucciones, foto)
--   tarea_asignaciones   → a quién (una fila por unidad/oficial) y su respuesta
--                          (pendiente → enterado → atendiendo → completada)
--
-- Las asignaciones disparan notificación push al oficial de la unidad
-- (reutiliza la Edge Function enviar_push de 0035/0036).
--
-- Como el resto del sistema: `estatus` (activo/cancelado) es retención de datos
-- y el avance operativo se lleva en `estado` / `respuesta`.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) TAREAS
-- ---------------------------------------------------------------------
create table if not exists tareas (
  id                  uuid primary key default gen_random_uuid(),
  folio               text,
  -- Tipo y motivo salen de cat_opciones (tipo_tarea / motivo_busqueda) para
  -- poder crecer sin migrar. El motivo es el "por qué" (Extraviada, etc.).
  tipo                text not null default 'Búsqueda de persona',
  motivo              text,
  asunto              text,                    -- resumen corto para listas
  instrucciones       text,

  -- Lugar (mismo patrón que incidentes/accidentes)
  direccion           text,
  latitud             double precision,
  longitud            double precision,

  -- Vigencia: desde/hasta. `vigencia_hasta` null = sin vencimiento.
  vigencia_desde      timestamptz not null default now(),
  vigencia_hasta      timestamptz,

  fotografias         jsonb default '[]'::jsonb,

  -- Origen: si nació de una orden (p. ej. orden de protección) o refiere a una
  -- persona (p. ej. búsqueda de persona).
  orden_id            uuid references ordenes(id),
  persona_id          uuid references personas(id),

  prioridad           text not null default 'media' check (prioridad in ('alta','media','baja')),
  estado              text not null default 'abierta'
                        check (estado in ('abierta','en_proceso','completada','vencida')),

  creado_por          uuid references auth.users(id) default auth.uid(),
  datos_adicionales   jsonb default '{}'::jsonb,

  estatus             text not null default 'activo' check (estatus in ('activo','cancelado')),
  cancelado_en        timestamptz,
  motivo_cancelacion  text,
  creado_en           timestamptz not null default now(),
  actualizado_en      timestamptz not null default now()
);
comment on table tareas is 'Tareas solicitadas a las unidades en servicio (búsqueda de persona, orden de protección, etc.) con vigencia, lugar, instrucciones y fotografía.';
create index if not exists idx_tareas_estado on tareas (estado);
create index if not exists idx_tareas_vigencia on tareas (vigencia_hasta);
create index if not exists idx_tareas_orden on tareas (orden_id);

-- ---------------------------------------------------------------------
-- 2) ASIGNACIONES (una fila por unidad; guarda la respuesta del oficial)
-- ---------------------------------------------------------------------
create table if not exists tarea_asignaciones (
  id                  uuid primary key default gen_random_uuid(),
  tarea_id            uuid not null references tareas(id) on delete cascade,
  patrulla_id         uuid references patrullas(id),
  personal_id         uuid references personal(id),

  respuesta           text not null default 'pendiente'
                        check (respuesta in ('pendiente','enterado','atendiendo','completada')),
  respondido_en       timestamptz,
  notas               text,

  estatus             text not null default 'activo' check (estatus in ('activo','cancelado')),
  cancelado_en        timestamptz,
  motivo_cancelacion  text,
  creado_en           timestamptz not null default now(),
  actualizado_en      timestamptz not null default now()
);
comment on table tarea_asignaciones is 'Unidades/oficiales a los que se asignó una tarea y su respuesta (pendiente → enterado → atendiendo → completada).';
create index if not exists idx_tarea_asig_tarea on tarea_asignaciones (tarea_id);
create index if not exists idx_tarea_asig_personal on tarea_asignaciones (personal_id);
-- Evita asignar dos veces la misma unidad a la misma tarea.
create unique index if not exists ux_tarea_asig_unica
  on tarea_asignaciones (tarea_id, coalesce(patrulla_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(personal_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- Marca la hora al registrar/cambiar la respuesta.
create or replace function fn_tarea_respuesta_fecha() returns trigger
language plpgsql as $$
begin
  if new.respuesta is distinct from coalesce(old.respuesta, 'pendiente') and new.respuesta <> 'pendiente' then
    new.respondido_en := now();
  end if;
  new.actualizado_en := now();
  return new;
end;
$$;
drop trigger if exists trg_tarea_respuesta_fecha on tarea_asignaciones;
create trigger trg_tarea_respuesta_fecha
  before update on tarea_asignaciones
  for each row execute function fn_tarea_respuesta_fecha();

-- ---------------------------------------------------------------------
-- 3) Vista de tareas vigentes (para el móvil y el tablero)
--    Incluye las vencidas hasta 24 h después de expirar.
-- ---------------------------------------------------------------------
create or replace view tareas_vigentes as
  select t.*,
         (t.vigencia_hasta is null or t.vigencia_hasta > now()) as vigente
  from tareas t
  where t.estatus = 'activo'
    and (t.vigencia_hasta is null or t.vigencia_hasta > now() - interval '24 hours');
comment on view tareas_vigentes is 'Tareas activas vigentes y las expiradas hace menos de 24 h (el móvil las sigue mostrando ese periodo).';

-- ---------------------------------------------------------------------
-- 4) Asignar una tarea a unidades
--    p_patrullas null/vacío = TODAS las unidades en servicio que no estén
--    fuera de servicio. Si se pasan ids, solo esas (y también se exige que no
--    estén fuera de servicio).
-- ---------------------------------------------------------------------
create or replace function rpc_asignar_tarea(
  p_tarea_id   uuid,
  p_patrullas  uuid[] default null
) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_insertadas int;
begin
  insert into tarea_asignaciones (tarea_id, patrulla_id, personal_id)
  select p_tarea_id, s.patrulla_id, s.personal_id
  from patrullas_en_servicio s
  where coalesce(s.estatus_unidad, '') <> 'fuera_servicio'
    and (p_patrullas is null or array_length(p_patrullas, 1) is null or s.patrulla_id = any(p_patrullas))
  on conflict do nothing;

  get diagnostics v_insertadas = row_count;
  return v_insertadas;
end;
$$;
comment on function rpc_asignar_tarea is 'Asigna una tarea a las unidades indicadas (o a todas las que estén en servicio y no fuera de servicio). Devuelve cuántas asignaciones creó.';

-- ---------------------------------------------------------------------
-- 5) Push al asignar una tarea (reutiliza enviar_push de 0035/0036)
-- ---------------------------------------------------------------------
create or replace function fn_push_tarea() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_secret text := (select valor from app_secretos where clave = 'push_secret');
  v_url    text := 'https://rdyjjfbehjfggpldmmur.supabase.co/functions/v1/enviar_push';
  v_t      record;
  v_cuerpo text;
begin
  if new.personal_id is null or coalesce(v_secret, '') = '' then
    return new;
  end if;

  select tipo, motivo, asunto, direccion, vigencia_hasta, folio
    into v_t from tareas where id = new.tarea_id;

  v_cuerpo := coalesce(v_t.tipo, 'Tarea')
              || coalesce(' · ' || v_t.motivo, '')
              || coalesce(' · ' || v_t.direccion, '')
              || coalesce(' · vence ' || to_char(v_t.vigencia_hasta, 'DD/MM HH24:MI'), '');

  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
    body    := jsonb_build_object(
      'personal_id', new.personal_id,
      'tipo',        'tarea',
      'titulo',      'Nueva tarea asignada' || coalesce(' ' || v_t.folio, ''),
      'cuerpo',      v_cuerpo,
      'data',        jsonb_build_object('tipo', 'tarea', 'tarea_id', new.tarea_id, 'asignacion_id', new.id)
    )
  );
  return new;
end;
$$;

drop trigger if exists trg_push_tarea on tarea_asignaciones;
create trigger trg_push_tarea
  after insert on tarea_asignaciones
  for each row execute function fn_push_tarea();

-- ---------------------------------------------------------------------
-- 6) Foliador (TA), no-delete y bitácora
-- ---------------------------------------------------------------------
insert into foliadores (modulo, nombre, iniciales) values ('tareas','Tareas','TA')
  on conflict (modulo) do nothing;
drop trigger if exists trg_folio_tareas on tareas;
create trigger trg_folio_tareas before insert on tareas for each row execute function fn_asignar_folio();

drop trigger if exists trg_no_delete_tareas on tareas;
create trigger trg_no_delete_tareas before delete on tareas for each row execute function fn_bloquear_delete();
revoke delete on tareas from authenticated, anon;

drop trigger if exists trg_auditoria_tareas on tareas;
create trigger trg_auditoria_tareas after insert or update on tareas for each row execute function fn_bitacora_generica();
drop trigger if exists trg_auditoria_tarea_asig on tarea_asignaciones;
create trigger trg_auditoria_tarea_asig after insert or update on tarea_asignaciones for each row execute function fn_bitacora_generica();

-- ---------------------------------------------------------------------
-- 7) RLS (mismo patrón permisivo del resto de módulos operativos)
-- ---------------------------------------------------------------------
alter table tareas enable row level security;
drop policy if exists sel_tareas on tareas;
create policy sel_tareas on tareas for select to authenticated
  using (estatus = 'activo' or fn_rol_actual() in ('supervisor','investigador','administrador'));
drop policy if exists ins_tareas on tareas;
create policy ins_tareas on tareas for insert to authenticated with check (true);
drop policy if exists upd_tareas on tareas;
create policy upd_tareas on tareas for update to authenticated using (true) with check (true);

alter table tarea_asignaciones enable row level security;
drop policy if exists sel_tarea_asig on tarea_asignaciones;
create policy sel_tarea_asig on tarea_asignaciones for select to authenticated using (true);
drop policy if exists ins_tarea_asig on tarea_asignaciones;
create policy ins_tarea_asig on tarea_asignaciones for insert to authenticated with check (true);
-- El oficial responde desde el móvil (Enterado / Atendiendo / Completada).
drop policy if exists upd_tarea_asig on tarea_asignaciones;
create policy upd_tarea_asig on tarea_asignaciones for update to authenticated using (true) with check (true);

-- ---------------------------------------------------------------------
-- 8) Ampliar rpc_cancelar_registro con las tablas nuevas
-- ---------------------------------------------------------------------
create or replace function rpc_cancelar_registro(p_tabla text, p_id uuid, p_motivo text)
returns void as $$
begin
  if p_tabla not in ('personas','vehiculos','ubicaciones','vinculos','casos','personal',
                     'ordenes','evidencias','asuntos_internos','llamadas_cad','despachos',
                     'barandilla','equipo','incidentes','presuntos','kardex',
                     'patrullas','armamento','comunicacion','bodycams','otros',
                     'rol_servicio','rol_servicio_asignaciones','abordamientos','accidentes',
                     'tareas','tarea_asignaciones') then
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

-- ---------------------------------------------------------------------
-- 9) ORDEN DE PROTECCIÓN (módulo Citatorios / Órdenes)
--    Se agrega el tipo y los campos que pide el flujo: vigencia, lugar,
--    persona/domicilio e instrucciones. Genera una tarea desde el detalle.
-- ---------------------------------------------------------------------
alter table ordenes drop constraint if exists ordenes_tipo_check;
alter table ordenes add constraint ordenes_tipo_check
  check (tipo in ('citatorio','orden_aprehension','orden_cateo',
                  'orden_comparecencia','orden_presentacion','orden_proteccion'));

alter table ordenes add column if not exists vigencia_desde  timestamptz;
alter table ordenes add column if not exists vigencia_hasta  timestamptz;
alter table ordenes add column if not exists direccion       text;
alter table ordenes add column if not exists latitud         double precision;
alter table ordenes add column if not exists longitud        double precision;
alter table ordenes add column if not exists instrucciones   text;
alter table ordenes add column if not exists persona_id      uuid references personas(id);

comment on column ordenes.instrucciones is 'Indicaciones operativas para la unidad (usado sobre todo en órdenes de protección).';
comment on column ordenes.persona_id is 'Persona protegida / requerida por la orden.';

-- ---------------------------------------------------------------------
-- 10) Catálogos de tipo y motivo
-- ---------------------------------------------------------------------
insert into cat_opciones (categoria, valor, orden) values
  ('tipo_tarea','Búsqueda de persona',1),
  ('tipo_tarea','Orden de protección',2),
  ('tipo_tarea','Verificación de domicilio',3),
  ('tipo_tarea','Vigilancia de punto',4),
  ('tipo_tarea','Traslado',5),
  ('tipo_tarea','Apoyo a otra unidad',6),
  ('tipo_tarea','Otra',7),
  ('motivo_busqueda','Extraviada',1),
  ('motivo_busqueda','No localizada',2),
  ('motivo_busqueda','Sustraída',3),
  ('motivo_busqueda','Ausente voluntario',4),
  ('motivo_busqueda','Menor de edad',5),
  ('motivo_busqueda','Adulto mayor',6),
  ('motivo_busqueda','Condición vulnerable',7),
  ('motivo_busqueda','Otro',8)
on conflict (categoria, valor) do nothing;


-- ########################################################################
-- ###  0038_transmisiones.sql
-- ########################################################################

-- =====================================================================
-- 0038_transmisiones.sql · Bodycam: transmisión de video en vivo + evidencia
--
-- Al oprimir "Enviar Alerta" en el móvil, el teléfono transmite su cámara en
-- vivo (WebRTC) y el despacho web lo ve en tiempo real. La señalización
-- (SDP/ICE) viaja por Supabase Realtime BROADCAST en un canal por transmisión;
-- esta tabla guarda la SESIÓN (quién, cuándo, ligada a qué alerta) y, al
-- terminar, la ruta del video grabado y su registro como evidencia.
--
-- El video se guarda en un bucket PRIVADO (contenido sensible): lectura solo
-- para usuarios autenticados vía URL firmada.
-- =====================================================================

-- 1) Bucket privado de video ------------------------------------------
insert into storage.buckets (id, name, public)
values ('videos', 'videos', false)
on conflict (id) do nothing;

drop policy if exists "videos_select" on storage.objects;
create policy "videos_select" on storage.objects
  for select to authenticated using (bucket_id = 'videos');
drop policy if exists "videos_insert" on storage.objects;
create policy "videos_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'videos');
drop policy if exists "videos_update" on storage.objects;
create policy "videos_update" on storage.objects
  for update to authenticated using (bucket_id = 'videos');

-- 2) Tabla de transmisiones -------------------------------------------
create table if not exists transmisiones (
  id                  uuid primary key default gen_random_uuid(),
  folio               text,
  -- Origen: la alerta (despacho de pánico) que la disparó, y el oficial/unidad.
  despacho_id         uuid references despachos(id),
  llamada_id          uuid references llamadas_cad(id),
  personal_id         uuid references personal(id),
  patrulla_id         uuid references patrullas(id),

  estado              text not null default 'en_vivo'
                        check (estado in ('en_vivo','finalizada','error')),
  motivo_fin          text,             -- manual | limite_5min | error | desconexion

  iniciado_en         timestamptz not null default now(),
  finalizado_en       timestamptz,

  -- Video grabado (evidencia). Se llena al terminar y subir el archivo.
  video_ruta          text,             -- ruta en el bucket privado 'videos'
  evidencia_id        uuid references evidencias(id),
  duracion_seg        int,

  datos_adicionales   jsonb default '{}'::jsonb,
  estatus             text not null default 'activo' check (estatus in ('activo','cancelado')),
  cancelado_en        timestamptz,
  motivo_cancelacion  text,
  creado_en           timestamptz not null default now(),
  actualizado_en      timestamptz not null default now()
);
comment on table transmisiones is 'Sesiones de transmisión en vivo (bodycam) disparadas por Enviar Alerta; guarda la sesión y el video grabado como evidencia.';
create index if not exists idx_transmisiones_estado on transmisiones (estado);
create index if not exists idx_transmisiones_despacho on transmisiones (despacho_id);
create index if not exists idx_transmisiones_personal on transmisiones (personal_id);

-- Foliador (TX), no-delete y bitácora.
insert into foliadores (modulo, nombre, iniciales) values ('transmisiones','Transmisiones','TX')
  on conflict (modulo) do nothing;
drop trigger if exists trg_folio_transmisiones on transmisiones;
create trigger trg_folio_transmisiones before insert on transmisiones for each row execute function fn_asignar_folio();

drop trigger if exists trg_no_delete_transmisiones on transmisiones;
create trigger trg_no_delete_transmisiones before delete on transmisiones for each row execute function fn_bloquear_delete();
revoke delete on transmisiones from authenticated, anon;

drop trigger if exists trg_auditoria_transmisiones on transmisiones;
create trigger trg_auditoria_transmisiones after insert or update on transmisiones for each row execute function fn_bitacora_generica();

-- 3) RLS --------------------------------------------------------------
alter table transmisiones enable row level security;
drop policy if exists sel_transmisiones on transmisiones;
create policy sel_transmisiones on transmisiones for select to authenticated using (true);
drop policy if exists ins_transmisiones on transmisiones;
create policy ins_transmisiones on transmisiones for insert to authenticated with check (true);
drop policy if exists upd_transmisiones on transmisiones;
create policy upd_transmisiones on transmisiones for update to authenticated using (true) with check (true);

-- 4) Realtime: el despacho web se entera al instante de una transmisión nueva
--    o cuando termina (indicador "EN VIVO" en el CAD).
alter publication supabase_realtime add table transmisiones;

-- 5) Ampliar rpc_cancelar_registro
create or replace function rpc_cancelar_registro(p_tabla text, p_id uuid, p_motivo text)
returns void as $$
begin
  if p_tabla not in ('personas','vehiculos','ubicaciones','vinculos','casos','personal',
                     'ordenes','evidencias','asuntos_internos','llamadas_cad','despachos',
                     'barandilla','equipo','incidentes','presuntos','kardex',
                     'patrullas','armamento','comunicacion','bodycams','otros',
                     'rol_servicio','rol_servicio_asignaciones','abordamientos','accidentes',
                     'tareas','tarea_asignaciones','transmisiones') then
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


-- ########################################################################
-- ###  0039_bodycam_smartphone.sql
-- ########################################################################

-- =====================================================================
-- 0039_bodycam_smartphone.sql · Vincular el smartphone (bodycam) al oficial
--
-- Cada teléfono con la app es una bodycam tipo 'Smartphone' en el inventario,
-- asignada a un oficial (bodycams.asignado_personal_id). La app valida que el
-- teléfono esté registrado y atado a ESTE dispositivo, y usa su folio como el
-- "número de bodycam" en el despacho, la transmisión y la evidencia.
-- =====================================================================

-- 1) Clasificación 'Smartphone' (catálogo de tipo de bodycam)
insert into cat_opciones (categoria, valor, orden) values
  ('tipo_bodycam','Smartphone',1),
  ('tipo_bodycam','Bodycam portátil',2),
  ('tipo_bodycam','Bodycam fija',3)
on conflict (categoria, valor) do nothing;

-- 2) La transmisión guarda la bodycam de origen.
alter table transmisiones add column if not exists bodycam_id uuid references bodycams(id);
alter table transmisiones add column if not exists bodycam_folio text;

-- 3) Validación + vinculación del smartphone al registro de bodycam.
--    p_device_id: identificador único del teléfono (lo obtiene la app).
--    Devuelve jsonb: { ok, folio, bodycam_id, vinculado?, motivo? }.
--    security definer para poder escribir el vínculo saltando RLS.
create or replace function rpc_validar_bodycam(
  p_personal_id uuid,
  p_device_id   text,
  p_plataforma  text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  bc  record;
  dev text;
begin
  if p_personal_id is null or coalesce(p_device_id, '') = '' then
    return jsonb_build_object('ok', false, 'motivo', 'datos_incompletos');
  end if;

  select * into bc from bodycams
   where estatus = 'activo'
     and asignado_personal_id = p_personal_id
     and lower(coalesce(tipo, '')) = 'smartphone'
   order by creado_en
   limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'sin_bodycam');
  end if;

  dev := bc.datos_adicionales->>'device_id';

  if coalesce(dev, '') = '' then
    -- Primera vinculación: se ata este teléfono a la bodycam del oficial.
    update bodycams
       set datos_adicionales = coalesce(datos_adicionales, '{}'::jsonb)
             || jsonb_build_object('device_id', p_device_id, 'device_plataforma', p_plataforma, 'device_vinculado_en', now()),
           estado_equipo = case when estado_equipo = 'operativo' then 'asignado' else estado_equipo end,
           actualizado_en = now()
     where id = bc.id;
    return jsonb_build_object('ok', true, 'vinculado', true, 'folio', bc.folio, 'bodycam_id', bc.id);
  elsif dev = p_device_id then
    return jsonb_build_object('ok', true, 'folio', bc.folio, 'bodycam_id', bc.id);
  else
    return jsonb_build_object('ok', false, 'motivo', 'otro_dispositivo', 'folio', bc.folio);
  end if;
end;
$$;

-- 4) Desvincular (admin) cuando el oficial cambia de teléfono.
--    Uso: select rpc_desvincular_bodycam('<folio o id>');
create or replace function rpc_desvincular_bodycam(p_bodycam text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update bodycams
     set datos_adicionales = (coalesce(datos_adicionales, '{}'::jsonb)
           - 'device_id' - 'device_plataforma' - 'device_vinculado_en'),
         actualizado_en = now()
   where folio = p_bodycam or id::text = p_bodycam;
end;
$$;


-- ########################################################################
-- ###  0040_reporte_cierre.sql
-- ########################################################################

-- =====================================================================
-- 0040_reporte_cierre.sql · Cierre de reportes CAD
--
-- Un reporte pasa de 'activo' a 'cerrado' cuando su despacho termina resuelto.
-- Al cerrar se elige una CONCLUSIÓN. La cancelación deja de ser un estatus
-- aparte: ahora es una conclusión de cierre ("Cancelado") con su submotivo.
-- Conclusiones: Atendido con Lesionados / Atendido con Detenidos /
-- Atendido en Falso / Cancelado (+ motivo: por 9-1-1 / llamada falsa / duplicado).
-- =====================================================================

-- 1) Estatus admite 'cerrado' (se conserva 'cancelado' por compatibilidad).
alter table llamadas_cad drop constraint if exists llamadas_cad_estatus_check;
alter table llamadas_cad add constraint llamadas_cad_estatus_check
  check (estatus in ('activo', 'cerrado', 'cancelado'));

-- 2) Conclusión de cierre y su submotivo.
alter table llamadas_cad add column if not exists conclusion   text;
alter table llamadas_cad add column if not exists motivo_cierre text;

alter table llamadas_cad drop constraint if exists llamadas_cad_conclusion_check;
alter table llamadas_cad add constraint llamadas_cad_conclusion_check
  check (conclusion is null or conclusion in (
    'Atendido con Lesionados', 'Atendido con Detenidos', 'Atendido en Falso', 'Cancelado'
  ));

comment on column llamadas_cad.conclusion is 'Conclusión del cierre del reporte (cómo terminó la atención).';
comment on column llamadas_cad.motivo_cierre is 'Submotivo cuando la conclusión es Cancelado (por 9-1-1 / llamada falsa / duplicado).';

-- 3) Backfill: los reportes cuyo despacho ya está resuelto quedan cerrados.
update llamadas_cad
   set estatus = 'cerrado',
       fecha_cierre = coalesce(fecha_cierre, now()),
       actualizado_en = now()
 where estatus = 'activo' and estado_despacho = 'resuelta';


-- ########################################################################
-- ###  0041_cad_historial.sql
-- ########################################################################

-- =====================================================================
-- 0041_cad_historial.sql · Historial de estados de un reporte CAD
--
-- Registra, con fecha/hora y usuario, cada cambio de estado del REPORTE
-- (estado_despacho, estatus) y de cada DESPACHO/unidad (estado). Sirve para
-- reconstruir cómo se atendió el reporte. Se muestra en pantalla y en el PDF.
-- =====================================================================

create table if not exists cad_estado_historial (
  id             bigint generated always as identity primary key,
  llamada_id     uuid not null references llamadas_cad(id) on delete cascade,
  despacho_id    uuid references despachos(id),
  ambito         text not null check (ambito in ('reporte','despacho')),
  campo          text not null,          -- estado_despacho | estatus | estado
  estado         text,                   -- valor nuevo
  patrulla_numero text,                  -- número de unidad (si es despacho)
  usuario        text,
  cambiado_en    timestamptz not null default now()
);
create index if not exists idx_cad_hist_llamada on cad_estado_historial (llamada_id, cambiado_en);

comment on table cad_estado_historial is 'Bitácora de cambios de estado de un reporte CAD y sus despachos (para la línea de tiempo de atención).';

alter table cad_estado_historial enable row level security;
drop policy if exists sel_cad_hist on cad_estado_historial;
create policy sel_cad_hist on cad_estado_historial for select to authenticated using (true);
-- Solo los triggers escriben (SECURITY DEFINER); no se permite insert directo.
revoke insert, update, delete on cad_estado_historial from authenticated, anon;

-- Email del usuario que provoca el cambio (si hay sesión).
create or replace function fn_usuario_actual() returns text
language sql stable as $$
  select coalesce(nullif(auth.jwt() ->> 'email', ''), null);
$$;

-- Reporte: alta (estado inicial) y cambios de estado_despacho / estatus.
create or replace function fn_hist_reporte() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into cad_estado_historial (llamada_id, ambito, campo, estado, usuario)
      values (new.id, 'reporte', 'estado_despacho', new.estado_despacho, fn_usuario_actual());
    return new;
  end if;
  if new.estado_despacho is distinct from old.estado_despacho then
    insert into cad_estado_historial (llamada_id, ambito, campo, estado, usuario)
      values (new.id, 'reporte', 'estado_despacho', new.estado_despacho, fn_usuario_actual());
  end if;
  if new.estatus is distinct from old.estatus then
    insert into cad_estado_historial (llamada_id, ambito, campo, estado, usuario)
      values (new.id, 'reporte', 'estatus', new.estatus, fn_usuario_actual());
  end if;
  return new;
end;
$$;
drop trigger if exists trg_hist_reporte_ins on llamadas_cad;
create trigger trg_hist_reporte_ins after insert on llamadas_cad for each row execute function fn_hist_reporte();
drop trigger if exists trg_hist_reporte_upd on llamadas_cad;
create trigger trg_hist_reporte_upd after update on llamadas_cad for each row execute function fn_hist_reporte();

-- Despacho: alta (asignada) y cada cambio de estado de la unidad.
create or replace function fn_hist_despacho() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_num text;
begin
  select numero into v_num from patrullas where id = new.patrulla_id;
  if tg_op = 'INSERT' then
    insert into cad_estado_historial (llamada_id, despacho_id, ambito, campo, estado, patrulla_numero, usuario)
      values (new.llamada_id, new.id, 'despacho', 'estado', new.estado, v_num, fn_usuario_actual());
    return new;
  end if;
  if new.estado is distinct from old.estado then
    insert into cad_estado_historial (llamada_id, despacho_id, ambito, campo, estado, patrulla_numero, usuario)
      values (new.llamada_id, new.id, 'despacho', 'estado', new.estado, v_num, fn_usuario_actual());
  end if;
  return new;
end;
$$;
drop trigger if exists trg_hist_despacho_ins on despachos;
create trigger trg_hist_despacho_ins after insert on despachos for each row execute function fn_hist_despacho();
drop trigger if exists trg_hist_despacho_upd on despachos;
create trigger trg_hist_despacho_upd after update on despachos for each row execute function fn_hist_despacho();


-- ########################################################################
-- ###  0042_casos_v2.sql
-- ########################################################################

-- =====================================================================
-- 0042_casos_v2.sql
-- Rework de Casos:
--   * Catálogo de DELITOS nuevo (distinto del catálogo 9-1-1 de incidentes)
--     y catálogo de PARENTESCOS, ambos administrables desde Admin -> Catálogos.
--   * presuntos: campos de identificación (nombre/apellidos) para presunto
--     identificado (además de la media filiación existente).
--   * caso_relaciones: personas relacionadas con la víctima o el presunto
--     (parentesco / tipo de relación) dentro de un caso.
-- Los datos de investigación por persona (estado civil, originario, teléfono,
-- redes) se guardan en personas.datos_adicionales (registro maestro); no
-- requieren esquema nuevo.
-- =====================================================================

-- 1) Catálogo de DELITOS (fuente del campo Delito en Casos).
insert into cat_opciones (categoria, valor, orden) values
  ('delito','Robo',1),
  ('delito','Robo a casa habitación',2),
  ('delito','Robo de vehículo',3),
  ('delito','Robo a negocio',4),
  ('delito','Robo a transeúnte',5),
  ('delito','Homicidio',6),
  ('delito','Lesiones',7),
  ('delito','Fraude',8),
  ('delito','Extorsión',9),
  ('delito','Secuestro',10),
  ('delito','Violencia familiar',11),
  ('delito','Amenazas',12),
  ('delito','Daño en propiedad ajena',13),
  ('delito','Narcomenudeo',14),
  ('delito','Abuso de confianza',15),
  ('delito','Despojo',16),
  ('delito','Abuso sexual',17),
  ('delito','Otro',99)
on conflict (categoria, valor) do nothing;

-- 2) Catálogo de PARENTESCOS / tipo de relación (pestaña Relaciones de Casos).
insert into cat_opciones (categoria, valor, orden) values
  ('parentesco','Padre',1),
  ('parentesco','Madre',2),
  ('parentesco','Hijo/a',3),
  ('parentesco','Hermano/a',4),
  ('parentesco','Cónyuge/Pareja',5),
  ('parentesco','Familiar',6),
  ('parentesco','Amigo/a',7),
  ('parentesco','Vecino/a',8),
  ('parentesco','Conocido/a',9),
  ('parentesco','Cómplice',10),
  ('parentesco','Jefe/Empleado',11),
  ('parentesco','Otro',99)
on conflict (categoria, valor) do nothing;

-- 3) presuntos: identificación cuando ya se conoce el nombre.
alter table presuntos add column if not exists nombre            text;
alter table presuntos add column if not exists apellido_paterno  text;
alter table presuntos add column if not exists apellido_materno  text;

-- 4) caso_relaciones: personas con parentesco/relación con la víctima o el presunto.
create table if not exists caso_relaciones (
  id                  uuid primary key default gen_random_uuid(),
  caso_id             uuid not null references casos(id),
  persona_id          uuid not null references personas(id),   -- persona relacionada
  con_tipo            text not null check (con_tipo in ('victima','presunto')),
  con_persona_id      uuid references personas(id),            -- víctima (persona) del caso
  con_presunto_id     uuid references presuntos(id),           -- presunto (identificado) del caso
  parentesco          text,                                    -- de cat_opciones 'parentesco'
  notas               text,

  estatus             text not null default 'activo' check (estatus in ('activo','cancelado')),
  cancelado_en        timestamptz,
  motivo_cancelacion  text,

  creado_en           timestamptz not null default now(),
  actualizado_en      timestamptz not null default now()
);

comment on table caso_relaciones is 'Personas relacionadas con la víctima o el presunto de un caso (parentesco/tipo de relación).';

create index if not exists idx_caso_relaciones_caso on caso_relaciones (caso_id);

drop trigger if exists trg_no_delete_caso_relaciones on caso_relaciones;
create trigger trg_no_delete_caso_relaciones before delete on caso_relaciones
  for each row execute function fn_bloquear_delete();

revoke delete on caso_relaciones from authenticated, anon;

drop trigger if exists trg_auditoria_caso_relaciones on caso_relaciones;
create trigger trg_auditoria_caso_relaciones after insert or update on caso_relaciones
  for each row execute function fn_bitacora_generica();

alter table caso_relaciones enable row level security;
drop policy if exists sel_caso_relaciones on caso_relaciones;
create policy sel_caso_relaciones on caso_relaciones for select to authenticated
  using (estatus = 'activo' or fn_rol_actual() in ('supervisor','investigador','administrador'));
drop policy if exists ins_caso_relaciones on caso_relaciones;
create policy ins_caso_relaciones on caso_relaciones for insert to authenticated with check (true);
drop policy if exists upd_caso_relaciones on caso_relaciones;
create policy upd_caso_relaciones on caso_relaciones for update to authenticated using (true) with check (true);

-- 5) Ampliar rpc_cancelar_registro con 'caso_relaciones' (whitelist completo vigente).
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
                     'tareas','tarea_asignaciones','transmisiones','caso_relaciones') then
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


-- ########################################################################
-- ###  0043_personal_crp.sql
-- ########################################################################

-- =====================================================================
-- 0043_personal_crp.sql
-- CORRECCIÓN: la CRP (Carro Radio Patrulla) NO es un dato manual del elemento,
-- es la PATRULLA que se le asigna en el ROL DE SERVICIO. Por lo tanto la CRP se
-- DERIVA del rol de servicio (vista patrullas_en_servicio: personal_id ->
-- patrulla numero), tanto en la app (Mi unidad) como en el módulo de Personal.
-- No se guarda una columna crp en personal. Si una versión previa de esta
-- migración la creó, aquí se elimina.
-- =====================================================================

alter table personal drop column if exists crp;


-- ########################################################################
-- ###  0044_accidente_conclusion.sql
-- ########################################################################

-- =====================================================================
-- 0044_accidente_conclusion.sql
-- Informe de accidente: conclusión del informe + licencia de conducir del
-- conductor. El estatus de atención se maneja como Abierto/Atendiendo/Cerrado
-- (controlado por la app; la columna estatus_atencion ya existe).
-- =====================================================================

alter table accidentes           add column if not exists conclusion        text;
alter table accidente_vehiculos  add column if not exists licencia_conducir text;

comment on column accidentes.conclusion is 'Conclusión del informe de accidente al cerrarse (catálogo conclusion_accidente).';
comment on column accidente_vehiculos.licencia_conducir is 'Folio/número de la licencia de conducir del conductor.';

-- Catálogo de conclusiones (editable en Admin -> Catálogos).
insert into cat_opciones (categoria, valor, orden) values
  ('conclusion_accidente','Cerrado con acuerdo de las partes',1),
  ('conclusion_accidente','Cerrado con lesionados',2),
  ('conclusion_accidente','Cerrado con detenidos',3),
  ('conclusion_accidente','Cerrado en Falso',4)
on conflict (categoria, valor) do nothing;


-- ########################################################################
-- ###  0045_despacho_reapertura.sql
-- ########################################################################

-- =====================================================================
-- 0045_despacho_reapertura.sql
-- Despacho (app del oficial):
--  * reapertura_autorizada: tras Cerrado, la app solo cambia el estatus si el
--    sistema central (CAD web) lo autoriza.
--  * rpc_despacho_avanzar: avanza el estatus del despacho de forma SECUENCIAL.
--    Si se salta uno o más estados (p. ej. se marca "En el lugar" sin haber
--    pasado por Enterado/En Ruta), registra los estados intermedios en el
--    historial con la MISMA fecha/hora que el destino.
-- =====================================================================

alter table despachos add column if not exists reapertura_autorizada boolean not null default false;
comment on column despachos.reapertura_autorizada is 'Si es true, la app permite cambiar el estatus de un despacho ya cerrado (autorizado desde el CAD).';

create or replace function rpc_despacho_avanzar(p_despacho uuid, p_estado text)
returns void as $$
declare
  v_actual   text;
  v_llamada  uuid;
  v_num      text;
  estados    text[] := array['enterado','en_ruta','en_lugar','cerrado'];
  idx_a int; idx_t int; i int;
begin
  if p_estado <> all (estados) then
    raise exception 'Estado no válido: %', p_estado;
  end if;

  select d.estado, d.llamada_id, p.numero
    into v_actual, v_llamada, v_num
    from despachos d left join patrullas p on p.id = d.patrulla_id
   where d.id = p_despacho;

  idx_a := coalesce(array_position(estados, v_actual), 0);
  idx_t := array_position(estados, p_estado);

  -- Estados intermedios saltados (estrictamente entre el actual y el destino):
  -- se registran en el historial con el now() de esta misma transacción.
  if idx_t > idx_a + 1 then
    for i in (idx_a + 1)..(idx_t - 1) loop
      insert into cad_estado_historial (llamada_id, despacho_id, ambito, campo, estado, patrulla_numero, usuario)
        values (v_llamada, p_despacho, 'despacho', 'estado', estados[i], v_num, fn_usuario_actual());
    end loop;
  end if;

  -- El cambio final dispara el trigger de historial para el estado destino.
  update despachos set estado = p_estado, actualizado_en = now() where id = p_despacho;
end;
$$ language plpgsql security definer;


-- ########################################################################
-- ###  0046_chat.sql
-- ########################################################################

-- =====================================================================
-- 0046_chat.sql · Módulo de Comunicación (Chat)
--
-- Chat por CANALES para comunicar al oficial (app móvil) con el central (web).
-- Portado de la guía de integración (SOME) al stack de SCP:
--   * Identidad del chat = usuarios_perfil (auth.uid) — sirve para web y móvil,
--     ambos inician sesión con Supabase Auth. Nombre visible = usuarios_perfil.nombre.
--   * Acceso POR PERTENENCIA (no por rol): solo los miembros de un canal leen/escriben.
--   * INSERT = fuente de verdad; Realtime solo difunde (igual que CAD).
--   * Gestión de canales (crear/integrar/abrir-cerrar) SOLO desde la web: se guarda
--     por rol (supervisor/investigador/administrador) y por admin del canal.
--   * Push a los miembros (menos el remitente) cuando la app está en 2º plano,
--     reutilizando dispositivos_push + Edge Function enviar_push (por user_id).
--   * Adjuntos en bucket privado 'chat' (subida por URL firmada).
--
-- WORM: los canales NO se eliminan (solo abren/cierran); delete bloqueado en las
-- tres tablas.
-- =====================================================================

-- 0) Enums -------------------------------------------------------------
do $$ begin
  create type chat_estado_canal as enum ('abierto','cerrado');
exception when duplicate_object then null; end $$;

do $$ begin
  create type chat_tipo_mensaje as enum ('texto','foto','archivo','sistema');
exception when duplicate_object then null; end $$;

-- 1) Tablas ------------------------------------------------------------
create table if not exists chat_canales (
  id             uuid primary key default gen_random_uuid(),
  nombre         text not null,
  tema           text,
  estado         chat_estado_canal not null default 'abierto',
  creado_por     uuid references usuarios_perfil(id),
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

-- Pertenencia: quién está en cada canal y si es admin del canal.
create table if not exists chat_miembros (
  canal_id   uuid not null references chat_canales(id) on delete cascade,
  usuario_id uuid not null references usuarios_perfil(id) on delete cascade,
  es_admin   boolean not null default false,
  unido_en   timestamptz not null default now(),
  primary key (canal_id, usuario_id)
);
create index if not exists idx_chat_miembros_usuario on chat_miembros(usuario_id);

-- Historial persistente (incluye adjuntos). Los mensajes 'sistema' llevan el
-- usuario_id del actor y un cuerpo descriptivo.
create table if not exists chat_mensajes (
  id          uuid primary key default gen_random_uuid(),
  canal_id    uuid not null references chat_canales(id) on delete cascade,
  usuario_id  uuid references usuarios_perfil(id),
  tipo        chat_tipo_mensaje not null default 'texto',
  cuerpo      text,
  adjunto_url text,                 -- ruta del objeto en el bucket 'chat'
  creado_en   timestamptz not null default now()
);
create index if not exists idx_chat_mensajes_canal_fecha on chat_mensajes(canal_id, creado_en);

-- 2) WORM: no se borran (solo se abren/cierran) -----------------------
do $$
declare t text;
begin
  foreach t in array array['chat_canales','chat_miembros','chat_mensajes'] loop
    execute format('drop trigger if exists trg_no_delete_%1$s on %1$s;', t);
    execute format('create trigger trg_no_delete_%1$s before delete on %1$s for each row execute function fn_bloquear_delete();', t);
    execute format('revoke delete on %I from authenticated, anon;', t);
  end loop;
end $$;

-- 3) Helper de pertenencia (SECURITY DEFINER para no recursar en RLS) ---
create or replace function fn_chat_es_miembro(p_canal uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from chat_miembros
     where canal_id = p_canal and usuario_id = auth.uid()
  );
$$;

create or replace function fn_chat_es_admin(p_canal uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from chat_miembros
     where canal_id = p_canal and usuario_id = auth.uid() and es_admin
  );
$$;

-- 3b) Ver el nombre de quien comparte un canal conmigo -----------------
-- usuarios_perfil solo deja ver el perfil propio (o admin). Para pintar el
-- nombre del remitente en el chat y listar miembros, se abre el select a los
-- usuarios que comparten al menos un canal con el usuario actual.
create or replace function fn_chat_comparte_canal(p_user uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from chat_miembros m1
      join chat_miembros m2 on m2.canal_id = m1.canal_id
     where m1.usuario_id = auth.uid() and m2.usuario_id = p_user
  );
$$;

drop policy if exists sel_usuarios_perfil_chat on usuarios_perfil;
create policy sel_usuarios_perfil_chat on usuarios_perfil for select to authenticated
  using (fn_chat_comparte_canal(id));

-- Directorio para el selector de miembros (solo personal central / web).
create or replace function rpc_chat_directorio()
returns table(id uuid, nombre text, rol text)
language sql stable security definer set search_path = public as $$
  select u.id, u.nombre, u.rol
    from usuarios_perfil u
   where u.activo
     and coalesce(fn_rol_actual(), '') in ('supervisor','investigador','administrador')
   order by u.nombre nulls last;
$$;

-- 4) RLS: acceso por pertenencia --------------------------------------
alter table chat_canales  enable row level security;
alter table chat_miembros enable row level security;
alter table chat_mensajes enable row level security;

-- Canales: solo los ve quien es miembro. Escritura solo por RPC (definer).
drop policy if exists chat_canales_sel on chat_canales;
create policy chat_canales_sel on chat_canales for select to authenticated
  using (fn_chat_es_miembro(id));

-- Miembros: los ve quien pertenece al canal. Alta/baja solo por RPC.
drop policy if exists chat_miembros_sel on chat_miembros;
create policy chat_miembros_sel on chat_miembros for select to authenticated
  using (fn_chat_es_miembro(canal_id));

-- Mensajes: los ve quien pertenece; ENVIAR = insert directo del propio usuario
-- en un canal ABIERTO donde es miembro (el trigger fija tipo y actualiza el canal).
drop policy if exists chat_mensajes_sel on chat_mensajes;
create policy chat_mensajes_sel on chat_mensajes for select to authenticated
  using (fn_chat_es_miembro(canal_id));

drop policy if exists chat_mensajes_ins on chat_mensajes;
create policy chat_mensajes_ins on chat_mensajes for insert to authenticated
  with check (
    usuario_id = auth.uid()
    and tipo <> 'sistema'
    and fn_chat_es_miembro(canal_id)
    and exists (select 1 from chat_canales c where c.id = canal_id and c.estado = 'abierto')
  );

-- 5) Trigger al insertar mensaje: fija tipo, valida contenido, bumpea canal ---
create or replace function fn_chat_msg_before() returns trigger
language plpgsql as $$
begin
  if new.tipo <> 'sistema' then
    if coalesce(new.cuerpo, '') = '' and coalesce(new.adjunto_url, '') = '' then
      raise exception 'El mensaje no puede estar vacío.';
    end if;
    new.tipo := case when coalesce(new.adjunto_url, '') <> '' then 'foto'::chat_tipo_mensaje
                     else 'texto'::chat_tipo_mensaje end;
  end if;
  update chat_canales set actualizado_en = now() where id = new.canal_id;
  return new;
end;
$$;

drop trigger if exists trg_chat_msg_before on chat_mensajes;
create trigger trg_chat_msg_before before insert on chat_mensajes
  for each row execute function fn_chat_msg_before();

-- 6) RPCs de gestión (SOLO web: rol central + admin del canal) ---------
-- 6a) Crear canal con miembros (transacción): creador = admin + mensaje 'sistema'.
create or replace function rpc_chat_crear_canal(
  p_nombre   text,
  p_tema     text default null,
  p_miembros uuid[] default '{}'
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_canal uuid;
  v_yo    uuid := auth.uid();
  v_n     int;
begin
  if coalesce(fn_rol_actual(), '') not in ('supervisor','investigador','administrador') then
    raise exception 'Solo el personal central (web) puede crear canales.';
  end if;
  if coalesce(trim(p_nombre), '') = '' then
    raise exception 'El canal necesita un nombre.';
  end if;

  insert into chat_canales (nombre, tema, creado_por)
    values (trim(p_nombre), nullif(trim(coalesce(p_tema,'')), ''), v_yo)
    returning id into v_canal;

  -- El creador queda como admin del canal.
  insert into chat_miembros (canal_id, usuario_id, es_admin)
    values (v_canal, v_yo, true)
    on conflict do nothing;

  -- Miembros elegidos (sin duplicar al creador).
  insert into chat_miembros (canal_id, usuario_id)
    select v_canal, x from unnest(coalesce(p_miembros, '{}')) as x
    where x is not null and x <> v_yo
    on conflict do nothing;

  select count(*) into v_n from chat_miembros where canal_id = v_canal;

  insert into chat_mensajes (canal_id, usuario_id, tipo, cuerpo)
    values (v_canal, v_yo, 'sistema', 'Canal creado con ' || v_n || ' integrante(s).');

  return v_canal;
end;
$$;

-- 6b) Integrar miembros (canal abierto, solo admin del canal).
create or replace function rpc_chat_integrar_miembros(
  p_canal    uuid,
  p_usuarios uuid[]
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_u    uuid;
  v_nom  text;
begin
  if not fn_chat_es_admin(p_canal) then
    raise exception 'Solo el administrador del canal puede integrar miembros.';
  end if;
  if not exists (select 1 from chat_canales where id = p_canal and estado = 'abierto') then
    raise exception 'El canal está cerrado; no admite nuevos integrantes.';
  end if;

  foreach v_u in array coalesce(p_usuarios, '{}') loop
    if v_u is null then continue; end if;
    if exists (select 1 from chat_miembros where canal_id = p_canal and usuario_id = v_u) then
      continue;
    end if;
    insert into chat_miembros (canal_id, usuario_id) values (p_canal, v_u);
    select nombre into v_nom from usuarios_perfil where id = v_u;
    insert into chat_mensajes (canal_id, usuario_id, tipo, cuerpo)
      values (p_canal, auth.uid(), 'sistema', coalesce(v_nom, 'Un usuario') || ' se integró al canal.');
  end loop;
end;
$$;

-- 6c) Abrir / cerrar canal (solo admin del canal).
create or replace function rpc_chat_estado_canal(p_canal uuid, p_estado text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not fn_chat_es_admin(p_canal) then
    raise exception 'Solo el administrador del canal puede cambiar su estado.';
  end if;
  if p_estado not in ('abierto','cerrado') then
    raise exception 'Estado no válido: %', p_estado;
  end if;
  update chat_canales set estado = p_estado::chat_estado_canal, actualizado_en = now()
   where id = p_canal;
  insert into chat_mensajes (canal_id, usuario_id, tipo, cuerpo)
    values (p_canal, auth.uid(), 'sistema',
            case when p_estado = 'cerrado' then 'El canal fue cerrado.' else 'El canal fue reabierto.' end);
end;
$$;

-- 7) Push: al insertar un mensaje, avisar a los miembros (menos el remitente) --
create or replace function fn_push_chat() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_secret  text := current_setting('app.push_secret', true);
  v_url     text := 'https://rdyjjfbehjfggpldmmur.supabase.co/functions/v1/enviar_push';
  v_canal   text;
  v_remite  text;
  v_users   uuid[];
begin
  -- Los mensajes de sistema no notifican. Sin secreto configurado, no hace nada.
  if new.tipo = 'sistema' or coalesce(v_secret, '') = '' then
    return new;
  end if;

  select nombre into v_canal from chat_canales where id = new.canal_id;
  select coalesce(nombre, 'Alguien') into v_remite from usuarios_perfil where id = new.usuario_id;

  -- Destinatarios: miembros del canal menos el remitente.
  select array_agg(usuario_id) into v_users
    from chat_miembros
   where canal_id = new.canal_id and usuario_id <> new.usuario_id;

  if v_users is null or array_length(v_users, 1) is null then
    return new;
  end if;

  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
    body    := jsonb_build_object(
      'user_ids', to_jsonb(v_users),
      'tipo',     'chat',
      'titulo',   coalesce('#' || v_canal || ' · ', '') || v_remite,
      'cuerpo',   left(coalesce(nullif(new.cuerpo, ''), '📷 Foto'), 180),
      'data',     jsonb_build_object('tipo', 'chat', 'canal_id', new.canal_id, 'nombre', v_canal)
    )
  );
  return new;
end;
$$;

drop trigger if exists trg_push_chat on chat_mensajes;
create trigger trg_push_chat after insert on chat_mensajes
  for each row execute function fn_push_chat();

-- 8) Realtime: difundir mensajes y cambios de canal --------------------
do $$ begin
  alter publication supabase_realtime add table chat_mensajes;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table chat_canales;
exception when duplicate_object then null; end $$;

-- 9) Bucket privado de adjuntos ---------------------------------------
insert into storage.buckets (id, name, public)
  values ('chat', 'chat', false)
  on conflict (id) do nothing;

-- Políticas de storage para el bucket 'chat'. Los objetos se nombran con rutas
-- aleatorias (uuid) y se sirven con URL firmada. (Endurecer por canal en prod.)
drop policy if exists chat_obj_sel on storage.objects;
create policy chat_obj_sel on storage.objects for select to authenticated
  using (bucket_id = 'chat');
drop policy if exists chat_obj_ins on storage.objects;
create policy chat_obj_ins on storage.objects for insert to authenticated
  with check (bucket_id = 'chat');


-- ########################################################################
-- ###  0047_chat_bitacora.sql
-- ########################################################################

-- =====================================================================
-- 0047_chat_bitacora.sql · Auditar el chat en la bitácora
--
-- Registra la actividad del chat en la bitácora con los MISMOS campos que el
-- resto del sistema (usuario, IP, dispositivo, acción, entidad, fecha), pero
-- SIN el contenido de los mensajes: en chat_mensajes se redactan `cuerpo` y
-- `adjunto_url`. Así queda constancia de que hubo comunicación (quién, en qué
-- canal, cuándo) sin guardar el texto.
--
-- No se usa fn_bitacora_generica porque: (a) chat_miembros tiene PK compuesta
-- (sin columna id) y (b) chat_mensajes no debe volcar su contenido.
-- =====================================================================

create or replace function fn_bitacora_chat() returns trigger
language plpgsql security definer as $$
declare
  v_headers  json;
  v_ip       text;
  v_device   text;
  v_usuario  uuid;
  v_entidad  uuid;
  v_nuevos   jsonb;
  v_ant      jsonb;
begin
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::json;
  exception when others then v_headers := null; end;
  v_ip     := coalesce(v_headers->>'x-forwarded-for', v_headers->>'cf-connecting-ip');
  v_device := v_headers->>'x-device-id';
  begin v_usuario := auth.uid(); exception when others then v_usuario := null; end;

  v_ant    := case when tg_op = 'UPDATE' then to_jsonb(old) else null end;
  v_nuevos := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end;

  if tg_table_name = 'chat_miembros' then
    -- PK compuesta: se referencia el canal como entidad.
    v_entidad := coalesce(new.canal_id, old.canal_id);
  else
    v_entidad := coalesce(new.id, old.id);
  end if;

  if tg_table_name = 'chat_mensajes' then
    -- Nunca se guarda el CONTENIDO del mensaje en la bitácora.
    v_nuevos := v_nuevos - 'cuerpo' - 'adjunto_url';
    v_ant    := v_ant    - 'cuerpo' - 'adjunto_url';
  end if;

  insert into bitacora (
    usuario_id, computadora_id, ip_address, tipo_accion,
    entidad_tipo, entidad_id, valores_anteriores, valores_nuevos, modulo
  ) values (
    v_usuario, v_device, v_ip, tg_op,
    tg_table_name, v_entidad, v_ant, v_nuevos, 'chat'
  );

  return coalesce(new, old);
end;
$$;

-- Canales: alta y cambios de estado (abrir/cerrar).
drop trigger if exists trg_auditoria_chat_canales on chat_canales;
create trigger trg_auditoria_chat_canales
  after insert or update on chat_canales
  for each row execute function fn_bitacora_chat();

-- Membresía: altas de integrantes.
drop trigger if exists trg_auditoria_chat_miembros on chat_miembros;
create trigger trg_auditoria_chat_miembros
  after insert or update on chat_miembros
  for each row execute function fn_bitacora_chat();

-- Mensajes: solo el metadato (quién, canal, tipo, fecha); NUNCA el contenido.
drop trigger if exists trg_auditoria_chat_mensajes on chat_mensajes;
create trigger trg_auditoria_chat_mensajes
  after insert on chat_mensajes
  for each row execute function fn_bitacora_chat();


-- ########################################################################
-- ###  0048_chat_v2.sql
-- ########################################################################

-- =====================================================================
-- 0048_chat_v2.sql · Chat: no leídos, editar canal, y limpieza de auditoría
--
--  * ultimo_leido por (canal, usuario): base para contar mensajes nuevos.
--  * rpc_chat_marcar_leido / rpc_chat_no_leidos.
--  * rpc_chat_actualizar_canal (editar nombre/tema; solo admin del canal).
--  * La auditoría de chat_miembros pasa a solo INSERT (el update de ultimo_leido
--    es lectura, no debe llenar la bitácora).
-- =====================================================================

alter table chat_miembros add column if not exists ultimo_leido timestamptz not null default now();

-- Marca el canal como leído hasta ahora para el usuario actual.
create or replace function rpc_chat_marcar_leido(p_canal uuid) returns void
language sql security definer set search_path = public as $$
  update chat_miembros set ultimo_leido = now()
   where canal_id = p_canal and usuario_id = auth.uid();
$$;

-- Mensajes NO leídos por canal (ajenos, no 'sistema', posteriores a mi marca).
-- Devuelve una fila por cada canal del usuario (n = 0 si está al día).
create or replace function rpc_chat_no_leidos()
returns table(canal_id uuid, n integer)
language sql stable security definer set search_path = public as $$
  select m.canal_id, count(msg.id)::int
    from chat_miembros m
    left join chat_mensajes msg
      on msg.canal_id = m.canal_id
     and msg.creado_en > m.ultimo_leido
     and msg.usuario_id is distinct from m.usuario_id
     and msg.tipo <> 'sistema'
   where m.usuario_id = auth.uid()
   group by m.canal_id;
$$;

-- Editar nombre / tema del canal (solo admin del canal).
create or replace function rpc_chat_actualizar_canal(p_canal uuid, p_nombre text, p_tema text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not fn_chat_es_admin(p_canal) then
    raise exception 'Solo el administrador del canal puede editarlo.';
  end if;
  update chat_canales
     set nombre = coalesce(nullif(trim(p_nombre), ''), nombre),
         tema   = nullif(trim(coalesce(p_tema, '')), ''),
         actualizado_en = now()
   where id = p_canal;
end;
$$;

-- La auditoría de membresía se limita a INSERT: los updates de ultimo_leido
-- (marca de lectura) no son actividad auditable y llenarían la bitácora.
drop trigger if exists trg_auditoria_chat_miembros on chat_miembros;
create trigger trg_auditoria_chat_miembros
  after insert on chat_miembros
  for each row execute function fn_bitacora_chat();


-- ########################################################################
-- ###  0049_chat_push_secreto.sql
-- ########################################################################

-- =====================================================================
-- 0049_chat_push_secreto.sql · Arreglar el push del chat
--
-- fn_push_chat (0046) leía el secreto del GUC `app.push_secret`, pero desde la
-- migración 0036 el secreto vive en la tabla `app_secretos` (clave 'push_secret')
-- y el GUC quedó vacío. Resultado: el disparador salía sin enviar y el chat nunca
-- notificaba (el de despachos sí, porque ya leía de la tabla).
--
-- Aquí se reescribe fn_push_chat para leer el secreto de app_secretos, igual que
-- fn_push_despacho. El trigger trg_push_chat (0046) ya apunta a esta función, así
-- que no hay que recrearlo. No requiere redeploy de enviar_push ni tocar env.
-- =====================================================================

create or replace function fn_push_chat() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_secret  text := (select valor from app_secretos where clave = 'push_secret');
  v_url     text := 'https://rdyjjfbehjfggpldmmur.supabase.co/functions/v1/enviar_push';
  v_canal   text;
  v_remite  text;
  v_users   uuid[];
begin
  -- Los mensajes de sistema no notifican. Sin secreto configurado, no hace nada.
  if new.tipo = 'sistema' or coalesce(v_secret, '') = '' then
    return new;
  end if;

  select nombre into v_canal from chat_canales where id = new.canal_id;
  select coalesce(nombre, 'Alguien') into v_remite from usuarios_perfil where id = new.usuario_id;

  -- Destinatarios: miembros del canal menos el remitente.
  select array_agg(usuario_id) into v_users
    from chat_miembros
   where canal_id = new.canal_id and usuario_id <> new.usuario_id;

  if v_users is null or array_length(v_users, 1) is null then
    return new;
  end if;

  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
    body    := jsonb_build_object(
      'user_ids', to_jsonb(v_users),
      'tipo',     'chat',
      'titulo',   coalesce('#' || v_canal || ' · ', '') || v_remite,
      'cuerpo',   left(coalesce(nullif(new.cuerpo, ''), '📷 Foto'), 180),
      'data',     jsonb_build_object('tipo', 'chat', 'canal_id', new.canal_id, 'nombre', v_canal)
    )
  );
  return new;
end;
$$;
