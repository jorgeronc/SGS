# Portar a SCP: capa de cámaras en el mapa + abrir cámara al clic + chat en el mapa

**Guía de implementación** · origen: SGS → destino: SCP
Versión 1.0 · 2026-09-30

---

## 0. Qué se va a portar

Del **Mapa Operativo** de SGS, tres capacidades:

1. **Capa de cámaras** en el mapa (marcadores de CCTV por ubicación, con color por
   estado operativo y toggle de capa).
2. **Clic en una cámara → abrir su inspector** en un panel lateral (video en vivo/
   snapshot + detalle + acciones).
3. **Abrir el chat del incidente dentro del mapa** (panel lateral con el chat en
   tiempo real del canal del incidente).

> **Contexto importante:** SCP es el *fork padre* de SGS. Todo lo que aquí se
> describe se construyó en SGS (migraciones `0050+`). Por eso **varias piezas de
> plataforma probablemente ya existan en SCP** (CAD `llamadas_cad`, chat
> `chat_canales/chat_miembros/chat_mensajes`, MapLibre, realtime). Cada sección
> marca **[VERIFICAR]** lo que hay que confirmar y **[NUEVO]** lo que casi seguro
> hay que agregar. No revivas módulos ajenos: esto es solo videovigilancia + mapa + chat.

### Diferencia de marca
Los componentes usan `var(--sc-btn, #f4a03f)` (naranja SGS) **con fallback**. En SCP
tomarán automáticamente el `--sc-btn` de SCP (azul). No hay que cambiar nada salvo que
quieras forzar color.

---

## 1. Backend — Base de datos (Supabase)

Crea **una migración nueva** en SCP (siguiente número en su secuencia) con lo que falte.
Todo sigue las convenciones de plataforma compartidas (WORM, folios, bitácora, RLS,
dos ejes de estatus, Haversine sin PostGIS).

### 1.1 Tabla `camaras` + foliador + WORM + RLS + cercanas **[NUEVO]**
Origen: `supabase/migrations/0061_videovigilancia.sql`. Copiar tal cual:

```sql
-- Tabla de cámaras fijas (CCTV) ancladas a un sitio. El video NO se almacena;
-- la señal se resuelve al vuelo (Edge Function camara_vista).
create table if not exists camaras (
  id                  uuid primary key default gen_random_uuid(),
  folio               text,
  nombre              text not null,
  sitio_id            uuid not null references sitios(id),
  latitud             double precision,
  longitud            double precision,
  ubicacion_desc      text,
  proveedor           text not null default 'manual',     -- 'manual' | 'windy' | 'iss'/'securos' | ...
  proveedor_ref       text,
  stream_url          text,                               -- solo 'manual' (HLS/MJPEG/embed)
  estado_operativo    text not null default 'activa'
                        check (estado_operativo in ('activa','inactiva','mantenimiento')),
  datos_adicionales   jsonb default '{}'::jsonb,
  estatus             text not null default 'activo' check (estatus in ('activo','cancelado')),
  cancelado_en        timestamptz,
  motivo_cancelacion  text,
  creado_en           timestamptz not null default now(),
  actualizado_en      timestamptz not null default now(),
  constraint chk_camara_fuente check (
    (proveedor = 'manual' and stream_url is not null)
    or (proveedor <> 'manual' and proveedor_ref is not null)
  )
);
create index if not exists idx_camaras_sitio  on camaras (sitio_id);
create index if not exists idx_camaras_estado on camaras (estado_operativo);
create unique index if not exists idx_camaras_proveedor_ref
  on camaras (proveedor, proveedor_ref) where proveedor_ref is not null;

-- Foliador (CM), WORM (no-delete), bitácora
insert into foliadores (modulo, nombre, iniciales) values ('camaras','Cámaras','CM')
  on conflict (modulo) do nothing;
drop trigger if exists trg_folio_camaras on camaras;
create trigger trg_folio_camaras before insert on camaras for each row execute function fn_asignar_folio();
drop trigger if exists trg_no_delete_camaras on camaras;
create trigger trg_no_delete_camaras before delete on camaras for each row execute function fn_bloquear_delete();
revoke delete on camaras from authenticated, anon;
drop trigger if exists trg_auditoria_camaras on camaras;
create trigger trg_auditoria_camaras after insert or update on camaras for each row execute function fn_bitacora_generica();

-- RLS: ver = cualquier autenticado; gestionar = mando
alter table camaras enable row level security;
drop policy if exists sel_camaras on camaras;
create policy sel_camaras on camaras for select to authenticated using (true);
drop policy if exists ins_camaras on camaras;
create policy ins_camaras on camaras for insert to authenticated
  with check (coalesce(fn_rol_actual(), '') in ('supervisor','administrador'));
drop policy if exists upd_camaras on camaras;
create policy upd_camaras on camaras for update to authenticated
  using (coalesce(fn_rol_actual(), '') in ('supervisor','administrador'))
  with check (coalesce(fn_rol_actual(), '') in ('supervisor','administrador'));

-- Cámaras cercanas a un punto (Haversine). Requiere fn_distancia_m (SCP ya la tiene
-- si tiene el módulo de ubicaciones; si no, portarla de la migración 0059 de SGS).
create or replace function rpc_camaras_cercanas(
  p_lat double precision, p_lng double precision,
  p_radio_m double precision default 800, p_limite int default 20
) returns table (
  id uuid, folio text, nombre text, sitio_id uuid, sitio_nombre text,
  latitud double precision, longitud double precision,
  proveedor text, estado_operativo text, distancia_m double precision
) language sql stable as $$
  select c.id, c.folio, c.nombre, c.sitio_id, s.nombre as sitio_nombre,
         c.latitud, c.longitud, c.proveedor, c.estado_operativo,
         round(fn_distancia_m(p_lat, p_lng, c.latitud, c.longitud)::numeric, 1)::double precision as distancia_m
  from camaras c join sitios s on s.id = c.sitio_id
  where c.estatus = 'activo' and c.estado_operativo = 'activa'
    and c.latitud is not null and c.longitud is not null
    and p_lat is not null and p_lng is not null
    and fn_distancia_m(p_lat, p_lng, c.latitud, c.longitud) <= p_radio_m
  order by fn_distancia_m(p_lat, p_lng, c.latitud, c.longitud)
  limit p_limite;
$$;
```

