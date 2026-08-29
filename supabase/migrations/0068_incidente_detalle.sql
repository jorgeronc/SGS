-- =====================================================================
-- 0068_incidente_detalle.sql
-- Detalle de incidente: captura de personas/vehículos involucrados (llegan a los
-- registros maestros), directorio de AUTORIDADES de seguridad (contactables) y
-- catálogo de RECURSOS PROPIOS sugeridos a despachar.
-- =====================================================================

-- 1) Campos de captura en los registros maestros --------------------------
alter table personas
  add column if not exists originario_de text,
  add column if not exists ocupacion     text,
  add column if not exists estado_civil  text,
  add column if not exists escolaridad   text;

alter table vehiculos
  add column if not exists tarjeta_circulacion text,   -- folio/número
  add column if not exists descripcion         text,
  add column if not exists fotografias         jsonb default '[]'::jsonb;

-- 2) Directorio de autoridades de seguridad (contactables) ----------------
create table if not exists directorio_autoridades (
  id                  uuid primary key default gen_random_uuid(),
  folio               text,
  tipo                text,                 -- 'Protección Civil' | 'Bomberos' | 'Ambulancia' | 'Policía' | 'Cruz Roja' ...
  nombre              text not null,        -- 'Bomberos — Estación 4'
  telefono            text,
  telefono_alt        text,
  contacto            text,                 -- nombre de la persona de contacto
  correo              text,
  zona                text,                 -- cobertura / municipio
  direccion           text,
  notas               text,
  datos_adicionales   jsonb default '{}'::jsonb,
  estatus             text not null default 'activo' check (estatus in ('activo','cancelado')),
  cancelado_en        timestamptz,
  motivo_cancelacion  text,
  creado_en           timestamptz not null default now(),
  actualizado_en      timestamptz not null default now()
);
comment on table directorio_autoridades is 'Directorio de autoridades/servicios de emergencia contactables (Protección Civil, Bomberos, Ambulancias, etc.).';
create index if not exists idx_directorio_tipo on directorio_autoridades (tipo);

insert into foliadores (modulo, nombre, iniciales) values ('directorio_autoridades','Directorio de autoridades','DA')
  on conflict (modulo) do nothing;
drop trigger if exists trg_folio_directorio on directorio_autoridades;
create trigger trg_folio_directorio before insert on directorio_autoridades for each row execute function fn_asignar_folio();
drop trigger if exists trg_no_delete_directorio on directorio_autoridades;
create trigger trg_no_delete_directorio before delete on directorio_autoridades for each row execute function fn_bloquear_delete();
revoke delete on directorio_autoridades from authenticated, anon;
drop trigger if exists trg_auditoria_directorio on directorio_autoridades;
create trigger trg_auditoria_directorio after insert or update on directorio_autoridades for each row execute function fn_bitacora_generica();

alter table directorio_autoridades enable row level security;
drop policy if exists sel_directorio on directorio_autoridades;
create policy sel_directorio on directorio_autoridades for select to authenticated using (true);
drop policy if exists ins_directorio on directorio_autoridades;
create policy ins_directorio on directorio_autoridades for insert to authenticated
  with check (coalesce(fn_rol_actual(), '') in ('supervisor','administrador'));
drop policy if exists upd_directorio on directorio_autoridades;
create policy upd_directorio on directorio_autoridades for update to authenticated
  using (coalesce(fn_rol_actual(), '') in ('supervisor','administrador'))
  with check (coalesce(fn_rol_actual(), '') in ('supervisor','administrador'));

-- 3) Catálogo de recursos propios sugeridos (editable) --------------------
insert into cat_opciones (categoria, valor, orden) values
  ('recurso_propio','Guardia de apoyo',1),
  ('recurso_propio','Supervisor de zona',2),
  ('recurso_propio','Dron de perímetro',3),
  ('recurso_propio','Unidad contra incendios',4),
  ('recurso_propio','Equipo de primeros auxilios',5),
  ('recurso_propio','Cuadrilla de mantenimiento',6)
on conflict (categoria, valor) do nothing;

-- 4) Whitelist de cancelación WORM (agrega directorio_autoridades) --------
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
                     'directorio_autoridades') then
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
