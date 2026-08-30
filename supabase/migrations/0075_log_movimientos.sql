-- =====================================================================
-- 0075_log_movimientos.sql · Seguridad Logística — Fase 1
-- Movimiento (entidad central) y su relación con unidades de carga.
-- Reusa `sitios`, `transporte_activos`, `citas` (opcional) y el chat.
-- =====================================================================

create table if not exists movimientos (
  id                  uuid primary key default gen_random_uuid(),
  folio               text,
  tipo_movimiento     text not null default 'CARRETERO'
                        check (tipo_movimiento in ('CARRETERO','FERROVIARIO','INTERMODAL','INTERNO')),
  sitio_origen_id     uuid references sitios(id),
  sitio_destino_id    uuid references sitios(id),
  transporte_activo_id uuid references transporte_activos(id),
  ruta_id             uuid,                                    -- rutas: Fase 2 (sin FK aún)
  cita_id             uuid references citas(id),               -- reuso: cita CEDIS ligada (opcional)
  programado_inicio   timestamptz,
  real_inicio         timestamptz,
  programado_fin      timestamptz,
  real_fin            timestamptz,
  estado              text not null default 'PROGRAMADO'
                        check (estado in ('PROGRAMADO','EN_PREPARACION','EN_TRANSITO','DETENIDO','EN_PATIO','FINALIZADO','CANCELADO')),
  nivel_riesgo        text,
  referencia_externa  text,
  chat_canal_id       uuid references chat_canales(id),
  datos_adicionales   jsonb default '{}'::jsonb,
  estatus             text not null default 'activo' check (estatus in ('activo','cancelado')),
  cancelado_en        timestamptz, motivo_cancelacion text,
  creado_en           timestamptz not null default now(),
  actualizado_en      timestamptz not null default now()
);
comment on table movimientos is 'Movimiento de seguridad (carretero/ferroviario/intermodal/interno). Puede ligar una cita CEDIS.';
create index if not exists idx_movimientos_estado on movimientos(estado);
create index if not exists idx_movimientos_activo on movimientos(transporte_activo_id);

create table if not exists movimiento_unidades (
  id                  uuid primary key default gen_random_uuid(),
  movimiento_id       uuid not null references movimientos(id),
  unidad_carga_id     uuid not null references unidades_carga(id),
  secuencia           int,
  carga_id            uuid references cargas(id),
  nivel_seguridad     text,
  sello_id            uuid,                                    -- puntero (FK a sellos se evita por orden)
  estatus             text not null default 'activo' check (estatus in ('activo','cancelado')),
  creado_en           timestamptz not null default now(),
  actualizado_en      timestamptz not null default now(),
  unique (movimiento_id, unidad_carga_id)
);
comment on table movimiento_unidades is 'Unidades de carga que integran un movimiento (con su carga y sello).';
create index if not exists idx_movimiento_unidades_mov on movimiento_unidades(movimiento_id);

-- Foliador solo para movimientos; movimiento_unidades es relación (sin folio).
insert into foliadores (modulo, nombre, iniciales) values ('movimientos','Movimientos','MV')
  on conflict (modulo) do nothing;
drop trigger if exists trg_folio_movimientos on movimientos;
create trigger trg_folio_movimientos before insert on movimientos for each row execute function fn_asignar_folio();

do $$
declare t text;
begin
  foreach t in array array['movimientos','movimiento_unidades'] loop
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
