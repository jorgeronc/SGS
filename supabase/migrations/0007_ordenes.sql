-- =====================================================================
-- 0007_ordenes.sql
-- Módulo de Citatorios y Órdenes (Fase 3 del roadmap).
--
-- Una "orden" cubre tanto citatorios como órdenes de autoridad superior
-- (aprehensión, cateo, comparecencia, presentación), diferenciadas por el
-- campo 'tipo'. Sus relaciones (con el caso, la persona citada/requerida,
-- vehículos o ubicaciones) se expresan con el motor de vínculos genérico,
-- igual que los casos.
--
-- NOTA sobre firma electrónica: el roadmap marca esta fase como dependiente
-- de un estándar de firma electrónica (flujos con juzgado/fiscalía). Para la
-- demo se registran los metadatos de autorización (autorizada_por) y se deja
-- la firma criptográfica como pendiente de producción — mismo criterio que
-- otros temas de hardening del sistema (ver README).
--
-- Como el resto del sistema: estatus (activo/cancelado) es retención de datos;
-- el avance del trámite se lleva en 'estado'.
-- =====================================================================

create table if not exists ordenes (
  id                    uuid primary key default gen_random_uuid(),
  folio                 text,
  tipo                  text not null default 'citatorio'
                          check (tipo in ('citatorio','orden_aprehension','orden_cateo',
                                          'orden_comparecencia','orden_presentacion')),
  autoridad_emisora     text,                -- juzgado / fiscalía / autoridad que emite
  autorizada_por        text,                -- funcionario que autoriza (firma pendiente en prod)
  asunto                text,
  fecha_emision         date,
  fecha_limite          date,                -- fecha de comparecencia / vencimiento
  estado                text not null default 'emitida'
                          check (estado in ('emitida','notificada','cumplida','vencida')),
  datos_adicionales     jsonb default '{}'::jsonb,

  estatus               text not null default 'activo' check (estatus in ('activo','cancelado')),
  cancelado_en          timestamptz,
  motivo_cancelacion    text,

  creado_en             timestamptz not null default now(),
  actualizado_en        timestamptz not null default now()
);

comment on table ordenes is 'Citatorios y órdenes de autoridad (aprehensión, cateo, comparecencia). Se relacionan con casos/personas/etc. vía el motor de vínculos.';

create index if not exists idx_ordenes_estado on ordenes (estado);
create index if not exists idx_ordenes_folio on ordenes (folio);

create or replace view ordenes_activas as
  select * from ordenes where estatus = 'activo';

-- ---------------------------------------------------------------------
-- Política "cancelar, nunca borrar"
-- ---------------------------------------------------------------------
drop trigger if exists trg_no_delete_ordenes on ordenes;
create trigger trg_no_delete_ordenes
  before delete on ordenes
  for each row execute function fn_bloquear_delete();

revoke delete on ordenes from authenticated, anon;

-- ---------------------------------------------------------------------
-- Bitácora de auditoría (reutiliza fn_bitacora_generica de 0002)
-- ---------------------------------------------------------------------
drop trigger if exists trg_auditoria_ordenes on ordenes;
create trigger trg_auditoria_ordenes
  after insert or update on ordenes
  for each row execute function fn_bitacora_generica();

-- ---------------------------------------------------------------------
-- Ampliar rpc_cancelar_registro para admitir la tabla 'ordenes'.
-- ---------------------------------------------------------------------
create or replace function rpc_cancelar_registro(
  p_tabla   text,
  p_id      uuid,
  p_motivo  text
) returns void as $$
begin
  if p_tabla not in ('personas','vehiculos','ubicaciones','vinculos','casos','personal','ordenes') then
    raise exception 'Tabla no reconocida: %', p_tabla;
  end if;

  execute format(
    'update %I set estatus = ''cancelado'', cancelado_en = now(), motivo_cancelacion = $1, actualizado_en = now() where id = $2',
    p_tabla
  ) using p_motivo, p_id;
end;
$$ language plpgsql security definer;

-- ---------------------------------------------------------------------
-- RLS (mismo patrón que las demás tablas núcleo en 0004)
-- ---------------------------------------------------------------------
alter table ordenes enable row level security;

drop policy if exists sel_ordenes on ordenes;
create policy sel_ordenes on ordenes
  for select to authenticated
  using (
    estatus = 'activo'
    or fn_rol_actual() in ('supervisor','investigador','administrador')
  );

drop policy if exists ins_ordenes on ordenes;
create policy ins_ordenes on ordenes for insert to authenticated with check (true);

drop policy if exists upd_ordenes on ordenes;
create policy upd_ordenes on ordenes for update to authenticated using (true) with check (true);
