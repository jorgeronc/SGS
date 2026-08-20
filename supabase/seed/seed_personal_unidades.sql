-- seed_personal_unidades.sql  (generado desde Datos/Personal.csv y Datos/Unidades.csv)
-- Migra SOLO los campos que corresponden claramente. Las FOTOS no se migran:
-- las rutas file:///...droidbase... apuntan al almacenamiento del telefono origen
-- y esos archivos no estan en el repo. Correr en el editor SQL de Supabase.
begin;

-- ---------- Personal -> personas (biografico) + personal (empleo) ----------
with p as (
  insert into personas (nombre, apellido_paterno, apellido_materno, sexo, fecha_nacimiento, curp, rfc, datos_adicionales)
  values ('Roxana', 'Zamarripa González', null, null, null, null, null, '{"origen":"migracion:Personal.csv"}'::jsonb)
  returning id
)
insert into personal (persona_id, numero_placa, rango, fecha_ingreso, estado_laboral, datos_adicionales)
select id, null, null, null, 'activo', '{"origen":"migracion:Personal.csv"}'::jsonb from p;

with p as (
  insert into personas (nombre, apellido_paterno, apellido_materno, sexo, fecha_nacimiento, curp, rfc, datos_adicionales)
  values ('Linda Lizeth', 'Dávila Stevens', null, null, null, null, null, '{"origen":"migracion:Personal.csv"}'::jsonb)
  returning id
)
insert into personal (persona_id, numero_placa, rango, fecha_ingreso, estado_laboral, datos_adicionales)
select id, null, null, null, 'activo', '{"origen":"migracion:Personal.csv"}'::jsonb from p;

with p as (
  insert into personas (nombre, apellido_paterno, apellido_materno, sexo, fecha_nacimiento, curp, rfc, datos_adicionales)
  values ('Uriel Armando', 'Urrutia Maldonado', null, null, null, null, null, '{"origen":"migracion:Personal.csv"}'::jsonb)
  returning id
)
insert into personal (persona_id, numero_placa, rango, fecha_ingreso, estado_laboral, datos_adicionales)
select id, null, null, null, 'activo', '{"origen":"migracion:Personal.csv"}'::jsonb from p;

with p as (
  insert into personas (nombre, apellido_paterno, apellido_materno, sexo, fecha_nacimiento, curp, rfc, datos_adicionales)
  values ('Mirka', 'Castañeda Garza', null, null, null, null, null, '{"origen":"migracion:Personal.csv"}'::jsonb)
  returning id
)
insert into personal (persona_id, numero_placa, rango, fecha_ingreso, estado_laboral, datos_adicionales)
select id, null, null, null, 'activo', '{"origen":"migracion:Personal.csv"}'::jsonb from p;

with p as (
  insert into personas (nombre, apellido_paterno, apellido_materno, sexo, fecha_nacimiento, curp, rfc, datos_adicionales)
  values ('Angeles', 'Escobedo Navarro', null, null, null, null, null, '{"origen":"migracion:Personal.csv"}'::jsonb)
  returning id
)
insert into personal (persona_id, numero_placa, rango, fecha_ingreso, estado_laboral, datos_adicionales)
select id, null, null, null, 'activo', '{"origen":"migracion:Personal.csv"}'::jsonb from p;

with p as (
  insert into personas (nombre, apellido_paterno, apellido_materno, sexo, fecha_nacimiento, curp, rfc, datos_adicionales)
  values ('Mark', 'Mcdonald Salinas', null, null, null, null, null, '{"origen":"migracion:Personal.csv"}'::jsonb)
  returning id
)
insert into personal (persona_id, numero_placa, rango, fecha_ingreso, estado_laboral, datos_adicionales)
select id, null, null, null, 'activo', '{"bodycams":"8","origen":"migracion:Personal.csv"}'::jsonb from p;

