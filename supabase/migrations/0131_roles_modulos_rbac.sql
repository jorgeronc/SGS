-- =====================================================================
-- 0131_roles_modulos_rbac.sql · RBAC por rol (dentro de un solo despliegue)
-- Catálogo de ROLES ampliable por el administrador + matriz rol→MÓDULOS
-- (hrefs del menú) que la web usa para filtrar el menú y bloquear rutas.
--   * modulos = null  → sin restricción (ve todo)  [roles de sistema legados/admin]
--   * modulos = [..]  → solo esos módulos (hrefs)
-- Enforcement de datos (RLS por módulo/sitio) queda para una fase posterior.
-- =====================================================================

create table if not exists roles (
  clave          text primary key,
  nombre         text not null,
  modulos        jsonb,                       -- null = todos; array de hrefs = restringido
  es_sistema     boolean not null default false,
  activo         boolean not null default true,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
comment on table roles is 'Catálogo de roles y su matriz de módulos permitidos (hrefs del menú). modulos null = sin restricción.';

-- Roles de sistema + plantillas iniciales de módulos por rol operativo.
insert into roles (clave, nombre, es_sistema, modulos) values
  ('administrador','Administrador', true, null),
  ('coordinador','Coordinador', true,
    '["/","/copiloto","/cumplimiento","/contratos/tablero","/supervisores","/cad","/mapa-operacional","/videovigilancia","/chat","/directorio","/evidencias","/alertas","/sitios","/puntos-control","/rondines/programados","/tareas","/rondines","/supervision","/turnos","/accesos","/citas","/citas-visitantes","/credenciales","/transportistas","/zonas","/clientes","/contratos","/sla","/personal","/patrullas","/reporte-horas","/reporte-sla"]'::jsonb),
  ('operador','Operador de central', true,
    '["/","/cad","/mapa-operacional","/videovigilancia","/chat","/directorio","/evidencias","/alertas"]'::jsonb),
  ('supervisor','Supervisor', true,
    '["/","/supervision","/supervisores","/rondines","/rondines/programados","/turnos","/tareas","/chat","/mapa-operacional"]'::jsonb),
  ('guardia','Guardia', true, '["/","/chat"]'::jsonb),
  ('oficial','Oficial', true, null),
  ('investigador','Investigador', true, null),
  ('asuntos_internos','Asuntos internos', true, null)
on conflict (clave) do nothing;

-- La columna rol ya no se limita por CHECK: los roles válidos viven en el catálogo.
alter table usuarios_perfil drop constraint if exists usuarios_perfil_rol_check;

alter table roles enable row level security;
drop policy if exists sel_roles on roles;
create policy sel_roles on roles for select to authenticated using (true);
drop policy if exists ins_roles on roles;
create policy ins_roles on roles for insert to authenticated with check (coalesce(fn_rol_actual(), '') = 'administrador');
drop policy if exists upd_roles on roles;
create policy upd_roles on roles for update to authenticated using (coalesce(fn_rol_actual(), '') = 'administrador') with check (coalesce(fn_rol_actual(), '') = 'administrador');

-- Crear/renombrar rol (admin). Clave normalizada (minúsculas, sin espacios).
create or replace function rpc_crear_rol(p_clave text, p_nombre text)
returns void language plpgsql security definer set search_path = public as $$
declare v_clave text;
begin
  if coalesce(fn_rol_actual(), '') <> 'administrador' then raise exception 'Solo el administrador.'; end if;
  v_clave := regexp_replace(lower(trim(coalesce(p_clave, ''))), '[^a-z0-9_]+', '_', 'g');
  if v_clave = '' then raise exception 'Clave de rol inválida.'; end if;
  insert into roles (clave, nombre) values (v_clave, coalesce(nullif(trim(p_nombre), ''), v_clave))
  on conflict (clave) do update set nombre = excluded.nombre, actualizado_en = now();
end;
$$;

-- Fijar los módulos permitidos de un rol (admin). p_modulos null = sin restricción.
create or replace function rpc_set_rol_modulos(p_clave text, p_modulos jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(fn_rol_actual(), '') <> 'administrador' then raise exception 'Solo el administrador.'; end if;
  update roles set modulos = p_modulos, actualizado_en = now() where clave = p_clave;
  if not found then raise exception 'Rol no encontrado: %', p_clave; end if;
end;
$$;

-- Validación de rol ahora contra el catálogo (reemplaza la whitelist fija de 0115).
create or replace function rpc_admin_actualizar_usuario(
  p_user   uuid,
  p_nombre text,
  p_rol    text,
  p_activo boolean
) returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(fn_rol_actual(), '') <> 'administrador' then
    raise exception 'Solo el administrador puede modificar usuarios.';
  end if;
  if not exists (select 1 from roles where clave = p_rol and activo) then
    raise exception 'Rol no válido: %', p_rol;
  end if;
  if p_user = auth.uid() and (p_rol <> 'administrador' or p_activo = false) then
    raise exception 'No puedes quitarte tu propio acceso de administrador.';
  end if;
  update usuarios_perfil set nombre = p_nombre, rol = p_rol, activo = p_activo where id = p_user;
end;
$$;

grant execute on function rpc_crear_rol(text, text) to authenticated;
grant execute on function rpc_set_rol_modulos(text, jsonb) to authenticated;
