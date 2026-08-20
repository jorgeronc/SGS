# App móvil del policía — Expo

App **Expo / React Native** (Android) para el elemento en campo. Consume el **mismo Supabase**
que la web (mismas tablas, RLS y bitácora), sin backend adicional.

> **Capacidades añadidas** (ver `../CLAUDE.md` para el detalle técnico): identidad por
> dispositivo (Mi elemento / Mi unidad / **Mi bodycam**), **estatus de unidad**, **Tareas
> asignadas** con respuestas, **push** (Expo + FCM), **Recordatorios de turno**, **bodycam en
> vivo** (WebRTC al Enviar Alerta) y **bodycam HD local** (módulo nativo Android que graba con
> la pantalla bloqueada y descarga los videos como evidencia, ligada al folio del módulo donde
> se inició). Estas dependencias nativas **requieren un build de EAS** (no corren en Expo Go).

## Arquitectura de navegación (tema oscuro de alto contraste)

Barra de **pestañas inferiores** — **Inicio · Buscar · Nuevo · Casos · Perfil** — sobre un
tema oscuro pensado para uso en campo (una mano, botones grandes, sol directo).

- **Inicio**: cabecera con *turno · conectividad · usuario*, indicadores de despachos e
  incidentes, accesos rápidos (Nuevo incidente, Consultar, Evidencia, Enviar ubicación),
  menú de módulos y botón de **Pánico / Emergencia** funcional (ver abajo).
- **Buscar (Consulta rápida)**: búsqueda real por **nombre, CURP, placa o VIN** con chips
  **Persona · Vehículo · Orden · Caso**, tarjetas de resultado con badges de estatus y
  acciones **Ver expediente** / **Compartir**. El escáner de código/OCR es visual (próxima fase).
- **Expediente**: ficha de sólo lectura del registro seleccionado.
- **Nuevo (incidente autónomo)**: captura en campo sin depender de un despacho — **tipo**
  (con chips comunes), **dirección**, **descripción**, **GPS automático** (`expo-location`),
  **fotografías** (cámara/galería) y dos acciones: **Guardar borrador** (en el dispositivo con
  AsyncStorage, se recupera al volver) y **Enviar** (inserta el incidente, sube las fotos al
  Storage y limpia el borrador). El folio se asigna solo.
- **Evidencia**: captura de evidencia en campo — **fotografía, video, audio y documentos**
  (`expo-image-picker`, `expo-audio` para grabar, `expo-document-picker`), tipo, descripción,
  cantidad y **GPS**. Al registrar, inserta la evidencia (estado *recolectada*), sube las
  imágenes a `fotografias` y el resto de archivos a `datos_adicionales.archivos`, e **inicia la
  cadena de custodia** (evento *recolección*). Se abre desde el menú/acceso rápido de Inicio.
- **Ubicación (Enviar GPS)**: mapa OpenStreetMap con **mi posición** y los **eventos cercanos**
  (reportes CAD e incidentes con coordenadas, ordenados por distancia). **Enviar mi ubicación**
  registra un ping en `ubicaciones_patrulla` vía `rpc_registrar_ubicacion` (append-only), y
  **Compartir** manda las coordenadas por el menú del teléfono. Requiere la migración
  `0021_ubicaciones_patrulla.sql`.
- **Alertas / notificaciones prioritarias**: feed derivado de datos en vivo — **emergencias**
  (llamadas CAD prioridad alta, incluidas las de pánico), **despachos** pendientes y **órdenes**
  vigentes, ordenadas por prioridad. El estado *leída* se guarda localmente (sin tabla de
  notificaciones) y el **badge** del menú de Inicio muestra las no leídas. Cada alerta abre su
  destino (despachos o el expediente de la orden).
- **Pánico / Emergencia** (botón rojo en Inicio): con confirmación y tu **GPS**. Si estás
  **atendiendo un incidente** (pantalla Informe abierta y sin cerrar), agrega una **novedad de
  alerta** a ese incidente; si no, crea una **llamada CAD de emergencia** (`prioridad alta`) con
  su **despacho**. En ambos casos envía tu ubicación (`rpc_registrar_ubicacion`), por lo que
  también apareces en el mapa del dashboard. La "atención actual" se guarda localmente al abrir
  el Informe y se limpia al cerrarlo.
- **Casos / Perfil**: Casos lista los incidentes recientes y Perfil muestra los datos de sesión
  y cierre de sesión.

