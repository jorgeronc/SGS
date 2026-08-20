-- =====================================================================
-- 0041_cad_historial.sql · Historial de estados de un reporte CAD
--
-- Registra, con fecha/hora y usuario, cada cambio de estado del REPORTE
-- (estado_despacho, estatus) y de cada DESPACHO/unidad (estado). Sirve para
-- reconstruir cómo se atendió el reporte. Se muestra en pantalla y en el PDF.
-- =====================================================================

create table if not exists cad_estado_historial (
  id             bigint generated always as identity primary key,
  llamada_id     uuid not null references llamadas_cad(id) on delete cascade,
  despacho_id    uuid references despachos(id),
  ambito         text not null check (ambito in ('reporte','despacho')),
  campo          text not null,          -- estado_despacho | estatus | estado
  estado         text,                   -- valor nuevo
  patrulla_numero text,                  -- número de unidad (si es despacho)
  usuario        text,
  cambiado_en    timestamptz not null default now()
);
create index if not exists idx_cad_hist_llamada on cad_estado_historial (llamada_id, cambiado_en);

comment on table cad_estado_historial is 'Bitácora de cambios de estado de un reporte CAD y sus despachos (para la línea de tiempo de atención).';

alter table cad_estado_historial enable row level security;
drop policy if exists sel_cad_hist on cad_estado_historial;
create policy sel_cad_hist on cad_estado_historial for select to authenticated using (true);
-- Solo los triggers escriben (SECURITY DEFINER); no se permite insert directo.
revoke insert, update, delete on cad_estado_historial from authenticated, anon;

-- Email del usuario que provoca el cambio (si hay sesión).
create or replace function fn_usuario_actual() returns text
language sql stable as $$
  select coalesce(nullif(auth.jwt() ->> 'email', ''), null);
$$;

-- Reporte: alta (estado inicial) y cambios de estado_despacho / estatus.
create or replace function fn_hist_reporte() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into cad_estado_historial (llamada_id, ambito, campo, estado, usuario)
      values (new.id, 'reporte', 'estado_despacho', new.estado_despacho, fn_usuario_actual());
    return new;
  end if;
  if new.estado_despacho is distinct from old.estado_despacho then
    insert into cad_estado_historial (llamada_id, ambito, campo, estado, usuario)
      values (new.id, 'reporte', 'estado_despacho', new.estado_despacho, fn_usuario_actual());
  end if;
  if new.estatus is distinct from old.estatus then
    insert into cad_estado_historial (llamada_id, ambito, campo, estado, usuario)
      values (new.id, 'reporte', 'estatus', new.estatus, fn_usuario_actual());
  end if;
  return new;
end;
$$;
drop trigger if exists trg_hist_reporte_ins on llamadas_cad;
create trigger trg_hist_reporte_ins after insert on llamadas_cad for each row execute function fn_hist_reporte();
drop trigger if exists trg_hist_reporte_upd on llamadas_cad;
create trigger trg_hist_reporte_upd after update on llamadas_cad for each row execute function fn_hist_reporte();

-- Despacho: alta (asignada) y cada cambio de estado de la unidad.
create or replace function fn_hist_despacho() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_num text;
begin
  select numero into v_num from patrullas where id = new.patrulla_id;
  if tg_op = 'INSERT' then
    insert into cad_estado_historial (llamada_id, despacho_id, ambito, campo, estado, patrulla_numero, usuario)
      values (new.llamada_id, new.id, 'despacho', 'estado', new.estado, v_num, fn_usuario_actual());
    return new;
  end if;
  if new.estado is distinct from old.estado then
    insert into cad_estado_historial (llamada_id, despacho_id, ambito, campo, estado, patrulla_numero, usuario)
      values (new.llamada_id, new.id, 'despacho', 'estado', new.estado, v_num, fn_usuario_actual());
  end if;
  return new;
end;
$$;
drop trigger if exists trg_hist_despacho_ins on despachos;
create trigger trg_hist_despacho_ins after insert on despachos for each row execute function fn_hist_despacho();
drop trigger if exists trg_hist_despacho_upd on despachos;
create trigger trg_hist_despacho_upd after update on despachos for each row execute function fn_hist_despacho();
