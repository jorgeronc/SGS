-- =====================================================================
-- 0038_transmisiones.sql · Bodycam: transmisión de video en vivo + evidencia
--
-- Al oprimir "Enviar Alerta" en el móvil, el teléfono transmite su cámara en
-- vivo (WebRTC) y el despacho web lo ve en tiempo real. La señalización
-- (SDP/ICE) viaja por Supabase Realtime BROADCAST en un canal por transmisión;
-- esta tabla guarda la SESIÓN (quién, cuándo, ligada a qué alerta) y, al
-- terminar, la ruta del video grabado y su registro como evidencia.
--
-- El video se guarda en un bucket PRIVADO (contenido sensible): lectura solo
-- para usuarios autenticados vía URL firmada.
-- =====================================================================

-- 1) Bucket privado de video ------------------------------------------
insert into storage.buckets (id, name, public)
values ('videos', 'videos', false)
on conflict (id) do nothing;

drop policy if exists "videos_select" on storage.objects;
create policy "videos_select" on storage.objects
  for select to authenticated using (bucket_id = 'videos');
drop policy if exists "videos_insert" on storage.objects;
create policy "videos_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'videos');
drop policy if exists "videos_update" on storage.objects;
create policy "videos_update" on storage.objects
  for update to authenticated using (bucket_id = 'videos');

-- 2) Tabla de transmisiones -------------------------------------------
create table if not exists transmisiones (
  id                  uuid primary key default gen_random_uuid(),
  folio               text,
  -- Origen: la alerta (despacho de pánico) que la disparó, y el oficial/unidad.
  despacho_id         uuid references despachos(id),
  llamada_id          uuid references llamadas_cad(id),
  personal_id         uuid references personal(id),
  patrulla_id         uuid references patrullas(id),

  estado              text not null default 'en_vivo'
                        check (estado in ('en_vivo','finalizada','error')),
  motivo_fin          text,             -- manual | limite_5min | error | desconexion

  iniciado_en         timestamptz not null default now(),
  finalizado_en       timestamptz,

  -- Video grabado (evidencia). Se llena al terminar y subir el archivo.
  video_ruta          text,             -- ruta en el bucket privado 'videos'
  evidencia_id        uuid references evidencias(id),
  duracion_seg        int,

  datos_adicionales   jsonb default '{}'::jsonb,
  estatus             text not null default 'activo' check (estatus in ('activo','cancelado')),
  cancelado_en        timestamptz,
  motivo_cancelacion  text,
  creado_en           timestamptz not null default now(),
  actualizado_en      timestamptz not null default now()
);
comment on table transmisiones is 'Sesiones de transmisión en vivo (bodycam) disparadas por Enviar Alerta; guarda la sesión y el video grabado como evidencia.';
create index if not exists idx_transmisiones_estado on transmisiones (estado);
create index if not exists idx_transmisiones_despacho on transmisiones (despacho_id);
create index if not exists idx_transmisiones_personal on transmisiones (personal_id);

-- Foliador (TX), no-delete y bitácora.
insert into foliadores (modulo, nombre, iniciales) values ('transmisiones','Transmisiones','TX')
  on conflict (modulo) do nothing;
drop trigger if exists trg_folio_transmisiones on transmisiones;
create trigger trg_folio_transmisiones before insert on transmisiones for each row execute function fn_asignar_folio();

drop trigger if exists trg_no_delete_transmisiones on transmisiones;
create trigger trg_no_delete_transmisiones before delete on transmisiones for each row execute function fn_bloquear_delete();
revoke delete on transmisiones from authenticated, anon;

drop trigger if exists trg_auditoria_transmisiones on transmisiones;
create trigger trg_auditoria_transmisiones after insert or update on transmisiones for each row execute function fn_bitacora_generica();

-- 3) RLS --------------------------------------------------------------
alter table transmisiones enable row level security;
drop policy if exists sel_transmisiones on transmisiones;
create policy sel_transmisiones on transmisiones for select to authenticated using (true);
drop policy if exists ins_transmisiones on transmisiones;
create policy ins_transmisiones on transmisiones for insert to authenticated with check (true);
drop policy if exists upd_transmisiones on transmisiones;
create policy upd_transmisiones on transmisiones for update to authenticated using (true) with check (true);

-- 4) Realtime: el despacho web se entera al instante de una transmisión nueva
--    o cuando termina (indicador "EN VIVO" en el CAD).
alter publication supabase_realtime add table transmisiones;

-- 5) Ampliar rpc_cancelar_registro
create or replace function rpc_cancelar_registro(p_tabla text, p_id uuid, p_motivo text)
returns void as $$
begin
  if p_tabla not in ('personas','vehiculos','ubicaciones','vinculos','casos','personal',
                     'ordenes','evidencias','asuntos_internos','llamadas_cad','despachos',
                     'barandilla','equipo','incidentes','presuntos','kardex',
                     'patrullas','armamento','comunicacion','bodycams','otros',
                     'rol_servicio','rol_servicio_asignaciones','abordamientos','accidentes',
                     'tareas','tarea_asignaciones','transmisiones') then
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
