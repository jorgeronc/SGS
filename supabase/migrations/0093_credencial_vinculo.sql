-- =====================================================================
-- 0093_credencial_vinculo.sql
-- Al emitir una credencial ligada a una persona, dejar un VÍNCULO
-- persona → credencial, para que en el registro de Personas se vea de dónde
-- proviene (VinculosPanel). Idempotente; backfill de las existentes.
-- =====================================================================

create or replace function fn_credencial_vinculo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.persona_id is not null then
    insert into vinculos (entidad_origen_tipo, entidad_origen_id, entidad_destino_tipo, entidad_destino_id, tipo_relacion)
      select 'persona', new.persona_id, 'credencial', new.id, 'credencial'
      where not exists (
        select 1 from vinculos v
         where v.entidad_origen_tipo = 'persona' and v.entidad_origen_id = new.persona_id
           and v.entidad_destino_tipo = 'credencial' and v.entidad_destino_id = new.id
           and v.estatus = 'activo');
  end if;
  return new;
end; $$;

drop trigger if exists trg_credencial_vinculo on credenciales;
create trigger trg_credencial_vinculo after insert on credenciales
  for each row execute function fn_credencial_vinculo();

-- Backfill de credenciales ya emitidas.
insert into vinculos (entidad_origen_tipo, entidad_origen_id, entidad_destino_tipo, entidad_destino_id, tipo_relacion)
  select 'persona', c.persona_id, 'credencial', c.id, 'credencial'
    from credenciales c
   where c.persona_id is not null
     and not exists (
       select 1 from vinculos v
        where v.entidad_origen_tipo = 'persona' and v.entidad_origen_id = c.persona_id
          and v.entidad_destino_tipo = 'credencial' and v.entidad_destino_id = c.id
          and v.estatus = 'activo');
