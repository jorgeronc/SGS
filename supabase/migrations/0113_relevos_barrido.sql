-- =====================================================================
-- 0113_relevos_barrido.sql
-- Brecha de relevo: cuando un sitio DEBERÍA estar cubierto (hay un turno activo
-- con guardias cuya ventana contiene "ahora") pero NINGÚN guardia asignado está en
-- posición (en línea + dentro de la geocerca del sitio) pasado el margen, se abre
-- automáticamente un CHAT entre central (operador/administrador) + coordinador del
-- turno + supervisor del sitio, para atender la situación. Al restablecerse la
-- cobertura, se cierra la brecha y se avisa en el chat.
--
-- Corre por pg_cron (cada 5 min) y también es llamable (rpc_barrer_relevos).
-- Depende de: 0095 (fn_distancia_m), 0111 (fn_usuario_de_personal, fn_supervisor_sitio,
-- turnos.coordinador_id), 0046 (chat).
-- =====================================================================

alter table config_sistema add column if not exists relevo_margen_min integer not null default 15;
comment on column config_sistema.relevo_margen_min is 'Minutos de tolerancia tras el inicio del turno antes de marcar brecha de relevo.';

-- Dedupe/auditoría de brechas: una fila por (turno, sitio, fecha).
create table if not exists relevo_gaps (
  id             uuid primary key default gen_random_uuid(),
  turno_id       uuid not null references turnos(id) on delete cascade,
  sitio_id       uuid not null references sitios(id),
  fecha          date not null,
  canal_id       uuid references chat_canales(id),
  estado         text not null default 'abierto' check (estado in ('abierto','cerrado')),
  detectado_en   timestamptz not null default now(),
  cerrado_en     timestamptz,
  motivo_cierre  text,
  unique (turno_id, sitio_id, fecha)
);
alter table relevo_gaps enable row level security;
drop policy if exists sel_relevo_gaps on relevo_gaps;
create policy sel_relevo_gaps on relevo_gaps for select to authenticated using (true);

-- Agrega al chat: central (operador/administrador), coordinador del turno y
-- supervisor del sitio (resueltos a su cuenta vía personal.usuario_id).
create or replace function fn_relevo_miembros(p_canal uuid, p_turno uuid, p_sitio uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_coord uuid; v_sup uuid; v_coord_personal uuid;
begin
  -- Central: todos los operadores/administradores activos.
  insert into chat_miembros (canal_id, usuario_id, es_admin)
    select p_canal, u.id, (u.rol = 'administrador')
      from usuarios_perfil u
     where u.activo and u.rol in ('operador','administrador')
  on conflict do nothing;
  -- Coordinador del turno.
  select coordinador_id into v_coord_personal from turnos where id = p_turno;
  v_coord := fn_usuario_de_personal(v_coord_personal);
  if v_coord is not null then
    insert into chat_miembros (canal_id, usuario_id, es_admin) values (p_canal, v_coord, true) on conflict do nothing;
  end if;
  -- Supervisor del sitio en el turno.
  v_sup := fn_usuario_de_personal(fn_supervisor_sitio(p_turno, p_sitio));
  if v_sup is not null then
    insert into chat_miembros (canal_id, usuario_id, es_admin) values (p_canal, v_sup, false) on conflict do nothing;
  end if;
end $$;

-- Barrido: detecta brechas y abre/cierra chats. Devuelve # de brechas abiertas nuevas.
create or replace function rpc_barrer_relevos()
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_now   timestamptz := now();
  v_hoy   date := (now() at time zone 'America/Monterrey')::date;
  v_margen int; v_geo int; v_nuevas int := 0;
  r record; v_total int; v_pres int; v_ausente text; v_n_aus int;
  v_gap relevo_gaps%rowtype; v_canal uuid; v_nombre text; v_ini timestamptz;
begin
  select coalesce(relevo_margen_min, 15), coalesce(geofence_margen_m, 20)
    into v_margen, v_geo from config_sistema where id = true;
  v_margen := coalesce(v_margen, 15); v_geo := coalesce(v_geo, 20);

  for r in
    select distinct t.id as turno_id, tg.sitio_id,
           (t.fecha + t.hora_inicio)::timestamptz as ini,
           (t.fecha + t.hora_fin + case when t.hora_fin < t.hora_inicio then interval '1 day' else interval '0 day' end)::timestamptz as fin
      from turnos t
      join turno_guardias tg on tg.turno_id = t.id and tg.estatus = 'activo'
     where t.estatus = 'activo' and t.estado = 'activo' and t.fecha = v_hoy
       and t.hora_inicio is not null and t.hora_fin is not null and tg.sitio_id is not null
  loop
    -- ¿Ventana vigente y pasado el margen desde el inicio?
    if not (v_now >= r.ini + make_interval(mins => v_margen) and v_now <= r.fin) then
      -- Fuera de ventana: si había brecha abierta, ciérrala.
      update relevo_gaps set estado = 'cerrado', cerrado_en = now(), motivo_cierre = 'fin de ventana'
        where turno_id = r.turno_id and sitio_id = r.sitio_id and fecha = v_hoy and estado = 'abierto';
      continue;
    end if;

    -- Presencia: guardias del sitio en el turno, en línea y dentro de la geocerca.
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
      -- BRECHA. Nombre del/los guardia(s) esperado(s) sin presencia.
      select count(*), min(trim(coalesce(pe.nombre,'') || ' ' || coalesce(pe.apellido_paterno,'')))
        into v_n_aus, v_ausente
        from turno_guardias tg join personal p on p.id = tg.personal_id
        left join personas pe on pe.id = p.persona_id
       where tg.turno_id = r.turno_id and tg.sitio_id = r.sitio_id and tg.estatus = 'activo';
      v_ausente := coalesce(nullif(v_ausente,''), 'guardia') || case when v_n_aus > 1 then ' (+' || (v_n_aus-1) || ')' else '' end;
      select nombre into v_nombre from sitios where id = r.sitio_id;

      if v_gap.id is null then
        -- Crear chat + miembros + mensaje de sistema + fila de brecha.
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
        -- Reapertura (el relevo se fue otra vez): reactivar y avisar en el mismo chat.
        update relevo_gaps set estado = 'abierto', detectado_en = now(), cerrado_en = null, motivo_cierre = null
          where id = v_gap.id;
        if v_gap.canal_id is not null then
          insert into chat_mensajes (canal_id, usuario_id, tipo, cuerpo)
            values (v_gap.canal_id, null, 'sistema', 'Se volvió a perder la cobertura en ' || coalesce(v_nombre,'el sitio') || '.');
        end if;
      end if;
      -- si ya estaba 'abierto', no hacer nada (dedupe)
    else
      -- Cubierto: si había brecha abierta, cerrarla y avisar.
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

-- Agenda pg_cron cada 5 minutos (re-agenda idempotente).
do $$ begin perform cron.unschedule('sgs-relevos'); exception when others then null; end $$;
select cron.schedule('sgs-relevos', '*/5 * * * *', $$ select rpc_barrer_relevos(); $$);
