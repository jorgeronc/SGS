-- =====================================================================
-- 0076_log_sellos.sql · Seguridad Logística — Fase 1
-- Sellos de seguridad y sus validaciones (evento append-only, reusa evidencia).
-- =====================================================================

create table if not exists sellos (
  id                  uuid primary key default gen_random_uuid(),
  folio               text,
  codigo_sello        text,
  tipo_sello          text,                                   -- cat tipo_sello
  estado              text not null default 'DISPONIBLE'
                        check (estado in ('DISPONIBLE','ASIGNADO','VALIDADO','ALTERADO','REEMPLAZADO','RETIRADO','PERDIDO')),
  unidad_carga_asignada_id uuid references unidades_carga(id),
  datos_adicionales   jsonb default '{}'::jsonb,
  estatus             text not null default 'activo' check (estatus in ('activo','cancelado')),
  cancelado_en        timestamptz, motivo_cancelacion text,
  creado_en           timestamptz not null default now(),
  actualizado_en      timestamptz not null default now()
);
comment on table sellos is 'Sellos de seguridad, con su estado (disponible…retirado).';
create index if not exists idx_sellos_codigo on sellos(codigo_sello);

-- Validación de sello: evento append-only (no se edita ni borra).
create table if not exists sello_validaciones (
  id                  uuid primary key default gen_random_uuid(),
  sello_id            uuid references sellos(id),
  unidad_carga_id     uuid references unidades_carga(id),
  movimiento_id       uuid references movimientos(id),
  personal_id         uuid references personal(id),
  usuario_id          uuid,
  latitud             double precision,
  longitud            double precision,
  evidencia_foto_id   uuid references evidencias(id),
  resultado           text not null default 'VALIDO'
                        check (resultado in ('VALIDO','NO_COINCIDE','ALTERADO','NO_ENCONTRADO','DANADO')),
  notas               text,
  creado_en           timestamptz not null default now()
);
comment on table sello_validaciones is 'Validación de un sello en campo (append-only): resultado, GPS, evidencia.';
create index if not exists idx_sello_val_sello on sello_validaciones(sello_id);

-- Sellos: folio + WORM + bitácora + RLS (gestión = mando).
insert into foliadores (modulo, nombre, iniciales) values ('sellos','Sellos de seguridad','SL')
  on conflict (modulo) do nothing;
drop trigger if exists trg_folio_sellos on sellos;
create trigger trg_folio_sellos before insert on sellos for each row execute function fn_asignar_folio();
drop trigger if exists trg_no_delete_sellos on sellos;
create trigger trg_no_delete_sellos before delete on sellos for each row execute function fn_bloquear_delete();
revoke delete on sellos from authenticated, anon;
drop trigger if exists trg_auditoria_sellos on sellos;
create trigger trg_auditoria_sellos after insert or update on sellos for each row execute function fn_bitacora_generica();
alter table sellos enable row level security;
drop policy if exists sel_sellos on sellos;
create policy sel_sellos on sellos for select to authenticated using (true);
drop policy if exists ins_sellos on sellos;
create policy ins_sellos on sellos for insert to authenticated with check (coalesce(fn_rol_actual(),'') in ('supervisor','administrador'));
drop policy if exists upd_sellos on sellos;
create policy upd_sellos on sellos for update to authenticated using (coalesce(fn_rol_actual(),'') in ('supervisor','administrador')) with check (coalesce(fn_rol_actual(),'') in ('supervisor','administrador'));

-- Validaciones: append-only. El guardia (y mando) las registra; nadie las borra.
drop trigger if exists trg_no_delete_sello_val on sello_validaciones;
create trigger trg_no_delete_sello_val before delete on sello_validaciones for each row execute function fn_bloquear_delete();
revoke delete, update on sello_validaciones from authenticated, anon;
drop trigger if exists trg_auditoria_sello_val on sello_validaciones;
create trigger trg_auditoria_sello_val after insert on sello_validaciones for each row execute function fn_bitacora_generica();
alter table sello_validaciones enable row level security;
drop policy if exists sel_sello_val on sello_validaciones;
create policy sel_sello_val on sello_validaciones for select to authenticated using (true);
drop policy if exists ins_sello_val on sello_validaciones;
create policy ins_sello_val on sello_validaciones for insert to authenticated with check (coalesce(fn_rol_actual(),'') in ('guardia','supervisor','administrador'));
