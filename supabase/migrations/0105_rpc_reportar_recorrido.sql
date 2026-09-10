-- =====================================================================
-- 0105_rpc_reportar_recorrido.sql
-- La traza (recorrido_gps) se insertaba DIRECTO desde el móvil con user_id del
-- cliente; la RLS (with check user_id = auth.uid()) la rechazaba cuando la
-- identidad guardada en el dispositivo no coincidía con la sesión → 0 puntos GPS
-- en la sesión (sin traza, sin distancia, y sin puntos el trigger de geocerca no
-- valida). Mismo patrón que ubicaciones_guardias (0098). Este RPC (definer)
-- inserta con user_id = auth.uid(); los triggers de sesión (0096) y de geocerca
-- (0104) siguen disparándose. Acepta un lote (para el buffer offline) e ignora
-- duplicados por id de cliente.
-- =====================================================================

create or replace function rpc_reportar_recorrido(p_puntos jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_n int := 0; r jsonb;
begin
  if v_uid is null then raise exception 'Sesión no válida (sin auth.uid).'; end if;
  for r in select value from jsonb_array_elements(coalesce(p_puntos, '[]'::jsonb)) as value loop
    insert into recorrido_gps (id, personal_id, user_id, latitud, longitud, precision_m, rumbo, velocidad, fecha_hora, mock)
    values (
      coalesce(nullif(r->>'id','')::uuid, gen_random_uuid()),
      nullif(r->>'personal_id','')::uuid,
      v_uid,
      (r->>'latitud')::double precision,
      (r->>'longitud')::double precision,
      nullif(r->>'precision_m','')::double precision,
      nullif(r->>'rumbo','')::double precision,
      nullif(r->>'velocidad','')::double precision,
      coalesce(nullif(r->>'fecha_hora','')::timestamptz, now()),
      coalesce((r->>'mock')::boolean, false)
    )
    on conflict (id) do nothing;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

grant execute on function rpc_reportar_recorrido(jsonb) to authenticated;
