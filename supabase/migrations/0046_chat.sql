-- =====================================================================
-- 0046_chat.sql · Módulo de Comunicación (Chat)
--
-- Chat por CANALES para comunicar al oficial (app móvil) con el central (web).
-- Portado de la guía de integración (SOME) al stack de SCP:
--   * Identidad del chat = usuarios_perfil (auth.uid) — sirve para web y móvil,
--     ambos inician sesión con Supabase Auth. Nombre visible = usuarios_perfil.nombre.
--   * Acceso POR PERTENENCIA (no por rol): solo los miembros de un canal leen/escriben.
--   * INSERT = fuente de verdad; Realtime solo difunde (igual que CAD).
--   * Gestión de canales (crear/integrar/abrir-cerrar) SOLO desde la web: se guarda
--     por rol (supervisor/investigador/administrador) y por admin del canal.
--   * Push a los miembros (menos el remitente) cuando la app está en 2º plano,
--     reutilizando dispositivos_push + Edge Function enviar_push (por user_id).
--   * Adjuntos en bucket privado 'chat' (subida por URL firmada).
--
-- WORM: los canales NO se eliminan (solo abren/cierran); delete bloqueado en las
-- tres tablas.
-- =====================================================================

-- 0) Enums -------------------------------------------------------------
do $$ begin
  create type chat_estado_canal as enum ('abierto','cerrado');
exception when duplicate_object then null; end $$;

do $$ begin
  create type chat_tipo_mensaje as enum ('texto','foto','archivo','sistema');
exception when duplicate_object then null; end $$;

-- 1) Tablas ------------------------------------------------------------
create table if not exists chat_canales (
  id             uuid primary key default gen_random_uuid(),
  nombre         text not null,
  tema           text,
  estado         chat_estado_canal not null default 'abierto',
  creado_por     uuid references usuarios_perfil(id),
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

-- Pertenencia: quién está en cada canal y si es admin del canal.
create table if not exists chat_miembros (
  canal_id   uuid not null references chat_canales(id) on delete cascade,
  usuario_id uuid not null references usuarios_perfil(id) on delete cascade,
  es_admin   boolean not null default false,
  unido_en   timestamptz not null default now(),
  primary key (canal_id, usuario_id)
);
create index if not exists idx_chat_miembros_usuario on chat_miembros(usuario_id);

-- Historial persistente (incluye adjuntos). Los mensajes 'sistema' llevan el
-- usuario_id del actor y un cuerpo descriptivo.
create table if not exists chat_mensajes (
  id          uuid primary key default gen_random_uuid(),
  canal_id    uuid not null references chat_canales(id) on delete cascade,
  usuario_id  uuid references usuarios_perfil(id),
  tipo        chat_tipo_mensaje not null default 'texto',
  cuerpo      text,
  adjunto_url text,                 -- ruta del objeto en el bucket 'chat'
  creado_en   timestamptz not null default now()
);
create index if not exists idx_chat_mensajes_canal_fecha on chat_mensajes(canal_id, creado_en);

-- 2) WORM: no se borran (solo se abren/cierran) -----------------------
do $$
declare t text;
begin
  foreach t in array array['chat_canales','chat_miembros','chat_mensajes'] loop
    execute format('drop trigger if exists trg_no_delete_%1$s on %1$s;', t);
    execute format('create trigger trg_no_delete_%1$s before delete on %1$s for each row execute function fn_bloquear_delete();', t);
    execute format('revoke delete on %I from authenticated, anon;', t);
  end loop;
end $$;

-- 3) Helper de pertenencia (SECURITY DEFINER para no recursar en RLS) ---
create or replace function fn_chat_es_miembro(p_canal uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from chat_miembros
     where canal_id = p_canal and usuario_id = auth.uid()
  );
$$;

create or replace function fn_chat_es_admin(p_canal uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from chat_miembros
     where canal_id = p_canal and usuario_id = auth.uid() and es_admin
  );
$$;

-- 3b) Ver el nombre de quien comparte un canal conmigo -----------------
-- usuarios_perfil solo deja ver el perfil propio (o admin). Para pintar el
-- nombre del remitente en el chat y listar miembros, se abre el select a los
-- usuarios que comparten al menos un canal con el usuario actual.
create or replace function fn_chat_comparte_canal(p_user uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from chat_miembros m1
      join chat_miembros m2 on m2.canal_id = m1.canal_id
     where m1.usuario_id = auth.uid() and m2.usuario_id = p_user
  );
$$;

