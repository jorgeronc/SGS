-- =====================================================================
-- 0040_reporte_cierre.sql · Cierre de reportes CAD
--
-- Un reporte pasa de 'activo' a 'cerrado' cuando su despacho termina resuelto.
-- Al cerrar se elige una CONCLUSIÓN. La cancelación deja de ser un estatus
-- aparte: ahora es una conclusión de cierre ("Cancelado") con su submotivo.
-- Conclusiones: Atendido con Lesionados / Atendido con Detenidos /
-- Atendido en Falso / Cancelado (+ motivo: por 9-1-1 / llamada falsa / duplicado).
-- =====================================================================

-- 1) Estatus admite 'cerrado' (se conserva 'cancelado' por compatibilidad).
alter table llamadas_cad drop constraint if exists llamadas_cad_estatus_check;
alter table llamadas_cad add constraint llamadas_cad_estatus_check
  check (estatus in ('activo', 'cerrado', 'cancelado'));

-- 2) Conclusión de cierre y su submotivo.
alter table llamadas_cad add column if not exists conclusion   text;
alter table llamadas_cad add column if not exists motivo_cierre text;

alter table llamadas_cad drop constraint if exists llamadas_cad_conclusion_check;
alter table llamadas_cad add constraint llamadas_cad_conclusion_check
  check (conclusion is null or conclusion in (
    'Atendido con Lesionados', 'Atendido con Detenidos', 'Atendido en Falso', 'Cancelado'
  ));

comment on column llamadas_cad.conclusion is 'Conclusión del cierre del reporte (cómo terminó la atención).';
comment on column llamadas_cad.motivo_cierre is 'Submotivo cuando la conclusión es Cancelado (por 9-1-1 / llamada falsa / duplicado).';

-- 3) Backfill: los reportes cuyo despacho ya está resuelto quedan cerrados.
update llamadas_cad
   set estatus = 'cerrado',
       fecha_cierre = coalesce(fecha_cierre, now()),
       actualizado_en = now()
 where estatus = 'activo' and estado_despacho = 'resuelta';
