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
