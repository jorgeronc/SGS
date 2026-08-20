-- ---------------------------------------------------------------------
-- 0036 · Secreto de push en tabla privada (reemplaza el GUC app.push_secret)
-- ---------------------------------------------------------------------
-- En Supabase el rol del editor SQL no puede `alter database ... set ...`
-- (permission denied). Guardamos el secreto en una tabla privada que solo el
-- rol de servicio / funciones SECURITY DEFINER pueden leer.
--
-- Configurar el secreto (una vez), en el editor SQL:
--   insert into app_secretos (clave, valor) values ('push_secret', '<SECRETO>')
--   on conflict (clave) do update set valor = excluded.valor, actualizado_en = now();
-- Debe coincidir con el secreto de la función:  supabase secrets set PUSH_SECRET=<SECRETO>
-- ---------------------------------------------------------------------

create table if not exists app_secretos (
  clave           text primary key,
  valor           text not null,
  actualizado_en  timestamptz not null default now()
);
comment on table app_secretos is 'Secretos internos del backend (ej. push_secret). RLS sin políticas: solo el rol de servicio y funciones SECURITY DEFINER lo leen.';

-- RLS habilitado y SIN políticas: anon/authenticated no pueden leerlo.
alter table app_secretos enable row level security;

-- Reemplaza la función del disparador para leer el secreto de la tabla.
create or replace function fn_push_despacho() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_secret text := (select valor from app_secretos where clave = 'push_secret');
  v_url    text := 'https://okhsniabwiukjyjhmeav.supabase.co/functions/v1/enviar_push';
  v_titulo text;
  v_cuerpo text;
  v_folio  text;
begin
  -- Sin destinatario o sin secreto configurado: no hace nada.
  if new.personal_id is null or coalesce(v_secret, '') = '' then
    return new;
  end if;

  -- En UPDATE solo notifica si cambió el estado.
  if tg_op = 'UPDATE' and new.estado is not distinct from old.estado then
    return new;
  end if;

  select l.folio into v_folio from llamadas_cad l where l.id = new.llamada_id;

  if tg_op = 'INSERT' then
    v_titulo := 'Nuevo incidente asignado';
    v_cuerpo := coalesce('Folio ' || v_folio || ' · ', '') || 'Se te asignó un despacho.';
  else
    v_titulo := 'Despacho actualizado';
    v_cuerpo := coalesce('Folio ' || v_folio || ' · ', '') || 'Estado: ' || coalesce(new.estado, '—') || '.';
  end if;

  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
    body    := jsonb_build_object(
      'personal_id', new.personal_id,
      'tipo',        'despacho',
      'titulo',      v_titulo,
      'cuerpo',      v_cuerpo,
      'data',        jsonb_build_object('tipo', 'despacho', 'despacho_id', new.id)
    )
  );
  return new;
end;
$$;
