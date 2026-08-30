-- =====================================================================
-- 0077_log_inspecciones.sql · Seguridad Logística — Fase 1
-- Inspecciones (checklist) sobre movimiento / activo / unidad / sitio / zona.
-- =====================================================================

create table if not exists inspecciones (
  id                  uuid primary key default gen_random_uuid(),
  folio               text,
  tipo_inspeccion     text,                                   -- cat tipo_inspeccion
  movimiento_id       uuid references movimientos(id),
  transporte_activo_id uuid references transporte_activos(id),
  unidad_carga_id     uuid references unidades_carga(id),
  sitio_id            uuid references sitios(id),
  zona_id             uuid references zonas(id),
  realizada_por       uuid references personal(id),
  resultado           text,                                   -- OK / con novedad / rechazada…
  latitud             double precision,
  longitud            double precision,
  datos_adicionales   jsonb default '{}'::jsonb,
  estatus             text not null default 'activo' check (estatus in ('activo','cancelado')),
  cancelado_en        timestamptz, motivo_cancelacion text,
  creado_en           timestamptz not null default now(),
  actualizado_en      timestamptz not null default now()
);
comment on table inspecciones is 'Inspección de seguridad (checklist) sobre movimiento, activo, unidad, sitio o zona.';
create index if not exists idx_inspecciones_mov on inspecciones(movimiento_id);

create table if not exists inspeccion_items (
  id                  uuid primary key default gen_random_uuid(),
  inspeccion_id       uuid not null references inspecciones(id),
  codigo_item         text,
  descripcion         text,
  resultado           text not null default 'PENDIENTE'
                        check (resultado in ('OK','NO_OK','NO_APLICA','PENDIENTE')),
  requerido           boolean not null default false,
  notas               text,
  evidencia_id        uuid references evidencias(id),
  creado_en           timestamptz not null default now()
);
comment on table inspeccion_items is 'Ítem del checklist de una inspección, con su resultado y evidencia.';
create index if not exists idx_inspeccion_items_insp on inspeccion_items(inspeccion_id);

-- Inspecciones: folio + WORM + bitácora + RLS (guardia y mando registran).
insert into foliadores (modulo, nombre, iniciales) values ('inspecciones','Inspecciones','IS')
  on conflict (modulo) do nothing;
drop trigger if exists trg_folio_inspecciones on inspecciones;
create trigger trg_folio_inspecciones before insert on inspecciones for each row execute function fn_asignar_folio();
drop trigger if exists trg_no_delete_inspecciones on inspecciones;
create trigger trg_no_delete_inspecciones before delete on inspecciones for each row execute function fn_bloquear_delete();
revoke delete on inspecciones from authenticated, anon;
drop trigger if exists trg_auditoria_inspecciones on inspecciones;
create trigger trg_auditoria_inspecciones after insert or update on inspecciones for each row execute function fn_bitacora_generica();
alter table inspecciones enable row level security;
drop policy if exists sel_inspecciones on inspecciones;
create policy sel_inspecciones on inspecciones for select to authenticated using (true);
drop policy if exists ins_inspecciones on inspecciones;
create policy ins_inspecciones on inspecciones for insert to authenticated with check (coalesce(fn_rol_actual(),'') in ('guardia','supervisor','administrador'));
drop policy if exists upd_inspecciones on inspecciones;
create policy upd_inspecciones on inspecciones for update to authenticated using (coalesce(fn_rol_actual(),'') in ('guardia','supervisor','administrador')) with check (coalesce(fn_rol_actual(),'') in ('guardia','supervisor','administrador'));

-- Ítems: sin borrado; el guardia/mando los crea y actualiza durante la inspección.
drop trigger if exists trg_no_delete_insp_items on inspeccion_items;
create trigger trg_no_delete_insp_items before delete on inspeccion_items for each row execute function fn_bloquear_delete();
revoke delete on inspeccion_items from authenticated, anon;
alter table inspeccion_items enable row level security;
drop policy if exists sel_insp_items on inspeccion_items;
create policy sel_insp_items on inspeccion_items for select to authenticated using (true);
drop policy if exists ins_insp_items on inspeccion_items;
create policy ins_insp_items on inspeccion_items for insert to authenticated with check (coalesce(fn_rol_actual(),'') in ('guardia','supervisor','administrador'));
drop policy if exists upd_insp_items on inspeccion_items;
create policy upd_insp_items on inspeccion_items for update to authenticated using (coalesce(fn_rol_actual(),'') in ('guardia','supervisor','administrador')) with check (coalesce(fn_rol_actual(),'') in ('guardia','supervisor','administrador'));
