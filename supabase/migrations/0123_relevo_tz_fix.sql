-- =====================================================================
-- 0123_relevo_tz_fix.sql  (fix de zona horaria en el barrido de relevos)
-- En 0113, la ventana del turno se armaba con (fecha + hora)::timestamptz, que
-- interpreta la hora LOCAL como si fuera UTC; al mostrar/comparar se corría −6 h
-- (p. ej. un turno 16:00 mostraba "Hora de cambio: 10:00" y detectaba la brecha a
-- destiempo). Se interpreta la hora como America/Monterrey.
-- =====================================================================
create or replace function rpc_barrer_relevos()
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_now   timestamptz := now();
  v_hoy   date := (now() at time zone 'America/Monterrey')::date;
  v_margen int; v_geo int; v_nuevas int := 0;
  r record; v_total int; v_pres int; v_ausente text; v_n_aus int;
  v_gap relevo_gaps%rowtype; v_canal uuid; v_nombre text;
begin
  select coalesce(relevo_margen_min, 15), coalesce(geofence_margen_m, 20)
    into v_margen, v_geo from config_sistema where id = true;
  v_margen := coalesce(v_margen, 15); v_geo := coalesce(v_geo, 20);

  for r in
    select distinct t.id as turno_id, tg.sitio_id,
           (t.fecha + t.hora_inicio) at time zone 'America/Monterrey' as ini,
           (t.fecha + t.hora_fin + case when t.hora_fin < t.hora_inicio then interval '1 day' else interval '0 day' end)
             at time zone 'America/Monterrey' as fin
      from turnos t
      join turno_guardias tg on tg.turno_id = t.id and tg.estatus = 'activo'
     where t.estatus = 'activo' and t.estado = 'activo' and t.fecha = v_hoy
       and t.hora_inicio is not null and t.hora_fin is not null and tg.sitio_id is not null
  loop
    if not (v_now >= r.ini + make_interval(mins => v_margen) and v_now <= r.fin) then
      update relevo_gaps set estado = 'cerrado', cerrado_en = now(), motivo_cierre = 'fin de ventana'
        where turno_id = r.turno_id and sitio_id = r.sitio_id and fecha = v_hoy and estado = 'abierto';
      continue;
    end if;

    select count(*),
           count(*) filter (where ug.en_linea and ug.actualizado_en > now() - interval '10 minutes'
             and s.latitud is not null and ug.latitud is not null
             and fn_distancia_m(ug.latitud, ug.longitud, s.latitud, s.longitud) <= coalesce(s.radio_geofence_m, 150) + v_geo)
      into v_total, v_pres
      from turno_guardias tg
      join sitios s on s.id = tg.sitio_id
      left join ubicaciones_guardias ug on ug.personal_id = tg.personal_id
     where tg.turno_id = r.turno_id and tg.sitio_id = r.sitio_id and tg.estatus = 'activo';

    select relevo_gaps.* into v_gap from relevo_gaps
      where turno_id = r.turno_id and sitio_id = r.sitio_id and fecha = v_hoy;

    if v_total > 0 and v_pres = 0 then
      select count(*), min(trim(coalesce(pe.nombre,'') || ' ' || coalesce(pe.apellido_paterno,'')))
        into v_n_aus, v_ausente
        from turno_guardias tg join personal p on p.id = tg.personal_id
        left join personas pe on pe.id = p.persona_id
       where tg.turno_id = r.turno_id and tg.sitio_id = r.sitio_id and tg.estatus = 'activo';
      v_ausente := coalesce(nullif(v_ausente,''), 'guardia') || case when v_n_aus > 1 then ' (+' || (v_n_aus-1) || ')' else '' end;
      select nombre into v_nombre from sitios where id = r.sitio_id;

      if v_gap.id is null then
        insert into chat_canales (nombre, tema, estado)
          values (coalesce(v_nombre,'Sitio') || ' - posición sin cobertura', 'Guardia ausente: ' || v_ausente, 'abierto')
          returning id into v_canal;
        perform fn_relevo_miembros(v_canal, r.turno_id, r.sitio_id);
        insert into chat_mensajes (canal_id, usuario_id, tipo, cuerpo)
          values (v_canal, null, 'sistema',
            'Brecha de relevo: ' || coalesce(v_nombre,'sitio') || ' sin guardia en posición. Esperado: ' || v_ausente ||
            '. Hora de cambio: ' || to_char(r.ini at time zone 'America/Monterrey', 'HH24:MI') || '.');
        insert into relevo_gaps (turno_id, sitio_id, fecha, canal_id, estado)
          values (r.turno_id, r.sitio_id, v_hoy, v_canal, 'abierto');
        v_nuevas := v_nuevas + 1;
      elsif v_gap.estado = 'cerrado' then
        update relevo_gaps set estado = 'abierto', detectado_en = now(), cerrado_en = null, motivo_cierre = null
          where id = v_gap.id;
        if v_gap.canal_id is not null then
          insert into chat_mensajes (canal_id, usuario_id, tipo, cuerpo)
            values (v_gap.canal_id, null, 'sistema', 'Se volvió a perder la cobertura en ' || coalesce(v_nombre,'el sitio') || '.');
        end if;
      end if;
    else
      if v_gap.id is not null and v_gap.estado = 'abierto' then
        update relevo_gaps set estado = 'cerrado', cerrado_en = now(), motivo_cierre = 'cobertura restablecida' where id = v_gap.id;
        if v_gap.canal_id is not null then
          insert into chat_mensajes (canal_id, usuario_id, tipo, cuerpo)
            values (v_gap.canal_id, null, 'sistema', 'Cobertura restablecida: ya hay guardia en posición.');
        end if;
      end if;
    end if;
  end loop;
  return v_nuevas;
end $$;
grant execute on function rpc_barrer_relevos() to authenticated;
