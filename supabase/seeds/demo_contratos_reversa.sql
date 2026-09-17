-- =====================================================================
-- demo_contratos_reversa.sql · "Alta en reversa" de Contratos (demo)
--
-- Crea un contrato ACTIVO por cada uno de los dos clientes demo
-- (folios 2026CL000002 y 2026CL000005) derivando TODO de la operación
-- ya activa en SGS:
--   * un servicio de seguridad física por cada sitio activo del cliente,
--   * dotación requerida por turno = dotación real observada (máx. guardias
--     en un mismo turno del sitio), o sitios.num_guardias si está definido,
--   * supervisores requeridos = máx. supervisores por turno del sitio,
--   * un puesto principal por sitio y requerimientos cuantificables
--     (guardias/turno, cobertura 100%, y rondines/turno = puntos de control),
--   * SLA del contrato copiando el SLA del cliente (o un set por defecto),
--   * coordinador operativo = el del turno activo más reciente del cliente.
--
-- Idempotente: si el contrato demo del cliente ya existe (numero DEMO-<folio>),
-- se omite. Correr en el SQL editor de Supabase. Requiere la migración 0127.
-- =====================================================================

do $$
declare
  cli   record;
  s     record;
  v_contrato uuid;
  v_serv     uuid;
  v_coord    uuid;
  v_g        int;   -- dotación de guardias por turno (derivada)
  v_sup      int;   -- supervisores por turno (derivada)
  v_rond     int;   -- puntos de control del sitio (para rondines/turno)
  v_cob      text;
  v_sla      int;
begin
  for cli in
    select id, folio, razon_social
      from clientes
     where folio in ('2026CL000002','2026CL000005') and estatus = 'activo'
  loop
    -- Idempotencia: no duplicar el contrato demo del cliente.
    if exists (select 1 from contratos where cliente_id = cli.id and numero = 'DEMO-' || cli.folio) then
      raise notice 'Contrato demo ya existe para % (%). Se omite.', cli.razon_social, cli.folio;
      continue;
    end if;

    -- Coordinador operativo: el del turno activo más reciente que cubre algún
    -- sitio del cliente (si hay).
    select t.coordinador_id into v_coord
      from turnos t
      join turno_guardias tg on tg.turno_id = t.id
      join sitios si on si.id = tg.sitio_id
     where si.cliente_id = cli.id and t.estatus = 'activo' and t.coordinador_id is not null
     order by t.fecha desc
     limit 1;

    insert into contratos (cliente_id, numero, nombre, descripcion, fecha_inicio, fecha_fin,
                           estado, referencia_comercial, account_manager, coordinador_operativo,
                           renovacion_tipo, renovacion_aviso_dias, notas)
    values (
      cli.id,
      'DEMO-' || cli.folio,
      'Servicio de seguridad — ' || cli.razon_social,
      'Contrato generado a partir de la operación activa en SGS (alta en reversa).',
      date_trunc('year', current_date)::date,
      (date_trunc('year', current_date) + interval '1 year' - interval '1 day')::date,
      'activo',
      'Demo',
      'Demo',
      v_coord,
      'manual',
      30,
      'Demo: refleja sitios, dotación y supervisión vigentes al momento de generarse.'
    )
    returning id into v_contrato;

    -- Un servicio de seguridad física por cada sitio activo del cliente.
    for s in
      select * from sitios where cliente_id = cli.id and estatus = 'activo' order by nombre
    loop
      -- Dotación por turno observada: máx. guardias en un mismo turno del sitio.
      select coalesce(max(cnt), 0) into v_g from (
        select tg.turno_id, count(distinct tg.personal_id) cnt
          from turno_guardias tg
          join turnos t on t.id = tg.turno_id
         where tg.sitio_id = s.id and t.estatus = 'activo'
         group by tg.turno_id
      ) g;
      -- Preferir num_guardias si está definido en el sitio.
      v_g := coalesce(nullif(s.num_guardias, 0), nullif(v_g, 0), null);

      select coalesce(max(cnt), 0) into v_sup from (
        select ts.turno_id, count(distinct ts.supervisor_personal_id) cnt
          from turno_supervisores ts
          join turnos t on t.id = ts.turno_id
         where ts.sitio_id = s.id and ts.estatus = 'activo' and t.estatus = 'activo'
         group by ts.turno_id
      ) su;

      select count(*) into v_rond from puntos_control where sitio_id = s.id and estatus = 'activo';

      v_cob := case when coalesce(s.horario, '') ilike '%24%' or coalesce(s.horario, '') = '' then '24x7' else 'franja' end;

      insert into contrato_servicios (contrato_id, tipo_servicio, sitio_id, fecha_inicio,
                                      estado, cobertura_tipo, guardias_requeridos, supervisores_requeridos, notas)
      values (v_contrato, 'Seguridad física / puesto fijo', s.id,
              date_trunc('year', current_date)::date, 'activo', v_cob,
              v_g, nullif(v_sup, 0), 'Derivado de la operación activa del sitio.')
      returning id into v_serv;

      -- Puesto principal del sitio.
      insert into contrato_puestos (contrato_servicio_id, sitio_id, nombre, dotacion_requerida, horario, estado)
      values (v_serv, s.id, 'Puesto principal', v_g, coalesce(s.horario, '24x7'), 'activo');

      -- Requerimientos cuantificables derivados.
      if coalesce(v_g, 0) > 0 then
        insert into contrato_requerimientos (contrato_servicio_id, clave, valor, unidad)
          values (v_serv, 'guardias_turno', v_g, '');
      end if;
      insert into contrato_requerimientos (contrato_servicio_id, clave, valor, unidad)
        values (v_serv, 'cobertura_pct', 100, '%');
      if v_rond > 0 then
        insert into contrato_requerimientos (contrato_servicio_id, clave, valor, unidad)
          values (v_serv, 'rondines_turno', v_rond, '');
      end if;
    end loop;

    -- SLA del contrato: copiar el del cliente si tiene; si no, un set por defecto.
    select count(*) into v_sla from sla_metas_cliente where cliente_id = cli.id;
    if v_sla > 0 then
      insert into contrato_sla_metas (contrato_id, clave, valor, activa)
        select v_contrato, clave, valor, activa from sla_metas_cliente where cliente_id = cli.id
        on conflict (contrato_id, clave) do nothing;
    end if;
    -- Asegurar las metas base activas (no pisa las ya insertadas).
    insert into contrato_sla_metas (contrato_id, clave, valor, activa) values
      (v_contrato, 'cobertura', 95, true),
      (v_contrato, 'rondines_rango', 90, true),
      (v_contrato, 'tiempo_resolucion', 60, true),
      (v_contrato, 'incidentes_criticos', 0, true)
    on conflict (contrato_id, clave) do nothing;

    raise notice 'Contrato creado para % (%).', cli.razon_social, cli.folio;
  end loop;
end $$;
