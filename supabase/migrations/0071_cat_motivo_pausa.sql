-- =====================================================================
-- 0071_cat_motivo_pausa.sql
-- Catálogo de motivos de pausa del guardia (móvil → Inicio → "Mi estado" →
-- En pausa). Se elimina la opción libre "Otro": los motivos salen de este
-- catálogo administrable (cat_opciones categoría 'motivo_pausa').
-- =====================================================================
insert into cat_opciones (categoria, valor, orden) values
  ('motivo_pausa','Alimentos',1),
  ('motivo_pausa','Baño',2),
  ('motivo_pausa','Descanso',3),
  ('motivo_pausa','Relevo',4)
on conflict (categoria, valor) do nothing;