with p as (
  insert into personas (nombre, apellido_paterno, apellido_materno, sexo, fecha_nacimiento, curp, rfc, datos_adicionales)
  values ('Mayra Elizabeth', 'Rodríguez Lara', null, null, null, null, null, '{"origen":"migracion:Personal.csv"}'::jsonb)
  returning id
)
insert into personal (persona_id, numero_placa, rango, fecha_ingreso, estado_laboral, datos_adicionales)
select id, null, null, null, 'activo', '{"origen":"migracion:Personal.csv"}'::jsonb from p;

with p as (
  insert into personas (nombre, apellido_paterno, apellido_materno, sexo, fecha_nacimiento, curp, rfc, datos_adicionales)
  values ('Alejandro', 'Posadas Kenner', null, null, null, null, null, '{"origen":"migracion:Personal.csv"}'::jsonb)
  returning id
)
insert into personal (persona_id, numero_placa, rango, fecha_ingreso, estado_laboral, datos_adicionales)
select id, null, null, null, 'activo', '{"origen":"migracion:Personal.csv"}'::jsonb from p;

with p as (
  insert into personas (nombre, apellido_paterno, apellido_materno, sexo, fecha_nacimiento, curp, rfc, datos_adicionales)
  values ('Americo', 'Lozano Armendariz', null, null, null, null, null, '{"origen":"migracion:Personal.csv"}'::jsonb)
  returning id
)
insert into personal (persona_id, numero_placa, rango, fecha_ingreso, estado_laboral, datos_adicionales)
select id, null, null, null, 'activo', '{"bodycams":"6","origen":"migracion:Personal.csv"}'::jsonb from p;

with p as (
  insert into personas (nombre, apellido_paterno, apellido_materno, sexo, fecha_nacimiento, curp, rfc, datos_adicionales)
  values ('Jaziel', 'Livingstone de León', null, null, null, null, null, '{"origen":"migracion:Personal.csv"}'::jsonb)
  returning id
)
insert into personal (persona_id, numero_placa, rango, fecha_ingreso, estado_laboral, datos_adicionales)
select id, null, null, null, 'activo', '{"origen":"migracion:Personal.csv"}'::jsonb from p;

with p as (
  insert into personas (nombre, apellido_paterno, apellido_materno, sexo, fecha_nacimiento, curp, rfc, datos_adicionales)
  values ('Cesar de Jesús', 'Yañez García', null, null, null, null, null, '{"origen":"migracion:Personal.csv"}'::jsonb)
  returning id
)
insert into personal (persona_id, numero_placa, rango, fecha_ingreso, estado_laboral, datos_adicionales)
select id, null, null, null, 'activo', '{"origen":"migracion:Personal.csv"}'::jsonb from p;

with p as (
  insert into personas (nombre, apellido_paterno, apellido_materno, sexo, fecha_nacimiento, curp, rfc, datos_adicionales)
  values ('José de Jesús', 'Nájera Jiménez', null, null, null, null, null, '{"origen":"migracion:Personal.csv"}'::jsonb)
  returning id
)
insert into personal (persona_id, numero_placa, rango, fecha_ingreso, estado_laboral, datos_adicionales)
select id, null, null, null, 'activo', '{"origen":"migracion:Personal.csv"}'::jsonb from p;

with p as (
  insert into personas (nombre, apellido_paterno, apellido_materno, sexo, fecha_nacimiento, curp, rfc, datos_adicionales)
  values ('Deyanira', 'Sandoval Arevalo', null, null, null, null, null, '{"origen":"migracion:Personal.csv"}'::jsonb)
  returning id
)
insert into personal (persona_id, numero_placa, rango, fecha_ingreso, estado_laboral, datos_adicionales)
select id, null, null, null, 'activo', '{"bodycams":"9","origen":"migracion:Personal.csv"}'::jsonb from p;

with p as (
  insert into personas (nombre, apellido_paterno, apellido_materno, sexo, fecha_nacimiento, curp, rfc, datos_adicionales)
  values ('Emilio Andrés', 'Aguilar Zarabia', null, null, null, null, null, '{"origen":"migracion:Personal.csv"}'::jsonb)
  returning id
)
insert into personal (persona_id, numero_placa, rango, fecha_ingreso, estado_laboral, datos_adicionales)
select id, null, null, null, 'activo', '{"origen":"migracion:Personal.csv"}'::jsonb from p;

