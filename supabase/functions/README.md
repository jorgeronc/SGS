# Copiloto de IA — Fase 0 (cimientos RAG)

Recuperación semántica sobre los expedientes del SCP. Los **embeddings se generan
con `gte-small` dentro de Supabase** (Edge Functions, `Supabase.ai`): no sale
información a terceros. Claude sólo intervendrá en la Fase 1 (redacción con
citas), no aquí.

## Piezas
- **Migración `0028_ia_rag.sql`** — `pgvector`, tabla `documentos_ia`,
  `rpc_buscar_semantica()` (RLS-aware) y `ia_consultas` (auditoría).
- **`indexar-ia`** — (re)construye el índice desde las fuentes de texto
  (incidentes, novedades, narrativas CAD, casos, llamadas, barandilla,
  evidencias, órdenes). Asuntos Internos queda **fuera**.
- **`buscar-ia`** — prueba de búsqueda semántica (sin LLM todavía).

## Requisitos previos
1. Corre la migración `0028_ia_rag.sql` en Supabase.
2. Instala/enlaza el CLI (una vez):
   ```bash
   npx supabase login
   npx supabase link --project-ref okhsniabwiukjyjhmeav
   ```

## Desplegar las funciones
```bash
cd sistema-central-policial
npx supabase functions deploy indexar-ia
npx supabase functions deploy buscar-ia
```

## Construir el índice (una vez, y cada que agregues datos)
Llama a `indexar-ia` con un token (el `service_role` o un JWT de admin):
```bash
curl -X POST "https://okhsniabwiukjyjhmeav.supabase.co/functions/v1/indexar-ia" \
  -H "Authorization: Bearer <SERVICE_ROLE_O_JWT_ADMIN>" \
  -H "Content-Type: application/json" -d '{}'
# Reindexar solo una fuente:  -d '{"tabla":"incidentes"}'
```
Respuesta: `{ ok: true, documentos: { incidentes: N, novedades: M, ... } }`.

## Probar la búsqueda semántica
```bash
curl -X POST "https://okhsniabwiukjyjhmeav.supabase.co/functions/v1/buscar-ia" \
  -H "Authorization: Bearer <JWT_DE_UN_USUARIO>" \
  -H "Content-Type: application/json" \
  -d '{"q":"robo de vehículo con violencia en la colonia centro","k":8}'
```
Devuelve los fragmentos más similares con su `folio`, `titulo` y `similitud`
(0–1). Verás que recupera por significado, no sólo por palabra exacta.

## Fase 1 — Copiloto RAG con citas (`copiloto`)
Embebe la pregunta (gte-small) → `rpc_buscar_semantica` (RLS del usuario) → arma
el contexto → **Claude (`claude-opus-4-8`)** redacta la respuesta **citando el
folio** de cada fuente, se **abstiene** si no hay evidencia suficiente, y registra
todo en `ia_consultas`. En la web aparece como pestaña **Copiloto IA** en el
detalle de incidentes y casos.

Requiere el secreto con la API key de Claude (fuera del repo):
```bash
npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
npx supabase functions deploy copiloto
```

Probar directo:
```bash
curl -X POST "https://okhsniabwiukjyjhmeav.supabase.co/functions/v1/copiloto" \
  -H "Authorization: Bearer <JWT_DE_UN_USUARIO>" \
  -H "Content-Type: application/json" \
  -d '{"pregunta":"¿Qué antecedentes hay del vehículo con placas ABC-123?"}'
```
Devuelve `{ respuesta, nivel_confianza, folios_citados, fuentes[] }`. Si el índice
no tiene nada relevante, responde `sin_evidencia` sin invocar al modelo.

## Siguientes fases
- **Fase 2** — tool-calling (persona/vehículo/antecedentes/reportes cercanos vía las funciones de `frontend/lib/duplicados.ts`).
- **Fase 3** — grafo de conocimiento (explotar `vinculos`).
- **Fase 4** — agente proactivo (alertas a cola de validación).
