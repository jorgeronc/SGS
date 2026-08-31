-- =====================================================================
-- 0080_liberacion_seguridad.sql · Vista Operativa (Fase B)
-- Liberación de seguridad: el "gate" que valida que un movimiento cumplió
-- todos los controles antes de salir. Computa el checklist desde los
-- controles existentes (accesos, inspecciones, sellos, GPS, riesgo) y deja
-- un registro de aprobación/rechazo con auditoría.
-- =====================================================================

create table if not exists liberaciones_seguridad (
  id                          uuid primary key default gen_random_uuid(),
  folio                       text,
  movimiento_id               uuid not null references movimientos(id),
  access_validated            boolean not null default false,
  identity_validated          boolean not null default false,
  asset_validated             boolean not null default false,
  cargo_units_validated       boolean not null default false,
  inspection_completed        boolean not null default false,
  seal_validated              boolean not null default false,
  required_evidence_completed boolean not null default false,
  gps_available               boolean not null default false,
  risk_protocol_completed     boolean not null default false,
  supervisor_approval         boolean not null default false,
  resultado                   text not null default 'BLOCKED'
                                check (resultado in ('READY','BLOCKED','APPROVED','REJECTED')),
  faltantes                   text,
  aprobado_por                text,          -- correo del que aprobó/rechazó
  notas                       text,
  estatus                     text not null default 'activo' check (estatus in ('activo','cancelado')),
  cancelado_en                timestamptz, motivo_cancelacion text,
  creado_en                   timestamptz not null default now(),
  actualizado_en              timestamptz not null default now()
);
comment on table liberaciones_seguridad is 'Gate de liberación de seguridad de un movimiento: checklist + aprobación (auditada).';
create index if not exists idx_liberaciones_mov on liberaciones_seguridad(movimiento_id, creado_en desc);

insert into foliadores (modulo, nombre, iniciales) values ('liberaciones','Liberaciones de seguridad','LB')
  on conflict (modulo) do nothing;
drop trigger if exists trg_folio_liberaciones on liberaciones_seguridad;
create trigger trg_folio_liberaciones before insert on liberaciones_seguridad for each row execute function fn_asignar_folio();
drop trigger if exists trg_no_delete_liberaciones on liberaciones_seguridad;
create trigger trg_no_delete_liberaciones before delete on liberaciones_seguridad for each row execute function fn_bloquear_delete();
revoke delete on liberaciones_seguridad from authenticated, anon;
drop trigger if exists trg_auditoria_liberaciones on liberaciones_seguridad;
create trigger trg_auditoria_liberaciones after insert or update on liberaciones_seguridad for each row execute function fn_bitacora_generica();
alter table liberaciones_seguridad enable row level security;
drop policy if exists sel_liberaciones on liberaciones_seguridad;
create policy sel_liberaciones on liberaciones_seguridad for select to authenticated using (true);
drop policy if exists ins_liberaciones on liberaciones_seguridad;
create policy ins_liberaciones on liberaciones_seguridad for insert to authenticated
  with check (coalesce(fn_rol_actual(),'') in ('coordinador','supervisor','administrador'));

-- Evalúa el gate: computa el checklist desde los controles y devuelve el estado.
create or replace function rpc_evaluar_liberacion(p_movimiento_id uuid)
returns jsonb as $fn$
declare
  m record;
  n_acc_ok int; n_acc_id int; n_unid int; n_insp int; n_insp_rech int;
  n_sello_val int; n_sello_bad int; n_evid int;
  b_access boolean; b_identity boolean; b_asset boolean; b_units boolean;
  b_insp boolean; b_seal boolean; b_evid boolean; b_gps boolean; b_risk boolean; b_super boolean;
  v_high boolean; v_falt text; v_res text;
begin
  select mv.*, ta.gps_device_id as gps into m from movimientos mv
    left join transporte_activos ta on ta.id = mv.transporte_activo_id
    where mv.id = p_movimiento_id;
  if m.id is null then return jsonb_build_object('error','movimiento no encontrado'); end if;

  select count(*) into n_acc_ok from accesos where movimiento_id = p_movimiento_id and estatus='activo' and resultado='autorizado';
  select count(*) into n_acc_id from accesos where movimiento_id = p_movimiento_id and estatus='activo' and resultado='autorizado' and (persona_id is not null or visitante_nombre is not null);
  select count(*) into n_unid from movimiento_unidades where movimiento_id = p_movimiento_id and estatus='activo';
  select count(*) into n_insp from inspecciones where movimiento_id = p_movimiento_id and estatus='activo';
  select count(*) into n_insp_rech from inspecciones where movimiento_id = p_movimiento_id and estatus='activo' and coalesce(resultado,'') ilike 'rechaz%';
  select count(*) into n_sello_val from sello_validaciones where movimiento_id = p_movimiento_id and resultado='VALIDO';
  select count(*) into n_sello_bad from sello_validaciones where movimiento_id = p_movimiento_id and resultado in ('ALTERADO','NO_COINCIDE');
  select count(*) into n_evid from vinculos where estatus='activo'
    and ((entidad_origen_tipo='movimiento' and entidad_origen_id=p_movimiento_id and entidad_destino_tipo='evidencia')
      or (entidad_destino_tipo='movimiento' and entidad_destino_id=p_movimiento_id and entidad_origen_tipo='evidencia'));

  v_high := coalesce(m.nivel_riesgo,'') in ('Alto valor','Sensible','Crítica');

  b_access := n_acc_ok > 0;
  b_identity := n_acc_id > 0;
  b_asset := m.transporte_activo_id is not null;
  b_units := n_unid > 0;
  b_insp := n_insp > 0 and n_insp_rech = 0;
  b_seal := n_sello_bad = 0;                          -- sin sellos alterados/no coincide
  b_evid := true;                                     -- evidencia requerida: Fase C (por ahora no bloquea)
  b_gps := m.gps is not null;
  b_risk := m.nivel_riesgo is not null;               -- riesgo evaluado
  b_super := not v_high;                              -- solo alto riesgo exige aprobación de mando

  v_falt := nullif(trim(both ', ' from concat_ws(', ',
    case when not b_access then 'acceso no autorizado' end,
    case when not b_identity then 'identidad no validada' end,
    case when not b_asset then 'sin activo de transporte' end,
    case when not b_units then 'sin unidades de carga' end,
    case when not b_insp then (case when n_insp_rech>0 then 'inspección rechazada' else 'inspección pendiente' end) end,
    case when not b_seal then 'sello alterado' end,
    case when not b_gps then 'GPS no disponible' end,
    case when not b_risk then 'riesgo sin evaluar' end)), '');

  v_res := case when v_falt is null then 'READY' else 'BLOCKED' end;

  return jsonb_build_object(
    'movimiento_id', p_movimiento_id,
    'checklist', jsonb_build_object(
      'access_validated', b_access, 'identity_validated', b_identity, 'asset_validated', b_asset,
      'cargo_units_validated', b_units, 'inspection_completed', b_insp, 'seal_validated', b_seal,
      'required_evidence_completed', b_evid, 'gps_available', b_gps, 'risk_protocol_completed', b_risk,
      'supervisor_approval', b_super),
    'high_risk', v_high,
    'resultado', v_res,
    'faltantes', v_falt
  );