with p as (
  insert into personas (nombre, apellido_paterno, apellido_materno, sexo, fecha_nacimiento, curp, rfc, datos_adicionales)
  values ('Luis Gonzalo', 'Ibarra Olivares', null, null, null, null, null, '{"origen":"migracion:Personal.csv"}'::jsonb)
  returning id
)
insert into personal (persona_id, numero_placa, rango, fecha_ingreso, estado_laboral, datos_adicionales)
select id, null, null, null, 'activo', '{"bodycams":"10","origen":"migracion:Personal.csv"}'::jsonb from p;

with p as (
  insert into personas (nombre, apellido_paterno, apellido_materno, sexo, fecha_nacimiento, curp, rfc, datos_adicionales)
  values ('Marlon', 'Villarreal Villarreal', null, null, null, null, null, '{"origen":"migracion:Personal.csv"}'::jsonb)
  returning id
)
insert into personal (persona_id, numero_placa, rango, fecha_ingreso, estado_laboral, datos_adicionales)
select id, null, null, null, 'activo', '{"origen":"migracion:Personal.csv"}'::jsonb from p;

with p as (
  insert into personas (nombre, apellido_paterno, apellido_materno, sexo, fecha_nacimiento, curp, rfc, datos_adicionales)
  values ('Bernardo Augusto', 'González Palacios', null, null, null, null, null, '{"origen":"migracion:Personal.csv"}'::jsonb)
  returning id
)
insert into personal (persona_id, numero_placa, rango, fecha_ingreso, estado_laboral, datos_adicionales)
select id, null, null, null, 'activo', '{"origen":"migracion:Personal.csv"}'::jsonb from p;

with p as (
  insert into personas (nombre, apellido_paterno, apellido_materno, sexo, fecha_nacimiento, curp, rfc, datos_adicionales)
  values ('Robert', 'Wallace San Miguel', null, null, null, null, null, '{"origen":"migracion:Personal.csv"}'::jsonb)
  returning id
)
insert into personal (persona_id, numero_placa, rango, fecha_ingreso, estado_laboral, datos_adicionales)
select id, null, null, null, 'activo', '{"origen":"migracion:Personal.csv"}'::jsonb from p;

with p as (
  insert into personas (nombre, apellido_paterno, apellido_materno, sexo, fecha_nacimiento, curp, rfc, datos_adicionales)
  values ('Omar Eduardo', 'Saavedra Riojas', null, 'HOMBRE', null, null, null, '{"origen":"migracion:Personal.csv"}'::jsonb)
  returning id
)
insert into personal (persona_id, numero_placa, rango, fecha_ingreso, estado_laboral, datos_adicionales)
select id, null, null, null, 'activo', '{"origen":"migracion:Personal.csv"}'::jsonb from p;

with p as (
  insert into personas (nombre, apellido_paterno, apellido_materno, sexo, fecha_nacimiento, curp, rfc, datos_adicionales)
  values ('Lorenzo', 'Amaya Gutiérrez', null, null, null, null, null, '{"origen":"migracion:Personal.csv"}'::jsonb)
  returning id
)
insert into personal (persona_id, numero_placa, rango, fecha_ingreso, estado_laboral, datos_adicionales)
select id, null, null, null, 'activo', '{"origen":"migracion:Personal.csv"}'::jsonb from p;

with p as (
  insert into personas (nombre, apellido_paterno, apellido_materno, sexo, fecha_nacimiento, curp, rfc, datos_adicionales)
  values ('LUIS ANGEL', 'SANDOVAL', 'PIEDRA', 'HOMBRE', '1997-11-20', 'SAPL971120HCCNDS01', 'SAPL971120P79', '{"origen":"migracion:Personal.csv","cuip":"SAPL971120H045388964","estado_civil":"SOLTERO(A)","licenciatura":"CRIMINALISTA","nivel_academico":"LICENCIATURA"}'::jsonb)
  returning id
)
insert into personal (persona_id, numero_placa, rango, fecha_ingreso, estado_laboral, datos_adicionales)
select id, '10001', 'POLICIA', '2022-03-31', 'activo', '{"bodycams":"1, 7","origen":"migracion:Personal.csv","armamento":"1 484839993, AR001 M16A4-0001"}'::jsonb from p;

