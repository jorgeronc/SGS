-- =====================================================================
-- 0002_bitacora.sql
-- Bitácora de auditoría transversal: usuario, computadora, timestamp,
-- tipo de acción, IP, valores antes/después.
-- =====================================================================

create table if not exists bitacora (
  id                  bigint generated always as identity primary key,
  usuario_id          uuid,             -- auth.uid() de quien hizo la acción
  computadora_id      text,             -- ver lib/deviceId.ts en el frontend; PENDIENTE
                                         -- pasar a catálogo de dispositivos registrados por TI
  ip_address          text,
  tipo_accion         text not null,    -- INSERT | UPDATE | CANCELAR | CONSULTAR | EXPORTAR | IMPRIMIR | LOGIN | LOGOUT
  entidad_tipo        text not null,    -- nombre de tabla o módulo
  entidad_id          uuid,
  valores_anteriores  jsonb,
  valores_nuevos      jsonb,
  modulo              text,
  creado_en           timestamptz not null default now()
);

comment on table bitacora is 'Bitácora de auditoría de todo el sistema. No se borra nunca (ni siquiera se cancela: es el registro de lo que pasó).';

create index if not exists idx_bitacora_usuario on bitacora (usuario_id);
create index if not exists idx_bitacora_entidad on bitacora (entidad_tipo, entidad_id);
create index if not exists idx_bitacora_creado_en on bitacora (creado_en);

-- La bitácora tampoco se puede alterar ni borrar una vez escrita.
create or replace function fn_bloquear_cambios_bitacora()
returns trigger as $$
begin
  raise exception 'La bitácora de auditoría es de solo escritura: no se puede modificar ni borrar (tabla %, operación %)', tg_table_name, tg_op;
end;
$$ language plpgsql;

drop trigger if exists trg_bitacora_no_update on bitacora;
create trigger trg_bitacora_no_update
  before update or delete on bitacora
  for each row execute function fn_bloquear_cambios_bitacora();

-- =====================================================================
-- Función de auditoría genérica, para adjuntar como trigger AFTER
-- INSERT/UPDATE en cada tabla núcleo (personas, vehiculos, ubicaciones,
-- vinculos, y cualquier tabla nueva que se agregue a futuro).
--
-- Usuario:      auth.uid() (lo resuelve Supabase Auth automáticamente)
-- IP / device:  se leen de los headers de la petición HTTP, expuestos
--               por PostgREST como el GUC "request.headers". El frontend
--               debe enviar el header `x-device-id` en cada llamada
--               (ver lib/supabaseClient.ts). La IP normalmente llega en
--               `x-forwarded-for`.
--
-- IMPORTANTE: hay que confirmar, ya conectados a un proyecto Supabase
-- real, que "request.headers" efectivamente trae estos valores (depende
-- de la configuración de PostgREST/Supabase). Si no llegan, hay que
-- ajustar esta función o mover la captura de IP/device a una llamada
-- RPC explícita antes de cada operación.
-- =====================================================================
create or replace function fn_bitacora_generica()
returns trigger as $$
declare
  v_headers     json;
  v_ip          text;
  v_device      text;
  v_usuario     uuid;
  v_entidad_id  uuid;
begin
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    v_headers := null;
  end;

  v_ip     := coalesce(v_headers->>'x-forwarded-for', v_headers->>'cf-connecting-ip');
  v_device := v_headers->>'x-device-id';

  begin
    v_usuario := auth.uid();
  exception when others then
    v_usuario := null;
  end;

  if tg_op = 'DELETE' then
    v_entidad_id := old.id;
  else
    v_entidad_id := new.id;
  end if;

  insert into bitacora (
    usuario_id, computadora_id, ip_address, tipo_accion,
    entidad_tipo, entidad_id, valores_anteriores, valores_nuevos, modulo
  ) values (
    v_usuario,
    v_device,
    v_ip,
    tg_op,
    tg_table_name,
    v_entidad_id,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end,
    tg_table_name
  );

  return coalesce(new, old);
end;
$$ language plpgsql security definer;

-- Adjuntar la auditoría a cada tabla núcleo
drop trigger if exists trg_auditoria_personas on personas;
create trigger trg_auditoria_personas
  after insert or update on personas
  for each row execute function fn_bitacora_generica();

drop trigger if exists trg_auditoria_vehiculos on vehiculos;
create trigger trg_auditoria_vehiculos
  after insert or update on vehiculos
  for each row execute function fn_bitacora_generica();

drop trigger if exists trg_auditoria_ubicaciones on ubicaciones;
create trigger trg_auditoria_ubicaciones
  after insert or update on ubicaciones
  for each row execute function fn_bitacora_generica();

drop trigger if exists trg_auditoria_vinculos on vinculos;
create trigger trg_auditoria_vinculos
  after insert or update on vinculos
  for each row execute function fn_bitacora_generica();

-- Nota: las acciones que NO disparan INSERT/UPDATE (consultar, exportar,
-- imprimir, iniciar/cerrar sesión) se registran desde el frontend/API
-- llamando a la función rpc_registrar_bitacora() de abajo.
create or replace function rpc_registrar_bitacora(
  p_tipo_accion  text,
  p_entidad_tipo text,
  p_entidad_id   uuid default null,
  p_modulo       text default null
) returns void as $$
declare
  v_headers json;
begin
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    v_headers := null;
  end;

  insert into bitacora (usuario_id, computadora_id, ip_address, tipo_accion, entidad_tipo, entidad_id, modulo)
  values (
    auth.uid(),
    v_headers->>'x-device-id',
    coalesce(v_headers->>'x-forwarded-for', v_headers->>'cf-connecting-ip'),
    p_tipo_accion,
    p_entidad_tipo,
    p_entidad_id,
    p_modulo
  );
end;
$$ language plpgsql security definer;
