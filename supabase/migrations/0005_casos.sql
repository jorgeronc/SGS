-- =====================================================================
-- 0005_casos.sql
-- Módulo de Casos / Incidentes.
--
-- Un caso es la unidad de investigación: agrupa (vía el motor de vínculos)
-- a las personas, vehículos y ubicaciones involucradas. Reutiliza toda la
-- infraestructura núcleo ya existente:
--   - política "cancelar, nunca borrar" (estatus + trigger no-delete)
--   - bitácora de auditoría (trigger AFTER insert/update)
--   - RLS por rol
--   - motor de vínculos genérico (entidad tipo 'caso')
--
-- Nota sobre los dos "estados": 'estatus' (activo/cancelado) es la política
-- de retención de datos y NO se usa para el flujo de trabajo. El avance de
-- la investigación se lleva en 'estado_investigacion'.
-- =====================================================================

create table if not exists casos (
  id                    uuid primary key default gen_random_uuid(),
  folio                 text,                -- número de expediente/caso (asignado por la agencia)
  tipo                  text,                -- robo, homicidio, accidente vial, extravío, etc.
  titulo                text not null,
  narrativa             text,                -- descripción de los hechos
  fecha_hecho           timestamptz,         -- cuándo ocurrió (distinto de creado_en = cuándo se capturó)
  prioridad             text not null default 'media'
                          check (prioridad in ('baja','media','alta')),
  estado_investigacion  text not null default 'abierto'
                          check (estado_investigacion in ('abierto','en_investigacion','cerrado','archivado')),
  datos_adicionales     jsonb default '{}'::jsonb,

  estatus               text not null default 'activo' check (estatus in ('activo','cancelado')),
  cancelado_en          timestamptz,
  motivo_cancelacion    text,

  creado_en             timestamptz not null default now(),
  actualizado_en        timestamptz not null default now()
);

comment on table casos is 'Casos/incidentes: unidad de investigación que agrupa personas, vehículos y ubicaciones vía el motor de vínculos.';

create index if not exists idx_casos_estado on casos (estado_investigacion);
create index if not exists idx_casos_folio on casos (folio);

create or replace view casos_activos as
  select * from casos where estatus = 'activo';

-- ---------------------------------------------------------------------
-- Política "cancelar, nunca borrar" (igual que el resto de tablas núcleo)
-- ---------------------------------------------------------------------
drop trigger if exists trg_no_delete_casos on casos;
create trigger trg_no_delete_casos
  before delete on casos
  for each row execute function fn_bloquear_delete();

revoke delete on casos from authenticated, anon;

-- ---------------------------------------------------------------------
-- Bitácora de auditoría (reutiliza fn_bitacora_generica de 0002)
-- ---------------------------------------------------------------------
drop trigger if exists trg_auditoria_casos on casos;
create trigger trg_auditoria_casos
  after insert or update on casos
  for each row execute function fn_bitacora_generica();

-- ---------------------------------------------------------------------
-- Ampliar rpc_cancelar_registro para admitir la tabla 'casos'.
-- (redefinición idempotente de la función de 0003, agregando 'casos')
-- ---------------------------------------------------------------------
create or replace function rpc_cancelar_registro(
  p_tabla   text,
  p_id      uuid,
  p_motivo  text
) returns void as $$
begin
  if p_tabla not in ('personas','vehiculos','ubicaciones','vinculos','casos') then
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
alter table casos enable row level security;

drop policy if exists sel_casos on casos;
create policy sel_casos on casos
  for select to authenticated
  using (
    estatus = 'activo'
    or fn_rol_actual() in ('supervisor','investigador','administrador')
  );

drop policy if exists ins_casos on casos;
create policy ins_casos on casos for insert to authenticated with check (true);

drop policy if exists upd_casos on casos;
create policy upd_casos on casos for update to authenticated using (true) with check (true);
