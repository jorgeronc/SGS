-- =====================================================================
-- 0122_citas_visitantes.sql  (Control de acceso: Citas de visitantes)
-- Agenda de visitas por sitio (entrevistas, proveedores, citas). El guardia/empleado
-- crea la cita y genera un LINK con un token de UN SOLO USO; el visitante lo abre
-- (público, sin login) y registra sus datos, que se guardan en registros MAESTROS
-- (personas + vehiculos) y se ligan a la cita. Al enviar, el token se DESTRUYE.
--
-- SEGURIDAD:
--   * La tabla NO tiene políticas para anon: el visitante nunca la toca directo.
--   * anon solo puede EJECUTAR dos RPC security definer, ambas gateadas por token:
--       - rpc_cita_visitante_por_token: devuelve solo datos de presentación.
--       - rpc_registrar_visitante: valida token vigente + de un solo uso, escribe
--         y lo invalida (token=null). Sin token válido no hace nada.
--   * Token = 24 bytes aleatorios (base64 url-safe) → inadivinable; con expiración.
-- =====================================================================

create table if not exists citas_visitantes (
  id                       uuid primary key default gen_random_uuid(),
  folio                    text,
  sitio_id                 uuid not null references sitios(id),
  fecha_hora_cita          timestamptz not null,
  motivo                   text,
  -- Quién SOLICITÓ la cita (empleado/guardia) y quién la REGISTRÓ (creó el link).
  solicitante_personal_id  uuid references personal(id),
  creado_por               uuid references auth.users(id) default auth.uid(),
  creado_por_personal_id   uuid references personal(id),
  -- Link de un solo uso.
  token                    text,
  token_expira             timestamptz,
  estado                   text not null default 'pendiente' check (estado in ('pendiente','registrada','cancelada')),
  -- Datos del visitante (maestros + contacto de la cita).
  persona_id               uuid references personas(id),
  vehiculo_id              uuid references vehiculos(id),
  telefono                 text,
  empresa                  text,
  persona_visita_texto     text,
  registrado_en            timestamptz,
  datos_adicionales        jsonb default '{}'::jsonb,
  estatus                  text not null default 'activo' check (estatus in ('activo','cancelado')),
  cancelado_en             timestamptz,
  motivo_cancelacion       text,
  creado_en                timestamptz not null default now(),
  actualizado_en           timestamptz not null default now()
);
comment on table citas_visitantes is 'Citas de visitantes por sitio; el visitante registra sus datos por un link de un solo uso.';
create index if not exists idx_citas_vis_sitio on citas_visitantes (sitio_id);
create unique index if not exists ux_citas_vis_token on citas_visitantes (token) where token is not null;

-- Folio VI, no-delete (WORM), bitácora.
insert into foliadores (modulo, nombre, iniciales) values ('citas_visitantes','Citas de visitantes','VI') on conflict (modulo) do nothing;
drop trigger if exists trg_folio_citas_vis on citas_visitantes;
create trigger trg_folio_citas_vis before insert on citas_visitantes for each row execute function fn_asignar_folio();
drop trigger if exists trg_no_delete_citas_vis on citas_visitantes;
create trigger trg_no_delete_citas_vis before delete on citas_visitantes for each row execute function fn_bloquear_delete();
revoke delete on citas_visitantes from authenticated, anon;
drop trigger if exists trg_auditoria_citas_vis on citas_visitantes;
create trigger trg_auditoria_citas_vis after insert or update on citas_visitantes for each row execute function fn_bitacora_generica();

-- RLS: solo autenticados (la web es 2FA). anon NO tiene políticas (sin acceso directo).
alter table citas_visitantes enable row level security;
drop policy if exists sel_citas_vis on citas_visitantes;
create policy sel_citas_vis on citas_visitantes for select to authenticated using (true);
drop policy if exists ins_citas_vis on citas_visitantes;
create policy ins_citas_vis on citas_visitantes for insert to authenticated with check (true);
drop policy if exists upd_citas_vis on citas_visitantes;
create policy upd_citas_vis on citas_visitantes for update to authenticated using (true) with check (true);

-- Ampliar rpc_cancelar_registro con citas_visitantes.
create or replace function rpc_cancelar_registro(p_tabla text, p_id uuid, p_motivo text)
returns void as $$
begin
  if p_tabla not in ('personas','vehiculos','ubicaciones','vinculos','casos','personal',
                     'ordenes','evidencias','asuntos_internos','llamadas_cad','despachos',
                     'barandilla','equipo','incidentes','presuntos','kardex',
                     'patrullas','armamento','comunicacion','bodycams','otros',
                     'rol_servicio','rol_servicio_asignaciones','abordamientos','accidentes',
                     'tareas','tarea_asignaciones','clientes','sitios','turnos','citas_visitantes') then
    raise exception 'Tabla no reconocida: %', p_tabla;
  end if;
  if p_tabla = 'asuntos_internos' and coalesce(fn_rol_actual(),'') not in ('asuntos_internos','administrador') then
    raise exception 'No autorizado para cancelar registros de asuntos internos.';
  end if;
  execute format('update %I set estatus=''cancelado'', cancelado_en=now(), motivo_cancelacion=$1, actualizado_en=now() where id=$2', p_tabla)
    using p_motivo, p_id;
end;
$$ language plpgsql security definer;

-- Token url-safe (24 bytes aleatorios).
create or replace function fn_token_visita() returns text
language sql volatile as $$
  select translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/=', '-_.');
