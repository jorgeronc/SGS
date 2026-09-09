-- =====================================================================
-- 0100_incidente_evidencia_sesion.sql
-- Rondines Fase 1B — liga a la SESIÓN DE RONDÍN los incidentes (llamadas_cad) y
-- evidencias creados por un guardia MIENTRAS tiene una sesión abierta. Un trigger
-- BEFORE INSERT resuelve el guardia por auth.uid() (personal.usuario_id) y estampa
-- su sesión activa (fn_sesion_activa_guardia, 0095). Si lo crea central u otro
-- usuario sin sesión abierta, queda en null (no se liga). No requiere cambios en
-- el móvil ni un build nuevo.
-- =====================================================================

alter table llamadas_cad add column if not exists sesion_id uuid references sesiones_rondin(id);
alter table evidencias  add column if not exists sesion_id uuid references sesiones_rondin(id);
create index if not exists idx_llamadas_cad_sesion on llamadas_cad(sesion_id);
create index if not exists idx_evidencias_sesion   on evidencias(sesion_id);

-- Estampa la sesión activa del guardia creador (si aplica) cuando sesion_id es null.
create or replace function fn_stamp_sesion_rondin()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_personal uuid;
begin
  if NEW.sesion_id is null then
    select id into v_personal from personal where usuario_id = auth.uid() and estatus = 'activo' limit 1;
    if v_personal is not null then
      NEW.sesion_id := fn_sesion_activa_guardia(v_personal);
    end if;
  end if;
  return NEW;
end $$;

drop trigger if exists trg_sesion_rondin_llamadas on llamadas_cad;
create trigger trg_sesion_rondin_llamadas before insert on llamadas_cad
  for each row execute function fn_stamp_sesion_rondin();

drop trigger if exists trg_sesion_rondin_evidencias on evidencias;
create trigger trg_sesion_rondin_evidencias before insert on evidencias
  for each row execute function fn_stamp_sesion_rondin();