with p as (
  insert into personas (nombre, apellido_paterno, apellido_materno, sexo, fecha_nacimiento, curp, rfc, datos_adicionales)
  values ('SELENE', 'HERNÁNDEZ', 'ROJAS', 'MUJER', '1997-08-30', 'HERS970830MTSRQL01', 'HERS970830F5F', '{"origen":"migracion:Personal.csv","cuip":"HERS970830M285397734","estado_civil":"SOLTERO(A)"}'::jsonb)
  returning id
)
insert into personal (persona_id, numero_placa, rango, fecha_ingreso, estado_laboral, datos_adicionales)
select id, '10002', 'POLICIA', '2021-03-29', 'baja', '{"origen":"migracion:Personal.csv","armamento":"8 484839998"}'::jsonb from p;

with p as (
  insert into personas (nombre, apellido_paterno, apellido_materno, sexo, fecha_nacimiento, curp, rfc, datos_adicionales)
  values ('JUAN FRANCISCO', 'RIOS', 'BELTRAN', 'HOMBRE', '1994-07-30', 'RIBJ940730HNLSLN03', 'RIBJ9407307Z1', '{"origen":"migracion:Personal.csv","cuip":"RIBJ940730H195397744","estado_civil":"SOLTERO(A)"}'::jsonb)
  returning id
)
insert into personal (persona_id, numero_placa, rango, fecha_ingreso, estado_laboral, datos_adicionales)
select id, '10003', 'POLICIA DE TRANSITO', '2022-03-31', 'activo', '{"bodycams":"4","origen":"migracion:Personal.csv","armamento":"ARM-0047 PF-2347, 2 484839993"}'::jsonb from p;

with p as (
  insert into personas (nombre, apellido_paterno, apellido_materno, sexo, fecha_nacimiento, curp, rfc, datos_adicionales)
  values ('DALIA', 'BRANDY', 'AQUINO', 'MUJER', '1997-08-30', 'BAAD970830MTSRQL01', 'BAAD9708302KA', '{"origen":"migracion:Personal.csv","cuip":"BAAD970830M285397734","estado_civil":"CASADO(A)"}'::jsonb)
  returning id
)
insert into personal (persona_id, numero_placa, rango, fecha_ingreso, estado_laboral, datos_adicionales)
select id, '10004', 'POLICIA', '2022-03-29', 'activo', '{"bodycams":"5","origen":"migracion:Personal.csv","armamento":"ARM-0045 PF-2345"}'::jsonb from p;

with p as (
  insert into personas (nombre, apellido_paterno, apellido_materno, sexo, fecha_nacimiento, curp, rfc, datos_adicionales)
  values ('EDWIN JESUS', 'ALVAREZ', 'AVALOS', 'HOMBRE', '1991-11-14', 'AAAE911114HTSLVD00', 'AAAE9111142P1', '{"origen":"migracion:Personal.csv","cuip":"AAAE911114H285196069","estado_civil":"SOLTERO(A)"}'::jsonb)
  returning id
)
insert into personal (persona_id, numero_placa, rango, fecha_ingreso, estado_laboral, datos_adicionales)
select id, '10005', 'POLICIA', '2020-03-30', 'activo', '{"bodycams":"3","origen":"migracion:Personal.csv"}'::jsonb from p;

