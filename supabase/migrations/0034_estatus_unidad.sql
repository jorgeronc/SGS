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
