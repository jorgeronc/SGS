-- =====================================================================
-- 0128_unidad_asignada_supervisor.sql
-- Asignar una UNIDAD (patrullas) a un supervisor/coordinador, para que el dato
-- esté disponible en el móvil (unidad del supervisor) y sirva de base para
-- supervisar su recorrido GPS de sitio a sitio.
-- =====================================================================

alter table patrullas add column if not exists asignado_personal_id uuid references personal(id);
comment on column patrullas.asignado_personal_id is 'Personal (supervisor/coordinador) al que está asignada la unidad. Base para "mi unidad" en el móvil y la supervisión de su recorrido.';
create index if not exists idx_patrullas_asignado on patrullas(asignado_personal_id);
