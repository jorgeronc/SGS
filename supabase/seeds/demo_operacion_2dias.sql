-- =====================================================================
-- demo_operacion_2dias.sql · Datos de DEMO: ~2 días de operación completa
--
-- Llena el sistema para una demostración: cliente + 2 sitios, guardias, turnos
-- (ayer y hoy), GPS (recorrido + posición en vivo), rondines (en/ fuera de rango),
-- incidencias (varias severidades, algunas cerradas con tiempo de respuesta),
-- accesos (personas y vehículos), credenciales, transportista, citas, salidas de
-- zona, una cámara de videovigilancia y metas de SLA.
--
-- IDEMPOTENTE: usa IDs fijos + ON CONFLICT DO NOTHING. Correr en el SQL editor.
-- Se recomienda correrlo el mismo día de la demo (las fechas se anclan a "ahora").
-- Para la vista "Situación ahora" (guardias en línea) conviene tener la ventana
-- GPS amplia durante la demo:  update config_sistema set gps_ventana_seg = 86400;
-- =====================================================================

-- ---- Cliente + sitios ------------------------------------------------------
insert into clientes (id, razon_social, rfc, contacto_nombre, contacto_tel)
values ('de110000-0000-4000-8000-000000000001','Corporativo Demo SGS','DEM010101AAA','Lic. Ana Torres','8110000001')
on conflict (id) do nothing;

insert into sitios (id, cliente_id, nombre, tipo, direccion, latitud, longitud, num_guardias, horario, horas_contratadas_mes)
values
 ('de110000-0000-4000-8000-000000000011','de110000-0000-4000-8000-000000000001','Planta Norte Demo','Industrial','Av. Industria 100, Monterrey',25.6820,-100.3100,3,'24/7',2160),
 ('de110000-0000-4000-8000-000000000012','de110000-0000-4000-8000-000000000001','Corporativo Sur Demo','Corporativo','Av. Sur 200, Monterrey',25.6510,-100.2900,2,'L-D 06:00-22:00',960)
on conflict (id) do nothing;

-- ---- Personas + guardias (4 guardias + 1 supervisor) -----------------------
insert into personas (id, nombre, apellido_paterno, apellido_materno, sexo) values
 ('de120000-0000-4000-8000-000000000001','Carlos','Ramírez','López','HOMBRE'),
 ('de120000-0000-4000-8000-000000000002','Luis','Hernández','Soto','HOMBRE'),
 ('de120000-0000-4000-8000-000000000003','Marisol','García','Núñez','MUJER'),
 ('de120000-0000-4000-8000-000000000004','Jorge','Méndez','Cruz','HOMBRE'),
 ('de120000-0000-4000-8000-000000000005','Patricia','Vega','Ríos','MUJER')
on conflict (id) do nothing;

insert into personal (id, persona_id, numero_placa, categoria, telefono, estado_laboral) values
 ('de130000-0000-4000-8000-000000000001','de120000-0000-4000-8000-000000000001','G-001','Guardia','8110000101','activo'),
 ('de130000-0000-4000-8000-000000000002','de120000-0000-4000-8000-000000000002','G-002','Guardia','8110000102','activo'),
 ('de130000-0000-4000-8000-000000000003','de120000-0000-4000-8000-000000000003','G-003','Guardia','8110000103','activo'),
 ('de130000-0000-4000-8000-000000000004','de120000-0000-4000-8000-000000000004','G-004','Guardia','8110000104','activo'),
 ('de130000-0000-4000-8000-000000000005','de120000-0000-4000-8000-000000000005','S-001','Supervisor','8110000105','activo')
on conflict (id) do nothing;

-- ---- Puntos de control (2 control + 1 caseta por sitio) --------------------
insert into puntos_control (id, sitio_id, nombre, codigo, orden, latitud, longitud, tipo_punto, radio_m, tipo_control) values
 ('de140000-0000-4000-8000-000000000011','de110000-0000-4000-8000-000000000011','Acceso principal','DEMO-N-CASETA',1,25.6822,-100.3102,'caseta',40,'ambos'),
 ('de140000-0000-4000-8000-000000000012','de110000-0000-4000-8000-000000000011','Patio norte','DEMO-N-P1',2,25.6828,-100.3095,'control',35,'qr'),
 ('de140000-0000-4000-8000-000000000013','de110000-0000-4000-8000-000000000011','Almacén','DEMO-N-P2',3,25.6815,-100.3110,'control',35,'nfc'),
 ('de140000-0000-4000-8000-000000000021','de110000-0000-4000-8000-000000000012','Recepción','DEMO-S-CASETA',1,25.6512,-100.2902,'caseta',35,'ambos'),
 ('de140000-0000-4000-8000-000000000022','de110000-0000-4000-8000-000000000012','Estacionamiento','DEMO-S-P1',2,25.6505,-100.2895,'control',35,'qr')
