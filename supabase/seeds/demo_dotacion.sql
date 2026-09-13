-- =====================================================================
-- demo_dotacion.sql  (SEED de demo — correr UNA sola vez en el SQL editor)
-- Crea la dotación para cubrir todos los sitios en 3 turnos con descansos (6x1):
--   * Cuenta a cada guardia EXISTENTE sin cuenta.
--   * Guardias NUEVOS hasta el objetivo = ceil(posiciones × 7/6),
--     posiciones = Σ(num_guardias por sitio) × 3 turnos.
--   * 3 supervisores (uno por turno; 1 ciudad).
-- Correo: nombre.apellido@sgs.com (no reales; email_confirmed). Pass: Pruebas123!
--
-- Inserta en auth.users + auth.identities (esquema GoTrue). Todo en una transacción
-- (BEGIN/COMMIT implícito del bloque). Si tu versión de Supabase difiere y el login
-- fallara, usa scripts/seed_demo_guardias.mjs (API admin).
-- =====================================================================

-- Helpers temporales -------------------------------------------------------
create or replace function fn_seed_email(p_nombre text, p_ap text) returns text
language plpgsql as $$
declare b text; e text; i int := 1;
begin
  b := regexp_replace(translate(lower(split_part(coalesce(p_nombre,'guardia'),' ',1)), 'áéíóúüñ','aeiouun'), '[^a-z0-9]','','g')
       || '.' ||
       regexp_replace(translate(lower(coalesce(nullif(p_ap,''),'guardia')), 'áéíóúüñ','aeiouun'), '[^a-z0-9]','','g');
  e := b || '@sgs.com';
  while exists (select 1 from auth.users where email = e) loop i := i + 1; e := b || i::text || '@sgs.com'; end loop;
  return e;
end $$;

create or replace function fn_seed_personal(p_nombre text, p_ap text, p_am text, p_categoria text, p_placa text)
returns uuid language plpgsql as $$
declare v_per uuid; v_pid uuid;
begin
  insert into personas (nombre, apellido_paterno, apellido_materno, datos_adicionales)
    values (p_nombre, p_ap, nullif(p_am,''), '{"origen":"seed_demo"}'::jsonb) returning id into v_per;
  insert into personal (persona_id, numero_placa, categoria, estado_laboral)
    values (v_per, p_placa, p_categoria, 'activo') returning id into v_pid;
  return v_pid;
end $$;

create or replace function fn_seed_cuenta(p_email text, p_nombre text, p_rol text, p_personal uuid)
returns uuid language plpgsql as $$
declare v_uid uuid := gen_random_uuid();
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change_token_new, email_change)
  values (
    '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated',
    lower(p_email), extensions.crypt('Pruebas123!', extensions.gen_salt('bf')), now(),
    now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('nombre', p_nombre),
    '', '', '', '');
  insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), lower(p_email), v_uid,
    jsonb_build_object('sub', v_uid::text, 'email', lower(p_email), 'email_verified', true),
    'email', now(), now(), now());
  -- usuarios_perfil (el trigger handle_new_user pudo crearlo): fija rol + nombre.
  insert into usuarios_perfil (id, nombre, rol, activo) values (v_uid, p_nombre, p_rol, true)
    on conflict (id) do update set rol = excluded.rol, nombre = excluded.nombre, activo = true;
  if p_personal is not null then
    update personal set usuario_id = v_uid, actualizado_en = now() where id = p_personal;
  end if;
  return v_uid;
end $$;

-- Ejecución ----------------------------------------------------------------
do $$
declare
  v_nombres text[] := array['Jose','Juan','Luis','Carlos','Miguel','Jorge','Pedro','Roberto','Ricardo','Fernando','Alejandro','Raul','Sergio','Arturo','Hector','Manuel','Francisco','Eduardo','Daniel','Oscar','Ana','Maria','Laura','Patricia','Rosa','Gabriela','Veronica','Claudia','Diana','Adriana'];
  v_apes text[] := array['Garcia','Hernandez','Lopez','Martinez','Gonzalez','Perez','Rodriguez','Sanchez','Ramirez','Cruz','Flores','Gomez','Diaz','Reyes','Morales','Jimenez','Torres','Vazquez','Ramos','Castillo','Mendoza','Guerrero','Rojas','Medina','Aguilar','Vargas','Castro','Ortiz','Nunez','Silva'];
  v_pos int; v_obj int; v_pool int; v_nuevos int; i int;
  r record; v_email text; v_pid uuid; v_nom text; v_ap text; v_am text; v_turno text;
  v_creadas_exist int := 0; v_creadas_nuevas int := 0; v_creadas_sup int := 0;
begin
  select coalesce(sum(coalesce(num_guardias,1)),0)*3 into v_pos from sitios where estatus='activo';
  v_obj := ceil(v_pos * 7.0 / 6.0);
  select count(*) into v_pool from personal where estatus='activo' and estado_laboral='activo';
  v_nuevos := greatest(0, v_obj - v_pool);
  raise notice 'Posiciones=%, objetivo=%, pool=%, nuevos=%', v_pos, v_obj, v_pool, v_nuevos;

  -- A) Cuentas a guardias existentes sin cuenta.
  for r in
    select p.id, pe.nombre, pe.apellido_paterno, pe.apellido_materno
      from personal p join personas pe on pe.id = p.persona_id
     where p.estatus='activo' and p.estado_laboral='activo' and p.usuario_id is null
  loop
    v_email := fn_seed_email(coalesce(r.nombre,'guardia'), coalesce(r.apellido_paterno,''));
    perform fn_seed_cuenta(v_email,
      trim(coalesce(r.nombre,'') || ' ' || coalesce(r.apellido_paterno,'') || ' ' || coalesce(r.apellido_materno,'')),
      'guardia', r.id);
    v_creadas_exist := v_creadas_exist + 1;
  end loop;

  -- B) Guardias nuevos.
  for i in 1..v_nuevos loop
    v_nom := v_nombres[1 + floor(random() * array_length(v_nombres,1))::int];
    v_ap  := v_apes[1 + floor(random() * array_length(v_apes,1))::int];
    v_am  := v_apes[1 + floor(random() * array_length(v_apes,1))::int];
    v_pid := fn_seed_personal(v_nom, v_ap, v_am, 'Guardia', 'G-' || lpad((v_pool + i)::text, 3, '0'));
    v_email := fn_seed_email(v_nom, v_ap);
    perform fn_seed_cuenta(v_email, v_nom || ' ' || v_ap || ' ' || v_am, 'guardia', v_pid);
    v_creadas_nuevas := v_creadas_nuevas + 1;
  end loop;

  -- C) 3 supervisores (uno por turno).
  foreach v_turno in array array['Matutino','Vespertino','Nocturno'] loop
    v_pid := fn_seed_personal('Supervisor', v_turno, '', 'Supervisor', 'S-' || upper(left(v_turno,3)));
    perform fn_seed_cuenta('supervisor.' || lower(v_turno) || '@sgs.com', 'Supervisor ' || v_turno, 'supervisor', v_pid);
    v_creadas_sup := v_creadas_sup + 1;
  end loop;

  raise notice 'Cuentas existentes: %, guardias nuevos: %, supervisores: %', v_creadas_exist, v_creadas_nuevas, v_creadas_sup;
end $$;

-- Limpia los helpers de seed.
drop function if exists fn_seed_email(text, text);
drop function if exists fn_seed_personal(text, text, text, text, text);
drop function if exists fn_seed_cuenta(text, text, text, uuid);
