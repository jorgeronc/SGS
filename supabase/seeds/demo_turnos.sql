-- =====================================================================
-- demo_turnos.sql  (SEED de demo — correr en el SQL editor)
-- Arma la cobertura de 24 h en 3 turnos de 8 h para TODOS los sitios activos:
--   * Turno 1 = el ACTIVO folio 2026TU000034 (se respeta el guardia y el
--     supervisor ya designados; se completa el resto del personal).
--   * Turno 2 y Turno 3 = nuevos, en BORRADOR (8 h cada uno), con guardias
--     DISTINTOS (el anti-fatiga 0110 impide encadenar al mismo guardia) y un
--     supervisor por turno (los otros dos supervisores de demo).
-- Posiciones por turno = Σ(num_guardias por sitio activo). Coordinador: el que
-- ya existe (rol coordinador), se asigna a los 3 turnos.
--
-- Todo en una transacción: si algo truena (p. ej. anti-fatiga o pool corto),
-- no deja nada a medias.
-- =====================================================================
do $$
declare
  v_t0 uuid; v_fecha date; v_base time; v_tipo text;
  v_t1 uuid; v_t2 uuid;
  v_sups uuid[]; v_sup_t0 uuid; v_sup_t1 uuid; v_sup_t2 uuid; v_rest uuid[];
  v_coord uuid;
  v_pool uuid[]; v_ptr int := 0; v_g uuid;
  v_turnos uuid[]; v_turno uuid; k int;
  r_s record; v_have int; i int;
  v_ng_total int; v_need_total int;