with p as (
  insert into personas (nombre, apellido_paterno, apellido_materno, sexo, fecha_nacimiento, curp, rfc, datos_adicionales)
  values ('GUADALUPE', 'CORTINA', 'PUENTE', 'MUJER', '2000-02-19', 'COPG000219MTSRNSA6', 'COPG000219US8', '{"origen":"migracion:Personal.csv","cuip":"COPG000219H285388967","estado_civil":"CASADO(A)"}'::jsonb)
  returning id
)
insert into personal (persona_id, numero_placa, rango, fecha_ingreso, estado_laboral, datos_adicionales)
select id, '10006', 'POLICIA DE TRANSITO', '2022-03-29', 'activo', '{"bodycams":"11","origen":"migracion:Personal.csv"}'::jsonb from p;

with p as (
  insert into personas (nombre, apellido_paterno, apellido_materno, sexo, fecha_nacimiento, curp, rfc, datos_adicionales)
  values ('MAYRA', 'SALINAS', 'ESTEVEZ', 'MUJER', '1997-08-30', 'SAEM970830MTSRQL01', 'SAEM970830F5F', '{"origen":"migracion:Personal.csv","cuip":"SAEM970830M285397734","estado_civil":"DIVORCIADO(A)"}'::jsonb)
  returning id
)
insert into personal (persona_id, numero_placa, rango, fecha_ingreso, estado_laboral, datos_adicionales)
select id, '10007', 'POLICIA', '2021-03-29', 'activo', '{"bodycams":"2","origen":"migracion:Personal.csv"}'::jsonb from p;

with p as (
  insert into personas (nombre, apellido_paterno, apellido_materno, sexo, fecha_nacimiento, curp, rfc, datos_adicionales)
  values ('MARIO ALBERTO', 'CARDONA', 'SANDOVAL', 'HOMBRE', '1992-09-27', 'CASM920927HNLRNR07', 'CASM920927E26', '{"origen":"migracion:Personal.csv","cuip":"CASM920927H195388784","estado_civil":"CASADO(A)","licenciatura":"CRIMINALISTA","nivel_academico":"LICENCIATURA"}'::jsonb)
  returning id
)
insert into personal (persona_id, numero_placa, rango, fecha_ingreso, estado_laboral, datos_adicionales)
select id, '10008', 'POLICIA', '2022-03-29', 'activo', '{"origen":"migracion:Personal.csv","armamento":"ARM-0046 PF-2346, 4 484839994"}'::jsonb from p;

with p as (
  insert into personas (nombre, apellido_paterno, apellido_materno, sexo, fecha_nacimiento, curp, rfc, datos_adicionales)
  values ('Michelle', 'Saenz García', null, null, null, null, null, '{"origen":"migracion:Personal.csv"}'::jsonb)
  returning id
)
insert into personal (persona_id, numero_placa, rango, fecha_ingreso, estado_laboral, datos_adicionales)
select id, '10009', null, null, 'activo', '{"origen":"migracion:Personal.csv"}'::jsonb from p;

with p as (
  insert into personas (nombre, apellido_paterno, apellido_materno, sexo, fecha_nacimiento, curp, rfc, datos_adicionales)
  values ('Stephany Marisol', 'Bermudez Loera', null, 'MUJER', null, null, null, '{"origen":"migracion:Personal.csv"}'::jsonb)
  returning id
)
insert into personal (persona_id, numero_placa, rango, fecha_ingreso, estado_laboral, datos_adicionales)
select id, '10010', 'POLICÍA', null, 'activo', '{"origen":"migracion:Personal.csv"}'::jsonb from p;

with p as (
  insert into personas (nombre, apellido_paterno, apellido_materno, sexo, fecha_nacimiento, curp, rfc, datos_adicionales)
  values ('Daniel Louis', 'Lewis Garza', null, null, null, null, null, '{"origen":"migracion:Personal.csv"}'::jsonb)
  returning id
)
insert into personal (persona_id, numero_placa, rango, fecha_ingreso, estado_laboral, datos_adicionales)
select id, '4290', null, null, 'activo', '{"origen":"migracion:Personal.csv"}'::jsonb from p;

