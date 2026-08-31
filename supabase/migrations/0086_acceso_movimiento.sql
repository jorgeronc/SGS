-- =====================================================================
-- 0086_acceso_movimiento.sql · Vista Operativa (Fase B+)
-- Conecta Control de Acceso con los movimientos: registra la entrada/salida de
-- un movimiento (su activo + operador) como un `acceso` LIGADO al movimiento,
-- para que la etapa "Control de acceso" del flujo se complete y alimente el
-- gate de liberación. Reutiliza la tabla `accesos`.
-- =====================================================================

create or replace function rpc_acceso_movimiento(
  p_movimiento_id uuid, p_tipo text, p_operador text default null, p_resultado text default 'autorizado')
returns jsonb as $fn$
declare v_rol text := coalesce(fn_rol_actual(),''); m record; v_id uuid; v_folio text; v_correo text;
begin
  if v_rol not in ('operador','coordinador','supervisor','administrador') then
    raise exception 'No autorizado para registrar accesos.';
  end if;
  if coalesce(p_tipo,'') not in ('entrada','salida') then p_tipo := 'entrada'; end if;
  if coalesce(p_resultado,'') not in ('autorizado','rechazado','pendiente') then p_resultado := 'autorizado'; end if;

  select mv.transporte_activo_id, mv.sitio_origen_id, mv.folio,
         ta.identificador as activo_ident, ta.placas as activo_placas
    into m from movimientos mv
    left join transporte_activos ta on ta.id = mv.transporte_activo_id
    where mv.id = p_movimiento_id;
  if not found then raise exception 'movimiento no encontrado'; end if;
  select email into v_correo from auth.users where id = auth.uid();

  insert into accesos (tipo, resultado, movimiento_id, transporte_activo_id, sitio_id,
    visitante_nombre, tipo_persona, motivo, datos_adicionales, autorizado_por, autorizacion_en)
  values (p_tipo, p_resultado, p_movimiento_id, m.transporte_activo_id, m.sitio_origen_id,
    p_operador, 'Transportista', 'Movimiento logístico',
    jsonb_build_object('origen','vista_operativa','movimiento_folio', m.folio,
      'placa', m.activo_placas, 'activo', m.activo_ident),
    auth.uid(), now())
  returning id, folio into v_id, v_folio;

  insert into movimiento_eventos (movimiento_id, tipo_evento, etapa, actor, datos)
    values (p_movimiento_id,
      case when p_resultado = 'rechazado' then 'access.rejected' else 'access.authorized' end,
      'CONTROL_ACCESO', v_correo,
      jsonb_build_object('acceso_id', v_id, 'folio', v_folio, 'tipo', p_tipo, 'operador', p_operador, 'resultado', p_resultado));

  return jsonb_build_object('ok', true, 'id', v_id, 'folio', v_folio, 'resultado', p_resultado);
end;
$fn$ language plpgsql security definer;
grant execute on function rpc_acceso_movimiento(uuid, text, text, text) to authenticated;
