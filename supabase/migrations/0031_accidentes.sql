-- =====================================================================
-- 0031_accidentes.sql   (Módulo Accidentes viales)
--
-- Informe de accidente vial (parte de tránsito). Campos tomados de
-- Tablas/Accidentes1.jpg (GENERALES), Accidentes2.jpg (VEHÍCULOS) y
-- Accidentes3.jpg (PARTE: croquis + fotos).
--
-- Los vehículos participantes se guardan en el catálogo maestro `vehiculos` y
-- sus conductores en `personas`; el detalle específico del accidente (rol
-- responsable/afectado, tipo de servicio, aseguradora, foto) vive en la tabla
-- hija `accidente_vehiculos`. Puede iniciarse desde un reporte CAD (llamada_id).
-- =====================================================================

create table if not exists accidentes (
  id                   uuid primary key default gen_random_uuid(),
  folio                text,
  llamada_id           uuid references llamadas_cad(id),   -- si se inició de un reporte

  -- Generales
  fecha                date,
  hora                 time,
  dia                  text,                               -- día de la semana
  oficial_personal_id  uuid references personal(id),
  bodycam              text,
  tipo_hecho           text,                               -- catálogo tipo_hecho_transito
  latitud              double precision,
  longitud             double precision,
  direccion            text,
  sentido_circulacion  text,                               -- Nte-Sur / Sur-Nte / Ote-Pte / Pte-Ote
  entre_calles         text,
  tipo_via             text,                               -- Calle / Avenida / Boulevard / Carretera / Brecha
  pavimentada          boolean,
  total_vehiculos      text,                               -- '1'..'5' / '6-10'
  lesionados           boolean,
  fallecidos           boolean,
  condicion_clima      text,                               -- Seco / Lluvioso / ...
  estatus_atencion     text,                               -- Atendiendo / Cerrado sin lesionados / Cerrado con detenidos

  -- Parte
  croquis              text,                               -- ruta del dibujo en Storage
  fotografias          jsonb default '[]'::jsonb,          -- fotos para el parte
  descripcion          text,

  estatus              text not null default 'activo' check (estatus in ('activo','cancelado')),
  cancelado_en         timestamptz,
  motivo_cancelacion   text,
  creado_en            timestamptz not null default now(),
  actualizado_en       timestamptz not null default now()
);
comment on table accidentes is 'Informes de accidentes viales (parte de tránsito): generales, participantes (accidente_vehiculos), croquis y fotos.';

create index if not exists idx_accidentes_oficial on accidentes (oficial_personal_id);
create index if not exists idx_accidentes_llamada on accidentes (llamada_id);
create index if not exists idx_accidentes_fecha on accidentes (fecha desc);

-- Vehículos/participantes del accidente (vehículo + conductor + rol).
create table if not exists accidente_vehiculos (
  id                    uuid primary key default gen_random_uuid(),
  accidente_id          uuid not null references accidentes(id),
  orden                 int not null default 1,            -- Vehículo 1, 2, ...
  vehiculo_id           uuid references vehiculos(id),     -- índice maestro
  conductor_persona_id  uuid references personas(id),      -- índice maestro
  placa                 text,
  tipo_vehiculo         text,                              -- catálogo tipo_vehiculo_accidente
  tipo_servicio         text,                              -- Particular / Público
  rol                   text,                              -- catálogo rol_participante_accidente
  asegurado             boolean,
  compania              text,
  foto                  text,                              -- ruta de la foto del vehículo en Storage
  creado_en             timestamptz not null default now()
);
comment on table accidente_vehiculos is 'Vehículos participantes de un accidente, con su conductor (persona), rol (responsable/afectado), aseguradora y foto.';
create index if not exists idx_acc_veh_accidente on accidente_vehiculos (accidente_id);

-- Triggers del padre: no-delete (WORM) + bitácora + foliador (AV).
drop trigger if exists trg_no_delete_accidentes on accidentes;
create trigger trg_no_delete_accidentes before delete on accidentes
  for each row execute function fn_bloquear_delete();
revoke delete on accidentes from authenticated, anon;

drop trigger if exists trg_auditoria_accidentes on accidentes;
create trigger trg_auditoria_accidentes after insert or update on accidentes
  for each row execute function fn_bitacora_generica();

insert into foliadores (modulo, nombre, iniciales) values ('accidentes','Accidentes viales','AV')
  on conflict (modulo) do nothing;
drop trigger if exists trg_folio_accidentes on accidentes;
create trigger trg_folio_accidentes before insert on accidentes
  for each row execute function fn_asignar_folio();

