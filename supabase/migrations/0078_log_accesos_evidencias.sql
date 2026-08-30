-- =====================================================================
-- 0078_log_accesos_evidencias.sql · Seguridad Logística — Fase 1 (cierre)
-- Extiende `accesos` para ligar movimiento/unidad/activo, amplía el catálogo de
-- evidencias, agrega las tablas nuevas al whitelist de cancelación (WORM) y a la
-- publicación de tiempo real (Realtime).
-- =====================================================================

-- 1) Accesos ligados al dominio logístico -------------------------------------
alter table accesos add column if not exists movimiento_id        uuid references movimientos(id);
alter table accesos add column if not exists unidad_carga_id      uuid references unidades_carga(id);
alter table accesos add column if not exists transporte_activo_id uuid references transporte_activos(id);
create index if not exists idx_accesos_movimiento on accesos(movimiento_id);

-- 2) Catálogo de tipos de evidencia (referencia; evidencias.tipo es libre) ----
insert into cat_opciones (categoria, valor, orden) values
  ('tipo_evidencia','Foto',1),('tipo_evidencia','Video',2),('tipo_evidencia','Audio',3),('tipo_evidencia','Documento',4),
  ('tipo_evidencia','Clip CCTV',5),('tipo_evidencia','Snapshot',6),('tipo_evidencia','Foto de sello',7),
  ('tipo_evidencia','Foto de inspección',8),('tipo_evidencia','Traza GPS',9)
on conflict (categoria, valor) do nothing;

-- 3) Whitelist de cancelación WORM (agrega las nuevas tablas cancelables) ------
create or replace function rpc_cancelar_registro(p_tabla text, p_id uuid, p_motivo text)
returns void as $$
begin
  if p_tabla not in ('personas','vehiculos','ubicaciones','vinculos','casos','personal',
                     'ordenes','evidencias','asuntos_internos','llamadas_cad','despachos',
                     'barandilla','equipo','incidentes','presuntos','kardex',
                     'patrullas','armamento','comunicacion','bodycams','otros',
                     'rol_servicio','rol_servicio_asignaciones','abordamientos','accidentes',
                     'tareas','tarea_asignaciones','transmisiones','caso_relaciones',
                     'guardia_capacitacion','clientes','sitios','turnos',
                     'puntos_control','rondines','camaras','accesos','credenciales',
                     'citas','transportistas','zonas','zona_permisos','sla_metas',
                     'directorio_autoridades',
                     -- Seguridad Logística:
                     'transporte_activos','unidades_carga','cargas','movimientos','sellos','inspecciones') then
    raise exception 'Tabla no reconocida: %', p_tabla;
  end if;
  if p_tabla = 'asuntos_internos'
     and coalesce(fn_rol_actual(), '') not in ('asuntos_internos','administrador') then
    raise exception 'No autorizado para cancelar registros de asuntos internos.';
  end if;
  execute format(
    'update %I set estatus = ''cancelado'', cancelado_en = now(), motivo_cancelacion = $1, actualizado_en = now() where id = $2',
    p_tabla
  ) using p_motivo, p_id;
end;
$$ language plpgsql security definer;

-- 4) Tiempo real: agregar tablas a la publicación (sin fallar si ya están) -----
do $$
declare t text;
begin
  foreach t in array array['movimientos','transporte_activos','sellos','sello_validaciones','inspecciones'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end $$;
