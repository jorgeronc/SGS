-- =====================================================================
-- 0066_sla_metas.sql · Tanda B · SLA por cliente + horas contratadas
--
-- Metas de nivel de servicio (SLA) por cliente (o global) para calcular el
-- cumplimiento y el Índice de Cumplimiento de Seguridad (0–100), y horas
-- contratadas por sitio para el argumento de "cobertura contractual".
-- El cálculo del reporte se hace en el frontend (lib/sla.ts) con datos reales.
-- =====================================================================

-- 1) Metas SLA (una fila por cliente; la fila con cliente_id NULL = default global)
create table if not exists sla_metas (
  id                    uuid primary key default gen_random_uuid(),
  cliente_id            uuid references clientes(id),
  cobertura_pct         int not null default 95,   -- % mínimo de cobertura/asistencia
  rondines_pct          int not null default 90,   -- % mínimo de rondines en rango
  tiempo_resp_min       int not null default 10,   -- minutos objetivo de respuesta
  supervision_pct       int not null default 90,   -- % de supervisiones (a futuro)
  incidentes_criticos_max int not null default 0,  -- críticos tolerados en el periodo
  datos_adicionales     jsonb default '{}'::jsonb,
  estatus               text not null default 'activo' check (estatus in ('activo','cancelado')),
  cancelado_en          timestamptz,
  motivo_cancelacion    text,
  creado_en             timestamptz not null default now(),
  actualizado_en        timestamptz not null default now()
);
comment on table sla_metas is 'Metas de SLA por cliente (o global si cliente_id es NULL) para el cumplimiento y el índice de seguridad.';
create unique index if not exists idx_sla_metas_cliente on sla_metas(cliente_id) where cliente_id is not null;
-- Una sola fila global (cliente_id null).
create unique index if not exists idx_sla_metas_global on sla_metas((cliente_id is null)) where cliente_id is null;

insert into sla_metas (cliente_id, cobertura_pct, rondines_pct, tiempo_resp_min, supervision_pct, incidentes_criticos_max)
  select null, 95, 90, 10, 90, 0
  where not exists (select 1 from sla_metas where cliente_id is null);

-- 2) Horas contratadas por sitio (para cobertura contractual) -----------------
alter table sitios add column if not exists horas_contratadas_mes numeric;

-- 3) WORM + bitácora + RLS ---------------------------------------------------
drop trigger if exists trg_no_delete_sla_metas on sla_metas;
create trigger trg_no_delete_sla_metas before delete on sla_metas for each row execute function fn_bloquear_delete();
revoke delete on sla_metas from authenticated, anon;
drop trigger if exists trg_auditoria_sla_metas on sla_metas;
create trigger trg_auditoria_sla_metas after insert or update on sla_metas for each row execute function fn_bitacora_generica();

alter table sla_metas enable row level security;
drop policy if exists sel_sla_metas on sla_metas;
create policy sel_sla_metas on sla_metas for select to authenticated using (true);
drop policy if exists ins_sla_metas on sla_metas;
create policy ins_sla_metas on sla_metas for insert to authenticated
  with check (coalesce(fn_rol_actual(), '') in ('supervisor','administrador'));
drop policy if exists upd_sla_metas on sla_metas;
create policy upd_sla_metas on sla_metas for update to authenticated
  using (coalesce(fn_rol_actual(), '') in ('supervisor','administrador'))
  with check (coalesce(fn_rol_actual(), '') in ('supervisor','administrador'));

-- 4) rpc_cancelar_registro += sla_metas --------------------------------------
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
                     'citas','transportistas','zonas','zona_permisos','sla_metas') then
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