on conflict (id) do nothing;

-- ---- Turnos (ayer y hoy) + asignación de guardias a sitios -----------------
insert into turnos (id, supervisor_id, fecha, estado, estatus) values
 ('de150000-0000-4000-8000-000000000001','de130000-0000-4000-8000-000000000005', current_date - 1, 'activo','activo'),
 ('de150000-0000-4000-8000-000000000002','de130000-0000-4000-8000-000000000005', current_date,     'activo','activo')
on conflict (id) do nothing;

insert into turno_guardias (id, turno_id, personal_id, sitio_id, estado) values
 ('de160000-0000-4000-8000-000000000001','de150000-0000-4000-8000-000000000001','de130000-0000-4000-8000-000000000001','de110000-0000-4000-8000-000000000011','cubierto'),
 ('de160000-0000-4000-8000-000000000002','de150000-0000-4000-8000-000000000001','de130000-0000-4000-8000-000000000002','de110000-0000-4000-8000-000000000011','cubierto'),
 ('de160000-0000-4000-8000-000000000003','de150000-0000-4000-8000-000000000001','de130000-0000-4000-8000-000000000003','de110000-0000-4000-8000-000000000012','cubierto'),
 ('de160000-0000-4000-8000-000000000004','de150000-0000-4000-8000-000000000002','de130000-0000-4000-8000-000000000001','de110000-0000-4000-8000-000000000011','cubierto'),
 ('de160000-0000-4000-8000-000000000005','de150000-0000-4000-8000-000000000002','de130000-0000-4000-8000-000000000002','de110000-0000-4000-8000-000000000012','cubierto'),
 ('de160000-0000-4000-8000-000000000006','de150000-0000-4000-8000-000000000002','de130000-0000-4000-8000-000000000003','de110000-0000-4000-8000-000000000012','cubierto')
on conflict (id) do nothing;

-- ---- Recorrido GPS (para cobertura/asistencia del reporte) ------------------
insert into recorrido_gps (id, personal_id, user_id, turno_id, latitud, longitud, fecha_hora) values
 ('de170000-0000-4000-8000-000000000001','de130000-0000-4000-8000-000000000001','de100000-0000-4000-8000-000000000000','de150000-0000-4000-8000-000000000001',25.6822,-100.3102, now() - interval '28 hours'),
 ('de170000-0000-4000-8000-000000000002','de130000-0000-4000-8000-000000000002','de100000-0000-4000-8000-000000000000','de150000-0000-4000-8000-000000000001',25.6825,-100.3098, now() - interval '26 hours'),
 ('de170000-0000-4000-8000-000000000003','de130000-0000-4000-8000-000000000003','de100000-0000-4000-8000-000000000000','de150000-0000-4000-8000-000000000001',25.6512,-100.2902, now() - interval '25 hours'),
 ('de170000-0000-4000-8000-000000000004','de130000-0000-4000-8000-000000000001','de100000-0000-4000-8000-000000000000','de150000-0000-4000-8000-000000000002',25.6822,-100.3103, now() - interval '4 hours'),
 ('de170000-0000-4000-8000-000000000005','de130000-0000-4000-8000-000000000002','de100000-0000-4000-8000-000000000000','de150000-0000-4000-8000-000000000002',25.6510,-100.2900, now() - interval '3 hours'),
 ('de170000-0000-4000-8000-000000000006','de130000-0000-4000-8000-000000000003','de100000-0000-4000-8000-000000000000','de150000-0000-4000-8000-000000000002',25.6511,-100.2901, now() - interval '2 hours')
on conflict (id) do nothing;

