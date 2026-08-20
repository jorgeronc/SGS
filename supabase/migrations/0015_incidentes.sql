-- =====================================================================
-- 0015_incidentes.sql
-- Módulo de Incidentes (informe de incidente) + Novedades, y alineación de
-- los estados de despacho al flujo del policía en la app móvil.
--
-- Flujo: una llamada llega a CAD → se despacha una unidad → el policía, desde
-- el móvil, cambia el estado del despacho (Enterado → En Ruta → En el Lugar →
-- Cerrado), reporta novedades y, en ciertos tipos (robo, etc.), levanta un
-- INFORME DE INCIDENTE. El informe se registra/consulta también desde la web.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Estados de despacho alineados al flujo movil del policía.
-- ---------------------------------------------------------------------
alter table despachos drop constraint if exists despachos_estado_check;
update despachos set estado = 'en_lugar' where estado = 'en_sitio';
update despachos set estado = 'cerrado'  where estado = 'liberada';
alter table despachos
  alter column estado set default 'asignada';
alter table despachos add constraint despachos_estado_check
  check (estado in ('asignada','enterado','en_ruta','en_lugar','cerrado'));

-- ---------------------------------------------------------------------
-- 2) INCIDENTES (informe de incidente)
-- ---------------------------------------------------------------------
create table if not exists incidentes (
  id                    uuid primary key default gen_random_uuid(),
  folio                 text,
  llamada_cad_id        uuid references llamadas_cad(id),   -- reporte de CAD que origina el informe
  tipo                  text,
  narrativa             text,
  oficial_personal_id   uuid references personal(id),       -- policía que reporta
  direccion             text,
  latitud               double precision,
  longitud              double precision,
  estado                text not null default 'abierto'
                          check (estado in ('abierto','en_proceso','cerrado')),
  fecha_incidente       timestamptz not null default now(),
  fotografias           jsonb default '[]'::jsonb,
  datos_adicionales     jsonb default '{}'::jsonb,

  estatus               text not null default 'activo' check (estatus in ('activo','cancelado')),
  cancelado_en          timestamptz,
  motivo_cancelacion    text,

  creado_en             timestamptz not null default now(),
  actualizado_en        timestamptz not null default now()
);

comment on table incidentes is 'Informe de incidente levantado por el policía a partir de un reporte de CAD (o directo). Se llena/consulta en web y móvil.';

create index if not exists idx_incidentes_llamada on incidentes (llamada_cad_id);
create index if not exists idx_incidentes_estado on incidentes (estado);

create or replace view incidentes_activos as
  select * from incidentes where estatus = 'activo';

drop trigger if exists trg_no_delete_incidentes on incidentes;
create trigger trg_no_delete_incidentes before delete on incidentes
  for each row execute function fn_bloquear_delete();

revoke delete on incidentes from authenticated, anon;

drop trigger if exists trg_auditoria_incidentes on incidentes;
create trigger trg_auditoria_incidentes after insert or update on incidentes
  for each row execute function fn_bitacora_generica();

-- Foliador para incidentes (iniciales IN) + trigger de folio.
insert into foliadores (modulo, nombre, iniciales) values
  ('incidentes', 'Informes de Incidente', 'IN')
on conflict (modulo) do nothing;

drop trigger if exists trg_folio_incidentes on incidentes;
create trigger trg_folio_incidentes before insert on incidentes
  for each row execute function fn_asignar_folio();

-- ---------------------------------------------------------------------
-- 3) NOVEDADES (append-only): actualizaciones del policía sobre un incidente.
-- ---------------------------------------------------------------------
create table if not exists novedades (
  id            bigint generated always as identity primary key,
  incidente_id  uuid not null references incidentes(id),
  texto         text not null,
  reportado_por text,
  fecha         timestamptz not null default now(),
  creado_en     timestamptz not null default now()
);

comment on table novedades is 'Novedades (bitácora append-only) reportadas por el policía sobre un incidente.';

create index if not exists idx_novedades_incidente on novedades (incidente_id, fecha);

create or replace function fn_bloquear_cambios_append_only()
returns trigger as $$
begin
  raise exception 'Registro de solo escritura (append-only): no se puede modificar ni borrar (operación %).', tg_op;
end;
$$ language plpgsql;

drop trigger if exists trg_novedades_worm on novedades;
create trigger trg_novedades_worm before update or delete on novedades
  for each row execute function fn_bloquear_cambios_append_only();

revoke update, delete on novedades from authenticated, anon;

-- ---------------------------------------------------------------------
-- 4) Ampliar rpc_cancelar_registro con 'incidentes'.
-- ---------------------------------------------------------------------
create or replace function rpc_cancelar_registro(
  p_tabla   text,
  p_id      uuid,
  p_motivo  text
) returns void as $$
begin
  if p_tabla not in ('personas','vehiculos','ubicaciones','vinculos','casos','personal',
                     'ordenes','evidencias','asuntos_internos','llamadas_cad','despachos',
                     'barandilla','equipo','incidentes') then
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
-- 5) RLS
-- ---------------------------------------------------------------------
alter table incidentes enable row level security;

drop policy if exists sel_incidentes on incidentes;
create policy sel_incidentes on incidentes for select to authenticated
  using (estatus = 'activo' or fn_rol_actual() in ('supervisor','investigador','administrador'));
drop policy if exists ins_incidentes on incidentes;
create policy ins_incidentes on incidentes for insert to authenticated with check (true);
drop policy if exists upd_incidentes on incidentes;
create policy upd_incidentes on incidentes for update to authenticated using (true) with check (true);

alter table novedades enable row level security;

drop policy if exists sel_novedades on novedades;
create policy sel_novedades on novedades for select to authenticated using (true);
drop policy if exists ins_novedades on novedades;
create policy ins_novedades on novedades for insert to authenticated with check (true);
