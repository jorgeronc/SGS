-- =====================================================================
-- 0108_menu_por_usuario.sql
-- Visibilidad de módulos del menú lateral POR CUENTA (viaja con el usuario, no
-- con el navegador). Cada usuario puede ocultar módulos de su menú.
--   * usuarios_perfil.menu_oculto: arreglo JSON de hrefs ocultos.
--   * rpc_set_menu_oculto: el usuario guarda SU propia preferencia (definer, solo
--     toca menu_oculto de auth.uid — no permite cambiar rol, cuyo UPDATE sigue
--     restringido a administrador por RLS de 0004).
-- =====================================================================

alter table usuarios_perfil add column if not exists menu_oculto jsonb not null default '[]'::jsonb;
comment on column usuarios_perfil.menu_oculto is 'Hrefs de módulos que el usuario ocultó de su menú lateral (preferencia por cuenta).';

create or replace function rpc_set_menu_oculto(p_oculto jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sesión no válida.'; end if;
  update usuarios_perfil
     set menu_oculto = coalesce(p_oculto, '[]'::jsonb)
   where id = auth.uid();
end $$;
grant execute on function rpc_set_menu_oculto(jsonb) to authenticated;
comment on function rpc_set_menu_oculto is 'Guarda la preferencia de módulos ocultos del USUARIO ACTUAL (auth.uid). No modifica rol.';