## Flujo de despachos (existente)
- **Acceso por token** (login con Supabase Auth; el token JWT se guarda en el dispositivo).
- **Mis despachos**: lista de despachos activos.
- **Detalle del despacho**: cambia el estatus **Enterado → En Ruta → En el Lugar → Cerrado**,
  ve el **mapa** con el lugar del incidente y la **ruta** desde el GPS de la patrulla, y abre
  la navegación en Google Maps.
- **Informe de incidente**: estado, narrativa, **novedades** (append-only) y **fotos**
  tomadas con la **cámara** o elegidas de la **galería**.

---

## App independiente (APK) — entrar desde cualquier lugar, sin depender de tu máquina

Con **Expo Go** la app carga el bundle desde el servidor de desarrollo (Metro) de tu
computadora: sólo funciona si `expo start` está corriendo y el teléfono está en la misma red.
Para tener una app **instalable que funcione en cualquier lado** (se conecta directo a Supabase
en la nube, sin PC), genera un **APK con EAS Build** (servidor de compilación de Expo, gratis):

```bash
cd mobile
npm install -g eas-cli          # una sola vez
eas login                       # tu cuenta de Expo (crear gratis en expo.dev)
eas init                        # enlaza el proyecto (agrega extra.eas.projectId a app.json)
eas build -p android --profile preview
```

Al terminar, EAS te da un **enlace/QR para descargar el APK**. Instálalo en cualquier Android
(Ajustes → permitir "instalar apps de fuentes desconocidas") y ábrelo: **entra siempre**, en
cualquier red, sin tu computadora. Las credenciales de Supabase (URL + publishable key, ambas
públicas) van embebidas en el build vía `eas.json` y como respaldo en `src/lib/supabase.ts`.

Para actualizar la app sin recompilar, se puede usar `eas update` (OTA); opcional.

> El **login** usa Supabase Auth (correo + contraseña). El usuario debe existir en tu proyecto
> Supabase (Authentication → Users). El acceso NO depende de tu máquina: es contra el backend
> en la nube.

## Desarrollo con Expo Go (opcional, requiere tu máquina)

### Requisitos
- Node.js instalado.
- La app **Expo Go** en tu teléfono (App Store / Play Store), o un emulador Android/iOS.
- El backend Supabase con las migraciones aplicadas (ya lo tienes).

## Puesta en marcha

```bash
cd mobile
npm install
# Alinea las versiones nativas al SDK de Expo (recomendado):
npx expo install --fix

# Configura las credenciales (mismas que la web; la anon key es pública):
cp .env.example .env      # en Windows: copy .env.example .env

npx expo start
```

Escanea el **QR** con Expo Go (Android) o con la cámara (iOS). La app abre en tu teléfono.

## Despacho con TomTom (ruta + tiempo estimado)
**Sólo la pantalla de despacho** puede usar **TomTom** para trazar la ruta patrulla→incidente
con **tráfico en tiempo real**, **tiempo estimado** y **hora de llegada**. El dashboard y los
demás mapas siguen con OpenStreetMap.

Pon tu API key de TomTom en `EXPO_PUBLIC_TOMTOM_API_KEY` (por **EAS environments** para el
APK; `.env` sólo para correr en local). **Sólo la pantalla de despacho** usa TomTom; los demás
mapas usan LocationIQ.

## Mapa (LocationIQ vía Leaflet en WebView)
Los mapas usan **LocationIQ** (tiles/geocode/reverse) renderizados con **Leaflet dentro de un
WebView** (`react-native-webview`), mediante los helpers de `src/lib/geo.ts` — con **OSM como
fallback**. La llave va en `EXPO_PUBLIC_LOCATIONIQ_KEY`. Muestra el lugar del incidente, la
ubicación de la patrulla (GPS con `expo-location`) y la **ruta** entre ambos. El botón "Abrir en
Google Maps" delega la navegación paso a paso a la app de mapas del teléfono.

## Notas
- **Despachos mostrados:** por ahora la lista muestra todos los despachos activos (no filtra
  por el oficial logueado, porque aún no hay vínculo usuario↔personal). Es un refinamiento
  futuro; para la demo, cualquier despacho activo aparece.
- **Ruta:** se traza con el servicio público de OSRM (sin API key); si no responde, dibuja una
  línea recta. La navegación paso a paso se delega a Google Maps.
- **Token seguro:** la sesión se persiste con AsyncStorage. Para producción se puede endurecer
  con `expo-secure-store` (cifrado en el llavero del dispositivo).
- La app **no reescribe lógica de negocio**: todo pasa por las mismas tablas y políticas RLS
  del núcleo (`despachos`, `incidentes`, `novedades`, Storage `fotos`).
