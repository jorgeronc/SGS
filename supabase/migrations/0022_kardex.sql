-- =====================================================================
-- 0022_kardex.sql
-- Kardex Policial: expediente laboral extendido de un elemento de Personal.
-- Modelado a partir del formato "KARDEX POLICIAL" (PDF PP00001).
--
-- Se vincula 1:1 a `personal` (que a su vez apunta a `personas`): NO duplica
-- los datos generales del elemento (nombre, CURP, RFC, grado, matrícula, fecha
-- de ingreso ya viven en personas/personal). Agrega los datos de trayectoria
-- profesional. Las secciones repetibles (formación, reconocimientos, sanciones,
-- ascensos, control y confianza, porte de arma, expediente documental) se
-- guardan como arreglos jsonb, coherente con el uso de jsonb del sistema.
-- =====================================================================

create table if not exists kardex (
  id                    uuid primary key default gen_random_uuid(),
  folio                 text,
  personal_id           uuid not null references personal(id),

  -- Contacto
  direccion             text,
  telefono              text,
  email                 text,

  -- Datos fisiológicos
  altura_cm             numeric,
  peso_kg               numeric,
  tipo_sangre           text,
  moscova               text,      -- talla del formato ("Moscova")
  talla_camisa          text,
  talla_pantalon        text,
  talla_zapato          text,

  -- CUP (Certificado Único Policial)
  cup                   text,
  cup_requisitos        text,
  cup_fin_vigencia      date,

  -- Evaluación del desempeño
  desempeno_puntaje     int,
  desempeno_productividad text,
  desempeno_fin_vigencia  date,

  -- Secciones repetibles (arreglos de objetos jsonb)
  formacion             jsonb default '[]'::jsonb,  -- [{tipo:'policial|academica|curso', institucion, formacion, fecha_fin, horas}]
  reconocimientos       jsonb default '[]'::jsonb,  -- [{reconocimiento, fecha}]
  sanciones             jsonb default '[]'::jsonb,  -- [{sancion, tipo, fecha}]
  ascensos              jsonb default '[]'::jsonb,  -- [{ascenso, resultado, grado}]
  control_confianza     jsonb default '[]'::jsonb,  -- [{examen, fecha, resultado}]
  armas                 jsonb default '[]'::jsonb,  -- [{arma, calibre, serie}]
  documentos            jsonb default '[]'::jsonb,  -- [{documento, completo, fin_vigencia}]

  datos_adicionales     jsonb default '{}'::jsonb,

  estatus               text not null default 'activo' check (estatus in ('activo','cancelado')),
  cancelado_en          timestamptz,
  motivo_cancelacion    text,

  creado_en             timestamptz not null default now(),
  actualizado_en        timestamptz not null default now()
);

comment on table kardex is 'Kardex Policial: expediente de trayectoria profesional de un elemento (1:1 con personal). No duplica datos generales.';

create index if not exists idx_kardex_personal on kardex (personal_id);
-- Un solo kardex activo por elemento.
create unique index if not exists uq_kardex_personal_activo on kardex (personal_id) where estatus = 'activo';

create or replace view kardex_activo as
  select * from kardex where estatus = 'activo';

drop trigger if exists trg_no_delete_kardex on kardex;
create trigger trg_no_delete_kardex before delete on kardex
  for each row execute function fn_bloquear_delete();

revoke delete on kardex from authenticated, anon;

drop trigger if exists trg_auditoria_kardex on kardex;
create trigger trg_auditoria_kardex after insert or update on kardex
  for each row execute function fn_bitacora_generica();

-- Foliador (iniciales KA) + trigger de folio.
insert into foliadores (modulo, nombre, iniciales) values
  ('kardex', 'Kardex Policial', 'KA')
on conflict (modulo) do nothing;

drop trigger if exists trg_folio_kardex on kardex;
create trigger trg_folio_kardex before insert on kardex
  for each row execute function fn_asignar_folio();

-- Ampliar rpc_cancelar_registro con 'kardex'.
create or replace function rpc_cancelar_registro(
  p_tabla   text,
  p_id      uuid,
  p_motivo  text
) returns void as $$
begin
  if p_tabla not in ('personas','vehiculos','ubicaciones','vinculos','casos','personal',
                     'ordenes','evidencias','asuntos_internos','llamadas_cad','despachos',
                     'barandilla','equipo','incidentes','presuntos','kardex') then
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

-- RLS
alter table kardex enable row level security;

drop policy if exists sel_kardex on kardex;
create policy sel_kardex on kardex for select to authenticated
  using (estatus = 'activo' or fn_rol_actual() in ('supervisor','investigador','administrador'));
drop policy if exists ins_kardex on kardex;
create policy ins_kardex on kardex for insert to authenticated with check (true);
drop policy if exists upd_kardex on kardex;
create policy upd_kardex on kardex for update to authenticated using (true) with check (true);
