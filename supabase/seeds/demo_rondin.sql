-- =====================================================================
-- seeds/demo_rondin.sql  ·  DATOS DE DEMO (no es migración de esquema)
-- Crea una "Fábrica Demo" con 8 puntos de control alrededor de
-- (25.69718508604555, -100.318173020338), el guardia Jorge Ron Cárdenas, y
-- rondines + trayecto GPS de AYER y ANTIER para mostrar el mapa de recorrido.
-- Idempotente: se puede correr varias veces sin duplicar.
-- Córrelo en el SQL editor de Supabase (SGS). Requiere 0053 y 0057 aplicadas.
-- =====================================================================
do $$
declare
  v_cliente  uuid;
  v_sitio    uuid;
  v_persona  uuid;
  v_guardia  uuid;
  v_punto    uuid;
  v_user     uuid := gen_random_uuid();   -- user_id ficticio para recorrido_gps (demo)
  d          date;
  i          int;
  k          int;
  punto_ids  uuid[] := array[]::uuid[];
  nombres    text[] := array['Accesos','Bodega 1','Bodega 2','Estacionamiento principal',
                             'Estacionamiento VIP','Oficinas generales','Edificio principal','Salida de emergencia'];
  codigos    text[] := array['DEMO-ACCESOS','DEMO-BOD1','DEMO-BOD2','DEMO-ESTPRIN',
                             'DEMO-ESTVIP','DEMO-OFIC','DEMO-EDIF','DEMO-SALEMER'];
  lats       double precision[] := array[25.696285,25.697885,25.697885,25.696585,25.696585,25.697185,25.698185,25.697285];
  lngs       double precision[] := array[-100.318173,-100.318973,-100.317373,-100.319073,-100.317273,-100.319273,-100.318073,-100.316973];
  novs       text[] := array['Sin novedad','Sin novedad','Portón de bodega sin candado','Sin novedad',
                             'Sin novedad','Sin novedad','Sin novedad','Luminaria fundida en la salida'];
begin
  -- 1) Cliente + sitio (fábrica) -------------------------------------------------
  select id into v_cliente from clientes where razon_social = 'Fábrica Demo S.A. de C.V.' and estatus = 'activo' limit 1;
  if v_cliente is null then
    insert into clientes (razon_social) values ('Fábrica Demo S.A. de C.V.') returning id into v_cliente;
  end if;

  select id into v_sitio from sitios where nombre = 'Fábrica Demo' and estatus = 'activo' limit 1;
  if v_sitio is null then
    insert into sitios (cliente_id, nombre, tipo, direccion, latitud, longitud)
      values (v_cliente, 'Fábrica Demo', 'Industrial / planta', 'Parque Industrial (demo)', 25.697185, -100.318173)
      returning id into v_sitio;
  end if;

  -- 2) Guardia Jorge Ron Cárdenas ------------------------------------------------
  select p.id into v_guardia
    from personal p join personas pe on pe.id = p.persona_id
    where pe.nombre ilike 'Jorge%' and pe.apellido_paterno ilike 'Ron%'
      and coalesce(pe.apellido_materno,'') ilike 'C%rdenas%' and p.estatus = 'activo'
    limit 1;
  if v_guardia is null then
    insert into personas (nombre, apellido_paterno, apellido_materno) values ('Jorge','Ron','Cárdenas') returning id into v_persona;
    insert into personal (persona_id, categoria, estado_laboral) values (v_persona, 'Guardia intramuros', 'activo') returning id into v_guardia;
  end if;

  -- 3) 8 puntos de control alrededor de la coordenada ----------------------------
  for i in 1..8 loop
    select id into v_punto from puntos_control where codigo = codigos[i] and estatus = 'activo' limit 1;
    if v_punto is null then
      insert into puntos_control (sitio_id, nombre, codigo, orden, latitud, longitud)
        values (v_sitio, nombres[i], codigos[i], i, lats[i], lngs[i]) returning id into v_punto;
    end if;
    punto_ids := array_append(punto_ids, v_punto);
  end loop;

  -- 4) Rondines + trayecto GPS de AYER y ANTIER ----------------------------------
  foreach d in array array[current_date - 1, current_date - 2] loop
    -- Rondines (una lectura por punto, en orden, cada 12 min desde las 20:00).
    if not exists (select 1 from rondines where personal_id = v_guardia and fecha_hora::date = d) then
      for i in 1..8 loop
        insert into rondines (punto_id, personal_id, fecha_hora, latitud, longitud, novedad)
          values (punto_ids[i], v_guardia,
                  (d + time '20:00') + ((i-1) * interval '12 min'),
                  lats[i], lngs[i], novs[i]);
      end loop;
    end if;

    -- Trayecto GPS: puntos en cada checkpoint + interpolados hacia el siguiente.
    if not exists (select 1 from recorrido_gps where personal_id = v_guardia and fecha_hora::date = d) then
      for i in 1..8 loop
        insert into recorrido_gps (personal_id, user_id, latitud, longitud, fecha_hora)
          values (v_guardia, v_user, lats[i], lngs[i], (d + time '20:00') + ((i-1) * interval '12 min'));
        if i < 8 then
          for k in 1..3 loop
            insert into recorrido_gps (personal_id, user_id, latitud, longitud, fecha_hora)
              values (v_guardia, v_user,
                      lats[i] + (lats[i+1] - lats[i]) * k / 4.0,
                      lngs[i] + (lngs[i+1] - lngs[i]) * k / 4.0,
                      (d + time '20:00') + ((i-1) * interval '12 min') + (k * interval '3 min'));
          end loop;
        end if;
      end loop;
    end if;
  end loop;

  raise notice 'Demo lista: sitio=% guardia=% (rondines y recorrido de % y %).', v_sitio, v_guardia, current_date-1, current_date-2;
end $$;
