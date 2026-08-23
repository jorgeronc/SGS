-- =====================================================================
-- seeds/demo_estadio_bbva.sql  ·  DATOS DE DEMO
-- Cliente + sitio "Estadio BBVA" (25.6698092, -100.2451801) con 14 puntos de
-- control georreferenciados, 4 guardias (nombres ficticios) y rondines + trayecto
-- GPS en 3 días (ayer, antier y hace 3 días). Idempotente (marcador demo).
-- Córrelo en el SQL editor de Supabase (SGS). Requiere 0053 y 0057 aplicadas.
-- =====================================================================
do $$
declare
  v_cliente  uuid; v_sitio uuid; v_persona uuid; v_g uuid; v_punto uuid;
  v_user     uuid := '00000000-0000-0000-0000-0000000000bb';  -- user_id fijo (demo) para recorrido_gps
  d date; off int; skip int; gi int; i int; k int;
  base timestamptz;
  punto_ids uuid[] := '{}'::uuid[];
  guardia_ids uuid[] := '{}'::uuid[];
  gnom text[] := array['Miguel Ángel','Laura Sofía','Carlos Eduardo','Ana Patricia'];
  gpat text[] := array['Torres','Méndez','Nava','Cruz'];
  gmat text[] := array['Vega','Ríos','Luna','Domínguez'];
  nombres text[] := array['Pasillo de Acceso 1','Estacionamiento E1','Estacionamiento E2','Estacionamiento E5',
                          'Pasillo de Acceso 2','Zona VIP','Zona Prensa','Tienda','Pasillo de Acceso 4',
                          'Estacionamiento E4','Estacionamiento E3','Pasillo de Acceso 3','Zona Jugadores','Cancha'];
  codigos text[] := array['BBVA-01','BBVA-02','BBVA-03','BBVA-04','BBVA-05','BBVA-06','BBVA-07',
                          'BBVA-08','BBVA-09','BBVA-10','BBVA-11','BBVA-12','BBVA-13','BBVA-14'];
  lats double precision[] := array[25.670409,25.670909,25.670909,25.670009,25.669809,25.670209,25.669509,
                                   25.669409,25.669809,25.668709,25.668709,25.669209,25.670109,25.669809];
  lngs double precision[] := array[-100.245180,-100.246080,-100.244280,-100.243880,-100.244480,-100.244880,-100.244780,
                                   -100.245580,-100.245880,-100.246180,-100.244180,-100.245180,-100.245380,-100.245180];
begin
  -- 1) Cliente + sitio -----------------------------------------------------------
  select id into v_cliente from clientes where razon_social = 'Estadio BBVA' and estatus='activo' limit 1;
  if v_cliente is null then insert into clientes (razon_social) values ('Estadio BBVA') returning id into v_cliente; end if;

  select id into v_sitio from sitios where nombre = 'Estadio BBVA' and estatus='activo' limit 1;
  if v_sitio is null then
    insert into sitios (cliente_id, nombre, tipo, direccion, latitud, longitud)
      values (v_cliente, 'Estadio BBVA', 'Evento', 'Av. Pablo Livas, Guadalupe, N.L.', 25.6698092, -100.2451801)
      returning id into v_sitio;
  end if;

  -- 2) Guardias (4, ficticios) ---------------------------------------------------
  for gi in 1..4 loop
    select p.id into v_g from personal p join personas pe on pe.id = p.persona_id
      where pe.nombre = gnom[gi] and pe.apellido_paterno = gpat[gi] and coalesce(pe.apellido_materno,'') = gmat[gi]
        and p.estatus='activo' limit 1;
    if v_g is null then
      insert into personas (nombre, apellido_paterno, apellido_materno) values (gnom[gi], gpat[gi], gmat[gi]) returning id into v_persona;
      insert into personal (persona_id, categoria, estado_laboral) values (v_persona, 'Guardia intramuros', 'activo') returning id into v_g;
    end if;
    guardia_ids := array_append(guardia_ids, v_g);
  end loop;

  -- 3) 14 puntos de control georreferenciados ------------------------------------
  for i in 1..14 loop
    select id into v_punto from puntos_control where codigo = codigos[i] and estatus='activo' limit 1;
    if v_punto is null then
      insert into puntos_control (sitio_id, nombre, codigo, orden, latitud, longitud)
        values (v_sitio, nombres[i], codigos[i], i, lats[i], lngs[i]) returning id into v_punto;
    end if;
    punto_ids := array_append(punto_ids, v_punto);
  end loop;

  -- 4) Rondines + trayecto GPS en 3 días con distintos guardias ------------------
  for off in 1..3 loop
    d := current_date - off;
    -- Día 1: guardias 1,2,3 · Día 2: 2,3,4 · Día 3: 1,3,4 (se omite uno por día).
    skip := case off when 1 then 4 when 2 then 1 else 2 end;
    for gi in 1..4 loop
      if gi = skip then continue; end if;
      v_g := guardia_ids[gi];
      base := (d + time '12:00') + ((gi-1) * interval '20 min');

      if not exists (select 1 from rondines where personal_id = v_g and fecha_hora::date = d and (datos_adicionales->>'demo')='true') then
        for i in 1..14 loop
          insert into rondines (punto_id, personal_id, fecha_hora, latitud, longitud, novedad, datos_adicionales)
            values (punto_ids[i], v_g, base + ((i-1)*interval '8 min'), lats[i], lngs[i],
                    case i when 5 then 'Aglomeración en el acceso' when 10 then 'Vehículo mal estacionado' else 'Sin novedad' end,
                    '{"demo": true}'::jsonb);
        end loop;
      end if;

      if not exists (select 1 from recorrido_gps where personal_id = v_g and fecha_hora::date = d and user_id = v_user) then
        for i in 1..14 loop
          insert into recorrido_gps (personal_id, user_id, latitud, longitud, fecha_hora)
            values (v_g, v_user, lats[i], lngs[i], base + ((i-1)*interval '8 min'));
          if i < 14 then
            for k in 1..3 loop
              insert into recorrido_gps (personal_id, user_id, latitud, longitud, fecha_hora)
                values (v_g, v_user,
                        lats[i] + (lats[i+1]-lats[i])*k/4.0,
                        lngs[i] + (lngs[i+1]-lngs[i])*k/4.0,
                        base + ((i-1)*interval '8 min') + (k*interval '2 min'));
            end loop;
          end if;
        end loop;
      end if;
    end loop;
  end loop;

  raise notice 'Demo Estadio BBVA: sitio=% guardias=% (rondines/recorrido de % a %).', v_sitio, array_length(guardia_ids,1), current_date-3, current_date-1;
end $$;
