-- =====================================================================
-- 0011_cad_barandilla.sql
-- Fase 6 del roadmap: CAD (Atención de llamadas / despacho) y Barandilla.
--
-- Se construye la lógica de negocio del despacho y la custodia. Las
-- integraciones de infraestructura de cada agencia (telefonía en tiempo
-- real, radios, CCTV, AVL/GPS de unidades) quedan fuera: el roadmap las
-- marca como dependientes del despliegue on-premise de cada cliente.
--
-- Tres tablas:
--   1) llamadas_cad   la llamada/incidente de despacho, con georreferencia.
--   2) despachos      asignación de una unidad (oficial + patrulla) a una
--                     llamada, con su estado (asignada/en_ruta/en_sitio/...).
--   3) barandilla     registro de custodia/detención, ligado a Personas.
-- =====================================================================

-- =========================
-- CAD: LLAMADAS
-- =========================
create table if not exists llamadas_cad (
  id                  uuid primary key default gen_random_uuid(),
  folio               text,
  tipo                text,             -- emergencia, robo_en_progreso, accidente, auxilio, etc.
  prioridad           text not null default 'media' check (prioridad in ('alta','media','baja')),
  reportante          text,
  telefono            text,
  descripcion         text,
  direccion           text,
  latitud             double precision,
  longitud            double precision,
  estado_despacho     text not null default 'recibida'
                        check (estado_despacho in ('recibida','despachada','en_atencion','resuelta')),
  fecha_recepcion     timestamptz not null default now(),
  fecha_cierre        timestamptz,
  datos_adicionales   jsonb default '{}'::jsonb,

  estatus             text not null default 'activo' check (estatus in ('activo','cancelado')),
  cancelado_en        timestamptz,
  motivo_cancelacion  text,

  creado_en           timestamptz not null default now(),
  actualizado_en      timestamptz not null default now()
);

comment on table llamadas_cad is 'Llamadas/incidentes de despacho (CAD) con georreferencia. Se relacionan con casos/personas vía vínculos.';

create index if not exists idx_llamadas_cad_estado on llamadas_cad (estado_despacho);
create index if not exists idx_llamadas_cad_prioridad on llamadas_cad (prioridad);

create or replace view llamadas_cad_activas as
  select * from llamadas_cad where estatus = 'activo';

-- =========================
-- CAD: DESPACHOS (unidades asignadas a una llamada)
-- =========================
create table if not exists despachos (
  id                  uuid primary key default gen_random_uuid(),
  llamada_id          uuid not null references llamadas_cad(id),
  personal_id         uuid references personal(id),    -- oficial asignado
  vehiculo_id         uuid references vehiculos(id),   -- unidad/patrulla
  estado              text not null default 'asignada'
                        check (estado in ('asignada','en_ruta','en_sitio','liberada')),
  notas               text,
  fecha_asignacion    timestamptz not null default now(),

  estatus             text not null default 'activo' check (estatus in ('activo','cancelado')),
  cancelado_en        timestamptz,
  motivo_cancelacion  text,

  creado_en           timestamptz not null default now(),
  actualizado_en      timestamptz not null default now()
);

comment on table despachos is 'Asignación de unidades (oficial + patrulla) a una llamada CAD, con seguimiento de estado.';

create index if not exists idx_despachos_llamada on despachos (llamada_id);

-- =========================
-- BARANDILLA (custodia / registro de detención)
-- =========================
create table if not exists barandilla (
  id                  uuid primary key default gen_random_uuid(),
  folio               text,
  persona_id          uuid not null references personas(id),
  motivo              text,
  autoridad_remitente text,
  celda               text,
  pertenencias        text,
  fecha_ingreso       timestamptz not null default now(),
  fecha_egreso        timestamptz,
  estado              text not null default 'ingresado'
                        check (estado in ('ingresado','en_custodia','liberado','trasladado')),
  datos_adicionales   jsonb default '{}'::jsonb,

  estatus             text not null default 'activo' check (estatus in ('activo','cancelado')),
  cancelado_en        timestamptz,
  motivo_cancelacion  text,

  creado_en           timestamptz not null default now(),
  actualizado_en      timestamptz not null default now()
);

