-- =====================================================================
-- 0013_equipo.sql
-- Módulo de Equipo policial (Fase 7 del roadmap).
--
-- Inventario del equipo de la agencia: armas, radios de comunicación,
-- bodycams, patrullas, motocicletas, etc. (diferenciado por `tipo`).
-- Cada pieza puede asignarse a un elemento de personal y lleva folio
-- automático (foliador, iniciales EQ), fotos y seguimiento de estado.
--
-- Requiere 0012 (foliador). Se registra el módulo en el catálogo de
-- foliadores y se le adjunta el trigger de folio.
-- =====================================================================

create table if not exists equipo (
  id                    uuid primary key default gen_random_uuid(),
  folio                 text,
  tipo                  text,             -- arma, radio, bodycam, patrulla, motocicleta, etc.
  marca                 text,
  modelo                text,
  numero_serie          text,
  asignado_personal_id  uuid references personal(id),   -- a quién está asignado (opcional)
  estado_equipo         text not null default 'operativo'
                          check (estado_equipo in ('operativo','asignado','en_reparacion','baja')),
  fecha_alta            date,
  fotografias           jsonb default '[]'::jsonb,
  datos_adicionales     jsonb default '{}'::jsonb,

  estatus               text not null default 'activo' check (estatus in ('activo','cancelado')),
  cancelado_en          timestamptz,
  motivo_cancelacion    text,

  creado_en             timestamptz not null default now(),
  actualizado_en        timestamptz not null default now()
);

comment on table equipo is 'Inventario de equipo policial (armas, radios, bodycams, patrullas, motos). Asignable a personal; folio automático.';

create index if not exists idx_equipo_tipo on equipo (tipo);
create index if not exists idx_equipo_estado on equipo (estado_equipo);
create index if not exists idx_equipo_asignado on equipo (asignado_personal_id);

create or replace view equipo_activo as
  select * from equipo where estatus = 'activo';

-- Política "cancelar, nunca borrar" + bitácora
drop trigger if exists trg_no_delete_equipo on equipo;
create trigger trg_no_delete_equipo before delete on equipo
  for each row execute function fn_bloquear_delete();

revoke delete on equipo from authenticated, anon;

drop trigger if exists trg_auditoria_equipo on equipo;
create trigger trg_auditoria_equipo after insert or update on equipo
  for each row execute function fn_bitacora_generica();

-- Foliador para equipo (iniciales EQ) + trigger de folio.
insert into foliadores (modulo, nombre, iniciales) values
  ('equipo', 'Equipo policial', 'EQ')
on conflict (modulo) do nothing;

drop trigger if exists trg_folio_equipo on equipo;
create trigger trg_folio_equipo before insert on equipo
  for each row execute function fn_asignar_folio();

-- Ampliar rpc_cancelar_registro con 'equipo' (conservando el guard de AI).
create or replace function rpc_cancelar_registro(
  p_tabla   text,
  p_id      uuid,
  p_motivo  text
) returns void as $$
begin
  if p_tabla not in ('personas','vehiculos','ubicaciones','vinculos','casos','personal',
                     'ordenes','evidencias','asuntos_internos','llamadas_cad','despachos',
                     'barandilla','equipo') then
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

-- RLS (patrón estándar)
alter table equipo enable row level security;

drop policy if exists sel_equipo on equipo;
create policy sel_equipo on equipo for select to authenticated
  using (estatus = 'activo' or fn_rol_actual() in ('supervisor','investigador','administrador'));
drop policy if exists ins_equipo on equipo;
create policy ins_equipo on equipo for insert to authenticated with check (true);
drop policy if exists upd_equipo on equipo;
create policy upd_equipo on equipo for update to authenticated using (true) with check (true);
