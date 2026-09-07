-- =====================================================================
-- 0094_sla_catalogo.sql
-- Metas de SLA como CATÁLOGO seleccionable por cliente: cada cliente (o el
-- global) elige qué metas aplican y su valor. El catálogo de claves vive en el
-- código (lib/sla.ts). Backfill desde sla_metas (columnas fijas anteriores).
-- =====================================================================

create table if not exists sla_metas_cliente (
  id             uuid primary key default gen_random_uuid(),
  cliente_id     uuid references clientes(id),   -- null = meta global (por defecto)
  clave          text not null,
  valor          numeric,
  activa         boolean not null default true,
  actualizado_en timestamptz not null default now()
);
comment on table sla_metas_cliente is 'Selección de metas de SLA por cliente (o global): clave del catálogo + valor + si aplica.';
-- Únicas: una fila por (cliente, clave) y una global por clave.
create unique index if not exists sla_metas_cliente_cli on sla_metas_cliente(cliente_id, clave) where cliente_id is not null;
create unique index if not exists sla_metas_cliente_glob on sla_metas_cliente(clave) where cliente_id is null;

alter table sla_metas_cliente enable row level security;
drop policy if exists sel_sla_metas_cliente on sla_metas_cliente;
create policy sel_sla_metas_cliente on sla_metas_cliente for select to authenticated using (true);
drop policy if exists ins_sla_metas_cliente on sla_metas_cliente;
create policy ins_sla_metas_cliente on sla_metas_cliente for insert to authenticated
  with check (coalesce(fn_rol_actual(), '') in ('supervisor','administrador'));
drop policy if exists upd_sla_metas_cliente on sla_metas_cliente;
create policy upd_sla_metas_cliente on sla_metas_cliente for update to authenticated
  using (coalesce(fn_rol_actual(), '') in ('supervisor','administrador'))
  with check (coalesce(fn_rol_actual(), '') in ('supervisor','administrador'));
drop policy if exists del_sla_metas_cliente on sla_metas_cliente;
create policy del_sla_metas_cliente on sla_metas_cliente for delete to authenticated
  using (coalesce(fn_rol_actual(), '') in ('supervisor','administrador'));

-- Backfill: convierte las metas fijas existentes (sla_metas) al catálogo.
do $$
declare r record;
begin
  if to_regclass('public.sla_metas') is null then return; end if;
  for r in select * from sla_metas where estatus = 'activo' loop
    insert into sla_metas_cliente (cliente_id, clave, valor, activa) values
      (r.cliente_id, 'cobertura',          r.cobertura_pct,          true),
      (r.cliente_id, 'rondines_rango',     r.rondines_pct,           true),
      (r.cliente_id, 'tiempo_resolucion',  r.tiempo_resp_min,        true),
      (r.cliente_id, 'incidentes_criticos',r.incidentes_criticos_max,true)
    on conflict do nothing;
    if r.supervision_pct is not null then
      insert into sla_metas_cliente (cliente_id, clave, valor, activa)
        values (r.cliente_id, 'supervision', r.supervision_pct, false) on conflict do nothing;
    end if;
  end loop;
end $$;