drop policy if exists sel_usuarios_perfil_chat on usuarios_perfil;
create policy sel_usuarios_perfil_chat on usuarios_perfil for select to authenticated
  using (fn_chat_comparte_canal(id));

-- Directorio para el selector de miembros (solo personal central / web).
create or replace function rpc_chat_directorio()
returns table(id uuid, nombre text, rol text)
language sql stable security definer set search_path = public as $$
  select u.id, u.nombre, u.rol
    from usuarios_perfil u
   where u.activo
     and coalesce(fn_rol_actual(), '') in ('supervisor','investigador','administrador')
   order by u.nombre nulls last;
$$;

-- 4) RLS: acceso por pertenencia --------------------------------------
alter table chat_canales  enable row level security;
alter table chat_miembros enable row level security;
alter table chat_mensajes enable row level security;

-- Canales: solo los ve quien es miembro. Escritura solo por RPC (definer).
drop policy if exists chat_canales_sel on chat_canales;
create policy chat_canales_sel on chat_canales for select to authenticated
  using (fn_chat_es_miembro(id));

-- Miembros: los ve quien pertenece al canal. Alta/baja solo por RPC.
drop policy if exists chat_miembros_sel on chat_miembros;
create policy chat_miembros_sel on chat_miembros for select to authenticated
  using (fn_chat_es_miembro(canal_id));

-- Mensajes: los ve quien pertenece; ENVIAR = insert directo del propio usuario
-- en un canal ABIERTO donde es miembro (el trigger fija tipo y actualiza el canal).
drop policy if exists chat_mensajes_sel on chat_mensajes;
create policy chat_mensajes_sel on chat_mensajes for select to authenticated
  using (fn_chat_es_miembro(canal_id));

drop policy if exists chat_mensajes_ins on chat_mensajes;
create policy chat_mensajes_ins on chat_mensajes for insert to authenticated
  with check (
    usuario_id = auth.uid()
    and tipo <> 'sistema'
    and fn_chat_es_miembro(canal_id)
    and exists (select 1 from chat_canales c where c.id = canal_id and c.estado = 'abierto')
  );

-- 5) Trigger al insertar mensaje: fija tipo, valida contenido, bumpea canal ---
create or replace function fn_chat_msg_before() returns trigger
language plpgsql as $$
begin
  if new.tipo <> 'sistema' then
    if coalesce(new.cuerpo, '') = '' and coalesce(new.adjunto_url, '') = '' then
      raise exception 'El mensaje no puede estar vacío.';
    end if;
    new.tipo := case when coalesce(new.adjunto_url, '') <> '' then 'foto'::chat_tipo_mensaje
                     else 'texto'::chat_tipo_mensaje end;
  end if;
  update chat_canales set actualizado_en = now() where id = new.canal_id;
  return new;
end;
$$;

drop trigger if exists trg_chat_msg_before on chat_mensajes;
create trigger trg_chat_msg_before before insert on chat_mensajes
  for each row execute function fn_chat_msg_before();

