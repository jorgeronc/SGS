-- =====================================================================
-- 0037_tareas.sql · Módulo de TAREAS (Operaciones)
--
-- Una TAREA es una solicitud de trabajo dirigida a una o varias unidades
-- (patrullas) que NO estén fuera de servicio: búsqueda de persona, acudir a un
-- domicilio por una orden de protección, verificación, etc.
--
-- Modelo:
--   tareas               → el qué (tipo, motivo, vigencia, lugar, instrucciones, foto)
--   tarea_asignaciones   → a quién (una fila por unidad/oficial) y su respuesta
--                          (pendiente → enterado → atendiendo → completada)
--
-- Las asignaciones disparan notificación push al oficial de la unidad
-- (reutiliza la Edge Function enviar_push de 0035/0036).
--
-- Como el resto del sistema: `estatus` (activo/cancelado) es retención de datos
-- y el avance operativo se lleva en `estado` / `respuesta`.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) TAREAS
-- ---------------------------------------------------------------------
create table if not exists tareas (
  id                  uuid primary key default gen_random_uuid(),
  folio               text,
  -- Tipo y motivo salen de cat_opciones (tipo_tarea / motivo_busqueda) para
  -- poder crecer sin migrar. El motivo es el "por qué" (Extraviada, etc.).
  tipo                text not null default 'Búsqueda de persona',
  motivo              text,
  asunto              text,                    -- resumen corto para listas
  instrucciones       text,

  -- Lugar (mismo patrón que incidentes/accidentes)
  direccion           text,
  latitud             double precision,
  longitud            double precision,

  -- Vigencia: desde/hasta. `vigencia_hasta` null = sin vencimiento.
  vigencia_desde      timestamptz not null default now(),
  vigencia_hasta      timestamptz,

  fotografias         jsonb default '[]'::jsonb,

  -- Origen: si nació de una orden (p. ej. orden de protección) o refiere a una
  -- persona (p. ej. búsqueda de persona).
  orden_id            uuid references ordenes(id),
  persona_id          uuid references personas(id),

  prioridad           text not null default 'media' check (prioridad in ('alta','media','baja')),
  estado              text not null default 'abierta'
                        check (estado in ('abierta','en_proceso','completada','vencida')),

  creado_por          uuid references auth.users(id) default auth.uid(),
  datos_adicionales   jsonb default '{}'::jsonb,

  estatus             text not null default 'activo' check (estatus in ('activo','cancelado')),
  cancelado_en        timestamptz,
  motivo_cancelacion  text,
  creado_en           timestamptz not null default now(),
  actualizado_en      timestamptz not null default now()
);
comment on table tareas is 'Tareas solicitadas a las unidades en servicio (búsqueda de persona, orden de protección, etc.) con vigencia, lugar, instrucciones y fotografía.';
create index if not exists idx_tareas_estado on tareas (estado);
create index if not exists idx_tareas_vigencia on tareas (vigencia_hasta);
create index if not exists idx_tareas_orden on tareas (orden_id);

