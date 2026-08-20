-- =====================================================================
-- 0006_personal.sql
-- Módulo de Personal (Fase 2 del roadmap: Personal, Flota y Equipo).
--
-- Un registro de "personal" es el vínculo de EMPLEO de una persona con la
-- agencia (placa, rango, adscripción, estado laboral). NO duplica los datos
-- biográficos: apunta a la persona en el índice maestro (tabla personas),
-- coherente con el principio de "un solo registro por individuo" — un
-- oficial es una persona más del índice, no un registro aparte.
--
-- La flota (vehículos de la agencia) ya está cubierta por la tabla vehiculos
-- con la bandera es_flota_agencia; no se necesita tabla nueva para eso.
-- =====================================================================

create table if not exists personal (
  id                    uuid primary key default gen_random_uuid(),
  persona_id            uuid not null references personas(id),
  numero_placa          text,                -- número de placa / identificador de oficial
  rango                 text,                -- oficial, cabo, sargento, teniente, etc.
  adscripcion           text,                -- unidad / área / destacamento
  fecha_ingreso         date,
  estado_laboral        text not null default 'activo'
                          check (estado_laboral in ('activo','licencia','suspendido','baja')),
  datos_adicionales     jsonb default '{}'::jsonb,

  estatus               text not null default 'activo' check (estatus in ('activo','cancelado')),
  cancelado_en          timestamptz,
  motivo_cancelacion    text,

  creado_en             timestamptz not null default now(),
  actualizado_en        timestamptz not null default now()
);

comment on table personal is 'Registro de empleo del personal de la agencia. Referencia a personas (índice maestro); NO duplica datos biográficos.';

create index if not exists idx_personal_persona on personal (persona_id);
create index if not exists idx_personal_placa on personal (numero_placa);

create or replace view personal_activo as
  select * from personal where estatus = 'activo';

-- ---------------------------------------------------------------------
-- Política "cancelar, nunca borrar"
-- ---------------------------------------------------------------------
drop trigger if exists trg_no_delete_personal on personal;
create trigger trg_no_delete_personal
  before delete on personal
  for each row execute function fn_bloquear_delete();

revoke delete on personal from authenticated, anon;

-- ---------------------------------------------------------------------
-- Bitácora de auditoría (reutiliza fn_bitacora_generica de 0002)
-- ---------------------------------------------------------------------
drop trigger if exists trg_auditoria_personal on personal;
create trigger trg_auditoria_personal
  after insert or update on personal
  for each row execute function fn_bitacora_generica();

-- ---------------------------------------------------------------------
-- Ampliar rpc_cancelar_registro para admitir la tabla 'personal'.
-- (redefinición idempotente, agregando 'personal' a la lista blanca)
-- ---------------------------------------------------------------------
create or replace function rpc_cancelar_registro(
  p_tabla   text,
  p_id      uuid,
  p_motivo  text
) returns void as $$
begin
  if p_tabla not in ('personas','vehiculos','ubicaciones','vinculos','casos','personal') then
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
alter table personal enable row level security;

drop policy if exists sel_personal on personal;
create policy sel_personal on personal
  for select to authenticated
  using (
    estatus = 'activo'
    or fn_rol_actual() in ('supervisor','investigador','administrador')
  );

drop policy if exists ins_personal on personal;
create policy ins_personal on personal for insert to authenticated with check (true);

drop policy if exists upd_personal on personal;
create policy upd_personal on personal for update to authenticated using (true) with check (true);
