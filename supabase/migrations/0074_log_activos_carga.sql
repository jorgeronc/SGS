-- =====================================================================
-- 0074_log_activos_carga.sql · Seguridad Logística — Fase 1
-- Activos de transporte, unidades de carga y cargas. Reusan `transportistas`
-- (empresa) y `vehiculos` (activo carretero). WORM + folios + bitácora + RLS.
-- =====================================================================

-- 1) Activo de transporte (tracto, camión, locomotora, unidad de seguridad) ---
create table if not exists transporte_activos (
  id                  uuid primary key default gen_random_uuid(),
  folio               text,
  tipo_activo         text,                                   -- cat tipo_activo_transporte
  identificador       text,
  placas              text,
  economico           text,
  empresa_id          uuid references transportistas(id),      -- reuso
  vehiculo_id         uuid references vehiculos(id),           -- reuso (carretero)
  gps_device_id       text,
  estado_activo       text not null default 'operativo'
                        check (estado_activo in ('operativo','inactivo','mantenimiento')),
  -- Última posición (se llena en Fase 2 con la ingesta de GPS).
  ultima_latitud      double precision,
  ultima_longitud     double precision,
  ultima_velocidad    double precision,
  ultimo_rumbo        double precision,
  ultima_posicion_en  timestamptz,
  datos_adicionales   jsonb default '{}'::jsonb,
  estatus             text not null default 'activo' check (estatus in ('activo','cancelado')),
  cancelado_en        timestamptz, motivo_cancelacion text,
  creado_en           timestamptz not null default now(),
  actualizado_en      timestamptz not null default now()
);
comment on table transporte_activos is 'Activo que genera/dirige el movimiento: tracto, camión, locomotora o unidad de seguridad.';
create index if not exists idx_transporte_activos_empresa on transporte_activos(empresa_id);

-- 2) Unidad de carga (remolque, caja, contenedor, vagón, etc.) ----------------
create table if not exists unidades_carga (
  id                  uuid primary key default gen_random_uuid(),
  folio               text,
  tipo_unidad         text,                                   -- cat tipo_unidad_carga
  identificador       text,
  empresa_id          uuid references transportistas(id),
  sello_actual_id     uuid,                                   -- puntero (FK a sellos se evita por orden)
  estado_unidad       text not null default 'disponible',
  datos_adicionales   jsonb default '{}'::jsonb,
  estatus             text not null default 'activo' check (estatus in ('activo','cancelado')),
  cancelado_en        timestamptz, motivo_cancelacion text,
  creado_en           timestamptz not null default now(),
  actualizado_en      timestamptz not null default now()
);
comment on table unidades_carga is 'Unidad física que transporta carga (remolque, caja, contenedor, vagón, tolva, etc.).';

-- 3) Carga ---------------------------------------------------------------------
create table if not exists cargas (
  id                  uuid primary key default gen_random_uuid(),
  folio               text,
  descripcion         text,
  categoria_carga     text,
  nivel_riesgo        text not null default 'Normal',          -- cat nivel_riesgo_carga
  referencia          text,
  empresa_id          uuid references transportistas(id),
  valor_declarado     numeric,
  datos_adicionales   jsonb default '{}'::jsonb,
  estatus             text not null default 'activo' check (estatus in ('activo','cancelado')),
  cancelado_en        timestamptz, motivo_cancelacion text,
  creado_en           timestamptz not null default now(),
  actualizado_en      timestamptz not null default now()
);
comment on table cargas is 'Carga transportada, con su nivel de riesgo (Normal…Crítica).';

-- 4) Foliadores, WORM, bitácora y RLS -----------------------------------------
insert into foliadores (modulo, nombre, iniciales) values
  ('transporte_activos','Activos de transporte','AT'),
  ('unidades_carga','Unidades de carga','UC'),
  ('cargas','Cargas','CG')
on conflict (modulo) do nothing;

do $$
declare t text;
begin
  foreach t in array array['transporte_activos','unidades_carga','cargas'] loop
    execute format('drop trigger if exists trg_folio_%1$s on %1$s', t);
    execute format('create trigger trg_folio_%1$s before insert on %1$s for each row execute function fn_asignar_folio()', t);
    execute format('drop trigger if exists trg_no_delete_%1$s on %1$s', t);
    execute format('create trigger trg_no_delete_%1$s before delete on %1$s for each row execute function fn_bloquear_delete()', t);
    execute format('revoke delete on %1$s from authenticated, anon', t);
    execute format('drop trigger if exists trg_auditoria_%1$s on %1$s', t);
    execute format('create trigger trg_auditoria_%1$s after insert or update on %1$s for each row execute function fn_bitacora_generica()', t);
    execute format('alter table %1$s enable row level security', t);
    execute format('drop policy if exists sel_%1$s on %1$s', t);
    execute format('create policy sel_%1$s on %1$s for select to authenticated using (true)', t);
    execute format('drop policy if exists ins_%1$s on %1$s', t);
    execute format($p$create policy ins_%1$s on %1$s for insert to authenticated with check (coalesce(fn_rol_actual(),'') in ('supervisor','administrador'))$p$, t);
    execute format('drop policy if exists upd_%1$s on %1$s', t);
    execute format($p$create policy upd_%1$s on %1$s for update to authenticated using (coalesce(fn_rol_actual(),'') in ('supervisor','administrador')) with check (coalesce(fn_rol_actual(),'') in ('supervisor','administrador'))$p$, t);
  end loop;
end $$;
