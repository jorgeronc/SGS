-- =====================================================================
-- 0067_videovigilancia_vms.sql
-- Videovigilancia "VMS-ready": el módulo hace HOY con Windy lo que aporta valor
-- (snapshot->evidencia, crear incidente, historial) y queda CABLEADO para recibir
-- un VMS real (ISS/SecurOS, Milestone, Genetec) sin rehacer UI ni esquema.
--
-- Diseño: la UI es guiada por CAPACIDADES (live/snapshot/ptz/grabacion/eventos).
-- Las capacidades las calcula la Edge Function `camara_vista` como intersección
-- del DRIVER (proveedor) y las banderas de la cámara (p. ej. es_ptz). PTZ/grabación/
-- eventos NO se simulan: se muestran deshabilitados hasta que un driver los declare.
-- =====================================================================

-- 1) Metadatos de cámara (ficha técnica / inventario) ------------------
alter table camaras
  add column if not exists tipo                 text,          -- 'fija' | 'ptz' | 'domo' | 'bullet' ...
  add column if not exists es_ptz               boolean not null default false,
  add column if not exists resolucion           text,          -- '1920x1080'
  add column if not exists fps                  integer,
  add column if not exists vms                  text,          -- 'ISS SecurOS' | 'Milestone XProtect' | 'Genetec' | null
  add column if not exists ip                   text,
  add column if not exists zona                 text,          -- zona lógica dentro del sitio ('Acceso 1')
  add column if not exists retencion_dias       integer,
  add column if not exists grabacion_disponible boolean not null default false,
  add column if not exists ultima_actividad     timestamptz;

comment on column camaras.es_ptz is 'La cámara es PTZ (habilita controles PTZ cuando el driver del VMS también lo soporta).';
comment on column camaras.vms is 'VMS/NVR que la gestiona; null = señal directa (Windy/manual). Define el driver de camara_vista.';

-- 2) Eventos de cámara (RECEPTOR de analítica / VMS) -------------------
-- Vacío hoy (Windy no produce eventos); lo alimenta un VMS o motor de analítica
-- (por service_role / webhook). Alimenta la pestaña "Eventos" del inspector.
create table if not exists camara_eventos (
  id             uuid primary key default gen_random_uuid(),
  camara_id      uuid not null references camaras(id),
  tipo           text not null,                 -- 'movimiento' | 'intrusion' | 'lpr' | 'tamper' | 'perdida_senal' ...
  severidad      text not null default 'info' check (severidad in ('info','aviso','critico')),
  descripcion    text,
  snapshot_url   text,                          -- fotograma del evento (si el VMS lo entrega)
  ocurrido_en    timestamptz not null default now(),
  resultado      text check (resultado in ('validado','descartado')),  -- tras revisión del operador
  llamada_id     uuid references llamadas_cad(id),                      -- si se convirtió en incidente
  datos_adicionales jsonb default '{}'::jsonb,
  creado_en      timestamptz not null default now()
);
create index if not exists idx_cam_eventos_camara on camara_eventos (camara_id, ocurrido_en desc);
comment on table camara_eventos is 'Eventos analíticos por cámara (receptor de VMS/analítica). Telemetría; se llena por backend (service_role), no por la app.';

alter table camara_eventos enable row level security;
-- Lectura para usuarios autenticados (la UI solo muestra eventos de cámaras que ya ve).
drop policy if exists sel_camara_eventos on camara_eventos;
create policy sel_camara_eventos on camara_eventos for select to authenticated using (true);
-- El operador puede marcar validado/descartado (update acotado); alta = backend.
drop policy if exists upd_camara_eventos on camara_eventos;
create policy upd_camara_eventos on camara_eventos for update to authenticated
  using (true) with check (true);
revoke delete on camara_eventos from authenticated, anon;
do $$ begin alter publication supabase_realtime add table camara_eventos; exception when duplicate_object then null; end $$;

