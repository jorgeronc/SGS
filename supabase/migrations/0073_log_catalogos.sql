-- =====================================================================
-- 0073_log_catalogos.sql · Seguridad Logística — Fase 1 (catálogos + zonas)
-- Catálogos administrables del dominio logístico y extensión de `sitios` y
-- `zonas` (se REUTILIZAN; no se crean tablas nuevas para eso).
-- =====================================================================

-- 1) Tipo de sitio (CEDIS, terminal ferroviaria, intermodal, etc.) ------------
alter table sitios add column if not exists tipo_sitio text;   -- cat tipo_sitio

-- 2) Extensión de zonas (reuso de control de accesos) -------------------------
alter table zonas add column if not exists tipo_zona       text;   -- cat tipo_zona
alter table zonas add column if not exists nivel_seguridad text;   -- cat nivel_seguridad_zona
-- La geometría (polígono GeoJSON / PostGIS) se agrega en la Fase 2.

-- 3) Catálogos (cat_opciones) --------------------------------------------------
insert into cat_opciones (categoria, valor, orden) values
  ('tipo_sitio','CEDIS',1),('tipo_sitio','Terminal ferroviaria',2),('tipo_sitio','Centro intermodal',3),
  ('tipo_sitio','Almacén',4),('tipo_sitio','Patio',5),('tipo_sitio','Planta',6),('tipo_sitio','Oficinas',7),('tipo_sitio','Otro',8),

  ('tipo_zona','Caseta',1),('tipo_zona','Patio',2),('tipo_zona','Almacén',3),('tipo_zona','Andén',4),('tipo_zona','Vía',5),
  ('tipo_zona','Oficinas',6),('tipo_zona','Estacionamiento',7),('tipo_zona','Área restringida',8),('tipo_zona','Área de carga',9),
  ('tipo_zona','Taller',10),('tipo_zona','Perímetro',11),('tipo_zona','Otro',12),

  ('nivel_seguridad_zona','Bajo',1),('nivel_seguridad_zona','Medio',2),('nivel_seguridad_zona','Alto',3),('nivel_seguridad_zona','Crítico',4),

  ('tipo_activo_transporte','Tractocamión',1),('tipo_activo_transporte','Camión',2),('tipo_activo_transporte','Locomotora',3),
  ('tipo_activo_transporte','Unidad de seguridad',4),('tipo_activo_transporte','Otro',5),

  ('tipo_unidad_carga','Remolque',1),('tipo_unidad_carga','Caja seca',2),('tipo_unidad_carga','Caja refrigerada',3),
  ('tipo_unidad_carga','Contenedor',4),('tipo_unidad_carga','Vagón',5),('tipo_unidad_carga','Carrotanque',6),
  ('tipo_unidad_carga','Tolva',7),('tipo_unidad_carga','Plataforma',8),('tipo_unidad_carga','Otro',9),

  ('nivel_riesgo_carga','Normal',1),('nivel_riesgo_carga','Controlada',2),('nivel_riesgo_carga','Alto valor',3),
  ('nivel_riesgo_carga','Sensible',4),('nivel_riesgo_carga','Crítica',5),

  ('tipo_inspeccion','Pre-salida',1),('tipo_inspeccion','Entrada',2),('tipo_inspeccion','Salida',3),('tipo_inspeccion','Patio',4),
  ('tipo_inspeccion','Sello',5),('tipo_inspeccion','Carga',6),('tipo_inspeccion','Perímetro',7),('tipo_inspeccion','Composición',8),
  ('tipo_inspeccion','Seguridad',9),('tipo_inspeccion','Otro',10),

  ('tipo_sello','Botella',1),('tipo_sello','Cable',2),('tipo_sello','Perno',3),('tipo_sello','Electrónico',4),('tipo_sello','Otro',5),

  -- Tipos de alerta (se usan en la Fase 2, se siembran desde ya).
  ('tipo_alerta','Detención no programada',1),('tipo_alerta','Salida de corredor',2),('tipo_alerta','Entrada a zona de riesgo',3),
  ('tipo_alerta','Sello no coincide',4),('tipo_alerta','Sello alterado',5),('tipo_alerta','Carga sensible sin custodia',6),
  ('tipo_alerta','Acceso no autorizado',7),('tipo_alerta','Movimiento fuera de horario',8),('tipo_alerta','Unidad de carga no reconocida',9),
  ('tipo_alerta','GPS sin señal',10),('tipo_alerta','CCTV crítico offline',11),('tipo_alerta','Inspección pendiente',12),
  ('tipo_alerta','Rondín incompleto',13),('tipo_alerta','Puerta abierta',14),('tipo_alerta','Permanencia excesiva',15)
on conflict (categoria, valor) do nothing;
