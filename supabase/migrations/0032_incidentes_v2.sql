-- =====================================================================
-- 0032_incidentes_v2.sql
-- Rework del módulo Incidentes (Informe de Incidente):
--  * Estado UNIFICADO: se agrega 'cancelado' al campo estado y se sincroniza
--    con el estatus del registro (cancelar por cualquier vía deja ambos
--    consistentes). El informe cancelado queda de solo lectura y fuera de las
--    listas activas; desde el reporte CAD origen se puede levantar otro.
--  * Fecha de la Elaboración (nueva) vs Fecha del Incidente.
--  * Campos: habitada (casa habitación), a_donde_traslada, a_donde_canaliza.
--  * Catálogos: delitos (Delitos.txt), giro del negocio (nombre del lugar) y
--    dependencias de apoyo adicionales (Periciales, Semefo).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) estado: agregar 'cancelado'.
-- ---------------------------------------------------------------------
alter table incidentes drop constraint if exists incidentes_estado_check;
alter table incidentes add constraint incidentes_estado_check
  check (estado in ('abierto','en_proceso','cerrado','cancelado'));

-- ---------------------------------------------------------------------
-- 2) Nuevos campos.
-- ---------------------------------------------------------------------
alter table incidentes add column if not exists fecha_elaboracion timestamptz;
alter table incidentes add column if not exists habitada          boolean;
alter table incidentes add column if not exists a_donde_traslada  text;
alter table incidentes add column if not exists a_donde_canaliza  text;

-- La fecha de elaboración toma, en los registros existentes, la fecha del
-- incidente (o la de creación). En adelante, ambas fechas se capturan aparte.
update incidentes
  set fecha_elaboracion = coalesce(fecha_incidente, creado_en)
  where fecha_elaboracion is null;

-- ---------------------------------------------------------------------
-- 3) Sincronía estado <-> estatus.
--    - Marcar estado='cancelado' cancela el registro (estatus + cancelado_en).
--    - Cancelar por estatus (rpc_cancelar_registro) refleja estado='cancelado'.
--    - Reactivar (estatus='activo') saca del estado 'cancelado'.
-- ---------------------------------------------------------------------
create or replace function fn_sync_estado_incidente()
returns trigger as $$
begin
  if new.estado = 'cancelado' and coalesce(old.estado, '') <> 'cancelado' then
    new.estatus := 'cancelado';
    if new.cancelado_en is null then new.cancelado_en := now(); end if;
  end if;
  if new.estatus = 'cancelado' and coalesce(old.estatus, '') <> 'cancelado' then
    new.estado := 'cancelado';
  end if;
  if new.estatus = 'activo' and new.estado = 'cancelado' then
    new.estado := 'abierto';
    new.cancelado_en := null;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_sync_estado_incidente on incidentes;
create trigger trg_sync_estado_incidente before update on incidentes
  for each row execute function fn_sync_estado_incidente();

-- ---------------------------------------------------------------------
-- 4) Catálogos.
-- ---------------------------------------------------------------------
-- 4a) Delito del incidente (de Tablas/Delitos.txt). Reemplaza al catálogo 911
--     para este campo. "ROBO A INTERIOR DE VEHÍCULO O" se limpió a
--     "ROBO A INTERIOR DE VEHÍCULO" (el " O" del origen era un artefacto).
insert into cat_opciones (categoria, valor, orden) values
  ('delito_incidente','CORRUPCIÓN',1),
  ('delito_incidente','DAÑOS A PROPIEDAD',2),
  ('delito_incidente','DESAPARICIÓN FORZADA',3),
  ('delito_incidente','EXTORSIÓN',4),
  ('delito_incidente','FEMINICIDIO',5),
  ('delito_incidente','FRAUDE',6),
  ('delito_incidente','HOMICIDIO',7),
  ('delito_incidente','NARCOTRÁFICO',8),
  ('delito_incidente','PIRATERÍA',9),
  ('delito_incidente','ROBO A CASA HABITACIÓN',10),
  ('delito_incidente','ROBO A INTERIOR DE VEHÍCULO',11),
  ('delito_incidente','ROBO A NEGOCIO',12),
  ('delito_incidente','ROBO A PERSONA',13),
  ('delito_incidente','ROBO DE AUTOPARTES',14),
  ('delito_incidente','ROBO DE VEHÍCULO',15),
  ('delito_incidente','SECUESTRO',16),
  ('delito_incidente','TRATA DE PERSONAS',17),
  ('delito_incidente','USO DE ARMAS PROHIBIDAS',18),
  ('delito_incidente','VANDALISMO',19),
  ('delito_incidente','VIOLACIÓN',20),
  ('delito_incidente','VIOLENCIA FAMILIAR',21)
on conflict (categoria, valor) do nothing;

-- 4b) Giro del negocio (campo "Nombre del lugar" cuando el tipo de lugar es Negocio).
insert into cat_opciones (categoria, valor, orden) values
  ('giro_negocio','FARMACIA',1),
  ('giro_negocio','JOYERÍA',2),
  ('giro_negocio','OFICINAS',3),
  ('giro_negocio','PLAZA COMERCIAL',4),
  ('giro_negocio','RESTAURANTE',5),
  ('giro_negocio','TIENDA DE CONVENIENCIA',6),
  ('giro_negocio','SUPERMERCADO',7),
  ('giro_negocio','TIENDA DE ROPA',8),
  ('giro_negocio','CASA DE DIVISAS',9)
on conflict (categoria, valor) do nothing;

-- 4c) Dependencias de apoyo adicionales (Tránsito ya existía).
insert into cat_opciones (categoria, valor, orden) values
  ('dependencias_apoyo','PERICIALES',8),
  ('dependencias_apoyo','SEMEFO',9)
on conflict (categoria, valor) do nothing;
