-- =====================================================================
-- 0099_sitio_corredor_rondin.sql
-- Rondines Fase 1B — Ruta esperada vs real (opción A): la ruta esperada se deriva
-- de los PUNTOS DE CONTROL del sitio en su `orden`; su corredor de tolerancia
-- (buffer, metros) se configura por sitio aquí. La cobertura/desviación se
-- calculan en el cliente (web) contra esa línea. No se necesita tabla de rutas.
-- =====================================================================

alter table sitios add column if not exists rondin_corredor_m integer not null default 30;
comment on column sitios.rondin_corredor_m is 'Ancho (± metros) del corredor de tolerancia alrededor de la ruta esperada (puntos de control en orden) para evaluar desviación del rondín.';
