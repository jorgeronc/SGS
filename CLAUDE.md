# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**SCP (Sistema Central Policial)** — a police RMS + CAD (Computer-Aided Dispatch) system. Three deployables live in one repo:

- `frontend/` — Next.js 14 (App Router, TypeScript) web app for dispatch/records. Deployed to **Vercel** (project `scp`, **Root Directory = `frontend`**; pushing to `main` on GitHub triggers a production deploy).
- `mobile/` — Expo / React Native app for officers in the field. Built with **EAS**.
- `supabase/` — Postgres schema (`migrations/`) + Deno **Edge Functions** (`functions/`). Backend is **Supabase** (project ref `okhsniabwiukjyjhmeav`).

Both apps talk directly to Supabase (Postgres + Auth + Storage + Realtime) via `@supabase/supabase-js`. There is no separate API server.

## Commands

Environment is **Windows / PowerShell**. There is **no test suite**; "verifying" means typecheck + build.

**Frontend** (`cd frontend`):
- `npm run dev` — dev server on **port 3100**
- `npm run build` — production build. **Run this to verify, not just `tsc`**: `next build` catches errors `tsc` misses (e.g. a page using `useSearchParams` without a `<Suspense>` boundary fails the Vercel build).
- `npm run lint`

**Mobile** (`cd mobile`):
- `npx tsc --noEmit` — typecheck (the main local verification for RN code)
- `npx eas-cli build --profile preview --platform android` — build an installable APK. Native modules (`react-native-webrtc`, `expo-notifications`, `expo-linear-gradient`, `expo-application`) require a new EAS build to take effect — they do **not** work in Expo Go. Add native deps with `npx expo install <pkg>` (never hand-edit versions).
- Mobile env vars come from **EAS environments** (set with `eas env:create --environment preview ...`), not from `env` blocks in `eas.json`. `.env` is only for local runs.

