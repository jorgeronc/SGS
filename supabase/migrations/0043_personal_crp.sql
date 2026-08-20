-- =====================================================================
-- 0043_personal_crp.sql
-- CORRECCIÓN: la CRP (Carro Radio Patrulla) NO es un dato manual del elemento,
-- es la PATRULLA que se le asigna en el ROL DE SERVICIO. Por lo tanto la CRP se
-- DERIVA del rol de servicio (vista patrullas_en_servicio: personal_id ->
-- patrulla numero), tanto en la app (Mi unidad) como en el módulo de Personal.
-- No se guarda una columna crp en personal. Si una versión previa de esta
-- migración la creó, aquí se elimina.
-- =====================================================================

alter table personal drop column if exists crp;
