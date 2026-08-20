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
