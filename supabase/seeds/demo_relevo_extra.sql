-- =====================================================================
-- demo_relevo_extra.sql  (SEED de demo — correr en el SQL editor)
-- Crea 8 guardias + 2 supervisores extra CON cuenta (auth.users + identities),
-- para poblar el panel "Disponibles" y probar el relevo. Como no tienen turnos,
-- salen disponibles (sin conflicto de fatiga).
-- Correo: nombre.apellido@sgs.com (no reales; email_confirmed). Pass: Pruebas123!
-- =====================================================================
do $$
declare
  v_nombres text[] := array['Tomas','Ivan','Ruben','Emilio','Marco','Angel','Gerardo','Rafael','Ismael','Bruno'];
  v_apes    text[] := array['Salazar','Cabrera','Fuentes','Duran','Escobar','Molina','Cordova','Palacios','Cervantes','Zamora'];
  i int; v_uid uuid; v_per uuid; v_pid uuid;
  v_nom text; v_ap text; v_cat text; v_rol text; v_placa text;
  v_base text; v_email text; v_n int;
begin
  for i in 1..10 loop
    if i <= 8 then v_cat := 'Guardia'; v_rol := 'guardia'; v_placa := 'G-9' || lpad(i::text, 2, '0');
    else            v_cat := 'Supervisor'; v_rol := 'supervisor'; v_placa := 'S-EX' || (i - 8)::text; end if;
    v_nom := v_nombres[i]; v_ap := v_apes[i];

    -- correo único nombre.apellido@sgs.com
    v_base := regexp_replace(translate(lower(v_nom), 'áéíóúñ','aeioun'), '[^a-z0-9]','','g') || '.' ||
              regexp_replace(translate(lower(v_ap),  'áéíóúñ','aeioun'), '[^a-z0-9]','','g');
    v_email := v_base || '@sgs.com'; v_n := 1;
    while exists (select 1 from auth.users where email = v_email) loop
      v_n := v_n + 1; v_email := v_base || v_n::text || '@sgs.com';
    end loop;

    -- persona + personal
    insert into personas (nombre, apellido_paterno, datos_adicionales)
      values (v_nom, v_ap, '{"origen":"seed_relevo"}'::jsonb) returning id into v_per;
    insert into personal (persona_id, numero_placa, categoria, estado_laboral)
      values (v_per, v_placa, v_cat, 'activo') returning id into v_pid;

    -- cuenta auth + identidad email/password
    v_uid := gen_random_uuid();
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
      confirmation_token, recovery_token, email_change_token_new, email_change)
    values (
      '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated',
      v_email, extensions.crypt('Pruebas123!', extensions.gen_salt('bf')), now(),
      now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('nombre', v_nom || ' ' || v_ap),
      '', '', '', '');
    insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), v_email, v_uid,
      jsonb_build_object('sub', v_uid::text, 'email', v_email, 'email_verified', true),
      'email', now(), now(), now());

    insert into usuarios_perfil (id, nombre, rol, activo)
      values (v_uid, v_nom || ' ' || v_ap, v_rol, true)
      on conflict (id) do update set rol = excluded.rol, nombre = excluded.nombre, activo = true;
    update personal set usuario_id = v_uid, actualizado_en = now() where id = v_pid;
  end loop;
  raise notice 'Creados 8 guardias + 2 supervisores extra (pass Pruebas123!).';
end $$;