-- 3) RPC: snapshot -> evidencia (atómico, con cadena de custodia + vínculo) ----
-- El frontend pasa la imagen ya resuelta (VisorCamara la tiene). Se preserva el
-- REGISTRO WORM de evidencia + custodia + vínculo cámara->evidencia. (Con Windy la
-- imagen es una URL efímera; con un VMS el driver entregará un snapshot persistible.)
create or replace function rpc_camara_snapshot_evidencia(
  p_camara uuid, p_imagen_url text, p_nota text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_cam camaras; v_ev uuid; v_folio text; v_resp text;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  select * into v_cam from camaras where id = p_camara;
  if v_cam.id is null then raise exception 'Cámara no encontrada'; end if;

  select coalesce(nombre, 'Operador') into v_resp from usuarios_perfil where id = auth.uid();

  insert into evidencias (tipo, descripcion, estado_evidencia, fecha_recoleccion, fotografias, datos_adicionales)
    values ('snapshot_camara',
            coalesce(p_nota, 'Captura de ' || coalesce(v_cam.nombre, 'cámara')),
            'recolectada', now(),
            case when p_imagen_url is null then '[]'::jsonb else jsonb_build_array(p_imagen_url) end,
            jsonb_build_object('origen','videovigilancia','camara_id', v_cam.id,
                               'camara_folio', v_cam.folio, 'sitio_id', v_cam.sitio_id,
                               'proveedor', v_cam.proveedor, 'capturado_en', now()))
    returning id, folio into v_ev, v_folio;

  insert into cadena_custodia (evidencia_id, tipo_evento, responsable, ubicacion, notas)
    values (v_ev, 'recoleccion', coalesce(v_resp,'Operador'),
            coalesce(v_cam.ubicacion_desc, v_cam.zona), 'Captura desde videovigilancia');

  insert into vinculos (entidad_origen_tipo, entidad_origen_id, entidad_destino_tipo, entidad_destino_id, tipo_relacion)
    values ('camara', v_cam.id, 'evidencia', v_ev, 'snapshot');

  return jsonb_build_object('evidencia_id', v_ev, 'folio', v_folio);
end; $$;

-- 4) RPC: crear incidente desde una cámara (precargado + vínculo) -------------
create or replace function rpc_camara_crear_incidente(
  p_camara uuid, p_tipo text default null, p_prioridad text default 'media',
  p_descripcion text default null, p_snapshot_url text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_cam camaras; v_id uuid; v_folio text;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  select * into v_cam from camaras where id = p_camara;
  if v_cam.id is null then raise exception 'Cámara no encontrada'; end if;

  insert into llamadas_cad (tipo, prioridad, descripcion, sitio_id, direccion, latitud, longitud, datos_adicionales)
    values (p_tipo, coalesce(p_prioridad,'media'),
            coalesce(p_descripcion, 'Incidente detectado en cámara ' || coalesce(v_cam.nombre,'')),
            v_cam.sitio_id, coalesce(v_cam.ubicacion_desc, v_cam.nombre, 'Sitio'),
            v_cam.latitud, v_cam.longitud,
            jsonb_build_object('origen','videovigilancia','sourceType','CAMERA',
                               'camara_id', v_cam.id, 'camara_folio', v_cam.folio,
                               'zona', v_cam.zona, 'snapshot_url', p_snapshot_url))
    returning id, folio into v_id, v_folio;

  insert into vinculos (entidad_origen_tipo, entidad_origen_id, entidad_destino_tipo, entidad_destino_id, tipo_relacion)
    values ('camara', v_cam.id, 'incidente', v_id, 'incidente_desde_camara');

  return jsonb_build_object('llamada_id', v_id, 'folio', v_folio);
end; $$;

grant execute on function rpc_camara_snapshot_evidencia(uuid, text, text) to authenticated;
grant execute on function rpc_camara_crear_incidente(uuid, text, text, text, text) to authenticated;
