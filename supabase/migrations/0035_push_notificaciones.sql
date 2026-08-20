-- ---------------------------------------------------------------------
-- 0035 · Notificaciones push (Expo) para incidentes asignados/actualizados
-- ---------------------------------------------------------------------
-- Guarda el token de Expo por dispositivo y dispara una Edge Function
-- (enviar_push) cuando un despacho se asigna o cambia de estado.
--
-- Requiere configurar UNA vez (fuera del repo por ser secreto):
--   alter database postgres set app.push_secret = '<UN_SECRETO_LARGO>';
-- y el mismo valor como secreto de la función:
--   supabase secrets set PUSH_SECRET=<UN_SECRETO_LARGO>
-- Además desplegar la función sin verificación de JWT:
--   supabase functions deploy enviar_push --no-verify-jwt
-- ---------------------------------------------------------------------

-- pg_net expone sus funciones en el esquema `net` (net.http_post).
create extension if not exists pg_net;

-- 1) Tokens de push por dispositivo -----------------------------------
create table if not exists dispositivos_push (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  personal_id       uuid references personal(id) on delete set null,
  expo_push_token   text not null unique,
  plataforma        text,
  creado_en         timestamptz not null default now(),
  actualizado_en    timestamptz not null default now()
);
create index if not exists idx_dispositivos_push_personal on dispositivos_push (personal_id);

comment on table dispositivos_push is 'Token de Expo Push por dispositivo, ligado al usuario y a su elemento (personal) para dirigir notificaciones de asignación.';

alter table dispositivos_push enable row level security;

-- Cada usuario administra solo sus propios dispositivos.
drop policy if exists dp_select_own on dispositivos_push;
create policy dp_select_own on dispositivos_push for select using (user_id = auth.uid());
drop policy if exists dp_insert_own on dispositivos_push;
create policy dp_insert_own on dispositivos_push for insert with check (user_id = auth.uid());
drop policy if exists dp_update_own on dispositivos_push;
create policy dp_update_own on dispositivos_push for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists dp_delete_own on dispositivos_push;
create policy dp_delete_own on dispositivos_push for delete using (user_id = auth.uid());

-- 2) Disparador que invoca la Edge Function ---------------------------
create or replace function fn_push_despacho() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_secret text := current_setting('app.push_secret', true);
  v_url    text := 'https://rdyjjfbehjfggpldmmur.supabase.co/functions/v1/enviar_push';
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

drop trigger if exists trg_push_despacho_ins on despachos;
create trigger trg_push_despacho_ins
  after insert on despachos
  for each row execute function fn_push_despacho();

drop trigger if exists trg_push_despacho_upd on despachos;
create trigger trg_push_despacho_upd
  after update on despachos
  for each row execute function fn_push_despacho();
