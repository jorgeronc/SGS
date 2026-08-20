-- =====================================================================
-- 0023_cad_narrativas.sql
-- Narrativas del CAD: registro append-only (WORM) de lo que reporta el oficial
-- que atiende un incidente/llamada. Cada narrativa guarda fecha/hora y usuario.
-- Se usa desde la web (detalle de la llamada) y desde la app móvil (despacho).
-- =====================================================================

create table if not exists narrativas_cad (
  id            bigint generated always as identity primary key,
  llamada_id    uuid not null references llamadas_cad(id),
  texto         text not null,
  usuario_id    uuid,
  usuario_email text,
  creado_en     timestamptz not null default now()
);

comment on table narrativas_cad is 'Narrativas (bitácora append-only) del oficial que atiende una llamada/incidente del CAD.';

create index if not exists idx_narrativas_cad_llamada on narrativas_cad (llamada_id, creado_en desc);

-- WORM: una vez registrada, no se modifica ni se borra.
-- (fn_bloquear_cambios_append_only se definió en 0015_incidentes.sql)
drop trigger if exists trg_narrativas_cad_worm on narrativas_cad;
create trigger trg_narrativas_cad_worm before update or delete on narrativas_cad
  for each row execute function fn_bloquear_cambios_append_only();

revoke update, delete on narrativas_cad from authenticated, anon;

alter table narrativas_cad enable row level security;

drop policy if exists sel_narrativas_cad on narrativas_cad;
create policy sel_narrativas_cad on narrativas_cad for select to authenticated using (true);
drop policy if exists ins_narrativas_cad on narrativas_cad;
create policy ins_narrativas_cad on narrativas_cad for insert to authenticated with check (true);

-- Registra una narrativa resolviendo el usuario (auth.uid + correo) en el
-- servidor, y devuelve la fila insertada.
create or replace function rpc_registrar_narrativa_cad(p_llamada uuid, p_texto text)
returns table (id bigint, llamada_id uuid, texto text, usuario_email text, creado_en timestamptz)
language plpgsql security definer set search_path = public, auth as $$
declare v_email text;
begin
  if coalesce(trim(p_texto), '') = '' then
    raise exception 'La narrativa no puede estar vacía.';
  end if;
  select u.email into v_email from auth.users u where u.id = auth.uid();
  return query
  insert into narrativas_cad (llamada_id, texto, usuario_id, usuario_email)
  values (p_llamada, p_texto, auth.uid(), v_email)
  returning narrativas_cad.id, narrativas_cad.llamada_id, narrativas_cad.texto, narrativas_cad.usuario_email, narrativas_cad.creado_en;
end;
$$;