with p as (
  insert into personas (nombre, apellido_paterno, apellido_materno, sexo, fecha_nacimiento, curp, rfc, datos_adicionales)
  values ('Marcela', 'Rebollar Alcocer', null, null, null, null, null, '{"origen":"migracion:Personal.csv"}'::jsonb)
  returning id
)
insert into personal (persona_id, numero_placa, rango, fecha_ingreso, estado_laboral, datos_adicionales)
select id, '4320', null, null, 'activo', '{"origen":"migracion:Personal.csv"}'::jsonb from p;

with p as (
  insert into personas (nombre, apellido_paterno, apellido_materno, sexo, fecha_nacimiento, curp, rfc, datos_adicionales)
  values ('Liliana', 'Lancaster Flores', null, null, '1990-10-27', 'LAFL901027MNLNOL06', 'LAFL9010273L8', '{"origen":"migracion:Personal.csv"}'::jsonb)
  returning id
)
insert into personal (persona_id, numero_placa, rango, fecha_ingreso, estado_laboral, datos_adicionales)
select id, '4321', null, null, 'activo', '{"origen":"migracion:Personal.csv"}'::jsonb from p;

with p as (
  insert into personas (nombre, apellido_paterno, apellido_materno, sexo, fecha_nacimiento, curp, rfc, datos_adicionales)
  values ('Tania', 'Hernández Muller', null, null, null, null, null, '{"origen":"migracion:Personal.csv"}'::jsonb)
  returning id
)
insert into personal (persona_id, numero_placa, rango, fecha_ingreso, estado_laboral, datos_adicionales)
select id, '4322', null, null, 'activo', '{"origen":"migracion:Personal.csv"}'::jsonb from p;

