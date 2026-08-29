-- =====================================================================
-- 0069_despacho_recursos.sql
-- Despacho de RECURSOS (no solo patrullas): el historial de despachos ahora admite
-- guardias del sitio, supervisores, recursos propios y CONTACTOS a autoridades de
-- seguridad. Ver detalle de incidente. Complementa 0068.
-- =====================================================================
alter table despachos
  add column if not exists recurso_tipo   text,     -- 'guardia' | 'supervisor' | 'recurso_propio' | 'autoridad'
  add column if not exists recurso_nombre text,      -- etiqueta a mostrar (nombre del guardia / recurso / autoridad)
  add column if not exists autoridad_id   uuid references directorio_autoridades(id),
  add column if not exists es_contacto    boolean not null default false; -- true = contacto a autoridad (no despacho de unidad)

comment on column despachos.recurso_tipo is 'Tipo de recurso despachado/contactado: guardia, supervisor, recurso_propio o autoridad.';
comment on column despachos.es_contacto is 'true cuando es el contacto a una autoridad de seguridad (queda en el historial como contactada).';