> **[VERIFICAR] `sitios`:** la tabla `camaras` referencia `sitios(id)`. En SCP (policial)
> puede llamarse distinto. Si no hay `sitios`, ancla la cámara a la entidad geográfica que
> use SCP o hazla opcional (quitar el `not null` y el FK). El mapa solo necesita
> `latitud/longitud/nombre/estado_operativo`.

> **[VERIFICAR] WORM:** agrega `'camaras'` a la whitelist de `rpc_cancelar_registro`
> en SCP (igual que hizo 0061 en SGS).

### 1.2 Inspector completo: eventos + snapshot→evidencia + incidente **[OPCIONAL]**
Origen: `supabase/migrations/0067_videovigilancia_vms.sql`. **Solo si quieres el
inspector completo** (`CameraDetailDrawer` usa estas piezas):
- Columnas extra de `camaras` (`tipo, es_ptz, resolucion, fps, vms, ip, zona, retencion_dias, grabacion_disponible, ultima_actividad`).
- Tabla `camara_eventos` (+ RLS + realtime).
- `rpc_camara_snapshot_evidencia(p_camara, p_imagen_url, p_nota)` → crea evidencia WORM + cadena de custodia + vínculo.
- `rpc_camara_crear_incidente(p_camara, p_tipo, p_prioridad, p_descripcion, p_snapshot_url)` → crea `llamadas_cad` + vínculo.

> Si NO portas 0067: `CameraDetailDrawer` ya cae a lo básico (tiene fallback si las
> columnas nuevas no existen), pero deshabilita snapshot/incidente/eventos. Para el
> pedido mínimo (ver cámara al clic) basta con 0061 + la edge function.

### 1.3 Chat del incidente en el mapa **[VERIFICAR / parcialmente NUEVO]**
SCP ya tiene el módulo de chat (`chat_canales/chat_miembros/chat_mensajes`,
`rpc_chat_marcar_leido` — migración 0048 en SGS). Lo específico del incidente:

```sql
-- Canal de chat por incidente (columna en la llamada CAD).
alter table llamadas_cad add column if not exists chat_canal_id uuid references chat_canales(id);

-- fn_incidente_crear_chat(p_llamada): crea el canal y suma miembros base
--   (creador + guardia que reportó + supervisor del turno) y a mando (admin/supervisor).
--   Copiar de SGS 0072 (o 0062 si SCP no maneja turnos por sitio).
-- rpc_incidente_unir_chat(p_llamada): asegura el canal y agrega al operador actual;
--   devuelve el canal_id. Es LO QUE LLAMA EL MAPA. Copiar de SGS 0089 (última versión)
--   o 0062 (versión mínima sin sincronizar oficiales).
```

**Versión mínima de `rpc_incidente_unir_chat`** (suficiente para el mapa; de 0062):

```sql
create or replace function rpc_incidente_unir_chat(p_llamada uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_canal uuid;
begin
  select chat_canal_id into v_canal from llamadas_cad where id = p_llamada;
  if v_canal is null then v_canal := fn_incidente_crear_chat(p_llamada); end if;
  if v_canal is null then return null; end if;
  if coalesce(fn_rol_actual(), '') in ('supervisor','investigador','administrador') then
    insert into chat_miembros (canal_id, usuario_id) values (v_canal, auth.uid())
      on conflict do nothing;
  end if;
  return v_canal;
end; $$;
```

> **[VERIFICAR] `fn_incidente_crear_chat`** depende de columnas de `llamadas_cad`
> (`folio`, `sitio_id`, `datos_adicionales->>'personal_id'`) y de `turnos/turno_guardias/
> personal`. Ajusta la parte de "supervisor del turno" a lo que exista en SCP; el mínimo
> viable es crear el canal con el creador + admins/supervisores.

### 1.4 Realtime **[VERIFICAR]**
El chat en vivo necesita `chat_mensajes` en la publicación `supabase_realtime`
(SCP ya debería tenerlo). El mapa de SGS también suscribe `transmisiones` (opcional,
solo si portas el recuadro de transmisión en vivo — no es parte del pedido).

---

## 2. Backend — Edge Function `camara_vista` **[NUEVO]**

Origen: `supabase/functions/camara_vista/index.ts`. **Copiar tal cual** y desplegar.
Resuelve la señal de una cámara al vuelo (mantiene la API key fuera del navegador).

- Acciones: `vista` (resolver imagen/reproductor de una cámara), `snapshot`
  (descarga server-side → evidencia), `importar` (alta masiva Windy), `ptz` (stub VMS).
- Para cámaras `manual` devuelve su `stream_url`. Para `windy` usa `WINDY_API_KEY`.
  Para `iss`/`securos` hay esqueleto de driver VMS.
- Depende de `_shared/cors.ts` (`json`, `preflight`).

Despliegue (PowerShell):
```powershell
npx supabase functions deploy camara_vista
# Si usas Windy: npx supabase secrets set WINDY_API_KEY=...
```

> Para "ver la cámara al clic" con cámaras `manual` (stream propio), **no necesitas
> ninguna llave**: la edge function regresa el `stream_url` directo.

---

## 3. Frontend — componentes a copiar

Copiar de `frontend/app/components/` y `frontend/lib/` de SGS. Alias de import `@/*`
apunta a la raíz de `frontend/` (igual en SCP).

| Archivo | Rol | ¿SCP ya lo tiene? |
|---|---|---|
| `components/MapaBase.tsx` | Base MapLibre reutilizable (`onReady(map)`) | **[VERIFICAR]** SCP migró de Leaflet→MapLibre en SGS; si SCP sigue en Leaflet, ver §5.1 |
| `lib/mapStyle.ts` | Estilos (OpenFreeMap/Protomaps), `estiloMapaPorId`, `ESTILOS_MAPA` | [VERIFICAR] |
| `lib/geo.ts` → `temaMapa()` | Tema claro/oscuro del mapa | [VERIFICAR] |
| `components/VisorCamara.tsx` | Tile de UNA cámara (invoca `camara_vista`) | **[NUEVO]** |
| `components/CameraDetailDrawer.tsx` | Inspector de cámara (video+detalle+acciones+pestañas) | **[NUEVO]** |
| `components/CamarasCercanas.tsx` | Lista de cámaras cercanas (usa `rpc_camaras_cercanas`) | **[NUEVO]** (opcional; lo usa el panel de incidente) |
| `components/ChatIncidente.tsx` | Chat compacto de un canal (realtime) | **[NUEVO]** (reusa tablas de chat) |
| `lib/chatColor.ts` → `colorUsuario`, `fondoUsuario` | Colores por usuario en el chat | **[NUEVO]** (o sustituir por colores fijos) |
| `lib/mapaOperacionalEstado.ts` | Estado del mapa que sobrevive navegación SPA | **[NUEVO]** (opcional; ver §5.4) |