comment on table barandilla is 'Registro de custodia/detención (barandilla), ligado al índice maestro de Personas.';

create index if not exists idx_barandilla_persona on barandilla (persona_id);
create index if not exists idx_barandilla_estado on barandilla (estado);

create or replace view barandilla_activa as
  select * from barandilla where estatus = 'activo';

-- ---------------------------------------------------------------------
-- Política "cancelar, nunca borrar" + bitácora para las tres tablas
-- ---------------------------------------------------------------------
drop trigger if exists trg_no_delete_llamadas_cad on llamadas_cad;
create trigger trg_no_delete_llamadas_cad before delete on llamadas_cad
  for each row execute function fn_bloquear_delete();
drop trigger if exists trg_no_delete_despachos on despachos;
create trigger trg_no_delete_despachos before delete on despachos
  for each row execute function fn_bloquear_delete();
drop trigger if exists trg_no_delete_barandilla on barandilla;
create trigger trg_no_delete_barandilla before delete on barandilla
  for each row execute function fn_bloquear_delete();

revoke delete on llamadas_cad, despachos, barandilla from authenticated, anon;

drop trigger if exists trg_auditoria_llamadas_cad on llamadas_cad;
create trigger trg_auditoria_llamadas_cad after insert or update on llamadas_cad
  for each row execute function fn_bitacora_generica();
drop trigger if exists trg_auditoria_despachos on despachos;
create trigger trg_auditoria_despachos after insert or update on despachos
  for each row execute function fn_bitacora_generica();
drop trigger if exists trg_auditoria_barandilla on barandilla;
create trigger trg_auditoria_barandilla after insert or update on barandilla
  for each row execute function fn_bitacora_generica();

-- ---------------------------------------------------------------------
-- Ampliar rpc_cancelar_registro con las tres tablas nuevas.
-- ---------------------------------------------------------------------
create or replace function rpc_cancelar_registro(
  p_tabla   text,
  p_id      uuid,
  p_motivo  text
) returns void as $$
begin
  if p_tabla not in ('personas','vehiculos','ubicaciones','vinculos','casos','personal',
                     'ordenes','evidencias','asuntos_internos','llamadas_cad','despachos','barandilla') then
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

-- ---------------------------------------------------------------------
-- RLS (patrón estándar: activo visible a autenticados; cancelado a supervisor+)
-- ---------------------------------------------------------------------
alter table llamadas_cad enable row level security;
alter table despachos    enable row level security;
alter table barandilla   enable row level security;

drop policy if exists sel_llamadas_cad on llamadas_cad;
create policy sel_llamadas_cad on llamadas_cad for select to authenticated
  using (estatus = 'activo' or fn_rol_actual() in ('supervisor','investigador','administrador'));
drop policy if exists ins_llamadas_cad on llamadas_cad;
create policy ins_llamadas_cad on llamadas_cad for insert to authenticated with check (true);
drop policy if exists upd_llamadas_cad on llamadas_cad;
create policy upd_llamadas_cad on llamadas_cad for update to authenticated using (true) with check (true);

drop policy if exists sel_despachos on despachos;
create policy sel_despachos on despachos for select to authenticated
  using (estatus = 'activo' or fn_rol_actual() in ('supervisor','investigador','administrador'));
drop policy if exists ins_despachos on despachos;
create policy ins_despachos on despachos for insert to authenticated with check (true);
drop policy if exists upd_despachos on despachos;
create policy upd_despachos on despachos for update to authenticated using (true) with check (true);

drop policy if exists sel_barandilla on barandilla;
create policy sel_barandilla on barandilla for select to authenticated
  using (estatus = 'activo' or fn_rol_actual() in ('supervisor','investigador','administrador'));
drop policy if exists ins_barandilla on barandilla;
create policy ins_barandilla on barandilla for insert to authenticated with check (true);
drop policy if exists upd_barandilla on barandilla;
create policy upd_barandilla on barandilla for update to authenticated using (true) with check (true);
