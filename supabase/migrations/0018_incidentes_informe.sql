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