**Dependencias de cada componente (para no dejar imports rotos):**
- `VisorCamara` → `supabaseClient`, edge function `camara_vista`.
- `CameraDetailDrawer` → `VisorCamara`, `CatalogoSelect` (catálogo `tipo_incidencia`),
  `camara_eventos`, `rpc_camara_snapshot_evidencia`, `rpc_camara_crear_incidente`
  (todo 0067). Props: `{ camaraId, onClose?, verMapaHref?, accionesColapsables? }`.
- `ChatIncidente` → `chat_miembros`, `chat_mensajes`, `rpc_chat_marcar_leido`,
  `chatColor`. Props: `{ canalId, alto? }`.
- `CamarasCercanas` → `rpc_camaras_cercanas`, `VisorCamara`. Props: `{ latitud, longitud, radioM? }`.

---

## 4. Frontend — el cableado del Mapa Operativo

Origen: `frontend/app/mapa-operacional/page.tsx`. Si SCP ya tiene su propio mapa
operativo, **injerta** estas tres piezas; si no, copia la página completa y adáptala.

### 4.1 Cargar las cámaras
```tsx
const [camaras, setCamaras] = useState<any[]>([]);
// dentro de cargar():
supabase.from("camaras")
  .select("id, nombre, estado_operativo, latitud, longitud")
  .eq("estatus", "activo").not("latitud", "is", null)
  .then(({ data }) => setCamaras((data as any[]) ?? []));
```

### 4.2 Capa de cámaras + CLIC → abrir cámara
Marcador por cámara; color por estado; `onClick` selecciona la cámara (abre el panel):
```tsx
const COL = { camara: "#0e8f86", pausa: "#d98a2b", incidente: "#e23b53", /* … */ };
const colorCamara = (e?: string) =>
  e === "activa" ? COL.camara : e === "mantenimiento" ? COL.pausa : COL.incidente;

const [selCam, setSelCam] = useState<any | null>(null);

// en pintar() (redibujo de marcadores), con la capa activa:
if (capas.camaras) camaras.forEach((c) =>
  add(Number(c.longitud), Number(c.latitud),
      pinEl(colorCamara(c.estado_operativo), "📷", c.nombre ?? "Cámara",
            /*dot*/ true, /*pulse*/ false,
            () => setSelCam(c),                         // ← CLIC ABRE LA CÁMARA
            { hoverOnly: true, sub: c.estado_operativo ?? "" })));
```
`pinEl(color, icon, label, dot, pulse, onClick, opts)` crea el `HTMLElement` del
marcador (ver la función en la página de SGS; incluye el CSS `.mo-pin/.mo-hoverlabel`
para mostrar la etiqueta solo al pasar el cursor). Los marcadores se agregan con
`new maplibre.Marker({ element }).setLngLat([lng,lat]).addTo(map)`.

### 4.3 Panel lateral de la cámara (dock izquierdo)
```tsx
{selCam && (
  <CameraDetailDrawer camaraId={selCam.id} onClose={() => setSelCam(null)} accionesColapsables />
)}
```

### 4.4 Abrir el CHAT del incidente en el mapa
Desde el panel del incidente, un botón asegura membresía y abre el chat:
```tsx
const [selChat, setSelChat] = useState<{ canalId: string; folio: string } | null>(null);

async function abrirChatIncidente(inc: any) {
  const { data } = await supabase.rpc("rpc_incidente_unir_chat", { p_llamada: inc.id });
  if (data) setSelChat({ canalId: data as string, folio: inc.folio ?? "incidente" });
}

// botón (en la ventana del incidente):
<button onClick={() => abrirChatIncidente(selInc)}>💬 Chat del incidente</button>

// panel del chat (dock izquierdo, debajo de la cámara):
{selChat && (
  <div /* panel */>
    <div /* header con ✕ */>💬 Chat · {selChat.folio}
      <span onClick={() => setSelChat(null)}>✕</span></div>
    <ChatIncidente canalId={selChat.canalId} alto={300} />
  </div>
)}
```

