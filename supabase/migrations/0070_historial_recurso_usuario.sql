-- =====================================================================
-- 0070_historial_recurso_usuario.sql
-- El HISTORIAL de atención ahora nombra el RECURSO despachado (no "unidad") y
-- marca si fue el contacto a una AUTORIDAD. Además fn_usuario_actual devuelve el
-- NOMBRE del usuario (perfil) en lugar del correo. Complementa 0041 y 0069.
-- =====================================================================

alter table cad_estado_historial
  add column if not exists recurso_desc text,                       -- etiqueta del recurso despachado/contactado
  add column if not exists es_contacto  boolean not null default false;  -- true = contacto a autoridad

-- Usuario que provoca el cambio: se prefiere el NOMBRE del perfil; si no hay,
-- el correo del JWT. (Antes devolvía solo el correo.)
create or replace function fn_usuario_actual() returns text
language sql stable security definer set search_path = public, auth as $$
  select coalesce(
    (select nullif(p.nombre, '') from usuarios_perfil p where p.id = auth.uid()),
    nullif(auth.jwt() ->> 'email', ''),
    null
  );
$$;

-- Despacho: registrar el recurso (guardia / supervisor / recurso propio) o el
-- contacto a una autoridad, con su descripción legible y la marca es_contacto.
create or replace function fn_hist_despacho() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_num text; v_desc text;
begin
  select numero into v_num from patrullas where id = new.patrulla_id;
  v_desc := coalesce(new.recurso_nombre, case when v_num is not null then 'Unidad #' || v_num else null end);
  if tg_op = 'INSERT' then
    insert into cad_estado_historial (llamada_id, despacho_id, ambito, campo, estado, patrulla_numero, recurso_desc, es_contacto, usuario)
      values (new.llamada_id, new.id, 'despacho', 'estado', new.estado, v_num, v_desc, coalesce(new.es_contacto, false), fn_usuario_actual());
    return new;
  end if;
  if new.estado is distinct from old.estado then
    insert into cad_estado_historial (llamada_id, despacho_id, ambito, campo, estado, patrulla_numero, recurso_desc, es_contacto, usuario)
      values (new.llamada_id, new.id, 'despacho', 'estado', new.estado, v_num, v_desc, coalesce(new.es_contacto, false), fn_usuario_actual());
  end if;
  return new;
end;
$$;