end;
$fn$ language plpgsql stable security definer;

-- Aprueba la liberación (solo mando). Falla si el gate no está READY.
create or replace function rpc_aprobar_liberacion(p_movimiento_id uuid, p_notas text default null)
returns jsonb as $fn$
declare v_rol text := coalesce(fn_rol_actual(),''); ev jsonb; c jsonb; v_id uuid; v_folio text; v_correo text;
begin
  if v_rol not in ('coordinador','supervisor','administrador') then
    raise exception 'Solo coordinador/administrador puede aprobar la liberación.';
  end if;
  ev := rpc_evaluar_liberacion(p_movimiento_id);
  if (ev->>'error') is not null then raise exception '%', ev->>'error'; end if;
  if (ev->>'resultado') <> 'READY' then
    raise exception 'No se puede aprobar: faltan controles (%).', coalesce(ev->>'faltantes','');
  end if;
  c := ev->'checklist';
  select email into v_correo from auth.users where id = auth.uid();
  insert into liberaciones_seguridad (movimiento_id,
    access_validated, identity_validated, asset_validated, cargo_units_validated,
    inspection_completed, seal_validated, required_evidence_completed, gps_available,
    risk_protocol_completed, supervisor_approval, resultado, faltantes, aprobado_por, notas)
  values (p_movimiento_id,
    (c->>'access_validated')::boolean, (c->>'identity_validated')::boolean, (c->>'asset_validated')::boolean,
    (c->>'cargo_units_validated')::boolean, (c->>'inspection_completed')::boolean, (c->>'seal_validated')::boolean,
    (c->>'required_evidence_completed')::boolean, (c->>'gps_available')::boolean, (c->>'risk_protocol_completed')::boolean,
    true, 'APPROVED', null, v_correo, p_notas)
  returning id, folio into v_id, v_folio;

  insert into movimiento_eventos (movimiento_id, tipo_evento, etapa, actor, datos)
    values (p_movimiento_id, 'clearance.approved', 'LIBERACION', v_correo,
            jsonb_build_object('liberacion_id', v_id, 'folio', v_folio, 'notas', p_notas));

  return jsonb_build_object('ok', true, 'id', v_id, 'folio', v_folio, 'resultado', 'APPROVED');
end;
$fn$ language plpgsql security definer;

-- Rechaza la liberación (solo mando), con motivo.
create or replace function rpc_rechazar_liberacion(p_movimiento_id uuid, p_motivo text)
returns jsonb as $fn$
declare v_rol text := coalesce(fn_rol_actual(),''); v_id uuid; v_folio text; v_correo text;
begin
  if v_rol not in ('coordinador','supervisor','administrador') then
    raise exception 'Solo coordinador/administrador puede rechazar la liberación.';
  end if;
  select email into v_correo from auth.users where id = auth.uid();
  insert into liberaciones_seguridad (movimiento_id, resultado, faltantes, aprobado_por, notas)
    values (p_movimiento_id, 'REJECTED', p_motivo, v_correo, p_motivo)
    returning id, folio into v_id, v_folio;
  insert into movimiento_eventos (movimiento_id, tipo_evento, etapa, actor, datos)
    values (p_movimiento_id, 'clearance.rejected', 'LIBERACION', v_correo,
            jsonb_build_object('liberacion_id', v_id, 'motivo', p_motivo));
  return jsonb_build_object('ok', true, 'id', v_id, 'folio', v_folio, 'resultado', 'REJECTED');
end;
$fn$ language plpgsql security definer;

grant execute on function rpc_evaluar_liberacion(uuid) to authenticated;
grant execute on function rpc_aprobar_liberacion(uuid, text) to authenticated;
grant execute on function rpc_rechazar_liberacion(uuid, text) to authenticated;

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='liberaciones_seguridad') then
    alter publication supabase_realtime add table liberaciones_seguridad;
  end if;
end $$;
