-- =====================================================================
-- 0114_tablero_supervisores.sql
-- Tablero de supervisores (para coordinador/administrador). Por supervisor y fecha:
--   * sitios asignados (turno_supervisores del día),
--   * % de esos sitios VISITADOS por el supervisor (su GPS dentro de la geocerca
--     ese día),
--   * brechas de relevo en sus sitios (relevo_gaps),
--   * cumplimiento de rondines en sus sitios (rondines dentro de rango).
-- Devuelve conteos; el % se calcula en el cliente.
-- =====================================================================

create or replace function rpc_tablero_supervisores(p_fecha date)
returns table(
  supervisor_id   uuid,
  supervisor      text,
  sitios          int,
  visitados       int,
  brechas         int,
  rondines        int,
  rondines_rango  int
) language plpgsql stable security definer set search_path = public as $$
declare v_geo int;
begin
  if coalesce(fn_rol_actual(), '') not in ('coordinador','administrador','operador') then
    raise exception 'No autorizado: el tablero de supervisores es para coordinador/administrador.';
  end if;
  select coalesce(geofence_margen_m, 20) into v_geo from config_sistema where id = true;
  v_geo := coalesce(v_geo, 20);

  return query
  with asg as (
    select ts.supervisor_personal_id as sup, ts.sitio_id
      from turno_supervisores ts join turnos t on t.id = ts.turno_id
     where t.fecha = p_fecha and t.estatus = 'activo' and ts.estatus = 'activo'
  ),
  ss as (select distinct sup, sitio_id from asg),
  visit as (
    select ss.sup, ss.sitio_id,
      exists (
        select 1 from recorrido_gps rg join sitios s on s.id = ss.sitio_id
         where rg.personal_id = ss.sup
           and (rg.fecha_hora at time zone 'America/Monterrey')::date = p_fecha
           and s.latitud is not null and rg.latitud is not null
           and fn_distancia_m(rg.latitud, rg.longitud, s.latitud, s.longitud) <= coalesce(s.radio_geofence_m, 150) + v_geo
      ) as visitado
    from ss
  ),
  brechas as (
    select ss.sup, count(*)::int as n
      from ss join relevo_gaps g on g.sitio_id = ss.sitio_id and g.fecha = p_fecha
     group by ss.sup
  ),
  rond as (
    select ss.sup, count(r.*)::int as total, count(r.*) filter (where r.dentro_geocerca)::int as en_rango
      from ss
      join puntos_control pc on pc.sitio_id = ss.sitio_id and pc.estatus = 'activo'
      join rondines r on r.punto_id = pc.id and r.estatus = 'activo'
       and (r.creado_en at time zone 'America/Monterrey')::date = p_fecha
     group by ss.sup
  )
  select
    ss.sup,
    trim(coalesce(pe.nombre,'') || ' ' || coalesce(pe.apellido_paterno,'') || ' ' || coalesce(pe.apellido_materno,'')) as supervisor,
    count(distinct ss.sitio_id)::int as sitios,
    count(distinct ss.sitio_id) filter (where v.visitado)::int as visitados,
    coalesce(max(b.n), 0) as brechas,
    coalesce(max(rd.total), 0) as rondines,
    coalesce(max(rd.en_rango), 0) as rondines_rango
  from ss
  join personal p on p.id = ss.sup
  left join personas pe on pe.id = p.persona_id
  left join visit v on v.sup = ss.sup and v.sitio_id = ss.sitio_id
  left join brechas b on b.sup = ss.sup
  left join rond rd on rd.sup = ss.sup
  group by ss.sup, pe.nombre, pe.apellido_paterno, pe.apellido_materno
  order by supervisor;
end $$;
grant execute on function rpc_tablero_supervisores(date) to authenticated;
