-- =====================================================================
-- 0052_turnos.sql · SGS — Rol de turnos (guardia asignado a un sitio por fecha)
--
-- Un turno = un guardia (personal) cubre un sitio (puesto) en una fecha y una
-- franja horaria. Es el eje operativo: de aquí salen rondines y control de acceso.
-- Dos ejes de estatus: `estatus` (activo/cancelado = retención) y `estado`
-- (programado/cubierto/falta = avance operativo del turno).
-- =====================================================================

create table if not exists turnos (
  id                  uuid primary key default gen_random_uuid(),
  sitio_id            uuid not null references sitios(id),
  personal_id         uuid not null references personal(id),   -- guardia
  fecha               date not null,
  tipo_turno          text,                    -- catálogo tipo_turno
  hora_inicio         time,
  hora_fin            time,
  estado              text not null default 'programado'
                        check (estado in ('programado','cubierto','falta','relevado')),
  notas               text,
  datos_adicionales   jsonb default '{}'::jsonb,
  estatus             text not null default 'activo' check (estatus in ('activo','cancelado')),
  cancelado_en        timestamptz,
  motivo_cancelacion  text,
  creado_en           timestamptz not null default now(),
  actualizado_en      timestamptz not null default now()
);
create index if not exists idx_turnos_sitio_fecha on turnos(sitio_id, fecha);
create index if not exists idx_turnos_guardia_fecha on turnos(personal_id, fecha);

comment on table turnos is 'Rol de turnos: guardia asignado a un sitio en una fecha y franja horaria.';

-- Catálogo de tipo de turno.
insert into cat_opciones (categoria, valor, orden) values
  ('tipo_turno','Diurno (08:00-20:00)',1),
  ('tipo_turno','Nocturno (20:00-08:00)',2),
  ('tipo_turno','24 horas',3),
  ('tipo_turno','Mixto / rolado',4)
on conflict (categoria, valor) do nothing;

-- Transversal: WORM (no-delete) + bitácora + RLS.
alter table turnos enable row level security;

drop policy if exists sel_turnos on turnos;
create policy sel_turnos on turnos for select to authenticated
  using (estatus = 'activo' or fn_rol_actual() in ('supervisor','investigador','administrador'));
drop policy if exists ins_turnos on turnos;
create policy ins_turnos on turnos for insert to authenticated with check (true);
drop policy if exists upd_turnos on turnos;
create policy upd_turnos on turnos for update to authenticated using (true) with check (true);

drop trigger if exists trg_no_delete_turnos on turnos;
create trigger trg_no_delete_turnos before delete on turnos for each row execute function fn_bloquear_delete();
revoke delete on turnos from authenticated, anon;

drop trigger if exists trg_auditoria_turnos on turnos;
create trigger trg_auditoria_turnos after insert or update on turnos for each row execute function fn_bitacora_generica();

-- Ampliar rpc_cancelar_registro con turnos.
create or replace function rpc_cancelar_registro(
  p_tabla   text,
  p_id      uuid,
  p_motivo  text
) returns void as $$
begin
  if p_tabla not in ('personas','vehiculos','ubicaciones','vinculos','casos','personal',
                     'ordenes','evidencias','asuntos_internos','llamadas_cad','despachos',
                     'barandilla','equipo','incidentes','presuntos','kardex',
                     'patrullas','armamento','comunicacion','bodycams','otros',
                     'rol_servicio','rol_servicio_asignaciones','abordamientos','accidentes',
                     'tareas','tarea_asignaciones','transmisiones','caso_relaciones',
                     'guardia_capacitacion','clientes','sitios','turnos') then
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
