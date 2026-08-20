-- =====================================================================
-- perfil_usuario.sql
-- Asigna rol y asegura el perfil de un usuario YA CREADO en Supabase Auth.
--
-- Pasos:
--   1) Crea el usuario en el panel: Authentication -> Users -> "Add user".
--      Pon correo y contraseña y MARCA "Auto Confirm User" (si no, no podrá
--      entrar hasta confirmar el correo).
--   2) Cambia el correo de abajo por el del usuario y corre este SQL en el
--      editor SQL de Supabase.
--
-- Roles válidos: 'oficial','supervisor','investigador','administrador','asuntos_internos'.
-- Para la app móvil/demo, 'administrador' o 'supervisor' ve todos los módulos.
-- =====================================================================

insert into public.usuarios_perfil (id, nombre, rol, activo)
select u.id, coalesce(u.raw_user_meta_data->>'nombre', 'Usuario demo'), 'administrador', true
from auth.users u
where u.email = 'CAMBIA_ESTE_CORREO@ejemplo.com'
on conflict (id) do update
  set rol = excluded.rol,
      activo = true;

-- Verifica el resultado:
-- select u.email, p.rol, p.activo
-- from auth.users u join public.usuarios_perfil p on p.id = u.id
-- where u.email = 'CAMBIA_ESTE_CORREO@ejemplo.com';
