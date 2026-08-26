-- =====================================================================
-- 0065_control_accesos_zonas.sql · Control de Accesos — Fase 3 (zonas internas)
--
-- Zonas internas de un sitio (patio, almacén, andenes, oficinas, área de valores,
-- servidores, restringidas) y sus PERMISOS por persona/credencial con horario y
-- vigencia. La validación en tiempo real de zona se hará en el flujo de acceso;
-- aquí queda el modelo + administración.
-- =====================================================================

-- 1) Zonas por sitio ---------------------------------------------------------
create table if not exists zonas (
  id                  uuid primary key default gen_random_uuid(),
  sitio_id            uuid references sitios(id),
  nombre              text not null,
  descripcion         text,
  restringida         boolean not null default true,
  datos_adicionales   jsonb default '{}'::jsonb,
  estatus             text not null default 'activo' check (estatus in ('activo','cancelado')),
  cancelado_en        timestamptz,
  motivo_cancelacion  text,
  creado_en           timestamptz not null default now(),
  actualizado_en      timestamptz not null default now()
);
comment on table zonas is 'Zonas internas de un sitio (patio, almacén, andenes, oficinas, valores, servidores…). Restringida = requiere permiso.';
create index if not exists idx_zonas_sitio on zonas(sitio_id);

-- 2) Permisos de zona (persona o credencial + horario + vigencia) ------------
create table if not exists zona_permisos (
  id                  uuid primary key default gen_random_uuid(),
  zona_id             uuid not null references zonas(id) on delete cascade,
  persona_id          uuid references personas(id),
  credencial_id       uuid references credenciales(id),
  hora_inicio         time,
  hora_fin            time,
  dias                text,                          -- p. ej. 'L-V', 'L-D', 'Sáb-Dom'
  vigencia_inicio     date,
  vigencia_fin        date,
  datos_adicionales   jsonb default '{}'::jsonb,
  estatus             text not null default 'activo' check (estatus in ('activo','cancelado')),
  cancelado_en        timestamptz,
  motivo_cancelacion  text,
  creado_en           timestamptz not null default now(),
  actualizado_en      timestamptz not null default now()
);
comment on table zona_permisos is 'Permisos de acceso a una zona por persona o credencial, con horario, días y vigencia.';
create index if not exists idx_zona_permisos_zona on zona_permisos(zona_id);
create index if not exists idx_zona_permisos_persona on zona_permisos(persona_id);

-- 3) WORM + bitácora + RLS ---------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['zonas','zona_permisos'] loop
    execute format('drop trigger if exists trg_no_delete_%1$s on %1$s;', t);
    execute format('create trigger trg_no_delete_%1$s before delete on %1$s for each row execute function fn_bloquear_delete();', t);
    execute format('revoke delete on %I from authenticated, anon;', t);
    execute format('drop trigger if exists trg_auditoria_%1$s on %1$s;', t);
    execute format('create trigger trg_auditoria_%1$s after insert or update on %1$s for each row execute function fn_bitacora_generica();', t);
    execute format('alter table %I enable row level security;', t);
    execute format('drop policy if exists sel_%1$s on %1$s;', t);
    execute format('create policy sel_%1$s on %1$s for select to authenticated using (true);', t);
    execute format('drop policy if exists ins_%1$s on %1$s;', t);
    execute format('create policy ins_%1$s on %1$s for insert to authenticated with check (true);', t);
    execute format('drop policy if exists upd_%1$s on %1$s;', t);
    execute format('create policy upd_%1$s on %1$s for update to authenticated using (true) with check (true);', t);
  end loop;
end $$;

-- 4) rpc_cancelar_registro += zonas, zona_permisos ---------------------------
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
                     'citas','transportistas','zonas','zona_permisos') then
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
