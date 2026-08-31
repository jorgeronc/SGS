-- =====================================================================
-- 0085_rls_captura_movil.sql · Inspecciones/Sellos desde el móvil
-- Las inspecciones y validaciones de sello se capturan en campo desde la app
-- móvil, cuya identidad es POR DISPOSITIVO (no por rol en usuarios_perfil).
-- Igual que accesos y evidencias (que ya tienen `with check (true)`), la
-- inserción se abre a cualquier usuario autenticado; así el guardia puede
-- registrar aunque su cuenta no tenga un rol de mando.
-- (La lectura ya es abierta; el borrado sigue bloqueado por WORM.)
-- =====================================================================

drop policy if exists ins_inspecciones on inspecciones;
create policy ins_inspecciones on inspecciones for insert to authenticated with check (true);

drop policy if exists ins_insp_items on inspeccion_items;
create policy ins_insp_items on inspeccion_items for insert to authenticated with check (true);

drop policy if exists ins_sello_val on sello_validaciones;
create policy ins_sello_val on sello_validaciones for insert to authenticated with check (true);

-- La actualización de ítems (durante la inspección) también desde el móvil.
drop policy if exists upd_insp_items on inspeccion_items;
create policy upd_insp_items on inspeccion_items for update to authenticated using (true) with check (true);
