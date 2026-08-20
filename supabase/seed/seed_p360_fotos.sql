-- seed_p360_fotos.sql  (enlaza las fotos subidas a Storage con los registros P360)
-- Correr DESPUES de seed_p360.sql y de subir las fotos con scripts/migrar_fotos.mjs.
-- Cruza por datos_adicionales->>'origen_id'. Correr en el editor SQL de Supabase.
begin;

-- personas
update personas set fotografias = '["migracion/personas/5191056/1.jpg"]'::jsonb, actualizado_en = now() where datos_adicionales->>'origen_id' = '5191056' and estatus = 'activo';
update personas set fotografias = '["migracion/personas/5191073/1.jpg"]'::jsonb, actualizado_en = now() where datos_adicionales->>'origen_id' = '5191073' and estatus = 'activo';
update personas set fotografias = '["migracion/personas/5191075/1.jpg"]'::jsonb, actualizado_en = now() where datos_adicionales->>'origen_id' = '5191075' and estatus = 'activo';
update personas set fotografias = '["migracion/personas/5191076/1.jpg"]'::jsonb, actualizado_en = now() where datos_adicionales->>'origen_id' = '5191076' and estatus = 'activo';
update personas set fotografias = '["migracion/personas/5191077/1.jpg"]'::jsonb, actualizado_en = now() where datos_adicionales->>'origen_id' = '5191077' and estatus = 'activo';
update personas set fotografias = '["migracion/personas/5191078/1.jpg"]'::jsonb, actualizado_en = now() where datos_adicionales->>'origen_id' = '5191078' and estatus = 'activo';
update personas set fotografias = '["migracion/personas/5191079/1.jpg"]'::jsonb, actualizado_en = now() where datos_adicionales->>'origen_id' = '5191079' and estatus = 'activo';

-- vehiculos
update vehiculos set fotografias = '["migracion/vehiculos/5130013/1.jpg"]'::jsonb, actualizado_en = now() where datos_adicionales->>'origen_id' = '5130013' and estatus = 'activo';
update vehiculos set fotografias = '["migracion/vehiculos/5130015/1.jpg","migracion/vehiculos/5130015/2.jpg","migracion/vehiculos/5130015/3.jpg","migracion/vehiculos/5130015/4.jpg"]'::jsonb, actualizado_en = now() where datos_adicionales->>'origen_id' = '5130015' and estatus = 'activo';
update vehiculos set fotografias = '["migracion/vehiculos/5130021/1.jpg"]'::jsonb, actualizado_en = now() where datos_adicionales->>'origen_id' = '5130021' and estatus = 'activo';
update vehiculos set fotografias = '["migracion/vehiculos/5130024/1.jpg"]'::jsonb, actualizado_en = now() where datos_adicionales->>'origen_id' = '5130024' and estatus = 'activo';
update vehiculos set fotografias = '["migracion/vehiculos/5130030/1.jpg"]'::jsonb, actualizado_en = now() where datos_adicionales->>'origen_id' = '5130030' and estatus = 'activo';
update vehiculos set fotografias = '["migracion/vehiculos/5130035/1.jpg","migracion/vehiculos/5130035/2.jpg","migracion/vehiculos/5130035/3.jpg"]'::jsonb, actualizado_en = now() where datos_adicionales->>'origen_id' = '5130035' and estatus = 'activo';
update vehiculos set fotografias = '["migracion/vehiculos/5130036/1.jpg"]'::jsonb, actualizado_en = now() where datos_adicionales->>'origen_id' = '5130036' and estatus = 'activo';
update vehiculos set fotografias = '["migracion/vehiculos/5130037/1.jpg"]'::jsonb, actualizado_en = now() where datos_adicionales->>'origen_id' = '5130037' and estatus = 'activo';
update vehiculos set fotografias = '["migracion/vehiculos/5130038/1.jpg","migracion/vehiculos/5130038/2.jpg","migracion/vehiculos/5130038/3.jpg"]'::jsonb, actualizado_en = now() where datos_adicionales->>'origen_id' = '5130038' and estatus = 'activo';
update vehiculos set fotografias = '["migracion/vehiculos/5130039/1.jpg"]'::jsonb, actualizado_en = now() where datos_adicionales->>'origen_id' = '5130039' and estatus = 'activo';
update vehiculos set fotografias = '["migracion/vehiculos/5130041/1.jpg","migracion/vehiculos/5130041/2.jpg","migracion/vehiculos/5130041/3.jpg"]'::jsonb, actualizado_en = now() where datos_adicionales->>'origen_id' = '5130041' and estatus = 'activo';
update vehiculos set fotografias = '["migracion/vehiculos/5130042/1.png"]'::jsonb, actualizado_en = now() where datos_adicionales->>'origen_id' = '5130042' and estatus = 'activo';
update vehiculos set fotografias = '["migracion/vehiculos/5130044/1.png"]'::jsonb, actualizado_en = now() where datos_adicionales->>'origen_id' = '5130044' and estatus = 'activo';
update vehiculos set fotografias = '["migracion/vehiculos/5130045/1.png","migracion/vehiculos/5130045/2.png"]'::jsonb, actualizado_en = now() where datos_adicionales->>'origen_id' = '5130045' and estatus = 'activo';
update vehiculos set fotografias = '["migracion/vehiculos/5130046/1.png"]'::jsonb, actualizado_en = now() where datos_adicionales->>'origen_id' = '5130046' and estatus = 'activo';

