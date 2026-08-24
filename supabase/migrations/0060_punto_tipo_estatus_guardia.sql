-- =====================================================================
-- 0060_punto_tipo_estatus_guardia.sql
--  - puntos_control: tipo_control (qr/nfc/ambos) y ubicacion_control (piso/área/
--    espacio donde está colocada la etiqueta, texto libre).
--  - ubicaciones_guardias: estatus_servicio (en_servicio/en_rondin/en_pausa) y
--    motivo_pausa, para mostrar el estado del guardia en el monitoreo en vivo.
-- =====================================================================

alter table puntos_control add column if not exists tipo_control text default 'qr';
do $$ begin
  alter table puntos_control add constraint chk_tipo_control check (tipo_control in ('qr','nfc','ambos'));
exception when duplicate_object then null; end $$;
alter table puntos_control add column if not exists ubicacion_control text;
comment on column puntos_control.ubicacion_control is 'Ubicación física de la etiqueta: piso/nivel, área, espacio, etc.';

alter table ubicaciones_guardias add column if not exists estatus_servicio text default 'en_servicio';
do $$ begin
  alter table ubicaciones_guardias add constraint chk_estatus_servicio check (estatus_servicio in ('en_servicio','en_rondin','en_pausa'));
exception when duplicate_object then null; end $$;
alter table ubicaciones_guardias add column if not exists motivo_pausa text;
comment on column ubicaciones_guardias.estatus_servicio is 'Estado del guardia en el turno: en posición (en_servicio), en rondín o en pausa.';
