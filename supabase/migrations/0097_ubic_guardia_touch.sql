-- =====================================================================
-- 0097_ubic_guardia_touch.sql
-- La frescura del guardia "en línea" no debe depender del RELOJ DEL TELÉFONO.
-- El móvil enviaba actualizado_en = new Date() del dispositivo; el mapa filtra
-- actualizado_en > now()-ventana con el reloj del SERVIDOR. Un teléfono con la
-- hora atrasada (hora manual/zona mal) caía fuera de la ventana y NO aparecía,
-- aunque estuviera reportando. Se sella actualizado_en con now() del servidor en
-- cada insert/update, ignorando el valor del cliente.
-- =====================================================================

create or replace function fn_ubic_guardia_touch()
returns trigger language plpgsql as $$
begin
  new.actualizado_en := now();  -- hora del servidor, no del teléfono
  return new;
end $$;

drop trigger if exists trg_ubic_guardia_touch on ubicaciones_guardias;
create trigger trg_ubic_guardia_touch before insert or update on ubicaciones_guardias
  for each row execute function fn_ubic_guardia_touch();
