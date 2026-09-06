-- =====================================================================
-- 0092_credenciales_tipos.sql
-- Credenciales por TIPO/categoría (Empleado, Guardia, Visitante, Servicio) con
-- fecha de emisión y PLANTILLA de impresión por tipo (imagen de fondo sobre la
-- que se imprimen los datos). El `tipo` existente sigue siendo la TECNOLOGÍA
-- (qr/nfc/temporal); la CATEGORÍA es nueva.
-- =====================================================================

-- 1) Catálogo de categoría de credencial ------------------------------------
insert into cat_opciones (categoria, valor, orden) values
  ('categoria_credencial','Empleado',1),
  ('categoria_credencial','Guardia',2),
  ('categoria_credencial','Visitante',3),
  ('categoria_credencial','Servicio',4)
on conflict (categoria, valor) do nothing;

-- 2) Credenciales: categoría + fecha de emisión -----------------------------
alter table credenciales
  add column if not exists categoria     text,
  add column if not exists fecha_emision timestamptz default now();

comment on column credenciales.categoria is 'Categoría de la credencial (catálogo categoria_credencial): Empleado, Guardia, Visitante, Servicio.';

-- Backfill best-effort: si la credencial es de una persona que es guardia, marca
-- 'Guardia'; el resto queda para que el operador lo defina.
update credenciales c set categoria = 'Guardia'
 where c.categoria is null and c.persona_id is not null
   and exists (select 1 from personal p where p.persona_id = c.persona_id and p.estatus = 'activo');

-- 3) Plantilla de impresión por categoría (imagen de fondo por tipo) ---------
create table if not exists credencial_plantillas (
  categoria       text primary key,
  imagen_ruta     text,                          -- ruta en bucket 'fotos'
  orientacion     text not null default 'horizontal' check (orientacion in ('horizontal','vertical')),
  campos          jsonb not null default '{}'::jsonb,  -- posiciones/estilos futuros
  actualizado_en  timestamptz not null default now(),
  actualizado_por uuid references usuarios_perfil(id)
);
comment on table credencial_plantillas is 'Plantilla de impresión (imagen de fondo) por categoría de credencial; los datos se sobreponen al imprimir.';

alter table credencial_plantillas enable row level security;
drop policy if exists sel_credencial_plantillas on credencial_plantillas;
create policy sel_credencial_plantillas on credencial_plantillas for select to authenticated using (true);
drop policy if exists ins_credencial_plantillas on credencial_plantillas;
create policy ins_credencial_plantillas on credencial_plantillas for insert to authenticated
  with check (coalesce(fn_rol_actual(), '') in ('supervisor','administrador'));
drop policy if exists upd_credencial_plantillas on credencial_plantillas;
create policy upd_credencial_plantillas on credencial_plantillas for update to authenticated
  using (coalesce(fn_rol_actual(), '') in ('supervisor','administrador'))
  with check (coalesce(fn_rol_actual(), '') in ('supervisor','administrador'));
drop policy if exists del_credencial_plantillas on credencial_plantillas;
create policy del_credencial_plantillas on credencial_plantillas for delete to authenticated
  using (coalesce(fn_rol_actual(), '') in ('supervisor','administrador'));
