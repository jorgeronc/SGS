-- =====================================================================
-- demo_turnos_hoy.sql  (SEED de demo — correr en el SQL editor)
-- Deja la demo con SOLO 3 turnos de HOY: Matutino 06:00–14:00, Vespertino
-- 14:00–22:00, Nocturno 22:00–06:00 (los del catálogo). Cubre todos los sitios
-- activos con guardias DISTINTOS por turno (respeta el anti-fatiga) + 1 supervisor
-- por turno; el coordinador existente se asigna a los 3.
--
-- IMPORTANTE: primero CANCELA los turnos vigentes actuales (estatus='activo') para
-- liberar a los guardias y limpiar el tablero. Todo en una transacción.
-- =====================================================================
do $$
declare
  v_hoy date := (now() at time zone 'America/Monterrey')::date;
  v_sups uuid[]; v_coord uuid; v_pool uuid[]; v_ptr int := 0; v_g uuid;
  v_turnos uuid[]; v_horas text[][] := array[['06:00','14:00'],['14:00','22:00'],['22:00','06:00']];
  v_tipos text[] := array['Matutino (06:00-14:00)','Vespertino (14:00-22:00)','Nocturno (22:00-06:00)'];
  v_tid uuid; k int; r_s record; i int; v_pos int;
begin
  -- 0) Reset: cancela los turnos vigentes actuales (libera guardias para el demo).
  update turnos set estatus = 'cancelado', cancelado_en = now(),
         motivo_cancelacion = 'Reset de turnos para demo', actualizado_en = now()
   where estatus = 'activo';

  -- 1) Supervisores (rol supervisor) y coordinador (rol coordinador).
  select array_agg(p.id order by pe.nombre) into v_sups
    from personal p join usuarios_perfil up on up.id = p.usuario_id
    left join personas pe on pe.id = p.persona_id
   where up.rol = 'supervisor' and p.estatus = 'activo' and p.estado_laboral = 'activo';
  if v_sups is null or array_length(v_sups,1) < 3 then
    raise exception 'Se necesitan 3 supervisores (rol supervisor con cuenta). Corre demo_dotacion.sql primero.';
  end if;
  select p.id into v_coord from personal p join usuarios_perfil up on up.id = p.usuario_id
   where up.rol = 'coordinador' and p.estatus = 'activo' and p.estado_laboral = 'activo' limit 1;

  -- 2) Crea los 3 turnos de hoy (activos).
  v_turnos := array[]::uuid[];
  for k in 1..3 loop
    insert into turnos (fecha, tipo_turno, hora_inicio, hora_fin, estado, supervisor_id, coordinador_id)
    values (v_hoy, v_tipos[k], v_horas[k][1]::time, v_horas[k][2]::time, 'activo', v_sups[k], v_coord)
    returning id into v_tid;
    v_turnos := v_turnos || v_tid;
  end loop;

  -- 3) Pool de guardias FRESCOS: activos, rol guardia (o sin cuenta), sin turno vigente
  --    (tras el reset, casi todos), excluyendo supervisores y coordinador.
  select array_agg(p.id order by p.creado_en, p.id) into v_pool
    from personal p left join usuarios_perfil up on up.id = p.usuario_id
   where p.estatus = 'activo' and p.estado_laboral = 'activo'
     and coalesce(up.rol,'guardia') not in ('supervisor','coordinador','administrador','operador')
     and p.id <> all (v_sups) and (v_coord is null or p.id <> v_coord)
     and p.id not in (
       select tg.personal_id from turno_guardias tg join turnos t on t.id = tg.turno_id
        where tg.estatus = 'activo' and t.estatus = 'activo');

  select coalesce(sum(greatest(coalesce(num_guardias,1),1)),0) into v_pos from sitios where estatus = 'activo';
  raise notice 'Posiciones por turno=%, pool disponible=%, necesito ~%', v_pos, coalesce(array_length(v_pool,1),0), v_pos*3;

  -- 4) Llena cada turno por sitio (guardias distintos gracias al puntero).
  for k in 1..3 loop
    v_tid := v_turnos[k];
    for r_s in select id as sitio_id, greatest(coalesce(num_guardias,1),1) as ng
                 from sitios where estatus = 'activo' order by nombre loop
      for i in 1..r_s.ng loop
        v_ptr := v_ptr + 1;
        if v_pool is null or v_ptr > array_length(v_pool,1) then
          raise exception 'Pool de guardias agotado (necesito ~%). Crea más con demo_dotacion.sql / demo_relevo_extra.sql.', v_pos*3;
        end if;
        v_g := v_pool[v_ptr];
        insert into turno_guardias (turno_id, personal_id, sitio_id) values (v_tid, v_g, r_s.sitio_id);
      end loop;
    end loop;
    -- Supervisión por sitio (el supervisor del turno cubre todos sus sitios).
    insert into turno_supervisores (turno_id, sitio_id, supervisor_personal_id, estatus)
      select v_tid, s.id, v_sups[k], 'activo' from sitios s where s.estatus = 'activo'
      on conflict (turno_id, sitio_id) do update set supervisor_personal_id = excluded.supervisor_personal_id, estatus = 'activo';
  end loop;

  raise notice 'Listo. Turnos hoy: Matutino=%, Vespertino=%, Nocturno=%', v_turnos[1], v_turnos[2], v_turnos[3];
end $$;