-- ---------- Unidades -> vehiculos (flota de la agencia) ----------
insert into vehiculos (placas, anio, modelo, vin, tipo, es_flota_agencia, datos_adicionales)
values ('SKP681A', 2020, 'Tahoe SUV Police Paquete "P"', null, 'patrulla', true, '{"origen":"migracion:Unidades.csv","tipo_unidad":"TAHOE","numero_economico":"1013","departamento":"POLICIA"}'::jsonb);
insert into vehiculos (placas, anio, modelo, vin, tipo, es_flota_agencia, datos_adicionales)
values ('SKP671A', 2020, 'Tahoe SUV Police Paquete "P"', null, 'patrulla', true, '{"origen":"migracion:Unidades.csv","tipo_unidad":"TAHOE","numero_economico":"1012","departamento":"POLICIA"}'::jsonb);
insert into vehiculos (placas, anio, modelo, vin, tipo, es_flota_agencia, datos_adicionales)
values ('SKP662A', 2020, 'Tahoe SUV Police Paquete "P"', null, 'patrulla', true, '{"origen":"migracion:Unidades.csv","tipo_unidad":"TAHOE","numero_economico":"1008","departamento":"POLICIA"}'::jsonb);
insert into vehiculos (placas, anio, modelo, vin, tipo, es_flota_agencia, datos_adicionales)
values ('SKP659A', 2020, 'Tahoe SUV Police Paquete "P"', null, 'patrulla', true, '{"origen":"migracion:Unidades.csv","tipo_unidad":"TAHOE","numero_economico":"1007","departamento":"POLICIA"}'::jsonb);
insert into vehiculos (placas, anio, modelo, vin, tipo, es_flota_agencia, datos_adicionales)
values ('SKP651A', 2020, 'Tahoe SUV Police Paquete "P"', null, 'patrulla', true, '{"origen":"migracion:Unidades.csv","tipo_unidad":"TAHOE","numero_economico":"1017","departamento":"POLICIA"}'::jsonb);
insert into vehiculos (placas, anio, modelo, vin, tipo, es_flota_agencia, datos_adicionales)
values ('SKP643A', 2020, 'Tahoe SUV Police Paquete "P"', null, 'patrulla', true, '{"origen":"migracion:Unidades.csv","tipo_unidad":"TAHOE","numero_economico":"1014","departamento":"POLICIA"}'::jsonb);
insert into vehiculos (placas, anio, modelo, vin, tipo, es_flota_agencia, datos_adicionales)
values ('SKP640A', 2020, 'Tahoe SUV Police Paquete "P"', null, 'patrulla', true, '{"origen":"migracion:Unidades.csv","tipo_unidad":"TAHOE","numero_economico":"1019","departamento":"POLICIA"}'::jsonb);
insert into vehiculos (placas, anio, modelo, vin, tipo, es_flota_agencia, datos_adicionales)
values ('SKP722A', 2020, 'Tahoe SUV Police Paquete "P"', null, 'patrulla', true, '{"origen":"migracion:Unidades.csv","tipo_unidad":"TAHOE","numero_economico":"1011","departamento":"POLICIA"}'::jsonb);
insert into vehiculos (placas, anio, modelo, vin, tipo, es_flota_agencia, datos_adicionales)
values ('SKP721A', 2020, 'Tahoe SUV Police Paquete "P"', null, 'patrulla', true, '{"origen":"migracion:Unidades.csv","tipo_unidad":"TAHOE","numero_economico":"1006","departamento":"POLICIA"}'::jsonb);
insert into vehiculos (placas, anio, modelo, vin, tipo, es_flota_agencia, datos_adicionales)
values ('SKP718A', 2020, 'Tahoe SUV Police Paquete "P"', null, 'patrulla', true, '{"origen":"migracion:Unidades.csv","tipo_unidad":"TAHOE","numero_economico":"1020","departamento":"POLICIA"}'::jsonb);
insert into vehiculos (placas, anio, modelo, vin, tipo, es_flota_agencia, datos_adicionales)
values ('SKP713A', 2020, 'Tahoe SUV Police Paquete "P"', null, 'patrulla', true, '{"origen":"migracion:Unidades.csv","tipo_unidad":"TAHOE","numero_economico":"1005","departamento":"POLICIA"}'::jsonb);
insert into vehiculos (placas, anio, modelo, vin, tipo, es_flota_agencia, datos_adicionales)
values ('SKP710A', 2020, 'Tahoe SUV Police Paquete "P"', null, 'patrulla', true, '{"origen":"migracion:Unidades.csv","tipo_unidad":"TAHOE","numero_economico":"1009","departamento":"POLICIA"}'::jsonb);
insert into vehiculos (placas, anio, modelo, vin, tipo, es_flota_agencia, datos_adicionales)
values ('SKP708A', 2020, 'Tahoe SUV Police Paquete "P"', null, 'patrulla', true, '{"origen":"migracion:Unidades.csv","tipo_unidad":"TAHOE","numero_economico":"1022","departamento":"POLICIA"}'::jsonb);
insert into vehiculos (placas, anio, modelo, vin, tipo, es_flota_agencia, datos_adicionales)
values ('SKP703A', 2020, 'Tahoe SUV Police Paquete "P"', null, 'patrulla', true, '{"origen":"migracion:Unidades.csv","tipo_unidad":"TAHOE","numero_economico":"1010","departamento":"POLICIA"}'::jsonb);
insert into vehiculos (placas, anio, modelo, vin, tipo, es_flota_agencia, datos_adicionales)
values ('SKP701A', 2020, 'Tahoe SUV Police Paquete "P"', null, 'patrulla', true, '{"origen":"migracion:Unidades.csv","tipo_unidad":"TAHOE","numero_economico":"1021","departamento":"POLICIA"}'::jsonb);
insert into vehiculos (placas, anio, modelo, vin, tipo, es_flota_agencia, datos_adicionales)
values ('SKP698A', 2020, 'Tahoe SUV Paquete "A"', null, 'patrulla', true, '{"origen":"migracion:Unidades.csv","tipo_unidad":"TAHOE","numero_economico":"1018","departamento":"POLICIA"}'::jsonb);
insert into vehiculos (placas, anio, modelo, vin, tipo, es_flota_agencia, datos_adicionales)
values ('SKP688A', 2020, 'Tahoe SUV Paquete "D"', null, 'patrulla', true, '{"origen":"migracion:Unidades.csv","tipo_unidad":"TAHOE","numero_economico":"1016","departamento":"POLICIA"}'::jsonb);
insert into vehiculos (placas, anio, modelo, vin, tipo, es_flota_agencia, datos_adicionales)
values ('SKP664A', 2020, 'Tahoe SUV Paquete "F"', null, 'patrulla', true, '{"origen":"migracion:Unidades.csv","tipo_unidad":"TAHOE","numero_economico":"1015","departamento":"POLICIA"}'::jsonb);
insert into vehiculos (placas, anio, modelo, vin, tipo, es_flota_agencia, datos_adicionales)
values ('SKP653A', 2020, 'Durango SXT', null, 'patrulla', true, '{"origen":"migracion:Unidades.csv","tipo_unidad":"DURANGO","numero_economico":"782","departamento":"TRANSITO"}'::jsonb);
insert into vehiculos (placas, anio, modelo, vin, tipo, es_flota_agencia, datos_adicionales)
values ('SKP650A', 2020, 'Durango SXT', null, 'patrulla', true, '{"origen":"migracion:Unidades.csv","tipo_unidad":"DURANGO","numero_economico":"777","departamento":"TRANSITO"}'::jsonb);
insert into vehiculos (placas, anio, modelo, vin, tipo, es_flota_agencia, datos_adicionales)
values ('SKP647A', 2020, 'Durango Touring', null, 'patrulla', true, '{"origen":"migracion:Unidades.csv","tipo_unidad":"DURANGO","numero_economico":"778","departamento":"TRANSITO"}'::jsonb);
insert into vehiculos (placas, anio, modelo, vin, tipo, es_flota_agencia, datos_adicionales)
values ('SKP645A', 2020, 'Durango Touring', null, 'patrulla', true, '{"origen":"migracion:Unidades.csv","tipo_unidad":"DURANGO","numero_economico":"783","departamento":"TRANSITO"}'::jsonb);
insert into vehiculos (placas, anio, modelo, vin, tipo, es_flota_agencia, datos_adicionales)
values ('SKP642A', 2020, 'Pick Up RAM 1500 CREW CAB SLT V8 4x4', null, 'patrulla', true, '{"origen":"migracion:Unidades.csv","tipo_unidad":"DURANGO","numero_economico":"780","departamento":"TRANSITO"}'::jsonb);
insert into vehiculos (placas, anio, modelo, vin, tipo, es_flota_agencia, datos_adicionales)
values ('SKP639A', 2020, 'Durango Touring', null, 'patrulla', true, '{"origen":"migracion:Unidades.csv","tipo_unidad":"DURANGO","numero_economico":"786","departamento":"TRANSITO"}'::jsonb);
insert into vehiculos (placas, anio, modelo, vin, tipo, es_flota_agencia, datos_adicionales)
values ('SKP637A', 2020, 'Durango SXT', null, 'patrulla', true, '{"origen":"migracion:Unidades.csv","tipo_unidad":"DURANGO","numero_economico":"781","departamento":"TRANSITO"}'::jsonb);
insert into vehiculos (placas, anio, modelo, vin, tipo, es_flota_agencia, datos_adicionales)
values ('SKP634A', 2020, 'Durango SXT', null, 'patrulla', true, '{"origen":"migracion:Unidades.csv","tipo_unidad":"DURANGO","numero_economico":"784","departamento":"TRANSITO"}'::jsonb);
insert into vehiculos (placas, anio, modelo, vin, tipo, es_flota_agencia, datos_adicionales)
values ('SKP632A', 2020, 'Durango SXT', null, 'patrulla', true, '{"origen":"migracion:Unidades.csv","tipo_unidad":"DURANGO","numero_economico":"779","departamento":"TRANSITO"}'::jsonb);
insert into vehiculos (placas, anio, modelo, vin, tipo, es_flota_agencia, datos_adicionales)
values ('SKP629A', 2020, 'Durango Touring', null, 'patrulla', true, '{"origen":"migracion:Unidades.csv","tipo_unidad":"DURANGO","numero_economico":"785","departamento":"TRANSITO"}'::jsonb);

commit;
