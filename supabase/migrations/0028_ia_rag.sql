-- =====================================================================
-- 0028_ia_rag.sql   (Fase 0: cimientos de IA / RAG)
--
-- Capa de recuperación semántica para el copiloto de investigación:
--   1) pgvector + tabla `documentos_ia` (texto troceado + embedding gte-small).
--   2) rpc_buscar_semantica(): búsqueda por similitud, RESPETANDO permisos
--      (nivel_acceso; Asuntos Internos y demás sensibles NO se indexan en la
--      POC, y aun así el RPC filtra por rol como segunda barrera).
--   3) `ia_consultas`: auditoría de cada consulta/respuesta del copiloto.
--
-- Embeddings: modelo `gte-small` (384 dims) ejecutado en una Edge Function de
-- Supabase (no sale información a terceros). El indexado y la generación viven
-- en supabase/functions/ (indexar-ia, buscar-ia).
-- =====================================================================

create extension if not exists vector;

-- ---------------------------------------------------------------------
-- 1) Índice documental para RAG.
-- ---------------------------------------------------------------------
create table if not exists documentos_ia (
  id            uuid primary key default gen_random_uuid(),
  fuente_tabla  text not null,               -- incidentes | novedades | casos | ...
  fuente_id     text not null,               -- id del registro origen
  folio         text,                        -- folio para citar (enlace verificable)
  titulo        text,                        -- etiqueta corta de la fuente
  chunk         int  not null default 0,     -- fragmento dentro del registro
  texto         text not null,               -- fragmento indexado
  embedding     vector(384),                 -- gte-small
  nivel_acceso  text not null default 'general'
                  check (nivel_acceso in ('general','sensible')),
  metadatos     jsonb default '{}'::jsonb,
  actualizado_en timestamptz not null default now(),
  creado_en     timestamptz not null default now(),
  unique (fuente_tabla, fuente_id, chunk)
);
comment on table documentos_ia is 'Índice semántico (RAG) del copiloto: texto troceado + embedding gte-small, con folio para citar la fuente.';

create index if not exists idx_documentos_ia_fuente on documentos_ia (fuente_tabla, fuente_id);
-- Índice ANN por distancia coseno (embeddings normalizados por gte-small).
create index if not exists idx_documentos_ia_embedding on documentos_ia
  using hnsw (embedding vector_cosine_ops);

alter table documentos_ia enable row level security;
-- Lectura: contenido 'general' para cualquier autenticado; 'sensible' sólo roles
-- de investigación. La escritura la hace el indexador con service_role (omite RLS).
drop policy if exists sel_documentos_ia on documentos_ia;
create policy sel_documentos_ia on documentos_ia for select to authenticated
  using (nivel_acceso = 'general' or fn_rol_actual() in ('investigador','supervisor','administrador'));

-- ---------------------------------------------------------------------
-- 2) Búsqueda semántica RLS-aware.
--    SECURITY INVOKER: corre con el JWT del usuario, por lo que la política de
--    documentos_ia y fn_rol_actual() se evalúan con SUS permisos.
-- ---------------------------------------------------------------------
create or replace function rpc_buscar_semantica(
  p_embedding  vector(384),
  p_k          int default 8,
  p_min_sim    float default 0.0
) returns table (
  fuente_tabla text,
  fuente_id    text,
  folio        text,
  titulo       text,
  texto        text,
  similitud    float
) language sql stable security invoker as $$
  select d.fuente_tabla, d.fuente_id, d.folio, d.titulo, d.texto,
         1 - (d.embedding <=> p_embedding) as similitud
  from documentos_ia d
  where d.embedding is not null
    and (1 - (d.embedding <=> p_embedding)) >= p_min_sim
  order by d.embedding <=> p_embedding
  limit greatest(p_k, 1);
$$;

-- ---------------------------------------------------------------------
-- 3) Auditoría de consultas del copiloto (trazabilidad obligatoria).
-- ---------------------------------------------------------------------
create table if not exists ia_consultas (
  id             bigint generated always as identity primary key,
  usuario_id     uuid default auth.uid(),
  pregunta       text not null,
  respuesta      text,
  citas          jsonb default '[]'::jsonb,   -- [{fuente_tabla, fuente_id, folio, similitud}]
  contexto_tipo  text,                        -- caso | incidente | global
  contexto_id    text,
  nivel_confianza text,                       -- alta | media | baja | sin_evidencia
  modelo         text,
  creado_en      timestamptz not null default now()
);
comment on table ia_consultas is 'Auditoría de cada consulta/respuesta del copiloto de IA (pregunta, citas, confianza).';
create index if not exists idx_ia_consultas_usuario on ia_consultas (usuario_id, creado_en desc);

alter table ia_consultas enable row level security;
-- Registro append-only (no update/delete desde el cliente).
drop trigger if exists trg_ia_consultas_worm on ia_consultas;
create trigger trg_ia_consultas_worm before update or delete on ia_consultas
  for each row execute function fn_bloquear_cambios_append_only();
revoke update, delete on ia_consultas from authenticated, anon;

drop policy if exists ins_ia_consultas on ia_consultas;
create policy ins_ia_consultas on ia_consultas for insert to authenticated with check (true);
drop policy if exists sel_ia_consultas on ia_consultas;
create policy sel_ia_consultas on ia_consultas for select to authenticated
  using (usuario_id = auth.uid() or fn_rol_actual() in ('supervisor','administrador'));
