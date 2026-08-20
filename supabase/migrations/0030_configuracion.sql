-- =====================================================================
-- 0030_configuracion.sql
-- Parámetros de configuración del sistema: datos de la Corporación Policial
-- y jurisdicción que rige la geocodificación de domicilios (búsqueda en mapa).
--
-- Tabla singleton: una sola fila (id = true). Lectura para cualquier usuario
-- autenticado (el CAD necesita la jurisdicción); edición solo administrador.
-- =====================================================================

create table if not exists config_sistema (
  id                boolean primary key default true check (id),  -- fuerza fila única
  corporacion       text not null default 'Secretaría de Seguridad Metropolitana',
  escudo            text not null default 'escudo.png',
  jurisdiccion      text not null default 'Nuevo León',   -- estado que rige la búsqueda de domicilios
  jurisdiccion_pais text not null default 'México',
  domicilio         text,
  telefono          text,
  correo            text,
  actualizado_en    timestamptz not null default now()
);

comment on table config_sistema is 'Parámetros del sistema: datos de la Corporación Policial y jurisdicción para geocodificación (tabla singleton).';
comment on column config_sistema.jurisdiccion is 'Estado/entidad que sesga la búsqueda de domicilios en el CAD (ej. Nuevo León).';

-- Fila única con los valores de esta corporación.
insert into config_sistema (id, corporacion, escudo, jurisdiccion, jurisdiccion_pais)
values (true, 'Secretaría de Seguridad Metropolitana', 'escudo.png', 'Nuevo León', 'México')
on conflict (id) do nothing;

alter table config_sistema enable row level security;

-- Lectura para cualquier usuario autenticado.
drop policy if exists sel_config on config_sistema;
create policy sel_config on config_sistema for select to authenticated using (true);

-- Alta/edición solo administrador.
drop policy if exists ins_config on config_sistema;
create policy ins_config on config_sistema for insert to authenticated
  with check (fn_rol_actual() = 'administrador');
drop policy if exists upd_config on config_sistema;
create policy upd_config on config_sistema for update to authenticated
  using (fn_rol_actual() = 'administrador') with check (fn_rol_actual() = 'administrador');
