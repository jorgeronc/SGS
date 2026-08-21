-- =====================================================================
-- 0050_guardias.sql · SGS — Módulo Guardias (adapta Personal a seguridad privada)
--
-- Reutiliza la tabla `personal` (identidad de persona + WORM + folios + bitácora)
-- y le agrega los campos propios del guardia de seguridad privada. La asignación
-- a sitio/turno se hará en el módulo de Sitios (no aquí).
-- =====================================================================

-- 1) Campos de guardia en `personal` -----------------------------------
alter table personal add column if not exists categoria text;                        -- catálogo categoria_guardia
alter table personal add column if not exists registro_autoridad text;               -- nº de registro / credencial ante la autoridad
alter table personal add column if not exists registro_vigencia date;
alter table personal add column if not exists control_confianza text
  check (control_confianza is null or control_confianza in ('aprobado','pendiente','no_aprobado','no_aplica'));
alter table personal add column if not exists control_confianza_vigencia date;
alter table personal add column if not exists porta_arma boolean not null default false;
alter table personal add column if not exists licencia_colectiva text;                -- amparo de portación (licencia colectiva)
alter table personal add column if not exists contacto_emergencia_nombre text;
alter table personal add column if not exists contacto_emergencia_tel text;

comment on column personal.categoria is 'Tipo de guardia (catálogo categoria_guardia).';
comment on column personal.control_confianza is 'Resultado del examen de control y confianza.';

-- 2) Catálogos ---------------------------------------------------------
insert into cat_opciones (categoria, valor, orden) values
  ('categoria_guardia','Guardia intramuros',1),
  ('categoria_guardia','Escolta',2),
  ('categoria_guardia','Canino (K9)',3),
  ('categoria_guardia','Monitorista / CCTV',4),
  ('categoria_guardia','Custodia de valores',5),
  ('categoria_guardia','Supervisor',6),
  ('categoria_guardia','Jefe de turno',7)
on conflict (categoria, valor) do nothing;

-- 3) Capacitación / cursos del guardia (lista 1-a-muchos) --------------
create table if not exists guardia_capacitacion (
  id                  uuid primary key default gen_random_uuid(),
  personal_id         uuid not null references personal(id) on delete cascade,
  curso               text not null,
  institucion         text,
  fecha               date,
  vigencia            date,
  observaciones       text,
  datos_adicionales   jsonb default '{}'::jsonb,
  estatus             text not null default 'activo' check (estatus in ('activo','cancelado')),
  cancelado_en        timestamptz,
  motivo_cancelacion  text,
  creado_en           timestamptz not null default now(),
  actualizado_en      timestamptz not null default now()
);
create index if not exists idx_guardia_capacitacion_personal on guardia_capacitacion(personal_id);

comment on table guardia_capacitacion is 'Cursos de formación/capacitación del guardia (SPF/CNSP y otros), con vigencia.';

-- WORM: no se borra (se cancela).
alter table guardia_capacitacion enable row level security;

drop policy if exists sel_guardia_capacitacion on guardia_capacitacion;
create policy sel_guardia_capacitacion on guardia_capacitacion for select to authenticated using (true);
drop policy if exists ins_guardia_capacitacion on guardia_capacitacion;
create policy ins_guardia_capacitacion on guardia_capacitacion for insert to authenticated with check (true);
drop policy if exists upd_guardia_capacitacion on guardia_capacitacion;
create policy upd_guardia_capacitacion on guardia_capacitacion for update to authenticated using (true) with check (true);

drop trigger if exists trg_no_delete_guardia_capacitacion on guardia_capacitacion;
create trigger trg_no_delete_guardia_capacitacion
  before delete on guardia_capacitacion for each row execute function fn_bloquear_delete();
revoke delete on guardia_capacitacion from authenticated, anon;

drop trigger if exists trg_auditoria_guardia_capacitacion on guardia_capacitacion;
create trigger trg_auditoria_guardia_capacitacion
  after insert or update on guardia_capacitacion for each row execute function fn_bitacora_generica();

-- 4) Ampliar rpc_cancelar_registro con guardia_capacitacion ------------
create or replace function rpc_cancelar_registro(
  p_tabla   text,
  p_id      uuid,
  p_motivo  text
) returns void as $$
begin
  if p_tabla not in ('personas','vehiculos','ubicaciones','vinculos','casos','personal',
                     'ordenes','evidencias','asuntos_internos','llamadas_cad','despachos',
                     'barandilla','equipo','incidentes','presuntos','kardex',
                     'patrullas','armamento','comunicacion','bodycams','otros',
                     'rol_servicio','rol_servicio_asignaciones','abordamientos','accidentes',
                     'tareas','tarea_asignaciones','transmisiones','caso_relaciones',
                     'guardia_capacitacion') then
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
