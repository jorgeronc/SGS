-- =====================================================================
-- sitio_fabrica_demo.sql
-- Alta del cliente "Fábrica Demo S.A. de C.V." y su sitio "Planta Dallas" con las
-- coordenadas dadas. Idempotente (si ya existe, no duplica). Imprime los IDs.
--
-- Las cámaras de Windy alrededor NO se dan de alta desde SQL (la API key vive en
-- el servidor): se importan con la edge function camara_vista tras correr esto —
-- ver instrucciones al final.
-- =====================================================================
do $$
declare v_cli uuid; v_sit uuid;
begin
  -- Cliente
  select id into v_cli from clientes where razon_social = 'Fábrica Demo S.A. de C.V.' and estatus = 'activo' limit 1;
  if v_cli is null then
    insert into clientes (razon_social) values ('Fábrica Demo S.A. de C.V.') returning id into v_cli;
  end if;

  -- Sitio "Planta Dallas" con las coordenadas dadas
  select id into v_sit from sitios where cliente_id = v_cli and nombre = 'Planta Dallas' and estatus = 'activo' limit 1;
  if v_sit is null then
    insert into sitios (cliente_id, nombre, latitud, longitud)
      values (v_cli, 'Planta Dallas', 32.74788803095575, -97.09286934904908)
      returning id into v_sit;
  end if;

  raise notice 'Cliente "Fábrica Demo S.A. de C.V.": %', v_cli;
  raise notice 'Sitio "Planta Dallas" (sitio_id para importar cámaras): %', v_sit;
end $$;

-- ---------------------------------------------------------------------
-- Paso 2 — importar cámaras de Windy alrededor del sitio (NO es SQL):
--
--   OPCIÓN A (recomendada, un clic en la app):
--     /videovigilancia/camaras  ->  "Buscar cámaras alrededor de un sitio"
--     ->  elige "Planta Dallas"  ->  Radio (p.ej. 5 km)  ->  "Buscar y agregar".
--
--   OPCIÓN B (curl; usa el sitio_id que imprimió el NOTICE de arriba y un
--   access token de una sesión iniciada):
--     curl -X POST "https://rdyjjfbehjfggpldmmur.supabase.co/functions/v1/camara_vista" \
--       -H "apikey: <ANON_KEY>" \
--       -H "Authorization: Bearer <ACCESS_TOKEN>" \
--       -H "Content-Type: application/json" \
--       -d '{"accion":"importar","sitio_id":"<SITIO_ID>","radio_km":5,"limite":20,"proveedor":"windy"}'
-- ---------------------------------------------------------------------
