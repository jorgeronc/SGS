-- =====================================================================
-- 0017_barandilla_campos.sql
-- Amplía Barandilla con todos los campos del formato SCP360, y agrega un
-- catálogo genérico de opciones cortas (cat_opciones), administrable.
--
-- Campos según el formato de captura: datos de la detención (fecha, lugar,
-- ubicación, puesta a disposición, motivo, delito 911, folio de informe) y
-- media filiación del detenido (alias, nacimiento, sexo, complexión,
-- estatura, peso, color de piel, antecedentes, tatuajes, cicatrices, huellas)
-- y familiar de contacto. Los policías de la detención se registran como
-- vínculos (personal ↔ barandilla). Las fotos, con FotosPanel.
-- =====================================================================

-- Catálogo genérico de opciones cortas (enums administrables).
create table if not exists cat_opciones (
  categoria text not null,
  valor     text not null,
  orden     int  not null default 0,
  activo    boolean not null default true,
  primary key (categoria, valor)
);

comment on table cat_opciones is 'Catálogo genérico de opciones cortas (sexo, complexión, color de piel, etc.) usadas en los formularios. Administrable.';

insert into cat_opciones (categoria, valor, orden) values
  ('puesta_disposicion','CODE',1),
  ('puesta_disposicion','FLAGRANCIA',2),
  ('puesta_disposicion','TORITO',3),
  ('puesta_disposicion','SECRETARIA DE SEGURIDAD',4),
  ('puesta_disposicion','MINISTERIAL',5),
  ('motivo_detencion','FLAGRANCIA',1),
  ('motivo_detencion','ORDEN DE APREHENSION',2),
  ('motivo_detencion','ORDEN JUDICIAL',3),
  ('motivo_detencion','FALTA ADMINISTRATIVA',4),
  ('motivo_detencion','OTRO',5),
  ('sexo','HOMBRE',1),
  ('sexo','MUJER',2),
  ('complexion','DELGADA',1),
  ('complexion','MEDIANA',2),
  ('complexion','ROBUSTA',3),
  ('complexion','ATLETICA',4),
  ('color_piel','BLANCA',1),
  ('color_piel','APERLADA',2),
  ('color_piel','MORENA CLARA',3),
  ('color_piel','MORENA',4),
  ('color_piel','MORENA OSCURA',5),
  ('color_piel','NEGRA',6)
on conflict (categoria, valor) do nothing;

alter table cat_opciones enable row level security;
drop policy if exists sel_cat_opciones on cat_opciones;
create policy sel_cat_opciones on cat_opciones for select to authenticated using (true);
drop policy if exists upd_cat_opciones on cat_opciones;
create policy upd_cat_opciones on cat_opciones for all to authenticated
  using (fn_rol_actual() = 'administrador') with check (fn_rol_actual() = 'administrador');

-- ---------------------------------------------------------------------
-- Nuevos campos en barandilla.
-- ---------------------------------------------------------------------
alter table barandilla add column if not exists fecha_detencion      timestamptz;
alter table barandilla add column if not exists lugar_detencion      text;
alter table barandilla add column if not exists latitud              double precision;
alter table barandilla add column if not exists longitud             double precision;
alter table barandilla add column if not exists puesta_disposicion   text;
alter table barandilla add column if not exists delito               text;   -- cat_incidentes_911.incidente
alter table barandilla add column if not exists folio_informe        text;
alter table barandilla add column if not exists alias                text;
alter table barandilla add column if not exists fecha_nacimiento     date;
alter table barandilla add column if not exists sexo                 text;
alter table barandilla add column if not exists complexion           text;
alter table barandilla add column if not exists estatura             numeric;
alter table barandilla add column if not exists peso                 numeric;
alter table barandilla add column if not exists color_piel           text;
alter table barandilla add column if not exists antecedentes         text;
alter table barandilla add column if not exists tatuajes             boolean not null default false;
alter table barandilla add column if not exists descripcion_tatuajes text;
alter table barandilla add column if not exists cicatrices           boolean not null default false;
alter table barandilla add column if not exists descripcion_cicatrices text;
alter table barandilla add column if not exists mano_izquierda       text;
alter table barandilla add column if not exists mano_derecha         text;
alter table barandilla add column if not exists proporciona_familiar boolean not null default false;
alter table barandilla add column if not exists nombre_familiar      text;
alter table barandilla add column if not exists telefono_familiar    text;
alter table barandilla add column if not exists fotografias          jsonb default '[]'::jsonb;
