# App móvil del guardia — Expo (SGS)

App **Expo / React Native** (Android) para el **guardia/supervisor en campo**. Consume el **mismo Supabase** que la web (mismas tablas, RLS y bitácora), sin backend adicional.

> Detalle técnico (identidad por dispositivo, push, bodycam, mapas): ver `../CLAUDE.md`. Inventario funcional: `../docs/SGS-Modulos-y-Funciones.md`.

## Navegación (tema oscuro de alto contraste)

Pestañas inferiores pensadas para uso en campo (una mano, botones grandes, sol directo). Las de **mando** (Buscar, Supervisión) solo aparecen para supervisor o superior:

- **Inicio / Mi turno** — resuelve el elemento por la cuenta; muestra el **sitio asignado** y el **turno vigente** (fecha local + ventana real, soporta cruce de medianoche), accesos rápidos, **alerta de pánico** (botón rojo), bodycam y recordatorios.
- **Rondín** — lectura de puntos por **QR / NFC / geocerca**, con novedad; **funciona offline** (se sube al reconectar).
- **Chat** — canales con no leídos y push (incluye avisos de relevo).
- **Perfil** — "Mi elemento" (valida el teléfono como su bodycam-smartphone), datos de sesión, descarga de bodycam, cierre de sesión.
- **Buscar** *(mando)* — consulta de Persona / Vehículo / Incidente.
- **Supervisión** *(mando)* — por guardia o por sitio: GPS/estatus, rondines del día y tareas completadas.

Pantallas de flujo (stack): **Mis incidentes / Incidente** (levantar con foto/ubicación), **Control de acceso (caseta)**, **Evidencia** (foto/video/**audio**), **Inspección** (checklist logístico con foto/GPS, offline), **Tareas** (enterado/atendiendo/completada, con evidencia), **Bodycam** y **Transmisión** (video en vivo), **Expediente** (ficha de solo lectura), **ChatCanal**.

**Gate de sesión:** guardia/supervisor solo entran con un **turno vigente** que cubra la hora; la sesión se cierra al terminar el turno.

## Capacidades nativas (requieren build de EAS, no corren en Expo Go)

- **Rastreo GPS en segundo plano** (pantalla bloqueada) vía servicio en primer plano.
- **Push** (Expo + FCM) de tareas, despachos y chat.
- **Bodycam en vivo** (WebRTC, al Enviar Alerta) + **Bodycam HD local** (módulo nativo Android que graba con la pantalla bloqueada y descarga los segmentos como evidencia, ligada al folio del módulo donde se inició).
- **NFC** para lectura de puntos de control.

---

## App independiente (APK) con EAS Build

Con **Expo Go** la app carga el bundle desde Metro (tu PC, misma red). Para una app **instalable que funcione en cualquier lado** (se conecta directo a Supabase en la nube), genera un **APK con EAS Build**:

```bash
cd mobile
npm install -g eas-cli          # una sola vez
eas login                       # cuenta de Expo (sgs-movil / @jorgeroncs-team)
eas build -p android --profile preview
```

Al terminar, EAS da un **enlace/QR para descargar el APK**. Las credenciales de Supabase (URL + anon key, públicas por diseño) van embebidas en el build y como respaldo en `src/lib/supabase.ts`. Las variables del móvil vienen de **EAS environments** (`eas env:create --environment preview ...`), no de `eas.json`; `.env` solo para correr en local.

> El **login** usa Supabase Auth (correo + contraseña + **2FA**). El usuario debe existir en el proyecto Supabase.

## Desarrollo con Expo Go

```bash
cd mobile
npm install
npx expo install --fix     # alinea versiones nativas al SDK de Expo
cp .env.example .env        # en Windows: copy .env.example .env
npx expo start
```
Escanea el **QR** con Expo Go (Android). **Verificación local:** `npx tsc --noEmit`. Agrega dependencias nativas con `npx expo install <pkg>` (nunca editar versiones a mano).

## Mapas

- **LocationIQ** (tiles/geocode) renderizado con **Leaflet dentro de un WebView** (`react-native-webview`), helpers en `src/lib/geo.ts`, con **OSM** como fallback. Llave en `EXPO_PUBLIC_LOCATIONIQ_KEY`.
- **TomTom** solo para el ruteo de despacho (ruta + tráfico + ETA): `EXPO_PUBLIC_TOMTOM_API_KEY`.

## Notas

- **Token:** la sesión se persiste con AsyncStorage; para producción se puede endurecer con `expo-secure-store`.
- La app **no reescribe lógica de negocio**: todo pasa por las mismas tablas y políticas RLS del backend (WORM, folios, bitácora).
- Identificadores heredados del fork (p. ej. la clave AsyncStorage `scp_bodycam_pendientes`) son nombres reales en el código; no se renombran.