-- 6) RPCs de gestión (SOLO web: rol central + admin del canal) ---------
-- 6a) Crear canal con miembros (transacción): creador = admin + mensaje 'sistema'.
create or replace function rpc_chat_crear_canal(
  p_nombre   text,
  p_tema     text default null,
  p_miembros uuid[] default '{}'
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_canal uuid;
  v_yo    uuid := auth.uid();
  v_n     int;
begin
  if coalesce(fn_rol_actual(), '') not in ('supervisor','investigador','administrador') then
    raise exception 'Solo el personal central (web) puede crear canales.';
  end if;
  if coalesce(trim(p_nombre), '') = '' then
    raise exception 'El canal necesita un nombre.';
  end if;

  insert into chat_canales (nombre, tema, creado_por)
    values (trim(p_nombre), nullif(trim(coalesce(p_tema,'')), ''), v_yo)
    returning id into v_canal;

  -- El creador queda como admin del canal.
  insert into chat_miembros (canal_id, usuario_id, es_admin)
    values (v_canal, v_yo, true)
    on conflict do nothing;

  -- Miembros elegidos (sin duplicar al creador).
  insert into chat_miembros (canal_id, usuario_id)
    select v_canal, x from unnest(coalesce(p_miembros, '{}')) as x
    where x is not null and x <> v_yo
    on conflict do nothing;

  select count(*) into v_n from chat_miembros where canal_id = v_canal;

  insert into chat_mensajes (canal_id, usuario_id, tipo, cuerpo)
    values (v_canal, v_yo, 'sistema', 'Canal creado con ' || v_n || ' integrante(s).');

  return v_canal;
end;
$$;

-- 6b) Integrar miembros (canal abierto, solo admin del canal).
create or replace function rpc_chat_integrar_miembros(
  p_canal    uuid,
  p_usuarios uuid[]
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_u    uuid;
  v_nom  text;
begin
  if not fn_chat_es_admin(p_canal) then
    raise exception 'Solo el administrador del canal puede integrar miembros.';
  end if;
  if not exists (select 1 from chat_canales where id = p_canal and estado = 'abierto') then
    raise exception 'El canal está cerrado; no admite nuevos integrantes.';
  end if;

  foreach v_u in array coalesce(p_usuarios, '{}') loop
    if v_u is null then continue; end if;
    if exists (select 1 from chat_miembros where canal_id = p_canal and usuario_id = v_u) then
      continue;
    end if;
    insert into chat_miembros (canal_id, usuario_id) values (p_canal, v_u);
    select nombre into v_nom from usuarios_perfil where id = v_u;
    insert into chat_mensajes (canal_id, usuario_id, tipo, cuerpo)
      values (p_canal, auth.uid(), 'sistema', coalesce(v_nom, 'Un usuario') || ' se integró al canal.');
  end loop;
end;
$$;

-- 6c) Abrir / cerrar canal (solo admin del canal).
create or replace function rpc_chat_estado_canal(p_canal uuid, p_estado text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not fn_chat_es_admin(p_canal) then
    raise exception 'Solo el administrador del canal puede cambiar su estado.';
  end if;
  if p_estado not in ('abierto','cerrado') then
    raise exception 'Estado no válido: %', p_estado;
  end if;
  update chat_canales set estado = p_estado::chat_estado_canal, actualizado_en = now()
   where id = p_canal;
  insert into chat_mensajes (canal_id, usuario_id, tipo, cuerpo)
    values (p_canal, auth.uid(), 'sistema',
            case when p_estado = 'cerrado' then 'El canal fue cerrado.' else 'El canal fue reabierto.' end);
end;
$$;

-- 7) Push: al insertar un mensaje, avisar a los miembros (menos el remitente) --
create or replace function fn_push_chat() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_secret  text := current_setting('app.push_secret', true);
  v_url     text := 'https://okhsniabwiukjyjhmeav.supabase.co/functions/v1/enviar_push';
  v_canal   text;
  v_remite  text;
  v_users   uuid[];
begin
  -- Los mensajes de sistema no notifican. Sin secreto configurado, no hace nada.
  if new.tipo = 'sistema' or coalesce(v_secret, '') = '' then
    return new;
  end if;

  select nombre into v_canal from chat_canales where id = new.canal_id;
  select coalesce(nombre, 'Alguien') into v_remite from usuarios_perfil where id = new.usuario_id;

  -- Destinatarios: miembros del canal menos el remitente.
  select array_agg(usuario_id) into v_users
    from chat_miembros
   where canal_id = new.canal_id and usuario_id <> new.usuario_id;

  if v_users is null or array_length(v_users, 1) is null then
    return new;
  end if;

  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
    body    := jsonb_build_object(
      'user_ids', to_jsonb(v_users),
      'tipo',     'chat',
      'titulo',   coalesce('#' || v_canal || ' · ', '') || v_remite,
      'cuerpo',   left(coalesce(nullif(new.cuerpo, ''), '📷 Foto'), 180),
      'data',     jsonb_build_object('tipo', 'chat', 'canal_id', new.canal_id, 'nombre', v_canal)
    )
  );
  return new;
end;
$$;

drop trigger if exists trg_push_chat on chat_mensajes;
create trigger trg_push_chat after insert on chat_mensajes
  for each row execute function fn_push_chat();

-- 8) Realtime: difundir mensajes y cambios de canal --------------------
do $$ begin
  alter publication supabase_realtime add table chat_mensajes;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table chat_canales;
exception when duplicate_object then null; end $$;

-- 9) Bucket privado de adjuntos ---------------------------------------
insert into storage.buckets (id, name, public)
  values ('chat', 'chat', false)
  on conflict (id) do nothing;

-- Políticas de storage para el bucket 'chat'. Los objetos se nombran con rutas
-- aleatorias (uuid) y se sirven con URL firmada. (Endurecer por canal en prod.)
drop policy if exists chat_obj_sel on storage.objects;
create policy chat_obj_sel on storage.objects for select to authenticated
  using (bucket_id = 'chat');
drop policy if exists chat_obj_ins on storage.objects;
create policy chat_obj_ins on storage.objects for insert to authenticated
  with check (bucket_id = 'chat');
