-- =====================================================================
-- 0003_no_delete.sql
-- Ningún registro núcleo se borra físicamente jamás: solo se cancela
-- (estatus = 'cancelado'). Esto se refuerza a nivel de base de datos
-- con dos mecanismos independientes, por si uno falla:
--   1) Trigger BEFORE DELETE que rechaza la operación.
--   2) Revocar el privilegio DELETE a los roles de la aplicación.
-- =====================================================================

create or replace function fn_bloquear_delete()
returns trigger as $$
begin
  raise exception
    'No se permite borrar registros de "%" (id=%). Use la cancelación (estatus = ''cancelado'') en su lugar.',
    tg_table_name, old.id;
end;
$$ language plpgsql;

drop trigger if exists trg_no_delete_personas on personas;
create trigger trg_no_delete_personas
  before delete on personas
  for each row execute function fn_bloquear_delete();

drop trigger if exists trg_no_delete_vehiculos on vehiculos;
create trigger trg_no_delete_vehiculos
  before delete on vehiculos
  for each row execute function fn_bloquear_delete();

drop trigger if exists trg_no_delete_ubicaciones on ubicaciones;
create trigger trg_no_delete_ubicaciones
  before delete on ubicaciones
  for each row execute function fn_bloquear_delete();

drop trigger if exists trg_no_delete_vinculos on vinculos;
create trigger trg_no_delete_vinculos
  before delete on vinculos
  for each row execute function fn_bloquear_delete();

-- Capa 2: quitar el privilegio DELETE a los roles que usa la aplicación.
-- Nota: el rol "service_role" de Supabase usa un rol de Postgres con
-- BYPASSRLS, pero el privilegio DELETE y los triggers BEFORE DELETE
-- siguen aplicando salvo que alguien tenga acceso directo como el rol
-- "postgres" (superusuario) — por eso el trigger es la protección real.
revoke delete on personas, vehiculos, ubicaciones, vinculos from authenticated, anon;

-- Función de ayuda para "cancelar" un registro de forma estándar,
-- para usarla desde el frontend en vez de un UPDATE manual repetido
-- en cada módulo.
create or replace function rpc_cancelar_registro(
  p_tabla   text,
  p_id      uuid,
  p_motivo  text
) returns void as $$
begin
  if p_tabla not in ('personas','vehiculos','ubicaciones','vinculos') then
    raise exception 'Tabla no reconocida: %', p_tabla;
  end if;

  execute format(
    'update %I set estatus = ''cancelado'', cancelado_en = now(), motivo_cancelacion = $1, actualizado_en = now() where id = $2',
    p_tabla
  ) using p_motivo, p_id;
end;
$$ language plpgsql security definer;
