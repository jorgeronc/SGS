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
