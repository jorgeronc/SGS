-- =====================================================================
-- 0106_tareas_guardias.sql
-- Adapta el módulo de TAREAS al contexto de SEGURIDAD PRIVADA (guardias).
-- Antes las tareas se asignaban a "unidades/patrullas" (contexto policial de SCP).
-- Aquí:
--   * Tipos de tarea de guardia (cat_opciones), y se desactivan los policiales.
--   * rpc_asignar_tarea_guardias: asigna por GUARDIA(s) y/o por SITIO (todos los
--     guardias con turno vigente hoy en ese sitio), insertando personal_id. El
--     trigger de push (fn_push_tarea, 0037) notifica a cada guardia y el móvil ya
--     lee "Mis tareas" por personal_id.
-- No cambia el esquema de tareas/tarea_asignaciones (0037): reutiliza personal_id.
-- =====================================================================

-- 1) Tipos de tarea para guardias (editables en Catálogos) --------------------
insert into cat_opciones (categoria, valor, orden) values
  ('tipo_tarea','Revisión de área',10),
  ('tipo_tarea','Verificar reporte',11),
  ('tipo_tarea','Apoyo a otra área',12),
  ('tipo_tarea','Mantenimiento a revisar',13),
  ('tipo_tarea','Entrega / recado',14),
  ('tipo_tarea','Control de acceso',15),
  ('tipo_tarea','Reporte de novedades',16)
on conflict (categoria, valor) do nothing;

-- Desactiva los tipos policiales heredados (no se borran; dejan de aparecer).
update cat_opciones set activo = false
 where categoria = 'tipo_tarea'
   and valor in ('Búsqueda de persona','Orden de protección','Verificación de domicilio',
                 'Vigilancia de punto','Traslado','Apoyo a otra unidad');

-- 2) Asignar una tarea a guardias específicos y/o a todos los de un sitio ------
-- p_personal: ids de guardias (personal) a asignar directamente.
-- p_sitio:    si viene, agrega a TODOS los guardias con turno vigente HOY en él.
-- Se puede combinar. Inserta personal_id (patrulla_id null); dispara push por guardia.
create or replace function rpc_asignar_tarea_guardias(
  p_tarea_id uuid,
  p_personal uuid[] default null,
  p_sitio    uuid default null
) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_n   int;
  v_hoy date := (now() at time zone 'America/Monterrey')::date;
begin
  insert into tarea_asignaciones (tarea_id, personal_id)
  select distinct p_tarea_id, s.pid from (
    -- guardias explícitos
    select unnest(coalesce(p_personal, array[]::uuid[])) as pid
    union
    -- guardias con turno vigente hoy en el sitio
    select tg.personal_id as pid
      from turno_guardias tg
      join turnos t on t.id = tg.turno_id
     where p_sitio is not null
       and tg.sitio_id = p_sitio
       and tg.estatus = 'activo'
       and t.estado = 'activo'
       and t.fecha = v_hoy
  ) s
  where s.pid is not null
  on conflict do nothing;

  get diagnostics v_n = row_count;
  return v_n;
end $$;
grant execute on function rpc_asignar_tarea_guardias(uuid, uuid[], uuid) to authenticated;
comment on function rpc_asignar_tarea_guardias is 'Asigna una tarea a guardias (personal) por id y/o a todos los guardias con turno vigente hoy en un sitio. Devuelve cuántas asignaciones creó.';
