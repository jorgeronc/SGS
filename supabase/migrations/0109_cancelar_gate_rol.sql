-- =====================================================================
-- 0109_cancelar_gate_rol.sql  (CSO Finding #1 — Fase A)
-- rpc_cancelar_registro es SECURITY DEFINER y estaba abierta a cualquier usuario
-- autenticado: un guardia podía cancelar registros de ~40 tablas (evidencias,
-- rondines, incidentes…). Cancelar es una acción de MANDO, no de campo.
--
-- Este parche agrega un gate de rol DENY-BY-DEFAULT: solo roles de mando pueden
-- cancelar. Los roles de campo (oficial/guardia) y cualquier rol desconocido/null
-- quedan bloqueados. No cambia el whitelist de tablas ni el resto de la lógica.
-- (Fase B — acotar UPDATE por tabla — se hará aparte, con validación en móvil.)
--
-- Roles permitidos para cancelar: supervisor, investigador, coordinador, operador,
-- administrador, asuntos_internos. Ajusta la lista si tu operación difiere (p. ej.
-- quitar 'operador' si no debe cancelar).
-- =====================================================================

create or replace function rpc_cancelar_registro(p_tabla text, p_id uuid, p_motivo text)
returns void as $$
declare v_rol text := coalesce(fn_rol_actual(), '');
begin
  if p_tabla not in ('personas','vehiculos','ubicaciones','vinculos','casos','personal',
                     'ordenes','evidencias','asuntos_internos','llamadas_cad','despachos',
                     'barandilla','equipo','incidentes','presuntos','kardex',
                     'patrullas','armamento','comunicacion','bodycams','otros',
                     'rol_servicio','rol_servicio_asignaciones','abordamientos','accidentes',
                     'tareas','tarea_asignaciones','transmisiones','caso_relaciones',
                     'guardia_capacitacion','clientes','sitios','turnos',
                     'puntos_control','rondines','camaras','accesos','credenciales',
                     'citas','transportistas','zonas','zona_permisos','sla_metas',
                     'directorio_autoridades',
                     -- Seguridad Logística:
                     'transporte_activos','unidades_carga','cargas','movimientos','sellos','inspecciones',
                     'liberaciones_seguridad',
                     -- Alertas:
                     'alertas_generales',
                     -- Rondines (trazabilidad):
                     'sesiones_rondin','rondines_programados') then
    raise exception 'Tabla no reconocida: %', p_tabla;
  end if;

  -- Gate de rol (deny-by-default): cancelar es acción de mando.
  if v_rol not in ('supervisor','investigador','coordinador','operador','administrador','asuntos_internos') then
    raise exception 'No autorizado: cancelar registros requiere un rol de mando.';
  end if;

  -- Asuntos internos: su tabla solo la cancela asuntos_internos o administrador.
  if p_tabla = 'asuntos_internos' and v_rol not in ('asuntos_internos','administrador') then
    raise exception 'No autorizado para cancelar registros de asuntos internos.';
  end if;

  execute format(
    'update %I set estatus = ''cancelado'', cancelado_en = now(), motivo_cancelacion = $1, actualizado_en = now() where id = $2',
    p_tabla
  ) using p_motivo, p_id;
end;
$$ language plpgsql security definer;
