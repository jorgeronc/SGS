-- =====================================================================
-- 0055_catalogos_formularios.sql
-- Conecta los formularios a cat_opciones (administrable en Administración →
-- Catálogos). Antes varias pantallas usaban listas fijas en el código, así que
-- lo que el admin editaba en Catálogos no se reflejaba en el registro.
--
-- Siembra las categorías que faltaban. tipo_bodycam (0039) y categoria_guardia
-- (0050) ya existen; se re-afirman por idempotencia. Todo con ON CONFLICT DO
-- NOTHING para no duplicar ni pisar lo que el admin ya haya ajustado.
-- =====================================================================

-- Bodycams (el móvil valida el tipo 'Smartphone' en rpc_validar_bodycam) -------
insert into cat_opciones (categoria, valor, orden) values
  ('tipo_bodycam','Smartphone',1),
  ('tipo_bodycam','Bodycam portátil',2),
  ('tipo_bodycam','Bodycam fija',3)
on conflict (categoria, valor) do nothing;

-- Armamento --------------------------------------------------------------------
insert into cat_opciones (categoria, valor, orden) values
  ('tipo_armamento','Arma corta',1),
  ('tipo_armamento','Arma larga',2),
  ('tipo_armamento','Menos letal',3),
  ('tipo_armamento','Munición',4),
  ('tipo_armamento','Otro',5)
on conflict (categoria, valor) do nothing;

-- Comunicación -----------------------------------------------------------------
insert into cat_opciones (categoria, valor, orden) values
  ('tipo_comunicacion','Radio',1),
  ('tipo_comunicacion','Celular',2),
  ('tipo_comunicacion','Repetidor',3),
  ('tipo_comunicacion','Otro',4)
on conflict (categoria, valor) do nothing;

-- Otros equipos ----------------------------------------------------------------
insert into cat_opciones (categoria, valor, orden) values
  ('tipo_otros_equipo','Dron',1),
  ('tipo_otros_equipo','Robot',2),
  ('tipo_otros_equipo','Equipo táctico',3),
  ('tipo_otros_equipo','Otro',4)
on conflict (categoria, valor) do nothing;

-- Sitios / puestos -------------------------------------------------------------
insert into cat_opciones (categoria, valor, orden) values
  ('tipo_sitio','Corporativo / oficinas',1),
  ('tipo_sitio','Residencial',2),
  ('tipo_sitio','Industrial / planta',3),
  ('tipo_sitio','Comercial / retail',4),
  ('tipo_sitio','Bodega / almacén',5),
  ('tipo_sitio','Escolar',6),
  ('tipo_sitio','Hospitalario',7),
  ('tipo_sitio','Evento',8)
on conflict (categoria, valor) do nothing;

-- Rol de turnos ----------------------------------------------------------------
-- Nota: la web autocompleta el horario para estos 4 valores exactos; opciones
-- nuevas quedan sin horario sugerido (se captura a mano).
insert into cat_opciones (categoria, valor, orden) values
  ('tipo_turno','Diurno (08:00-20:00)',1),
  ('tipo_turno','Nocturno (20:00-08:00)',2),
  ('tipo_turno','24 horas',3),
  ('tipo_turno','Mixto / rolado',4)
on conflict (categoria, valor) do nothing;

-- Guardias (ya existe desde 0050; se re-afirma por idempotencia) ---------------
insert into cat_opciones (categoria, valor, orden) values
  ('categoria_guardia','Guardia intramuros',1),
  ('categoria_guardia','Escolta',2),
  ('categoria_guardia','Canino (K9)',3),
  ('categoria_guardia','Monitorista / CCTV',4),
  ('categoria_guardia','Custodia de valores',5),
  ('categoria_guardia','Supervisor',6),
  ('categoria_guardia','Jefe de turno',7)
on conflict (categoria, valor) do nothing;

-- Central / Despacho: tipo de incidencia (reemplaza el catálogo policial 911) --
insert into cat_opciones (categoria, valor, orden) values
  ('tipo_incidencia','Alarma activada',1),
  ('tipo_incidencia','Intrusión / acceso no autorizado',2),
  ('tipo_incidencia','Robo / hurto',3),
  ('tipo_incidencia','Persona sospechosa',4),
  ('tipo_incidencia','Riña / agresión',5),
  ('tipo_incidencia','Emergencia médica',6),
  ('tipo_incidencia','Incendio / conato',7),
  ('tipo_incidencia','Falla de servicio (CCTV, energía)',8),
  ('tipo_incidencia','Apoyo / rondín extraordinario',9),
  ('tipo_incidencia','Emergencia - Pánico',10),
  ('tipo_incidencia','Otro',11)
on conflict (categoria, valor) do nothing;