-- ---------------------------------------------------------------------
-- 2) ASIGNACIONES (una fila por unidad; guarda la respuesta del oficial)
-- ---------------------------------------------------------------------
create table if not exists tarea_asignaciones (
  id                  uuid primary key default gen_random_uuid(),
  tarea_id            uuid not null references tareas(id) on delete cascade,
  patrulla_id         uuid references patrullas(id),
  personal_id         uuid references personal(id),

  respuesta           text not null default 'pendiente'
                        check (respuesta in ('pendiente','enterado','atendiendo','completada')),
  respondido_en       timestamptz,
  notas               text,

  estatus             text not null default 'activo' check (estatus in ('activo','cancelado')),
  cancelado_en        timestamptz,
  motivo_cancelacion  text,
  creado_en           timestamptz not null default now(),
  actualizado_en      timestamptz not null default now()
);
comment on table tarea_asignaciones is 'Unidades/oficiales a los que se asignó una tarea y su respuesta (pendiente → enterado → atendiendo → completada).';
create index if not exists idx_tarea_asig_tarea on tarea_asignaciones (tarea_id);
create index if not exists idx_tarea_asig_personal on tarea_asignaciones (personal_id);
-- Evita asignar dos veces la misma unidad a la misma tarea.
create unique index if not exists ux_tarea_asig_unica
  on tarea_asignaciones (tarea_id, coalesce(patrulla_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(personal_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- Marca la hora al registrar/cambiar la respuesta.
create or replace function fn_tarea_respuesta_fecha() returns trigger
language plpgsql as $$
begin
  if new.respuesta is distinct from coalesce(old.respuesta, 'pendiente') and new.respuesta <> 'pendiente' then
    new.respondido_en := now();
  end if;
  new.actualizado_en := now();
  return new;
end;
$$;
drop trigger if exists trg_tarea_respuesta_fecha on tarea_asignaciones;
create trigger trg_tarea_respuesta_fecha
  before update on tarea_asignaciones
  for each row execute function fn_tarea_respuesta_fecha();

-- ---------------------------------------------------------------------
-- 3) Vista de tareas vigentes (para el móvil y el tablero)
--    Incluye las vencidas hasta 24 h después de expirar.
-- ---------------------------------------------------------------------
create or replace view tareas_vigentes as
  select t.*,
         (t.vigencia_hasta is null or t.vigencia_hasta > now()) as vigente
  from tareas t
  where t.estatus = 'activo'
    and (t.vigencia_hasta is null or t.vigencia_hasta > now() - interval '24 hours');
comment on view tareas_vigentes is 'Tareas activas vigentes y las expiradas hace menos de 24 h (el móvil las sigue mostrando ese periodo).';

-- ---------------------------------------------------------------------
-- 4) Asignar una tarea a unidades
--    p_patrullas null/vacío = TODAS las unidades en servicio que no estén
--    fuera de servicio. Si se pasan ids, solo esas (y también se exige que no
--    estén fuera de servicio).
-- ---------------------------------------------------------------------
create or replace function rpc_asignar_tarea(
  p_tarea_id   uuid,
  p_patrullas  uuid[] default null
) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_insertadas int;
begin
  insert into tarea_asignaciones (tarea_id, patrulla_id, personal_id)
  select p_tarea_id, s.patrulla_id, s.personal_id
  from patrullas_en_servicio s
  where coalesce(s.estatus_unidad, '') <> 'fuera_servicio'
    and (p_patrullas is null or array_length(p_patrullas, 1) is null or s.patrulla_id = any(p_patrullas))
  on conflict do nothing;

  get diagnostics v_insertadas = row_count;
  return v_insertadas;
end;
$$;
comment on function rpc_asignar_tarea is 'Asigna una tarea a las unidades indicadas (o a todas las que estén en servicio y no fuera de servicio). Devuelve cuántas asignaciones creó.';

-- ---------------------------------------------------------------------
-- 5) Push al asignar una tarea (reutiliza enviar_push de 0035/0036)
-- ---------------------------------------------------------------------
create or replace function fn_push_tarea() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_secret text := (select valor from app_secretos where clave = 'push_secret');
  v_url    text := 'https://okhsniabwiukjyjhmeav.supabase.co/functions/v1/enviar_push';
  v_t      record;
  v_cuerpo text;
begin
  if new.personal_id is null or coalesce(v_secret, '') = '' then
    return new;
  end if;

  select tipo, motivo, asunto, direccion, vigencia_hasta, folio
    into v_t from tareas where id = new.tarea_id;

  v_cuerpo := coalesce(v_t.tipo, 'Tarea')
              || coalesce(' · ' || v_t.motivo, '')
              || coalesce(' · ' || v_t.direccion, '')
              || coalesce(' · vence ' || to_char(v_t.vigencia_hasta, 'DD/MM HH24:MI'), '');

  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
    body    := jsonb_build_object(
      'personal_id', new.personal_id,
      'tipo',        'tarea',
      'titulo',      'Nueva tarea asignada' || coalesce(' ' || v_t.folio, ''),
      'cuerpo',      v_cuerpo,
      'data',        jsonb_build_object('tipo', 'tarea', 'tarea_id', new.tarea_id, 'asignacion_id', new.id)
    )
  );
  return new;
end;
$$;

drop trigger if exists trg_push_tarea on tarea_asignaciones;
create trigger trg_push_tarea
  after insert on tarea_asignaciones
  for each row execute function fn_push_tarea();

-- ---------------------------------------------------------------------
-- 6) Foliador (TA), no-delete y bitácora
-- ---------------------------------------------------------------------
insert into foliadores (modulo, nombre, iniciales) values ('tareas','Tareas','TA')
  on conflict (modulo) do nothing;
drop trigger if exists trg_folio_tareas on tareas;
create trigger trg_folio_tareas before insert on tareas for each row execute function fn_asignar_folio();

drop trigger if exists trg_no_delete_tareas on tareas;
create trigger trg_no_delete_tareas before delete on tareas for each row execute function fn_bloquear_delete();
revoke delete on tareas from authenticated, anon;