begin
  -- 0) Turno activo por folio -------------------------------------------------
  select id, fecha, coalesce(hora_inicio, time '06:00'), tipo_turno
    into v_t0, v_fecha, v_base, v_tipo
    from turnos where folio = '2026TU000034';
  if v_t0 is null then raise exception 'No existe el turno con folio 2026TU000034.'; end if;

  -- 1) Supervisores (rol supervisor) y coordinador (rol coordinador) ----------
  select array_agg(p.id order by pe.nombre)
    into v_sups
    from personal p
    join usuarios_perfil up on up.id = p.usuario_id
    left join personas pe on pe.id = p.persona_id
   where up.rol = 'supervisor' and p.estatus = 'activo' and p.estado_laboral = 'activo';
  if v_sups is null or array_length(v_sups,1) < 3 then
    raise exception 'Se necesitan 3 supervisores (rol supervisor con cuenta ligada). Corre demo_dotacion.sql primero.';
  end if;

  select p.id into v_coord
    from personal p join usuarios_perfil up on up.id = p.usuario_id
   where up.rol = 'coordinador' and p.estatus = 'activo' and p.estado_laboral = 'activo'
   limit 1;

  -- Supervisor del T0: respeta el ya designado (turno_supervisores o header); si
  -- no hay, toma el primero. Los otros dos van a T1 y T2.
  v_sup_t0 := coalesce(
    (select supervisor_personal_id from turno_supervisores where turno_id = v_t0 and estatus = 'activo' limit 1),
    (select supervisor_id from turnos where id = v_t0),
    v_sups[1]);
  select array_agg(s) into v_rest from unnest(v_sups) s where s <> v_sup_t0;
  v_sup_t1 := v_rest[1];
  v_sup_t2 := coalesce(v_rest[2], v_rest[1]);

  -- 2) Ventanas de 8 h --------------------------------------------------------
  update turnos set hora_inicio = v_base, hora_fin = (v_base + interval '8 hours')::time,
                    supervisor_id = v_sup_t0, coordinador_id = coalesce(v_coord, coordinador_id),
                    actualizado_en = now()
   where id = v_t0;

  insert into turnos (fecha, tipo_turno, hora_inicio, hora_fin, estado, supervisor_id, coordinador_id)
    values (v_fecha, v_tipo, (v_base + interval '8 hours')::time, (v_base + interval '16 hours')::time,
            'borrador', v_sup_t1, v_coord)
    returning id into v_t1;
  insert into turnos (fecha, tipo_turno, hora_inicio, hora_fin, estado, supervisor_id, coordinador_id)
    values (v_fecha, v_tipo, (v_base + interval '16 hours')::time, (v_base + interval '24 hours')::time,
            'borrador', v_sup_t2, v_coord)
    returning id into v_t2;

  -- 3) Pool de guardias: personal activo con rol guardia (o sin cuenta), EXCLUYE
  --    supervisores, coordinador y CUALQUIER guardia que ya tenga un turno activo
  --    (incluye el designado del T0). Así cada guardia del pool queda en un único
  --    turno y el anti-fatiga (0110) nunca lo bloquea (cadena = 1).
  select array_agg(p.id order by p.creado_en, p.id)
    into v_pool
    from personal p
    left join usuarios_perfil up on up.id = p.usuario_id
   where p.estatus = 'activo' and p.estado_laboral = 'activo'
     and coalesce(up.rol, 'guardia') not in ('supervisor','coordinador','administrador','operador')
     and p.id <> all (v_sups)
     and (v_coord is null or p.id <> v_coord)
     and p.id not in (
       select tg.personal_id from turno_guardias tg join turnos t on t.id = tg.turno_id
        where tg.estatus = 'activo' and t.estatus = 'activo');

  select coalesce(sum(greatest(coalesce(num_guardias,1),1)),0) into v_ng_total from sitios where estatus = 'activo';
  raise notice 'Posiciones por turno=%, necesito ~% guardias, pool disponible=%, supervisores=%, coordinador=%',
    v_ng_total, v_ng_total * 3, coalesce(array_length(v_pool,1),0), array_length(v_sups,1), v_coord;

  -- 4) Llenado de guardias por turno (guardias distintos gracias al puntero) ---
  v_turnos := array[v_t0, v_t1, v_t2];
  foreach v_turno in array v_turnos loop
    for r_s in select id as sitio_id, greatest(coalesce(num_guardias,1),1) as ng
                 from sitios where estatus = 'activo' order by nombre loop
      select count(*) into v_have from turno_guardias
        where turno_id = v_turno and sitio_id = r_s.sitio_id and estatus = 'activo';
      for i in 1 .. (r_s.ng - v_have) loop
        v_ptr := v_ptr + 1;
        if v_pool is null or v_ptr > array_length(v_pool,1) then
          raise exception 'Pool de guardias agotado (se necesitan ~% en total). Crea más con demo_dotacion.sql.', v_ng_total * 3;
        end if;
        v_g := v_pool[v_ptr];
        insert into turno_guardias (turno_id, personal_id, sitio_id) values (v_turno, v_g, r_s.sitio_id);
      end loop;
    end loop;
  end loop;

  -- 5) Supervisión por sitio (turno_supervisores). El supervisor YA forma parte del
  --    turno por esta vía + turnos.supervisor_id (cabecera); NO se mete en
  --    turno_guardias (no es guardia de posición y dispararía el anti-fatiga 0110).
  for k in 1..3 loop
    v_turno := v_turnos[k];
    v_g := (array[v_sup_t0, v_sup_t1, v_sup_t2])[k];
    insert into turno_supervisores (turno_id, sitio_id, supervisor_personal_id, estatus, actualizado_en)
      select v_turno, s.id, v_g, 'activo', now() from sitios s where s.estatus = 'activo'
      on conflict (turno_id, sitio_id)
      do update set supervisor_personal_id = excluded.supervisor_personal_id, estatus = 'activo', actualizado_en = now();
  end loop;

  select count(*) into v_need_total from turno_guardias where turno_id = any (v_turnos) and estatus = 'activo';
  raise notice 'Listo. Turno1(activo)=%, Turno2(borrador)=%, Turno3(borrador)=%. Asignaciones totales=%.',
    v_t0, v_t1, v_t2, v_need_total;
end $$;
