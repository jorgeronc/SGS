-- =====================================================================
-- 0119_bitacora_retencion.sql  (Fase E: auditoría)
-- * Parámetro de retención de bitácora (informativo; NO se borra — la bitácora es
--   WORM). Default 365 días. Lo edita el administrador.
-- * rpc_registrar_bitacora ahora acepta un snapshot opcional (p_valores) para
--   registrar el CONTENIDO del registro consultado/abierto (CONSULTAR).
-- Nota: el antes/después de INSERT/UPDATE ya se guarda COMPLETO vía to_jsonb en
-- fn_bitacora_generica (0002); el truncado era solo de la pantalla.
-- =====================================================================

alter table config_sistema add column if not exists bitacora_retencion_dias integer not null default 365;
comment on column config_sistema.bitacora_retencion_dias is 'Días de bitácora a conservar (informativo; la bitácora es WORM y no se purga automáticamente). Default 365.';

-- Recrea rpc_registrar_bitacora con snapshot opcional del registro consultado.
drop function if exists rpc_registrar_bitacora(text, text, uuid, text);
create or replace function rpc_registrar_bitacora(
  p_tipo_accion  text,
  p_entidad_tipo text,
  p_entidad_id   uuid  default null,
  p_modulo       text  default null,
  p_valores      jsonb default null
) returns void as $$
declare v_headers json;
begin
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    v_headers := null;
  end;

  insert into bitacora (usuario_id, computadora_id, ip_address, tipo_accion, entidad_tipo, entidad_id, modulo, valores_nuevos)
  values (
    auth.uid(),
    v_headers->>'x-device-id',
    coalesce(v_headers->>'x-forwarded-for', v_headers->>'cf-connecting-ip'),
    p_tipo_accion,
    p_entidad_tipo,
    p_entidad_id,
    p_modulo,
    p_valores
  );
end;
$$ language plpgsql security definer;