### 4.5 Toggle de capa de cámaras
```tsx
const [capas, setCapas] = useState({ /* …, */ camaras: true });
// en la barra de capas:
<label><input type="checkbox" checked={capas.camaras}
  onChange={() => setCapas(p => ({ ...p, camaras: !p.camaras }))}/> Cámaras</label>
// pintar() lee capas.camaras para mostrar/ocultar los marcadores.
```

---

## 5. Notas de adaptación a SCP

### 5.1 Si SCP aún usa Leaflet (no MapLibre)
El patrón es idéntico; cambia solo la API de marcadores:
- MapLibre: `new maplibregl.Marker({element}).setLngLat([lng,lat]).addTo(map)`.
- Leaflet: `L.marker([lat,lng], { icon: L.divIcon({ html }) }).addTo(map).on('click', …)`.
La lógica (cargar `camaras`, color por estado, `onClick → setSelCam`, panel con
`CameraDetailDrawer`, chat con `rpc_incidente_unir_chat` + `ChatIncidente`) no cambia.

### 5.2 Nombres de dominio
- SGS usa `llamadas_cad` para incidentes y `sitios` para ubicaciones fijas. Si SCP
  usa otros nombres, ajusta los `select`/RPC.
- `estado_despacho in ('recibida','despachada','en_atencion')` es el filtro de
  incidentes abiertos de SGS; usa los estados de SCP.

### 5.3 Roles
Las RLS usan `fn_rol_actual()` con roles `supervisor/investigador/administrador`.
SCP comparte estos roles (oficial/supervisor/investigador/asuntos_internos/
administrador), así que aplica igual.

### 5.4 Persistencia del estado del mapa (opcional)
`lib/mapaOperacionalEstado.ts` recuerda ventanas abiertas y centro/zoom al navegar.
Es una mejora de UX; puedes omitirla y arrancar con estado en `useState`.

---

## 6. Checklist de implementación en SCP

**Base de datos (una migración nueva):**
- [ ] Tabla `camaras` + foliador CM + WORM + RLS + `rpc_camaras_cercanas` (§1.1).
- [ ] `'camaras'` agregado a `rpc_cancelar_registro`.
- [ ] `fn_distancia_m` existe (si no, portar de SGS 0059).
- [ ] (Opcional) 0067: `camara_eventos` + columnas VMS + RPCs snapshot/incidente (§1.2).
- [ ] `llamadas_cad.chat_canal_id` + `fn_incidente_crear_chat` + `rpc_incidente_unir_chat` (§1.3).
- [ ] `chat_mensajes` en `supabase_realtime`.

**Edge function:**
- [ ] `camara_vista` copiada y desplegada (+ `_shared/cors.ts`). Secretos si usas Windy/VMS.

**Frontend:**
- [ ] Componentes copiados: `VisorCamara`, `CameraDetailDrawer`, `ChatIncidente`
      (+ `CamarasCercanas`, `chatColor`, y base de mapa/estilos si faltan).
- [ ] Mapa: cargar `camaras`, capa + `onClick → setSelCam`, panel `CameraDetailDrawer`.
- [ ] Mapa: botón "Chat del incidente" → `rpc_incidente_unir_chat` → panel `ChatIncidente`.
- [ ] Toggle de capa "Cámaras".

**Verificación (convención SCP: typecheck + build):**
- [ ] `cd frontend && npm run build` sin errores.
- [ ] Dar de alta 1 cámara `manual` con `stream_url` y verla al clic en el mapa.
- [ ] Abrir el chat de un incidente desde el mapa y enviar/recibir un mensaje (realtime).

---

*Archivos fuente en SGS para copiar/consultar:*
`frontend/app/mapa-operacional/page.tsx` ·
`frontend/app/components/{MapaBase,VisorCamara,CameraDetailDrawer,ChatIncidente,CamarasCercanas}.tsx` ·
`frontend/lib/{mapStyle,geo,chatColor,mapaOperacionalEstado}.ts` ·
`supabase/functions/camara_vista/` ·
`supabase/migrations/{0061_videovigilancia,0067_videovigilancia_vms,0062_incidentes_central,0072_incidente_chat_central,0089_chat_incidente_oficiales,0048_chat_v2}.sql`
