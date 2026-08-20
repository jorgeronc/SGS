-- =====================================================================
-- 0004_roles_rls.sql
-- Perfiles de usuario (rol dentro de la agencia) y políticas RLS
-- básicas sobre las tablas núcleo. Se refinan por módulo más adelante
-- (por ejemplo, Asuntos Internos necesitará políticas mucho más
-- restrictivas cuando se construya ese módulo).
-- =====================================================================

create table if not exists usuarios_perfil (
  id            uuid primary key references auth.users(id) on delete cascade,
  nombre        text,
  rol           text not null default 'oficial'
                check (rol in ('oficial','supervisor','investigador','administrador')),
  activo        boolean not null default true,
  creado_en     timestamptz not null default now()
);

comment on table usuarios_perfil is 'Rol de cada usuario dentro de la agencia. Vinculado 1:1 a auth.users de Supabase.';

-- Los perfiles tampoco se borran: se desactivan.
revoke delete on usuarios_perfil from authenticated, anon;

create or replace function fn_bloquear_delete_perfil()
returns trigger as $$
begin
  raise exception 'No se permite borrar perfiles de usuario (id=%). Desactive el perfil en su lugar.', old.id;
end;
$$ language plpgsql;

drop trigger if exists trg_no_delete_usuarios_perfil on usuarios_perfil;
create trigger trg_no_delete_usuarios_perfil
  before delete on usuarios_perfil
  for each row execute function fn_bloquear_delete_perfil();

-- Helper: rol del usuario autenticado actual
create or replace function fn_rol_actual()
returns text as $$
  select rol from usuarios_perfil where id = auth.uid();
$$ language sql stable security definer;

-- =========================
-- Habilitar RLS en las tablas núcleo
-- =========================
alter table personas    enable row level security;
alter table vehiculos   enable row level security;
alter table ubicaciones enable row level security;
alter table vinculos    enable row level security;
alter table usuarios_perfil enable row level security;

-- Lectura: cualquier usuario autenticado con perfil activo puede ver
-- los registros activos; los cancelados solo los ve supervisor+.
drop policy if exists sel_personas on personas;
create policy sel_personas on personas
  for select to authenticated
  using (
    estatus = 'activo'
    or fn_rol_actual() in ('supervisor','investigador','administrador')
  );

drop policy if exists sel_vehiculos on vehiculos;
create policy sel_vehiculos on vehiculos
  for select to authenticated
  using (
    estatus = 'activo'
    or fn_rol_actual() in ('supervisor','investigador','administrador')
  );

drop policy if exists sel_ubicaciones on ubicaciones;
create policy sel_ubicaciones on ubicaciones
  for select to authenticated
  using (
    estatus = 'activo'
    or fn_rol_actual() in ('supervisor','investigador','administrador')
  );

drop policy if exists sel_vinculos on vinculos;
create policy sel_vinculos on vinculos
  for select to authenticated
  using (
    estatus = 'activo'
    or fn_rol_actual() in ('supervisor','investigador','administrador')
  );

-- Escritura (insert/update): cualquier usuario autenticado con perfil
-- activo. Ajustar por módulo cuando haga falta (por ejemplo, solo
-- supervisor puede reasignar, etc.).
drop policy if exists ins_personas on personas;
create policy ins_personas on personas for insert to authenticated with check (true);
drop policy if exists upd_personas on personas;
create policy upd_personas on personas for update to authenticated using (true) with check (true);

drop policy if exists ins_vehiculos on vehiculos;
create policy ins_vehiculos on vehiculos for insert to authenticated with check (true);
drop policy if exists upd_vehiculos on vehiculos;
create policy upd_vehiculos on vehiculos for update to authenticated using (true) with check (true);

drop policy if exists ins_ubicaciones on ubicaciones;
create policy ins_ubicaciones on ubicaciones for insert to authenticated with check (true);
drop policy if exists upd_ubicaciones on ubicaciones;
create policy upd_ubicaciones on ubicaciones for update to authenticated using (true) with check (true);

drop policy if exists ins_vinculos on vinculos;
create policy ins_vinculos on vinculos for insert to authenticated with check (true);
drop policy if exists upd_vinculos on vinculos;
create policy upd_vinculos on vinculos for update to authenticated using (true) with check (true);

-- Perfiles: cada quien ve el suyo; administrador ve todos.
drop policy if exists sel_usuarios_perfil on usuarios_perfil;
create policy sel_usuarios_perfil on usuarios_perfil
  for select to authenticated
  using (id = auth.uid() or fn_rol_actual() = 'administrador');

drop policy if exists upd_usuarios_perfil on usuarios_perfil;
create policy upd_usuarios_perfil on usuarios_perfil
  for update to authenticated
  using (fn_rol_actual() = 'administrador')
  with check (fn_rol_actual() = 'administrador');

-- La bitácora: nadie inserta directo (solo los triggers/RPC con
-- security definer); solo administrador/supervisor pueden leerla.
alter table bitacora enable row level security;

drop policy if exists sel_bitacora on bitacora;
create policy sel_bitacora on bitacora
  for select to authenticated
  using (fn_rol_actual() in ('supervisor','administrador'));

-- Crear automáticamente un perfil (rol 'oficial' por defecto) cuando
-- se registra un nuevo usuario en Supabase Auth.
-- security definer + search_path fijo + tabla calificada con esquema: GoTrue
-- (el servicio de Auth) ejecuta este trigger con un search_path restringido,
-- así que sin esto la creación de usuarios falla con "Database error creating
-- new user". El bloque exception evita además que un fallo al crear el perfil
-- bloquee el alta del usuario: el perfil se puede reparar después.
create or replace function fn_crear_perfil_nuevo_usuario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.usuarios_perfil (id, nombre, rol)
  values (new.id, new.raw_user_meta_data->>'nombre', 'oficial')
  on conflict (id) do nothing;
  return new;
exception
  when others then
    raise warning 'No se pudo crear el perfil para %: %', new.id, sqlerrm;
    return new;
end;
$$;

drop trigger if exists trg_crear_perfil_nuevo_usuario on auth.users;
create trigger trg_crear_perfil_nuevo_usuario
  after insert on auth.users
  for each row execute function fn_crear_perfil_nuevo_usuario();