drop trigger if exists trg_auditoria_tareas on tareas;
create trigger trg_auditoria_tareas after insert or update on tareas for each row execute function fn_bitacora_generica();
drop trigger if exists trg_auditoria_tarea_asig on tarea_asignaciones;
create trigger trg_auditoria_tarea_asig after insert or update on tarea_asignaciones for each row execute function fn_bitacora_generica();

-- ---------------------------------------------------------------------
-- 7) RLS (mismo patrón permisivo del resto de módulos operativos)
-- ---------------------------------------------------------------------
alter table tareas enable row level security;
drop policy if exists sel_tareas on tareas;
create policy sel_tareas on tareas for select to authenticated
  using (estatus = 'activo' or fn_rol_actual() in ('supervisor','investigador','administrador'));
drop policy if exists ins_tareas on tareas;
create policy ins_tareas on tareas for insert to authenticated with check (true);
drop policy if exists upd_tareas on tareas;
create policy upd_tareas on tareas for update to authenticated using (true) with check (true);

alter table tarea_asignaciones enable row level security;
drop policy if exists sel_tarea_asig on tarea_asignaciones;
create policy sel_tarea_asig on tarea_asignaciones for select to authenticated using (true);
drop policy if exists ins_tarea_asig on tarea_asignaciones;
create policy ins_tarea_asig on tarea_asignaciones for insert to authenticated with check (true);
-- El oficial responde desde el móvil (Enterado / Atendiendo / Completada).
drop policy if exists upd_tarea_asig on tarea_asignaciones;
create policy upd_tarea_asig on tarea_asignaciones for update to authenticated using (true) with check (true);

-- ---------------------------------------------------------------------
-- 8) Ampliar rpc_cancelar_registro con las tablas nuevas
-- ---------------------------------------------------------------------
create or replace function rpc_cancelar_registro(p_tabla text, p_id uuid, p_motivo text)
returns void as $$
begin
  if p_tabla not in ('personas','vehiculos','ubicaciones','vinculos','casos','personal',
                     'ordenes','evidencias','asuntos_internos','llamadas_cad','despachos',
                     'barandilla','equipo','incidentes','presuntos','kardex',
                     'patrullas','armamento','comunicacion','bodycams','otros',
                     'rol_servicio','rol_servicio_asignaciones','abordamientos','accidentes',
                     'tareas','tarea_asignaciones') then
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

-- ---------------------------------------------------------------------
-- 9) ORDEN DE PROTECCIÓN (módulo Citatorios / Órdenes)
--    Se agrega el tipo y los campos que pide el flujo: vigencia, lugar,
--    persona/domicilio e instrucciones. Genera una tarea desde el detalle.
-- ---------------------------------------------------------------------
alter table ordenes drop constraint if exists ordenes_tipo_check;
alter table ordenes add constraint ordenes_tipo_check
  check (tipo in ('citatorio','orden_aprehension','orden_cateo',
                  'orden_comparecencia','orden_presentacion','orden_proteccion'));

alter table ordenes add column if not exists vigencia_desde  timestamptz;
alter table ordenes add column if not exists vigencia_hasta  timestamptz;
alter table ordenes add column if not exists direccion       text;
alter table ordenes add column if not exists latitud         double precision;
alter table ordenes add column if not exists longitud        double precision;
alter table ordenes add column if not exists instrucciones   text;
alter table ordenes add column if not exists persona_id      uuid references personas(id);

comment on column ordenes.instrucciones is 'Indicaciones operativas para la unidad (usado sobre todo en órdenes de protección).';
comment on column ordenes.persona_id is 'Persona protegida / requerida por la orden.';

-- ---------------------------------------------------------------------
-- 10) Catálogos de tipo y motivo
-- ---------------------------------------------------------------------
insert into cat_opciones (categoria, valor, orden) values
  ('tipo_tarea','Búsqueda de persona',1),
  ('tipo_tarea','Orden de protección',2),
  ('tipo_tarea','Verificación de domicilio',3),
  ('tipo_tarea','Vigilancia de punto',4),
  ('tipo_tarea','Traslado',5),
  ('tipo_tarea','Apoyo a otra unidad',6),
  ('tipo_tarea','Otra',7),
  ('motivo_busqueda','Extraviada',1),
  ('motivo_busqueda','No localizada',2),
  ('motivo_busqueda','Sustraída',3),
  ('motivo_busqueda','Ausente voluntario',4),
  ('motivo_busqueda','Menor de edad',5),
  ('motivo_busqueda','Adulto mayor',6),
  ('motivo_busqueda','Condición vulnerable',7),
  ('motivo_busqueda','Otro',8)
on conflict (categoria, valor) do nothing;
