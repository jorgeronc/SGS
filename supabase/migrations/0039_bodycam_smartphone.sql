-- =====================================================================
-- 0039_bodycam_smartphone.sql · Vincular el smartphone (bodycam) al oficial
--
-- Cada teléfono con la app es una bodycam tipo 'Smartphone' en el inventario,
-- asignada a un oficial (bodycams.asignado_personal_id). La app valida que el
-- teléfono esté registrado y atado a ESTE dispositivo, y usa su folio como el
-- "número de bodycam" en el despacho, la transmisión y la evidencia.
-- =====================================================================

-- 1) Clasificación 'Smartphone' (catálogo de tipo de bodycam)
insert into cat_opciones (categoria, valor, orden) values
  ('tipo_bodycam','Smartphone',1),
  ('tipo_bodycam','Bodycam portátil',2),
  ('tipo_bodycam','Bodycam fija',3)
on conflict (categoria, valor) do nothing;

-- 2) La transmisión guarda la bodycam de origen.
alter table transmisiones add column if not exists bodycam_id uuid references bodycams(id);
alter table transmisiones add column if not exists bodycam_folio text;

-- 3) Validación + vinculación del smartphone al registro de bodycam.
--    p_device_id: identificador único del teléfono (lo obtiene la app).
--    Devuelve jsonb: { ok, folio, bodycam_id, vinculado?, motivo? }.
--    security definer para poder escribir el vínculo saltando RLS.
create or replace function rpc_validar_bodycam(
  p_personal_id uuid,
  p_device_id   text,
  p_plataforma  text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  bc  record;
  dev text;
begin
  if p_personal_id is null or coalesce(p_device_id, '') = '' then
    return jsonb_build_object('ok', false, 'motivo', 'datos_incompletos');
  end if;

  select * into bc from bodycams
   where estatus = 'activo'
     and asignado_personal_id = p_personal_id
     and lower(coalesce(tipo, '')) = 'smartphone'
   order by creado_en
   limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'sin_bodycam');
  end if;

  dev := bc.datos_adicionales->>'device_id';

  if coalesce(dev, '') = '' then
    -- Primera vinculación: se ata este teléfono a la bodycam del oficial.
    update bodycams
       set datos_adicionales = coalesce(datos_adicionales, '{}'::jsonb)
             || jsonb_build_object('device_id', p_device_id, 'device_plataforma', p_plataforma, 'device_vinculado_en', now()),
           estado_equipo = case when estado_equipo = 'operativo' then 'asignado' else estado_equipo end,
           actualizado_en = now()
     where id = bc.id;
    return jsonb_build_object('ok', true, 'vinculado', true, 'folio', bc.folio, 'bodycam_id', bc.id);
  elsif dev = p_device_id then
    return jsonb_build_object('ok', true, 'folio', bc.folio, 'bodycam_id', bc.id);
  else
    return jsonb_build_object('ok', false, 'motivo', 'otro_dispositivo', 'folio', bc.folio);
  end if;
end;
$$;

-- 4) Desvincular (admin) cuando el oficial cambia de teléfono.
--    Uso: select rpc_desvincular_bodycam('<folio o id>');
create or replace function rpc_desvincular_bodycam(p_bodycam text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update bodycams
     set datos_adicionales = (coalesce(datos_adicionales, '{}'::jsonb)
           - 'device_id' - 'device_plataforma' - 'device_vinculado_en'),
         actualizado_en = now()
   where folio = p_bodycam or id::text = p_bodycam;
end;
$$;
