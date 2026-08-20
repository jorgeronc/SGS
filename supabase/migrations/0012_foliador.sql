-- =====================================================================
-- 0012_foliador.sql
-- Foliador único, consecutivo y administrable, para todos los módulos que
-- manejan un campo `folio`.
--
-- Formato del folio (12 caracteres): AAAA + II + NNNNNN
--   - AAAA   : año (4 dígitos)
--   - II     : iniciales del módulo (2 letras, configurables)
--   - NNNNNN : consecutivo de 6 dígitos, con ceros a la izquierda
-- El consecutivo se REINICIA cada año, por módulo.  Ej: 2026CA000001
--
-- Se administra desde el módulo de administración (/admin): se pueden
-- cambiar las iniciales de cada módulo y ver/ajustar el consecutivo por año.
-- =====================================================================

-- Catálogo de módulos que usan folio, con sus iniciales configurables.
create table if not exists foliadores (
  modulo    text primary key,     -- coincide con el nombre de la tabla (ej. 'casos')
  nombre    text not null,        -- nombre para mostrar
  iniciales text not null check (char_length(iniciales) = 2),
  activo    boolean not null default true
);

comment on table foliadores is 'Configuración del foliador por módulo: iniciales (2 letras) que forman parte del folio.';

-- Consecutivo por módulo y año (se reinicia cada año).
create table if not exists folios_consecutivos (
  modulo  text not null,
  anio    int  not null,
  ultimo  int  not null default 0,
  primary key (modulo, anio)
);

comment on table folios_consecutivos is 'Último consecutivo asignado por módulo y año. El foliador reinicia en 1 cada año.';

-- Semilla de módulos con folio (iniciales por defecto).
insert into foliadores (modulo, nombre, iniciales) values
  ('casos',            'Casos / Incidentes',   'CA'),
  ('ordenes',          'Citatorios y Órdenes', 'OR'),
  ('evidencias',       'Bienes y Evidencias',  'EV'),
  ('asuntos_internos', 'Asuntos Internos',     'AI'),
  ('llamadas_cad',     'CAD / Despacho',       'CD'),
  ('barandilla',       'Barandilla',           'BA')
on conflict (modulo) do nothing;

-- ---------------------------------------------------------------------
-- Función que entrega el siguiente folio de un módulo (atómica).
-- security definer: escribe folios_consecutivos saltando la RLS.
-- ---------------------------------------------------------------------
create or replace function rpc_siguiente_folio(p_modulo text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_anio  int := extract(year from now())::int;
  v_ini   text;
  v_next  int;
begin
  select iniciales into v_ini from foliadores where modulo = p_modulo and activo;
  if v_ini is null then
    raise exception 'No hay foliador configurado (o está inactivo) para el módulo %', p_modulo;
  end if;

  insert into folios_consecutivos (modulo, anio, ultimo)
  values (p_modulo, v_anio, 1)
  on conflict (modulo, anio)
  do update set ultimo = folios_consecutivos.ultimo + 1
  returning ultimo into v_next;

  return v_anio::text || upper(v_ini) || lpad(v_next::text, 6, '0');
end;
$$;

-- ---------------------------------------------------------------------
-- Trigger BEFORE INSERT: si no se envió folio, lo asigna el foliador.
-- Usa el nombre de la tabla como clave de módulo.
-- ---------------------------------------------------------------------
create or replace function fn_asignar_folio()
returns trigger
language plpgsql
as $$
begin
  if new.folio is null or new.folio = '' then
    new.folio := rpc_siguiente_folio(tg_table_name);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_folio_casos on casos;
create trigger trg_folio_casos before insert on casos
  for each row execute function fn_asignar_folio();

drop trigger if exists trg_folio_ordenes on ordenes;
create trigger trg_folio_ordenes before insert on ordenes
  for each row execute function fn_asignar_folio();

drop trigger if exists trg_folio_evidencias on evidencias;
create trigger trg_folio_evidencias before insert on evidencias
  for each row execute function fn_asignar_folio();

drop trigger if exists trg_folio_asuntos_internos on asuntos_internos;
create trigger trg_folio_asuntos_internos before insert on asuntos_internos
  for each row execute function fn_asignar_folio();

drop trigger if exists trg_folio_llamadas_cad on llamadas_cad;
create trigger trg_folio_llamadas_cad before insert on llamadas_cad
  for each row execute function fn_asignar_folio();

drop trigger if exists trg_folio_barandilla on barandilla;
create trigger trg_folio_barandilla before insert on barandilla
  for each row execute function fn_asignar_folio();

-- ---------------------------------------------------------------------
-- RLS: la administración del foliador es solo para administrador.
-- (rpc_siguiente_folio es security definer, así que el alta de registros
--  funciona para cualquier usuario aunque no pueda leer estas tablas.)
-- ---------------------------------------------------------------------
alter table foliadores enable row level security;
alter table folios_consecutivos enable row level security;

drop policy if exists sel_foliadores on foliadores;
create policy sel_foliadores on foliadores for select to authenticated
  using (fn_rol_actual() = 'administrador');
drop policy if exists upd_foliadores on foliadores;
create policy upd_foliadores on foliadores for update to authenticated
  using (fn_rol_actual() = 'administrador') with check (fn_rol_actual() = 'administrador');
drop policy if exists ins_foliadores on foliadores;
create policy ins_foliadores on foliadores for insert to authenticated
  with check (fn_rol_actual() = 'administrador');

drop policy if exists sel_folios_consecutivos on folios_consecutivos;
create policy sel_folios_consecutivos on folios_consecutivos for select to authenticated
  using (fn_rol_actual() = 'administrador');
drop policy if exists upd_folios_consecutivos on folios_consecutivos;
create policy upd_folios_consecutivos on folios_consecutivos for update to authenticated
  using (fn_rol_actual() = 'administrador') with check (fn_rol_actual() = 'administrador');