**Supabase** (`cd .` — repo root has `supabase/`):
- Migrations are **applied manually by the user** in the Supabase SQL editor (they are not auto-run). When adding schema, create the next sequentially-numbered file in `supabase/migrations/` (currently up to `0041_*`) and tell the user to run it.
- Deploy an edge function: `npx supabase functions deploy <name>` (PowerShell; the Bash tool fails on this machine). `enviar_push` must be deployed with `--no-verify-jwt` (it's called by a DB trigger, not a user session).

Multi-line git commit messages: use `git commit -F <file>` (here-strings with quotes misbehave on this machine).

## Backend architecture & conventions

The schema is the source of truth for most behavior. Cross-cutting patterns, all enforced in SQL:

- **Two status axes.** `estatus` = data-retention state (`activo` / `cancelado`, plus `cerrado` for CAD reports); domain progress lives in a **separate** field (`estado`, `estado_despacho`, `estado_evidencia`, `respuesta`, `estatus_unidad`, …). Never conflate them.
- **WORM / never delete.** Records are cancelled, not deleted: a `before delete` trigger (`fn_bloquear_delete`) blocks deletes and `delete` is revoked from `authenticated`/`anon`. Cancellation goes through `rpc_cancelar_registro(p_tabla, p_id, p_motivo)` — **every new cancelable table must be added to the `p_tabla` whitelist inside that function** (it is re-created in the latest migration that needs it). `cadena_custodia` is strictly append-only (update/delete blocked too).
- **Folios.** Human folios are assigned by a `before insert` trigger `fn_asignar_folio` driven by the `foliadores` table (one row per module, e.g. `('tareas','Tareas','TA')`). Never accept a manual folio input; register the module in `foliadores` and attach the trigger.
- **Audit.** `fn_bitacora_generica` logs inserts/updates to a bitácora; the frontend also calls `rpc_registrar_bitacora` on reads.
- **Generic relations.** Cross-entity links use one `vinculos` table (entidad_origen/destino tipo+id, tipo_relacion), surfaced by `VinculosPanel`. Prefer this over per-pair FK tables.
- **Generic catalogs.** Short admin-editable option lists live in `cat_opciones (categoria, valor, orden, activo)`; the mobile/web forms read by `categoria`.
- **RLS everywhere**, usually permissive select + `fn_rol_actual()` for role-gated cases (`asuntos_internos` is the strict one). Roles: oficial / supervisor / investigador / asuntos_internos / administrador.
- **Realtime** drives live UI (CAD "EN VIVO" indicator, dispatch unit/status, state-change timeline). Tables added to the `supabase_realtime` publication are subscribed via `supabase.channel().on("postgres_changes", …)`.

**Edge Functions** (Deno, `supabase/functions/`): call Anthropic/Expo via raw `fetch` (the esm.sh SDKs are flaky in Deno); share `_shared/cors.ts` (`json`, `preflight`). `SUPABASE_SERVICE_ROLE_KEY`/`SUPABASE_URL` are auto-injected. `crear_usuario` (admin-only user creation), `copiloto` (RAG assistant, model `claude-opus-4-8`), `enviar_push` (Expo push relay; validates a shared secret stored in the `app_secretos` table, not a GUC), `indexar-ia` (builds/refreshes the RAG embeddings index), `buscar-ia` (semantic search over that index, feeds `copiloto`).

## Frontend architecture (`frontend/`)

- App Router under `app/`; shared UI in `app/components/`, non-component logic in `lib/`. Path alias `@/*` → the `frontend/` root (`@/lib/...`, `@/app/components/...`).
- `app/components/AppShell.tsx` wraps everything: it gates on Supabase auth **and requires 2FA (aal2)** for non-public routes, renders the sidebar/topbar, and renders routes in `LIMPIAS` (or any path ending in `/imprimir`) full-screen with no chrome (for second-monitor maps and printable PDF views).
- `app/components/ListaMaestra.tsx` is the reusable master-list (table + filters + quick-view + inline edit + hide-cancelled). Most module list pages are thin wrappers over it; CAD uses a bespoke list.
- `lib/` hubs: `supabaseClient.ts`, `types.ts` (shared row types), `config.ts` (corporation/jurisdiction settings), `geo.ts` (**LocationIQ** provider with OSM fallback), `turn.ts` (WebRTC ICE/TURN), `despachos.ts` (dispatch-unit + state-history helpers).
- **PDF** = a print-optimized route (e.g. `cad/[id]/imprimir`) rendered chrome-less by AppShell that auto-calls `window.print()`; there is no PDF library.
- **Client-fetched pages go stale on the App Router's client cache.** A page that loads data once in `useEffect(…, [])` (e.g. the home dashboard `components/Panel.tsx`) is reused from the router cache on navigation back and won't refetch. The pattern here: refactor the load into a `cargar()` callback and re-run it on `window` `focus` + `document` `visibilitychange`, plus a manual "Actualizar" button. Genuinely live UI (CAD) uses Supabase Realtime instead.

## Mobile architecture (`mobile/`)

- Expo SDK 54 / RN 0.81 / React 19. Screens in `src/screens/`, shared logic in `src/lib/`, theme tokens in `src/theme.ts` (`T`, `UI`) — restyle by editing tokens; screens consume them.
- **Device-scoped identity via AsyncStorage** (there is no `auth.uid ↔ personal` link): `oficial.ts` ("Mi elemento"), `unidad.ts` ("Mi unidad"), `bodycam.ts` ("Mi bodycam", device-bound), `accesos.ts` (configurable quick-actions). Selecting an officer in Perfil validates the phone against a `bodycams` record of type `Smartphone` (`rpc_validar_bodycam`, device id from `expo-application`).
- **Push** (`lib/push.ts`): registers an Expo token into `dispositivos_push`; a DB trigger on `despachos`/`tarea_asignaciones` calls the `enviar_push` edge function. Requires an EAS build + FCM (Android `google-services.json` in `app.json`, FCM V1 service account in EAS credentials).
- **Bodycam / live video** (`lib/transmision.ts` + `TransmisionScreen`): `react-native-webrtc`, signaling over a Supabase Realtime broadcast channel `tx:{id}`, **Metered** TURN. The web dispatcher views/records it (`VisorTransmision`); recording is browser-side into the private `videos` bucket + an `evidencias` record with chain of custody.
- **Bodycam HD local** (`lib/bodycamHd.ts` + native module `modules/bodycamhd`, Kotlin/CameraX/LifecycleService foreground service `camera|microphone`): the "Activar Bodycam" flow records HD **with the screen locked / app backgrounded**. Rotates into **size-based segments (~45 MB)** via `FileOutputOptions.setFileSizeLimit` to stay under Supabase Storage's 50 MB per-file cap (a 3-min clip → HTTP 413). Segments queue on the phone (`/Android/data/com.scp.movil/files/bodycam/pending/`, AsyncStorage `scp_bodycam_pendientes`); Perfil → "Descargar bodycam" uploads them via `FileSystem.uploadAsync` (streaming to a `createSignedUploadUrl`, never base64/in-memory) as `evidencias` (`video_bodycam`, `datos_adicionales.modo='local_hd'`) + `cadena_custodia`. **No delete-from-app** (every video is evidence); purge test clips by uninstalling the APK. Android-only, needs an EAS build.
- **Bodycam tied to a module** (`components/BodycamBoton.tsx`): the same recording can be started from Informe (`incidente`), DespachoDetalle (`cad`), Tareas (`tarea`), Abordamiento, and Accidente. `iniciarBodycam(origen)` stamps each segment with the origin `{tipo,id,folio}`; forms that only know the folio after saving call `asociarBodycamActual()` to back-stamp the session's segments. On download the evidence carries `origen_tipo/id/folio` in `datos_adicionales` (+ a `vinculos` origin→evidencia row); the web Evidencias list shows an "Origen" folio column.
- Maps: **TomTom** only for dispatch routing (`EXPO_PUBLIC_TOMTOM_API_KEY`); LocationIQ for everything else. Leaflet runs inside a WebView.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
