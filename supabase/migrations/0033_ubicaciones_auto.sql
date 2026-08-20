-- =====================================================================
-- 0033_ubicaciones_auto.sql
-- Respalda en `ubicaciones` las direcciones de los reportes (llamadas_cad),
-- incidentes y accidentes, y las liga con `vinculos` (tipo_relacion 'LUGAR'),
-- para que al buscar un domicilio (en Ubicaciones o en la búsqueda general) se
-- encuentren todos los registros del mismo lugar.
--
-- Dedup POR TEXTO de dirección normalizado (minúsculas, sin espacios extra):
-- una misma dirección = una sola ubicación. Las ubicaciones creadas aquí llevan
-- datos_adicionales.origen = 'auto_registro' y la clave dir_norm para deduplicar.
-- Incluye trigger para ligar automáticamente los registros FUTUROS.
-- =====================================================================

-- Normaliza una dirección de texto libre (o null si queda vacía).
create or replace function fn_norm_dir(p text)
returns text language sql immutable as $$
  select nullif(lower(regexp_replace(btrim(coalesce(p, '')), '\s+', ' ', 'g')), '')
$$;

-- Encuentra (o crea) la ubicación de una dirección y la liga a un registro.
create or replace function fn_ligar_ubicacion(
  p_tipo text, p_id uuid, p_dir text, p_lat double precision, p_lng double precision
) returns void language plpgsql security definer set search_path = public as $$
declare v_norm text; v_ubic uuid;
begin
  v_norm := fn_norm_dir(p_dir);
  if v_norm is null then return; end if;

  select id into v_ubic from ubicaciones
    where estatus = 'activo' and datos_adicionales->>'dir_norm' = v_norm
    limit 1;

  if v_ubic is null then
    insert into ubicaciones (calle, latitud, longitud, datos_adicionales)
      values (btrim(p_dir), p_lat, p_lng, jsonb_build_object('origen', 'auto_registro', 'dir_norm', v_norm))
      returning id into v_ubic;
  elsif p_lat is not null then
    -- Completa coordenadas si la ubicación aún no las tenía.
    update ubicaciones set latitud = p_lat, longitud = p_lng, actualizado_en = now()
      where id = v_ubic and latitud is null;
  end if;

  if not exists (
    select 1 from vinculos
     where entidad_origen_tipo = p_tipo and entidad_origen_id = p_id
       and entidad_destino_tipo = 'ubicacion' and entidad_destino_id = v_ubic
       and estatus = 'activo'
  ) then
    insert into vinculos (entidad_origen_tipo, entidad_origen_id, entidad_destino_tipo, entidad_destino_id, tipo_relacion)
      values (p_tipo, p_id, 'ubicacion', v_ubic, 'LUGAR');
  end if;
end $$;

-- Trigger genérico: mapea la tabla a su tipo de entidad y liga la ubicación.
create or replace function fn_trg_ubicacion_registro()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_tipo text;
begin
  v_tipo := case tg_table_name
    when 'llamadas_cad' then 'cad'
    when 'incidentes'   then 'incidente'
    when 'accidentes'   then 'accidente'
    else tg_table_name end;
  perform fn_ligar_ubicacion(v_tipo, new.id, new.direccion, new.latitud, new.longitud);
  return new;
end $$;

-- Se dispara al crear el registro o al cambiar su dirección/coordenadas.
drop trigger if exists trg_ubicacion on llamadas_cad;
create trigger trg_ubicacion after insert or update of direccion, latitud, longitud on llamadas_cad
  for each row execute function fn_trg_ubicacion_registro();

drop trigger if exists trg_ubicacion on incidentes;
create trigger trg_ubicacion after insert or update of direccion, latitud, longitud on incidentes
  for each row execute function fn_trg_ubicacion_registro();

drop trigger if exists trg_ubicacion on accidentes;
create trigger trg_ubicacion after insert or update of direccion, latitud, longitud on accidentes
  for each row execute function fn_trg_ubicacion_registro();

-- Respaldo de lo YA existente (idempotente: se puede volver a correr sin duplicar).
do $$
declare r record; t text; v_tipo text;
begin
  foreach t in array array['llamadas_cad', 'incidentes', 'accidentes'] loop
    v_tipo := case t when 'llamadas_cad' then 'cad' when 'incidentes' then 'incidente' when 'accidentes' then 'accidente' end;
    for r in execute format(
      'select id, direccion, latitud, longitud from %I where estatus = ''activo'' and fn_norm_dir(direccion) is not null', t
    ) loop
      perform fn_ligar_ubicacion(v_tipo, r.id, r.direccion, r.latitud, r.longitud);
    end loop;
  end loop;
end $$;
