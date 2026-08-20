-- =====================================================================
-- 0008_fotos_storage.sql
-- Soporte de fotografías para Personas y Vehículos usando Supabase Storage.
--
-- - personas ya tiene la columna `fotografias jsonb` desde 0001.
-- - a vehiculos se le agrega la misma columna aquí.
-- - se crea un bucket público 'fotos' y las políticas de acceso sobre
--   storage.objects (lectura pública, escritura solo autenticados).
--
-- Las columnas `fotografias` guardan un arreglo JSON de RUTAS dentro del
-- bucket (ej. ["personas/<uuid>/1699999999_frente.jpg"]). La URL pública
-- se resuelve en el frontend con supabase.storage.getPublicUrl().
--
-- Nota de producción: el bucket es público para simplificar la demo. Para
-- datos sensibles (evidencia, fotos de personas) conviene un bucket privado
-- + URLs firmadas y políticas por rol; ver README.
-- =====================================================================

alter table vehiculos add column if not exists fotografias jsonb default '[]'::jsonb;

-- Bucket de almacenamiento de fotos.
insert into storage.buckets (id, name, public)
values ('fotos', 'fotos', true)
on conflict (id) do nothing;

-- Políticas sobre los objetos del bucket 'fotos'.
-- storage.objects ya tiene RLS habilitada por defecto en Supabase.
drop policy if exists "fotos_select" on storage.objects;
create policy "fotos_select" on storage.objects
  for select using (bucket_id = 'fotos');

drop policy if exists "fotos_insert" on storage.objects;
create policy "fotos_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'fotos');

drop policy if exists "fotos_update" on storage.objects;
create policy "fotos_update" on storage.objects
  for update to authenticated using (bucket_id = 'fotos');