-- RLS del padre (patrón estándar operativo).
alter table accidentes enable row level security;
drop policy if exists sel_accidentes on accidentes;
create policy sel_accidentes on accidentes for select to authenticated
  using (estatus = 'activo' or fn_rol_actual() in ('supervisor','investigador','administrador'));
drop policy if exists ins_accidentes on accidentes;
create policy ins_accidentes on accidentes for insert to authenticated with check (true);
drop policy if exists upd_accidentes on accidentes;
create policy upd_accidentes on accidentes for update to authenticated using (true) with check (true);

-- RLS de la tabla hija (se puede agregar/quitar participantes mientras se edita).
alter table accidente_vehiculos enable row level security;
drop policy if exists sel_acc_veh on accidente_vehiculos;
create policy sel_acc_veh on accidente_vehiculos for select to authenticated using (true);
drop policy if exists ins_acc_veh on accidente_vehiculos;
create policy ins_acc_veh on accidente_vehiculos for insert to authenticated with check (true);
drop policy if exists upd_acc_veh on accidente_vehiculos;
create policy upd_acc_veh on accidente_vehiculos for update to authenticated using (true) with check (true);
drop policy if exists del_acc_veh on accidente_vehiculos;
create policy del_acc_veh on accidente_vehiculos for delete to authenticated using (true);

-- Ampliar rpc_cancelar_registro con 'accidentes'.
create or replace function rpc_cancelar_registro(p_tabla text, p_id uuid, p_motivo text)
returns void as $$
begin
  if p_tabla not in ('personas','vehiculos','ubicaciones','vinculos','casos','personal',
                     'ordenes','evidencias','asuntos_internos','llamadas_cad','despachos',
                     'barandilla','equipo','incidentes','presuntos','kardex',
                     'patrullas','armamento','comunicacion','bodycams','otros',
                     'rol_servicio','rol_servicio_asignaciones','abordamientos','accidentes') then
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

-- Catálogos del módulo.
insert into cat_opciones (categoria, valor, orden) values
  ('tipo_hecho_transito','CHOQUE POR ALCANCE',1),
  ('tipo_hecho_transito','CHOQUE LATERAL',2),
  ('tipo_hecho_transito','CHOQUE FRONTAL',3),
  ('tipo_hecho_transito','CHOQUE POR PROYECCION',4),
  ('tipo_hecho_transito','VOLCADURA',5),
  ('tipo_hecho_transito','ATROPELLAMIENTO',6),
  ('tipo_hecho_transito','SALIDA DE CAMINO',7),
  ('tipo_hecho_transito','COLISION CON OBJETO FIJO',8),
  ('tipo_hecho_transito','CAIDA DE PASAJERO',9),
  ('tipo_hecho_transito','OTRO',10),
  ('sentido_circulacion','NTE-SUR',1),
  ('sentido_circulacion','SUR-NTE',2),
  ('sentido_circulacion','OTE-PTE',3),
  ('sentido_circulacion','PTE-OTE',4),
  ('tipo_via','CALLE',1),
  ('tipo_via','AVENIDA',2),
  ('tipo_via','BOULEVARD',3),
  ('tipo_via','CARRETERA',4),
  ('tipo_via','BRECHA',5),
  ('condicion_clima','SECO',1),
  ('condicion_clima','LLUVIOSO',2),
  ('condicion_clima','GRANIZO',3),
  ('condicion_clima','NIEVE',4),
  ('condicion_clima','NEBLINA',5),
  ('condicion_clima','HIELO',6),
  ('condicion_clima','OTRO',7),
  ('tipo_vehiculo_accidente','AUTOMOVIL',1),
  ('tipo_vehiculo_accidente','CAMIONETA',2),
  ('tipo_vehiculo_accidente','URBANO',3),
  ('tipo_vehiculo_accidente','TRAILER',4),
  ('tipo_vehiculo_accidente','MOTOCICLETA',5),
  ('tipo_vehiculo_accidente','BICICLETA',6),
  ('tipo_vehiculo_accidente','OTRO',7),
  ('tipo_servicio_vehiculo','PARTICULAR',1),
  ('tipo_servicio_vehiculo','PUBLICO',2),
  ('rol_participante_accidente','RESPONSABLE',1),
  ('rol_participante_accidente','AFECTADO',2),
  ('estatus_accidente','ATENDIENDO',1),
  ('estatus_accidente','CERRADO SIN LESIONADOS',2),
  ('estatus_accidente','CERRADO CON DETENIDOS',3)
on conflict (categoria, valor) do nothing;