$$;

-- 1) Crear cita + link (solo autenticados). Devuelve folio y token.
drop function if exists rpc_generar_cita_visitante(uuid, timestamptz, text, uuid);
create or replace function rpc_generar_cita_visitante(
  p_sitio uuid, p_fecha_hora timestamptz, p_motivo text, p_solicitante uuid
) returns table(folio text, token text)
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_pid uuid; v_tok text; v_folio text;
begin
  if v_uid is null then raise exception 'No autenticado.'; end if;
  if p_sitio is null or p_fecha_hora is null then raise exception 'Faltan sitio o fecha/hora de la cita.'; end if;
  select p.id into v_pid from personal p where p.usuario_id = v_uid limit 1;
  v_tok := fn_token_visita();
  insert into citas_visitantes (sitio_id, fecha_hora_cita, motivo, solicitante_personal_id,
                                creado_por, creado_por_personal_id, token, token_expira)
  values (p_sitio, p_fecha_hora, nullif(btrim(p_motivo),''), p_solicitante,
          v_uid, v_pid, v_tok, greatest(now(), p_fecha_hora) + interval '2 days')
  returning citas_visitantes.folio into v_folio;
  return query select v_folio, v_tok;
end $$;
grant execute on function rpc_generar_cita_visitante(uuid, timestamptz, text, uuid) to authenticated;

-- 2) Leer cita por token (PÚBLICO). Solo datos de presentación; solo si vigente.
-- Por SEGURIDAD NO se devuelve a quién visita ni el solicitante: el visitante debe
-- capturar la "persona a la que visita" con la información que ya tiene.
drop function if exists rpc_cita_visitante_por_token(text);
create or replace function rpc_cita_visitante_por_token(p_token text)
returns table(folio text, sitio text, fecha_hora_cita timestamptz, estado text)
language plpgsql security definer set search_path = public as $$
begin
  return query
  select c.folio, s.nombre, c.fecha_hora_cita, c.estado
    from citas_visitantes c
    join sitios s on s.id = c.sitio_id
   where c.token = p_token and c.estatus = 'activo' and c.estado = 'pendiente'
     and (c.token_expira is null or c.token_expira > now())
   limit 1;
end $$;
grant execute on function rpc_cita_visitante_por_token(text) to anon, authenticated;

-- 3) Registrar visitante (PÚBLICO). Valida token vigente, guarda en maestros
--    (personas + vehiculos), liga a la cita y DESTRUYE el token. Devuelve folio.
create or replace function rpc_registrar_visitante(
  p_token text, p_nombre text, p_ap_pat text, p_ap_mat text, p_telefono text,
  p_motivo text, p_persona_visita text, p_empresa text,
  p_veh_marca text, p_veh_modelo text, p_veh_placas text
) returns text
language plpgsql security definer set search_path = public as $$
declare v_c record; v_persona uuid; v_veh uuid; v_folio text;
begin
  select * into v_c from citas_visitantes
   where token = p_token and estatus = 'activo' and estado = 'pendiente'
     and (token_expira is null or token_expira > now())
   for update;
  if not found then raise exception 'Link no válido o ya utilizado.'; end if;

  if coalesce(btrim(p_nombre),'') = '' or coalesce(btrim(p_ap_pat),'') = '' then
    raise exception 'Nombre y apellido paterno son obligatorios.';
  end if;
  if coalesce(btrim(p_telefono),'') = '' then raise exception 'El teléfono de contacto es obligatorio.'; end if;
  if length(p_nombre) > 120 or length(coalesce(p_ap_pat,'')) > 120 or length(coalesce(p_ap_mat,'')) > 120
     or length(coalesce(p_telefono,'')) > 40 or length(coalesce(p_empresa,'')) > 200
     or length(coalesce(p_motivo,'')) > 500 or length(coalesce(p_persona_visita,'')) > 200 then
    raise exception 'Alguno de los campos excede el largo permitido.';
  end if;

  insert into personas (nombre, apellido_paterno, apellido_materno, datos_adicionales)
  values (btrim(p_nombre), btrim(p_ap_pat), nullif(btrim(p_ap_mat),''),
          jsonb_build_object('origen','visitante','telefono', nullif(btrim(p_telefono),''), 'empresa', nullif(btrim(p_empresa),'')))
  returning id into v_persona;

  if coalesce(btrim(p_veh_placas),'') <> '' or coalesce(btrim(p_veh_marca),'') <> '' then
    insert into vehiculos (marca, modelo, placas, datos_adicionales)
    values (nullif(btrim(p_veh_marca),''), nullif(btrim(p_veh_modelo),''), nullif(btrim(p_veh_placas),''),
            jsonb_build_object('origen','visitante'))
    returning id into v_veh;
  end if;

  update citas_visitantes
     set persona_id = v_persona, vehiculo_id = v_veh,
         telefono = nullif(btrim(p_telefono),''), empresa = nullif(btrim(p_empresa),''),
         persona_visita_texto = nullif(btrim(p_persona_visita),''),
         motivo = coalesce(nullif(btrim(p_motivo),''), motivo),
         estado = 'registrada', registrado_en = now(),
         token = null, token_expira = null, actualizado_en = now()
   where id = v_c.id
   returning folio into v_folio;
  return v_folio;
end $$;
grant execute on function rpc_registrar_visitante(text, text, text, text, text, text, text, text, text, text, text) to anon, authenticated;
