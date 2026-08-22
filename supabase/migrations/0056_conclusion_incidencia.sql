-- =====================================================================
-- 0056_conclusion_incidencia.sql
-- Central / Despacho (seguridad privada): las conclusiones de cierre de una
-- incidencia son distintas a las policiales de SCP (0040). Se reemplaza el
-- check de `conclusion` para admitir las de SGS. Se conservan también las
-- heredadas de SCP para no romper filas existentes.
-- =====================================================================

alter table llamadas_cad drop constraint if exists llamadas_cad_conclusion_check;
alter table llamadas_cad add constraint llamadas_cad_conclusion_check
  check (conclusion is null or conclusion in (
    -- SGS (seguridad privada)
    'Atendida sin novedad', 'Atendida con novedad', 'Falsa alarma', 'Cancelada',
    -- heredadas de SCP (compatibilidad con datos previos)
    'Atendido con Lesionados', 'Atendido con Detenidos', 'Atendido en Falso', 'Cancelado'
  ));