-- ---- Posición en vivo (para "guardias en línea" / mapa) --------------------
insert into ubicaciones_guardias (personal_id, user_id, etiqueta, unidad, latitud, longitud, en_linea, actualizado_en, estatus_servicio) values
 ('de130000-0000-4000-8000-000000000001','de100000-0000-4000-8000-000000000000','Guardia G-001','Planta Norte Demo',25.6822,-100.3103, true, now(), 'en_rondin'),
 ('de130000-0000-4000-8000-000000000002','de100000-0000-4000-8000-000000000000','Guardia G-002','Corporativo Sur Demo',25.6510,-100.2900, true, now(), 'en_servicio'),
 ('de130000-0000-4000-8000-000000000003','de100000-0000-4000-8000-000000000000','Guardia G-003','Corporativo Sur Demo',25.6511,-100.2901, true, now(), 'en_pausa')
on conflict (personal_id) do update set latitud = excluded.latitud, longitud = excluded.longitud, en_linea = true, actualizado_en = now(), estatus_servicio = excluded.estatus_servicio;

-- ---- Rondines (ayer y hoy; mayoría en rango, 2 fuera, algunos con novedad) --
insert into rondines (id, punto_id, personal_id, turno_id, fecha_hora, latitud, longitud, novedad, distancia_m, dentro_geocerca, tipo_evento, metodo, creado_en) values
 ('de180000-0000-4000-8000-000000000001','de140000-0000-4000-8000-000000000011','de130000-0000-4000-8000-000000000001','de150000-0000-4000-8000-000000000001', now() - interval '27 hours',25.6822,-100.3102,'sin novedad',8,true,'entrada','qr', now() - interval '27 hours'),
 ('de180000-0000-4000-8000-000000000002','de140000-0000-4000-8000-000000000012','de130000-0000-4000-8000-000000000001','de150000-0000-4000-8000-000000000001', now() - interval '26 hours',25.6828,-100.3095,'sin novedad',12,true,'control','qr', now() - interval '26 hours'),
 ('de180000-0000-4000-8000-000000000003','de140000-0000-4000-8000-000000000013','de130000-0000-4000-8000-000000000002','de150000-0000-4000-8000-000000000001', now() - interval '25 hours',25.6815,-100.3110,'Reja de almacén abierta',15,true,'control','nfc', now() - interval '25 hours'),
 ('de180000-0000-4000-8000-000000000004','de140000-0000-4000-8000-000000000012','de130000-0000-4000-8000-000000000001','de150000-0000-4000-8000-000000000001', now() - interval '23 hours',25.6850,-100.3060,'sin novedad',180,false,'control','qr', now() - interval '23 hours'),
 ('de180000-0000-4000-8000-000000000005','de140000-0000-4000-8000-000000000011','de130000-0000-4000-8000-000000000001','de150000-0000-4000-8000-000000000002', now() - interval '5 hours',25.6822,-100.3102,'sin novedad',6,true,'entrada','qr', now() - interval '5 hours'),
 ('de180000-0000-4000-8000-000000000006','de140000-0000-4000-8000-000000000012','de130000-0000-4000-8000-000000000001','de150000-0000-4000-8000-000000000002', now() - interval '4 hours',25.6828,-100.3095,'Luminaria fundida en patio',10,true,'control','qr', now() - interval '4 hours'),
 ('de180000-0000-4000-8000-000000000007','de140000-0000-4000-8000-000000000021','de130000-0000-4000-8000-000000000003','de150000-0000-4000-8000-000000000002', now() - interval '3 hours',25.6512,-100.2902,'sin novedad',9,true,'entrada','nfc', now() - interval '3 hours'),
 ('de180000-0000-4000-8000-000000000008','de140000-0000-4000-8000-000000000022','de130000-0000-4000-8000-000000000002','de150000-0000-4000-8000-000000000002', now() - interval '2 hours',25.6560,-100.2940,'sin novedad',210,false,'control','qr', now() - interval '2 hours'),
 ('de180000-0000-4000-8000-000000000009','de140000-0000-4000-8000-000000000021','de130000-0000-4000-8000-000000000003','de150000-0000-4000-8000-000000000002', now() - interval '1 hours',25.6512,-100.2902,'sin novedad',7,true,'control','qr', now() - interval '1 hours')
on conflict (id) do nothing;

