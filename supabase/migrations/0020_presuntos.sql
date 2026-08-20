-- =====================================================================
-- 0020_presuntos.sql
-- Sub-ficha de PRESUNTOS de un caso: cada presunto con su media filiación,
-- vestimenta, tatuajes/señas, producto del robo, vehículo y fotos propias.
-- Es una lista dentro del caso (uno a muchos).
-- =====================================================================

create table if not exists presuntos (
  id                  uuid primary key default gen_random_uuid(),
  caso_id             uuid not null references casos(id),
  persona_id          uuid references personas(id),   -- si está identificado en el índice maestro
  alias               text,
  sexo                text,
  complexion          text,
  estatura            numeric,
  color_piel          text,
  vestimenta          text,               -- multi (coma-separado)
  tatuajes            text,
  senas_particulares  text,
  producto_robo       text,
  veh_marca           text,
  veh_modelo          text,
  veh_anio            int,
  veh_color           text,
  veh_placas          text,
  notas               text,
  fotografias         jsonb default '[]'::jsonb,

  estatus             text not null default 'activo' check (estatus in ('activo','cancelado')),
  cancelado_en        timestamptz,
  motivo_cancelacion  text,

  creado_en           timestamptz not null default now(),
  actualizado_en      timestamptz not null default now()
);

comment on table presuntos is 'Presuntos responsables de un caso, con media filiación, vestimenta, vehículo y fotos.';

create index if not exists idx_presuntos_caso on presuntos (caso_id);

drop trigger if exists trg_no_delete_presuntos on presuntos;
create trigger trg_no_delete_presuntos before delete on presuntos
  for each row execute function fn_bloquear_delete();

revoke delete on presuntos from authenticated, anon;

drop trigger if exists trg_auditoria_presuntos on presuntos;
create trigger trg_auditoria_presuntos after insert or update on presuntos
  for each row execute function fn_bitacora_generica();

-- Ampliar rpc_cancelar_registro con 'presuntos'.
create or replace function rpc_cancelar_registro(
  p_tabla   text,
  p_id      uuid,
  p_motivo  text
) returns void as $$
begin
  if p_tabla not in ('personas','vehiculos','ubicaciones','vinculos','casos','personal',
                     'ordenes','evidencias','asuntos_internos','llamadas_cad','despachos',
                     'barandilla','equipo','incidentes','presuntos') then
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

alter table presuntos enable row level security;
drop policy if exists sel_presuntos on presuntos;
create policy sel_presuntos on presuntos for select to authenticated
  using (estatus = 'activo' or fn_rol_actual() in ('supervisor','investigador','administrador'));
drop policy if exists ins_presuntos on presuntos;
create policy ins_presuntos on presuntos for insert to authenticated with check (true);
drop policy if exists upd_presuntos on presuntos;
create policy upd_presuntos on presuntos for update to authenticated using (true) with check (true);

-- Catálogo de vestimenta (multi-select).
insert into cat_opciones (categoria, valor, orden) values
  ('vestimenta','CAMISA MANGA CORTA',1),
  ('vestimenta','CAMISA MANGA LARGA',2),
  ('vestimenta','PLAYERA',3),
  ('vestimenta','SUDADERA',4),
  ('vestimenta','CHAMARRA',5),
  ('vestimenta','PANTALON DE MEZCLILLA',6),
  ('vestimenta','PANTALON DE VESTIR',7),
  ('vestimenta','BERMUDA',8),
  ('vestimenta','SHORT',9),
  ('vestimenta','GORRA',10),
  ('vestimenta','TENIS',11),
  ('vestimenta','ZAPATOS',12),
  ('vestimenta','BOTAS',13)
on conflict (categoria, valor) do nothing;
