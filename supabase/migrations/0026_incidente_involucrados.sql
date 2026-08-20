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