-- ---- Incidencias (varias severidades; algunas cerradas con tiempo de resp.) --
insert into llamadas_cad (id, tipo, prioridad, reportante, telefono, descripcion, direccion, latitud, longitud, sitio_id, estado_despacho, estatus, fecha_recepcion, fecha_cierre, conclusion, datos_adicionales) values
 ('de190000-0000-4000-8000-000000000001','Persona sospechosa','alta','Guardia G-001','8110000101','Persona merodeando el acceso norte','Planta Norte Demo',25.6822,-100.3102,'de110000-0000-4000-8000-000000000011','resuelta','cerrado', now() - interval '26 hours', now() - interval '25 hours 52 minutes','Atendida sin novedad', '{"origen":"incidente_movil","demo":true}'),
 ('de190000-0000-4000-8000-000000000002','Intrusión / acceso no autorizado','alta','Central','', 'Intento de acceso por barda oriente','Planta Norte Demo',25.6818,-100.3108,'de110000-0000-4000-8000-000000000011','resuelta','cerrado', now() - interval '22 hours', now() - interval '21 hours 45 minutes','Atendida con novedad', '{"origen":"central_operador","demo":true}'),
 ('de190000-0000-4000-8000-000000000003','Falla de servicio (CCTV, energía)','media','Guardia G-003','8110000103','Cámara de recepción sin señal','Corporativo Sur Demo',25.6512,-100.2902,'de110000-0000-4000-8000-000000000012','resuelta','cerrado', now() - interval '20 hours', now() - interval '19 hours 40 minutes','Atendida sin novedad', '{"origen":"incidente_movil","demo":true}'),
 ('de190000-0000-4000-8000-000000000004','Alarma activada','media','Central','','Alarma de puerta trasera','Corporativo Sur Demo',25.6508,-100.2898,'de110000-0000-4000-8000-000000000012','resuelta','cerrado', now() - interval '6 hours', now() - interval '5 hours 50 minutes','Falsa alarma', '{"origen":"central_operador","demo":true}'),
 ('de190000-0000-4000-8000-000000000005','Riña / agresión','alta','Guardia G-002','8110000102','Altercado en estacionamiento','Corporativo Sur Demo',25.6505,-100.2895,'de110000-0000-4000-8000-000000000012','en_atencion','activo', now() - interval '40 minutes', null, null, '{"origen":"incidente_movil","demo":true}'),
 ('de190000-0000-4000-8000-000000000006','EMERGENCIA - PÁNICO','alta','Guardia G-001','8110000101','Alerta de pánico activada por el elemento en campo.','Planta Norte Demo',25.6822,-100.3103,'de110000-0000-4000-8000-000000000011','despachada','activo', now() - interval '18 minutes', null, null, '{"origen":"panico_movil","demo":true}'),
 ('de190000-0000-4000-8000-000000000007','Persona sospechosa','baja','Central','','Reporte de vehículo desconocido','Planta Norte Demo',25.6825,-100.3099,'de110000-0000-4000-8000-000000000011','resuelta','cerrado', now() - interval '3 hours', now() - interval '2 hours 55 minutes','Atendida sin novedad', '{"origen":"central_operador","demo":true}')
on conflict (id) do nothing;

-- ---- Credenciales, transportista y accesos --------------------------------
insert into credenciales (id, persona_id, tipo, codigo, descripcion, vigencia_inicio, vigencia_fin) values
 ('de1a0000-0000-4000-8000-000000000001', null, 'temporal','DEMO-CR-VIS01','Visitante Roberto Díaz', now() - interval '1 day', now() + interval '2 days'),
 ('de1a0000-0000-4000-8000-000000000002', null, 'qr','DEMO-CR-PROV1','Proveedor Aguas del Norte', now() - interval '1 day', now() + interval '7 days')
on conflict (id) do nothing;

insert into transportistas (id, razon_social, rfc, contacto_nombre, contacto_tel) values
 ('de1b0000-0000-4000-8000-000000000001','Transportes del Norte SA','TNO900101AB1','Miguel Ángel','8110000201')
on conflict (id) do nothing;

insert into citas (id, sitio_id, transportista_id, operador_nombre, placa, remolque_placa, tipo_operacion, anden, programada_en, estado) values
 ('de1c0000-0000-4000-8000-000000000001','de110000-0000-4000-8000-000000000011','de1b0000-0000-4000-8000-000000000001','Pedro Salinas','ABC-1234','REM-9987','Descarga','A2', now() - interval '2 hours','en_anden'),
 ('de1c0000-0000-4000-8000-000000000002','de110000-0000-4000-8000-000000000011','de1b0000-0000-4000-8000-000000000001','Raúl Cano','XYZ-7788',null,'Carga','A1', now() + interval '3 hours','programada')