-- casos
update casos set fotografias = '["migracion/casos/12580/1.jpg","migracion/casos/12580/2.bin","migracion/casos/12580/3.jpg","migracion/casos/12580/4.jpg"]'::jsonb, actualizado_en = now() where datos_adicionales->>'origen_id' = '12580' and estatus = 'activo';
update casos set fotografias = '["migracion/casos/31423/1.png","migracion/casos/31423/2.png","migracion/casos/31423/3.png","migracion/casos/31423/4.jpg"]'::jsonb, actualizado_en = now() where datos_adicionales->>'origen_id' = '31423' and estatus = 'activo';
update casos set fotografias = '["migracion/casos/2021-8283/1.jpg"]'::jsonb, actualizado_en = now() where datos_adicionales->>'origen_id' = '2021-8283' and estatus = 'activo';
update casos set fotografias = '["migracion/casos/20-26008/1.png","migracion/casos/20-26008/2.jpg","migracion/casos/20-26008/3.jpg"]'::jsonb, actualizado_en = now() where datos_adicionales->>'origen_id' = '20-26008' and estatus = 'activo';
update casos set fotografias = '["migracion/casos/UI-17441/1.jpg","migracion/casos/UI-17441/2.jpg","migracion/casos/UI-17441/3.jpg","migracion/casos/UI-17441/4.jpg","migracion/casos/UI-17441/5.jpg","migracion/casos/UI-17441/6.jpg"]'::jsonb, actualizado_en = now() where datos_adicionales->>'origen_id' = 'UI-17441' and estatus = 'activo';
update casos set fotografias = '["migracion/casos/20-24184/1.jpg"]'::jsonb, actualizado_en = now() where datos_adicionales->>'origen_id' = '20-24184' and estatus = 'activo';
update casos set fotografias = '["migracion/casos/20-24546/1.jpg","migracion/casos/20-24546/2.jpg","migracion/casos/20-24546/3.jpg"]'::jsonb, actualizado_en = now() where datos_adicionales->>'origen_id' = '20-24546' and estatus = 'activo';
update casos set fotografias = '["migracion/casos/20-24481/1.jpg","migracion/casos/20-24481/2.jpg","migracion/casos/20-24481/3.jpg","migracion/casos/20-24481/4.jpg","migracion/casos/20-24481/5.jpg","migracion/casos/20-24481/6.jpg","migracion/casos/20-24481/7.jpg","migracion/casos/20-24481/8.bin","migracion/casos/20-24481/9.jpg","migracion/casos/20-24481/10.jpg","migracion/casos/20-24481/11.jpg","migracion/casos/20-24481/12.jpg"]'::jsonb, actualizado_en = now() where datos_adicionales->>'origen_id' = '20-24481' and estatus = 'activo';
update casos set fotografias = '["migracion/casos/20-23223/1.jpg","migracion/casos/20-23223/2.jpg","migracion/casos/20-23223/3.jpg","migracion/casos/20-23223/4.jpg","migracion/casos/20-23223/5.jpg","migracion/casos/20-23223/6.jpg","migracion/casos/20-23223/7.jpg","migracion/casos/20-23223/8.jpg","migracion/casos/20-23223/9.jpg","migracion/casos/20-23223/10.jpg","migracion/casos/20-23223/11.bin","migracion/casos/20-23223/12.jpg","migracion/casos/20-23223/13.jpg","migracion/casos/20-23223/14.png"]'::jsonb, actualizado_en = now() where datos_adicionales->>'origen_id' = '20-23223' and estatus = 'activo';

-- incidentes
update incidentes set fotografias = '["migracion/incidentes/24-97765/1.png"]'::jsonb, actualizado_en = now() where datos_adicionales->>'origen_id' = '24-97765' and estatus = 'activo';

commit;
