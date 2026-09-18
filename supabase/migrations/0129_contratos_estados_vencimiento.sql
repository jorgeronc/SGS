-- =====================================================================
-- 0129_contratos_estados_vencimiento.sql · Contratos Fase 2
-- Transición automática de estado por fecha (se llama al abrir el tablero):
--   * 'vencido'    cuando fecha_fin ya pasó.
--   * 'por_vencer' cuando faltan <= renovacion_aviso_dias (default 30) para fin.
-- Solo mueve contratos activos/por_vencer; nunca toca borrador/suspendido/
-- terminado/cerrado ni el eje de retención (estatus).
-- =====================================================================

create or replace function rpc_actualizar_estados_contratos() returns void
language plpgsql security definer set search_path = public as $$
begin
  update contratos
     set estado = 'vencido', actualizado_en = now()
   where estatus = 'activo' and estado in ('activo', 'por_vencer')
     and fecha_fin is not null and fecha_fin < current_date;

  update contratos
     set estado = 'por_vencer', actualizado_en = now()
   where estatus = 'activo' and estado = 'activo'
     and fecha_fin is not null
     and fecha_fin >= current_date
     and fecha_fin <= current_date + make_interval(days => coalesce(renovacion_aviso_dias, 30));
end;
$$;
