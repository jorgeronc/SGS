-- =====================================================================
-- 0009_evidencias.sql
-- Módulo de Bienes y Evidencias (Fase 4 del roadmap). Depende de Casos.
--
-- Dos tablas:
--   1) evidencias        el bien/objeto asegurado (con fotos).
--   2) cadena_custodia   registro APPEND-ONLY (WORM) de cada movimiento de
--                        custodia de una evidencia — inmutable por diseño.
--
-- La inmutabilidad de la cadena de custodia se refuerza a nivel de base de
-- datos (bloqueo de UPDATE y DELETE + revocación de privilegios), que es la
-- aproximación WORM que plantea el documento de arquitectura mientras no se
-- adopte un almacenamiento WORM dedicado.
--
-- Como el resto del sistema: estatus (activo/cancelado) es retención; el
-- avance del bien se lleva en 'estado_evidencia'.
-- =====================================================================

-- =========================
-- EVIDENCIAS
-- =========================
create table if not exists evidencias (
  id                    uuid primary key default gen_random_uuid(),
  folio                 text,                -- etiqueta / número de evidencia
  tipo                  text,                -- arma, droga, documento, dispositivo, dinero, etc.
  descripcion           text,
  cantidad              text,                -- ej. "2 piezas", "15.3 g" (texto libre para la demo)
  ubicacion_almacen     text,               -- bodega / anaquel donde se resguarda
  estado_evidencia      text not null default 'recolectada'
                          check (estado_evidencia in ('recolectada','en_almacen','en_analisis',
                                                      'entregada','devuelta','destruida')),
  fecha_recoleccion     timestamptz,
  fotografias           jsonb default '[]'::jsonb,
  datos_adicionales     jsonb default '{}'::jsonb,

  estatus               text not null default 'activo' check (estatus in ('activo','cancelado')),
  cancelado_en          timestamptz,
  motivo_cancelacion    text,

  creado_en             timestamptz not null default now(),
  actualizado_en        timestamptz not null default now()
);

comment on table evidencias is 'Bienes y evidencias asegurados. Se relacionan con casos/personas/etc. vía vínculos; su custodia se registra en cadena_custodia.';

create index if not exists idx_evidencias_estado on evidencias (estado_evidencia);
create index if not exists idx_evidencias_folio on evidencias (folio);

create or replace view evidencias_activas as
  select * from evidencias where estatus = 'activo';

drop trigger if exists trg_no_delete_evidencias on evidencias;
create trigger trg_no_delete_evidencias
  before delete on evidencias
  for each row execute function fn_bloquear_delete();

revoke delete on evidencias from authenticated, anon;

drop trigger if exists trg_auditoria_evidencias on evidencias;
create trigger trg_auditoria_evidencias
  after insert or update on evidencias
  for each row execute function fn_bitacora_generica();

-- =========================
-- CADENA DE CUSTODIA (append-only / WORM)
-- =========================
create table if not exists cadena_custodia (
  id              bigint generated always as identity primary key,
  evidencia_id    uuid not null references evidencias(id),
  tipo_evento     text not null
                    check (tipo_evento in ('recoleccion','traslado','resguardo','analisis',
                                           'entrega','devolucion','destruccion')),
  responsable     text,                -- quién recibe/ejecuta la custodia
  ubicacion       text,                -- dónde queda la evidencia tras el evento
  notas           text,
  fecha_evento    timestamptz not null default now(),
  creado_en       timestamptz not null default now()
);

comment on table cadena_custodia is 'Registro append-only (WORM) de los movimientos de custodia de cada evidencia. No se modifica ni se borra jamás.';

create index if not exists idx_custodia_evidencia on cadena_custodia (evidencia_id, fecha_evento);

-- WORM: la cadena de custodia no se puede modificar ni borrar una vez escrita.
create or replace function fn_bloquear_cambios_custodia()
returns trigger as $$
begin
  raise exception 'La cadena de custodia es de solo escritura (append-only): no se puede modificar ni borrar (operación %).', tg_op;
end;
$$ language plpgsql;

drop trigger if exists trg_custodia_worm on cadena_custodia;
create trigger trg_custodia_worm
  before update or delete on cadena_custodia
  for each row execute function fn_bloquear_cambios_custodia();

revoke update, delete on cadena_custodia from authenticated, anon;

-- ---------------------------------------------------------------------
-- Ampliar rpc_cancelar_registro para admitir 'evidencias'.
-- (cadena_custodia NO se cancela: es append-only.)
-- ---------------------------------------------------------------------
create or replace function rpc_cancelar_registro(
  p_tabla   text,
  p_id      uuid,
  p_motivo  text
) returns void as $$
begin
  if p_tabla not in ('personas','vehiculos','ubicaciones','vinculos','casos','personal','ordenes','evidencias') then
    raise exception 'Tabla no reconocida: %', p_tabla;
  end if;

  execute format(
    'update %I set estatus = ''cancelado'', cancelado_en = now(), motivo_cancelacion = $1, actualizado_en = now() where id = $2',
    p_tabla
  ) using p_motivo, p_id;
end;
$$ language plpgsql security definer;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table evidencias enable row level security;

drop policy if exists sel_evidencias on evidencias;
create policy sel_evidencias on evidencias
  for select to authenticated
  using (
    estatus = 'activo'
    or fn_rol_actual() in ('supervisor','investigador','administrador')
  );

drop policy if exists ins_evidencias on evidencias;
create policy ins_evidencias on evidencias for insert to authenticated with check (true);

drop policy if exists upd_evidencias on evidencias;
create policy upd_evidencias on evidencias for update to authenticated using (true) with check (true);

alter table cadena_custodia enable row level security;

-- Lectura para cualquier autenticado; escritura solo insert (append-only).
drop policy if exists sel_custodia on cadena_custodia;
create policy sel_custodia on cadena_custodia for select to authenticated using (true);

drop policy if exists ins_custodia on cadena_custodia;
create policy ins_custodia on cadena_custodia for insert to authenticated with check (true);
