-- =====================================================================
-- seed.sql — Datos de prueba para el end-to-end de la demo.
--
-- Ejecutar en el SQL Editor de Supabase DESPUÉS de las migraciones
-- 0001–0006. Usa UUIDs fijos e "on conflict do nothing", así que se
-- puede correr varias veces sin duplicar.
--
-- Nota: al insertarse disparan los triggers de bitácora, por lo que
-- también dejan rastro de auditoría (con usuario nulo, porque corre
-- desde el editor SQL y no desde una sesión autenticada).
-- =====================================================================

-- ---------- PERSONAS ----------
insert into personas (id, nombre, apellido_paterno, apellido_materno, sexo, curp) values
  ('a1111111-1111-1111-1111-111111111111', 'Juan',   'Pérez',   'García',  'M', 'PEGJ800101HDFRRN01'),
  ('a2222222-2222-2222-2222-222222222222', 'María',  'López',   'Hernández','F', 'LOHM900202MDFPRR02'),
  ('a3333333-3333-3333-3333-333333333333', 'Carlos', 'Ramírez', 'Soto',    'M', 'RASC850303HDFMTR03'),
  ('a4444444-4444-4444-4444-444444444444', 'Ana',    'Torres',  'Vega',    'F', 'TOVA880404MDFRGN04')
on conflict (id) do nothing;

-- ---------- VEHÍCULOS ----------
insert into vehiculos (id, placas, marca, modelo, anio, color, tipo) values
  ('b1111111-1111-1111-1111-111111111111', 'ABC-123', 'Nissan', 'Versa',  2019, 'Blanco', 'particular'),
  ('b2222222-2222-2222-2222-222222222222', 'XYZ-987', 'Ford',   'Ranger', 2021, 'Gris',   'pickup')
on conflict (id) do nothing;

-- ---------- UBICACIONES ----------
insert into ubicaciones (id, calle, numero_exterior, colonia, municipio, estado, codigo_postal) values
  ('c1111111-1111-1111-1111-111111111111', 'Av. Reforma', '100', 'Centro',   'Cuauhtémoc', 'CDMX', '06000'),
  ('c2222222-2222-2222-2222-222222222222', 'Calle 5',     '42',  'Del Valle','Benito Juárez','CDMX', '03100')
on conflict (id) do nothing;

-- ---------- CASOS ----------
insert into casos (id, folio, tipo, titulo, narrativa, prioridad, estado_investigacion, fecha_hecho) values
  ('d1111111-1111-1111-1111-111111111111', 'EXP-2026-001', 'robo',
     'Robo a vehículo en Av. Reforma',
     'Se reporta el robo de un vehículo estacionado sobre Av. Reforma la madrugada del hecho.',
     'alta', 'en_investigacion', now() - interval '3 days'),
  ('d2222222-2222-2222-2222-222222222222', 'EXP-2026-002', 'accidente vial',
     'Accidente vial con lesionados',
     'Colisión entre dos vehículos con una persona lesionada; se solicita parte médico.',
     'media', 'abierto', now() - interval '1 day')
on conflict (id) do nothing;

-- ---------- PERSONAL ----------
-- Ana Torres (persona a4...) es oficial de la agencia.
insert into personal (id, persona_id, numero_placa, rango, adscripcion, estado_laboral, fecha_ingreso) values
  ('e1111111-1111-1111-1111-111111111111', 'a4444444-4444-4444-4444-444444444444',
     '4501', 'Oficial', 'Robo de vehículos', 'activo', date '2018-06-01')
on conflict (id) do nothing;

-- ---------- VÍNCULOS ----------
-- Caso 1: víctima (Juan), vehículo robado, ubicación del hecho y oficial asignado.
insert into vinculos (entidad_origen_tipo, entidad_origen_id, entidad_destino_tipo, entidad_destino_id, tipo_relacion) values
  ('caso',     'd1111111-1111-1111-1111-111111111111', 'persona',   'a1111111-1111-1111-1111-111111111111', 'victima'),
  ('caso',     'd1111111-1111-1111-1111-111111111111', 'vehiculo',  'b1111111-1111-1111-1111-111111111111', 'vehiculo_robado'),
  ('caso',     'd1111111-1111-1111-1111-111111111111', 'ubicacion', 'c1111111-1111-1111-1111-111111111111', 'lugar_del_hecho'),
  ('caso',     'd1111111-1111-1111-1111-111111111111', 'personal',  'e1111111-1111-1111-1111-111111111111', 'oficial_asignado'),
  -- Domicilio conocido de Juan.
  ('persona',  'a1111111-1111-1111-1111-111111111111', 'ubicacion', 'c2222222-2222-2222-2222-222222222222', 'domicilio_actual'),
  -- María es propietaria de un vehículo.
  ('persona',  'a2222222-2222-2222-2222-222222222222', 'vehiculo',  'b2222222-2222-2222-2222-222222222222', 'propietario')
on conflict do nothing;

-- ---------- EVIDENCIAS ----------
insert into evidencias (id, folio, tipo, descripcion, cantidad, ubicacion_almacen, estado_evidencia, fecha_recoleccion) values
  ('f1111111-1111-1111-1111-111111111111', 'EVI-2026-001', 'documento',
     'Tarjeta de circulación encontrada en el lugar del hecho', '1 pieza',
     'Bodega A - Anaquel 3', 'en_almacen', now() - interval '3 days')
on conflict (id) do nothing;

-- Vínculo: la evidencia pertenece al caso del robo.
insert into vinculos (entidad_origen_tipo, entidad_origen_id, entidad_destino_tipo, entidad_destino_id, tipo_relacion)
select 'caso', 'd1111111-1111-1111-1111-111111111111', 'evidencia', 'f1111111-1111-1111-1111-111111111111', 'evidencia_del_caso'
where not exists (
  select 1 from vinculos
  where entidad_origen_id = 'd1111111-1111-1111-1111-111111111111'
    and entidad_destino_id = 'f1111111-1111-1111-1111-111111111111'
);

-- Primer evento de cadena de custodia (append-only; guardado para no duplicar al re-correr el seed).
insert into cadena_custodia (evidencia_id, tipo_evento, responsable, ubicacion, notas, fecha_evento)
select 'f1111111-1111-1111-1111-111111111111', 'recoleccion', 'Oficial Ana Torres (#4501)',
       'Lugar del hecho — Av. Reforma', 'Recolección inicial de la evidencia.', now() - interval '3 days'
where not exists (
  select 1 from cadena_custodia where evidencia_id = 'f1111111-1111-1111-1111-111111111111'
);

-- ---------- ASUNTOS INTERNOS (solo visible para rol asuntos_internos/administrador) ----------
insert into asuntos_internos (id, folio, tipo, asunto, narrativa, personal_id, confidencialidad, estado) values
  ('01111111-1111-1111-1111-111111111111', 'AI-2026-001', 'queja_ciudadana',
     'Queja por presunto uso indebido de la fuerza',
     'Un ciudadano presentó una queja formal; se abre investigación interna preliminar.',
     'e1111111-1111-1111-1111-111111111111', 'confidencial', 'en_investigacion')
on conflict (id) do nothing;