on conflict (id) do nothing;

-- Accesos: entradas/salidas de personas (2 dentro ahora), un rechazado, un vehículo dentro.
insert into accesos (id, tipo, persona_id, visitante_nombre, tipo_persona, sitio_id, punto_id, personal_id, motivo, resultado, fecha_evento, datos_adicionales) values
 ('de1d0000-0000-4000-8000-000000000001','entrada', null,'Roberto Díaz','Visitante','de110000-0000-4000-8000-000000000011','de140000-0000-4000-8000-000000000011','de130000-0000-4000-8000-000000000001','Visita','autorizado', now() - interval '5 hours', '{"origen":"caseta_movil","demo":true}'),
 ('de1d0000-0000-4000-8000-000000000002','salida',  null,'Roberto Díaz','Visitante','de110000-0000-4000-8000-000000000011','de140000-0000-4000-8000-000000000011','de130000-0000-4000-8000-000000000001','Visita','autorizado', now() - interval '3 hours', '{"origen":"caseta_movil","demo":true}'),
 ('de1d0000-0000-4000-8000-000000000003','entrada', null,'Aguas del Norte','Proveedor','de110000-0000-4000-8000-000000000011','de140000-0000-4000-8000-000000000011','de130000-0000-4000-8000-000000000001','Entrega','autorizado', now() - interval '2 hours', '{"origen":"caseta_movil","demo":true}'),
 ('de1d0000-0000-4000-8000-000000000004','entrada', null,'Sofía Ramos','Visitante','de110000-0000-4000-8000-000000000012','de140000-0000-4000-8000-000000000021','de130000-0000-4000-8000-000000000003','Entrevista','autorizado', now() - interval '90 minutes', '{"origen":"caseta_movil","demo":true}'),
 ('de1d0000-0000-4000-8000-000000000005','entrada', null,'Desconocido','Otro','de110000-0000-4000-8000-000000000012','de140000-0000-4000-8000-000000000021','de130000-0000-4000-8000-000000000003','Otro','rechazado', now() - interval '70 minutes', '{"origen":"caseta_movil","demo":true}')
on conflict (id) do nothing;

insert into accesos (id, tipo, visitante_nombre, tipo_persona, sitio_id, punto_id, personal_id, motivo, resultado, placa, cita_id, anden, fecha_evento, datos_adicionales) values
 ('de1d0000-0000-4000-8000-000000000006','entrada','Pedro Salinas','Transportista','de110000-0000-4000-8000-000000000011','de140000-0000-4000-8000-000000000011','de130000-0000-4000-8000-000000000001','Descarga','autorizado','ABC-1234','de1c0000-0000-4000-8000-000000000001','A2', now() - interval '2 hours', '{"origen":"caseta_movil","demo":true}')
on conflict (id) do nothing;

-- ---- Salidas de zona (feed "requiere atención" / abandono) -----------------
insert into geocerca_eventos (id, personal_id, user_id, sitio_id, tipo, latitud, longitud, fecha_hora) values
 ('de1e0000-0000-4000-8000-000000000001','de130000-0000-4000-8000-000000000002','de100000-0000-4000-8000-000000000000','de110000-0000-4000-8000-000000000012','salida',25.6560,-100.2940, now() - interval '35 minutes')
on conflict (id) do nothing;

-- ---- Cámara de videovigilancia (manual, stream público de prueba) ----------
insert into camaras (id, nombre, sitio_id, latitud, longitud, proveedor, stream_url, estado_operativo) values
 ('de1f0000-0000-4000-8000-000000000001','Acceso Norte (demo)','de110000-0000-4000-8000-000000000011',25.6822,-100.3102,'manual','https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8','activa')
on conflict (id) do nothing;

-- ---- Metas de SLA del cliente demo -----------------------------------------
insert into sla_metas (id, cliente_id, cobertura_pct, rondines_pct, tiempo_resp_min, incidentes_criticos_max) values
 ('de200000-0000-4000-8000-000000000001','de110000-0000-4000-8000-000000000001',95,90,10,1)
on conflict (id) do nothing;
