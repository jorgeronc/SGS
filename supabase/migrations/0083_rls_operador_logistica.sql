-- =====================================================================
-- 0083_rls_operador_logistica.sql · Vista Operativa
-- Amplía las políticas de escritura de Seguridad Logística para incluir a
-- los roles de la central (operador/coordinador), de modo que el operador
-- pueda gestionar cargas, unidades, activos, sellos e inspecciones — no solo
-- supervisor/administrador. (El guardia sigue capturando en campo.)
-- =====================================================================

-- Cargas, unidades de carga, activos, sellos: alta/edición de la central.
do $$
declare t text;
begin
  foreach t in array array['cargas','unidades_carga','transporte_activos','sellos'] loop
    execute format('drop policy if exists ins_%1$s on %1$s', t);
    execute format($p$create policy ins_%1$s on %1$s for insert to authenticated with check (coalesce(fn_rol_actual(),'') in ('operador','coordinador','supervisor','administrador'))$p$, t);
    execute format('drop policy if exists upd_%1$s on %1$s', t);
    execute format($p$create policy upd_%1$s on %1$s for update to authenticated using (coalesce(fn_rol_actual(),'') in ('operador','coordinador','supervisor','administrador')) with check (coalesce(fn_rol_actual(),'') in ('operador','coordinador','supervisor','administrador'))$p$, t);
  end loop;
end $$;

-- Inspecciones (+ ítems): guardia captura en campo; la central también.
drop policy if exists ins_inspecciones on inspecciones;
create policy ins_inspecciones on inspecciones for insert to authenticated
  with check (coalesce(fn_rol_actual(),'') in ('guardia','operador','coordinador','supervisor','administrador'));
drop policy if exists upd_inspecciones on inspecciones;
create policy upd_inspecciones on inspecciones for update to authenticated
  using (coalesce(fn_rol_actual(),'') in ('guardia','operador','coordinador','supervisor','administrador'))
  with check (coalesce(fn_rol_actual(),'') in ('guardia','operador','coordinador','supervisor','administrador'));
drop policy if exists ins_insp_items on inspeccion_items;
create policy ins_insp_items on inspeccion_items for insert to authenticated
  with check (coalesce(fn_rol_actual(),'') in ('guardia','operador','coordinador','supervisor','administrador'));
drop policy if exists upd_insp_items on inspeccion_items;
create policy upd_insp_items on inspeccion_items for update to authenticated
  using (coalesce(fn_rol_actual(),'') in ('guardia','operador','coordinador','supervisor','administrador'))
  with check (coalesce(fn_rol_actual(),'') in ('guardia','operador','coordinador','supervisor','administrador'));

-- Validaciones de sello (append-only): guardia y central.
drop policy if exists ins_sello_val on sello_validaciones;
create policy ins_sello_val on sello_validaciones for insert to authenticated
  with check (coalesce(fn_rol_actual(),'') in ('guardia','operador','coordinador','supervisor','administrador'));
