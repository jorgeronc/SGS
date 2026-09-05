-- =====================================================================
-- 0091_llamada_narrativa.sql
-- Separa la "narrativa" de la "descripción" en el incidente (llamadas_cad):
-- la descripción es el planteamiento inicial (tamaño fijo, ajustado a su texto) y
-- la narrativa es el seguimiento cronológico, que va debajo.
-- =====================================================================
alter table llamadas_cad add column if not exists narrativa text;
comment on column llamadas_cad.narrativa is 'Narrativa cronológica del incidente (seguimiento), separada de la descripción inicial.';
