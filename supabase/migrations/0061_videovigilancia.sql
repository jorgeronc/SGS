-- =====================================================================
-- 0061_videovigilancia.sql · Módulo de Videovigilancia (cámaras fijas)
--
-- Catálogo de CÁMARAS FIJAS (CCTV) ancladas geográficamente a un SITIO/puesto,
-- para pintarlas en el mapa de monitoreo y ofrecer las CERCANAS a una alerta o
-- incidencia. Complementa (no reemplaza) la transmisión en vivo de bodycam
-- (tabla `transmisiones`), que es la cámara MÓVIL del teléfono del guardia.
--
-- Reglas del diseño (heredadas del documento de referencia, adaptadas a SGS):
--   • El video NO se almacena. La fila sólo IDENTIFICA la cámara ante su
--     proveedor (proveedor + proveedor_ref) o trae su stream fijo (proveedor
--     'manual'). La imagen/reproductor se resuelven AL VUELO por petición
--     (Edge Function `camara_vista`), porque los proveedores firman URLs que
--     caducan y la API key vive SÓLO en el backend.
--   • Cámaras 'manual' (NVR/DVR del propio cliente): traen `stream_url` fija y
--     no necesitan Edge Function ni llave.
--
-- Convenciones SGS aplicadas: sin PostGIS (lat/lng + fn_distancia_m/Haversine),
-- WORM (baja = cancelación, nunca DELETE), folio (CM), bitácora, dos ejes de
-- estatus (retención `estatus` vs. dominio `estado_operativo`), RLS por rol.
-- =====================================================================

-- 1) Tabla de cámaras --------------------------------------------------
create table if not exists camaras (
  id                  uuid primary key default gen_random_uuid(),
  folio               text,
  nombre              text not null,
  sitio_id            uuid not null references sitios(id),
  latitud             double precision,
  longitud            double precision,
  ubicacion_desc      text,                              -- "Acceso norte, piso 2, lobby…"

  -- Proveedor de la señal. 'manual' = stream propio del cliente; cualquier otro
  -- (p. ej. 'windy' o un VMS futuro) se resuelve por la Edge Function.
  proveedor           text not null default 'manual',
  proveedor_ref       text,                              -- id de la cámara en el proveedor
  stream_url          text,                              -- sólo 'manual' (HLS/MJPEG/embed)

  -- Eje de DOMINIO (no confundir con `estatus`, que es retención WORM).
  estado_operativo    text not null default 'activa'
                        check (estado_operativo in ('activa','inactiva','mantenimiento')),

  datos_adicionales   jsonb default '{}'::jsonb,
  estatus             text not null default 'activo' check (estatus in ('activo','cancelado')),
  cancelado_en        timestamptz,
  motivo_cancelacion  text,
  creado_en           timestamptz not null default now(),
  actualizado_en      timestamptz not null default now(),

  -- 'manual' EXIGE stream_url; cualquier otro proveedor EXIGE proveedor_ref.
  constraint chk_camara_fuente check (
    (proveedor = 'manual' and stream_url is not null)
    or (proveedor <> 'manual' and proveedor_ref is not null)
  )
);
comment on table camaras is 'Catálogo de cámaras fijas (CCTV) ancladas a un sitio; la señal es efímera y se resuelve al vuelo (Edge Function camara_vista). El video no se almacena.';

create index if not exists idx_camaras_sitio  on camaras (sitio_id);
create index if not exists idx_camaras_estado on camaras (estado_operativo);
-- Evita importar/dar de alta dos veces la misma cámara del mismo proveedor.
create unique index if not exists idx_camaras_proveedor_ref
  on camaras (proveedor, proveedor_ref) where proveedor_ref is not null;

-- 2) Foliador (CAM), WORM (no-delete) y bitácora ----------------------
insert into foliadores (modulo, nombre, iniciales) values ('camaras','Cámaras','CM')
  on conflict (modulo) do nothing;
drop trigger if exists trg_folio_camaras on camaras;
create trigger trg_folio_camaras before insert on camaras for each row execute function fn_asignar_folio();

drop trigger if exists trg_no_delete_camaras on camaras;
create trigger trg_no_delete_camaras before delete on camaras for each row execute function fn_bloquear_delete();
revoke delete on camaras from authenticated, anon;

drop trigger if exists trg_auditoria_camaras on camaras;
create trigger trg_auditoria_camaras after insert or update on camaras for each row execute function fn_bitacora_generica();

-- 3) RLS: ver = cualquier autenticado; gestionar = mando -------------------
alter table camaras enable row level security;
drop policy if exists sel_camaras on camaras;
create policy sel_camaras on camaras for select to authenticated using (true);
drop policy if exists ins_camaras on camaras;
create policy ins_camaras on camaras for insert to authenticated
  with check (coalesce(fn_rol_actual(), '') in ('supervisor','administrador'));
drop policy if exists upd_camaras on camaras;
create policy upd_camaras on camaras for update to authenticated
  using (coalesce(fn_rol_actual(), '') in ('supervisor','administrador'))
  with check (coalesce(fn_rol_actual(), '') in ('supervisor','administrador'));

-- 4) Cámaras cercanas a un punto (para el detalle de alerta/incidencia) ----
--    Devuelve las cámaras ACTIVAS dentro del radio, de la más cercana a la más
--    lejana, usando la fórmula de Haversine (fn_distancia_m, migración 0059).
create or replace function rpc_camaras_cercanas(
  p_lat     double precision,
  p_lng     double precision,
  p_radio_m double precision default 800,
  p_limite  int default 20
) returns table (
  id uuid, folio text, nombre text, sitio_id uuid, sitio_nombre text,
  latitud double precision, longitud double precision,
  proveedor text, estado_operativo text, distancia_m double precision
) language sql stable as $$
  select c.id, c.folio, c.nombre, c.sitio_id, s.nombre as sitio_nombre,
         c.latitud, c.longitud, c.proveedor, c.estado_operativo,
         round(fn_distancia_m(p_lat, p_lng, c.latitud, c.longitud)::numeric, 1)::double precision as distancia_m
  from camaras c
  join sitios s on s.id = c.sitio_id
  where c.estatus = 'activo'
    and c.estado_operativo = 'activa'
    and c.latitud is not null and c.longitud is not null
    and p_lat is not null and p_lng is not null
    and fn_distancia_m(p_lat, p_lng, c.latitud, c.longitud) <= p_radio_m
  order by fn_distancia_m(p_lat, p_lng, c.latitud, c.longitud)
  limit p_limite;
$$;

-- 5) Ampliar rpc_cancelar_registro con 'camaras' (WORM) ---------------------
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
                     'guardia_capacitacion','clientes','sitios','turnos',
                     'puntos_control','rondines','camaras') then
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
