-- =====================================================================
-- 0010_asuntos_internos.sql
-- Módulo de Asuntos Internos (Fase 5 del roadmap): el más sensible.
--
-- Diseño de seguridad (lo que distingue a este módulo del resto):
--   1) RLS ESTRICTA: solo el rol 'asuntos_internos' (+ 'administrador')
--      puede ver, crear o editar estos registros. Ni oficiales, ni
--      supervisores, ni investigadores los ven — ni siquiera los activos.
--   2) AISLAMIENTO: NO se integra al motor de vínculos (cuya RLS es
--      permisiva y filtraría la existencia de un asunto sobre una persona)
--      ni a las fotos (el bucket 'fotos' es público). El oficial investigado
--      se referencia con una FK directa a personal.
--   3) La RPC rpc_cancelar_registro es SECURITY DEFINER (salta RLS): se le
--      agrega un guard de rol para que nadie cancele un asunto interno sin
--      el rol adecuado.
--   4) ALERTAS DE CONSULTA: cada apertura queda registrada en la bitácora
--      (acción CONSULTAR) desde el frontend.
--
-- Pendiente de producción: cifrado por registro (field-level) de la
-- narrativa/resolución; ver README.
-- =====================================================================

-- Nuevo rol 'asuntos_internos' en el catálogo de roles.
alter table usuarios_perfil drop constraint if exists usuarios_perfil_rol_check;
alter table usuarios_perfil add constraint usuarios_perfil_rol_check
  check (rol in ('oficial','supervisor','investigador','administrador','asuntos_internos'));

create table if not exists asuntos_internos (
  id                    uuid primary key default gen_random_uuid(),
  folio                 text,
  tipo                  text,                -- queja_ciudadana, investigacion_interna, uso_de_fuerza, etc.
  asunto                text,
  narrativa             text,                -- detalle confidencial
  personal_id           uuid references personal(id),   -- oficial investigado (opcional)
  confidencialidad      text not null default 'confidencial'
                          check (confidencialidad in ('reservado','confidencial','restringido')),
  estado                text not null default 'abierto'
                          check (estado in ('abierto','en_investigacion','resuelto','cerrado')),
  resolucion            text,
  datos_adicionales     jsonb default '{}'::jsonb,

  estatus               text not null default 'activo' check (estatus in ('activo','cancelado')),
  cancelado_en          timestamptz,
  motivo_cancelacion    text,

  creado_en             timestamptz not null default now(),
  actualizado_en        timestamptz not null default now()
);

comment on table asuntos_internos is 'Asuntos Internos (quejas e investigaciones sobre personal). Acceso restringido por RLS al rol asuntos_internos/administrador. No se expone en vínculos ni fotos por confidencialidad.';

create index if not exists idx_asuntos_internos_estado on asuntos_internos (estado);
create index if not exists idx_asuntos_internos_personal on asuntos_internos (personal_id);

create or replace view asuntos_internos_activos as
  select * from asuntos_internos where estatus = 'activo';

drop trigger if exists trg_no_delete_asuntos_internos on asuntos_internos;
create trigger trg_no_delete_asuntos_internos
  before delete on asuntos_internos
  for each row execute function fn_bloquear_delete();

revoke delete on asuntos_internos from authenticated, anon;

drop trigger if exists trg_auditoria_asuntos_internos on asuntos_internos;
create trigger trg_auditoria_asuntos_internos
  after insert or update on asuntos_internos
  for each row execute function fn_bitacora_generica();

-- ---------------------------------------------------------------------
-- rpc_cancelar_registro: admite 'asuntos_internos' PERO con guard de rol,
-- porque esta función es security definer y de otro modo saltaría la RLS.
-- ---------------------------------------------------------------------
create or replace function rpc_cancelar_registro(
  p_tabla   text,
  p_id      uuid,
  p_motivo  text
) returns void as $$
begin
  if p_tabla not in ('personas','vehiculos','ubicaciones','vinculos','casos','personal','ordenes','evidencias','asuntos_internos') then
    raise exception 'Tabla no reconocida: %', p_tabla;
  end if;

  -- Asuntos Internos: solo el rol autorizado puede cancelar (la función es
  -- security definer y no aplicaría la RLS por sí sola).
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
-- RLS ESTRICTA: solo asuntos_internos / administrador.
-- ---------------------------------------------------------------------
alter table asuntos_internos enable row level security;

drop policy if exists sel_asuntos_internos on asuntos_internos;
create policy sel_asuntos_internos on asuntos_internos
  for select to authenticated
  using (fn_rol_actual() in ('asuntos_internos','administrador'));

drop policy if exists ins_asuntos_internos on asuntos_internos;
create policy ins_asuntos_internos on asuntos_internos
  for insert to authenticated
  with check (fn_rol_actual() in ('asuntos_internos','administrador'));

drop policy if exists upd_asuntos_internos on asuntos_internos;
create policy upd_asuntos_internos on asuntos_internos
  for update to authenticated
  using (fn_rol_actual() in ('asuntos_internos','administrador'))
  with check (fn_rol_actual() in ('asuntos_internos','administrador'));
