-- =====================================================================
-- 0045_despacho_reapertura.sql
-- Despacho (app del oficial):
--  * reapertura_autorizada: tras Cerrado, la app solo cambia el estatus si el
--    sistema central (CAD web) lo autoriza.
--  * rpc_despacho_avanzar: avanza el estatus del despacho de forma SECUENCIAL.
--    Si se salta uno o más estados (p. ej. se marca "En el lugar" sin haber
--    pasado por Enterado/En Ruta), registra los estados intermedios en el
--    historial con la MISMA fecha/hora que el destino.
-- =====================================================================

alter table despachos add column if not exists reapertura_autorizada boolean not null default false;
comment on column despachos.reapertura_autorizada is 'Si es true, la app permite cambiar el estatus de un despacho ya cerrado (autorizado desde el CAD).';

create or replace function rpc_despacho_avanzar(p_despacho uuid, p_estado text)
returns void as $$
declare
  v_actual   text;
  v_llamada  uuid;
  v_num      text;
  estados    text[] := array['enterado','en_ruta','en_lugar','cerrado'];
  idx_a int; idx_t int; i int;
begin
  if p_estado <> all (estados) then
    raise exception 'Estado no válido: %', p_estado;
  end if;

  select d.estado, d.llamada_id, p.numero
    into v_actual, v_llamada, v_num
    from despachos d left join patrullas p on p.id = d.patrulla_id
   where d.id = p_despacho;

  idx_a := coalesce(array_position(estados, v_actual), 0);
  idx_t := array_position(estados, p_estado);

  -- Estados intermedios saltados (estrictamente entre el actual y el destino):
  -- se registran en el historial con el now() de esta misma transacción.
  if idx_t > idx_a + 1 then
    for i in (idx_a + 1)..(idx_t - 1) loop
      insert into cad_estado_historial (llamada_id, despacho_id, ambito, campo, estado, patrulla_numero, usuario)
        values (v_llamada, p_despacho, 'despacho', 'estado', estados[i], v_num, fn_usuario_actual());
    end loop;
  end if;

  -- El cambio final dispara el trigger de historial para el estado destino.
  update despachos set estado = p_estado, actualizado_en = now() where id = p_despacho;
end;
$$ language plpgsql security definer;
