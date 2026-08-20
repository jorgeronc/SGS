-- =====================================================================
-- 0027_fix_rol_servicio_horarios.sql
--
-- Corrige los horarios de los roles de servicio ya creados.
--
-- Bug: la web calculaba inicio/fin restando el offset del huso antes de
-- serializar (truco válido para inputs datetime-local, NO para timestamptz).
-- Las 07:00 locales se guardaban como 07:00Z y se releían como 01:00 local
-- (UTC-6), por lo que el turno diurno aparecía 1am–1pm y el nocturno 1pm–1am.
--
-- Aquí NO se desplaza el valor guardado: se RECALCULA la ventana de 12 h a
-- partir de `fecha` (día en que inicia el turno) y `turno`, interpretando las
-- horas en la zona local de la agencia. Es idempotente: correr de nuevo deja
-- el mismo resultado.
--
--   diurno   : fecha 07:00  →  fecha 19:00
--   nocturno : fecha 19:00  →  (fecha + 1) 07:00
-- =====================================================================

update rol_servicio
set
  inicio = case
    when turno = 'nocturno' then (fecha + time '19:00') at time zone 'America/Mexico_City'
    else                         (fecha + time '07:00') at time zone 'America/Mexico_City'
  end,
  fin = case
    when turno = 'nocturno' then ((fecha + 1) + time '07:00') at time zone 'America/Mexico_City'
    else                          (fecha + time '19:00') at time zone 'America/Mexico_City'
  end,
  actualizado_en = now()
where fecha is not null and turno is not null;

comment on column rol_servicio.fecha is 'Día en que INICIA el turno (diurno 07:00-19:00 del mismo día; nocturno 19:00 a 07:00 del día siguiente).';
