# Sistema Central Policial (SCP)

RMS + CAD (Computer-Aided Dispatch) policial. Monorepo con tres entregables, todos
conectados **directo a Supabase** (Postgres + Auth + Storage + Realtime); no hay
servidor API intermedio.

| Componente | Carpeta | Stack | Despliegue |
|---|---|---|---|
| Web (despacho/registros) | `frontend/` | Next.js 14 (App Router, TS) | **Vercel** (proyecto `scp`, Root = `frontend`; push a `main` = deploy) |
| Móvil (oficial en campo) | `mobile/` | Expo SDK 54 / RN 0.81 | **EAS** (APK Android) |
| Backend | `supabase/` | Postgres (migraciones `0001`–`0041`) + Edge Functions (Deno) | Supabase (ref `okhsniabwiukjyjhmeav`) |

> Guía de trabajo para contribuir (comandos, arquitectura y convenciones): ver
> `CLAUDE.md`. Diseño completo y roadmap: `Arquitectura_Sistema_Central_Policial_SaaS.md`.

---

## Estructura

```
sistema-central-policial/
├── supabase/
│   ├── migrations/                 0001…0041 — se corren MANUALMENTE en orden en el SQL Editor
│   │                               (core, bitácora, WORM, RLS, casos, personal, órdenes, fotos,
│   │                                evidencias, asuntos internos, CAD/barandilla, foliador, equipo,
│   │                                admin, incidentes, tareas, transmisiones, bodycam, cierre/historial CAD…)
│   ├── functions/                  Edge Functions (Deno): crear_usuario, copiloto, enviar_push,
│   │                               indexar-ia, buscar-ia
│   └── seed.sql                    Datos de prueba (opcional)
├── frontend/                       Next.js 14 (App Router) — web de despacho/registros
│   ├── app/                        rutas + components/ (AppShell, ListaMaestra, VinculosPanel…)
│   ├── lib/                        supabaseClient, types, config, geo (LocationIQ), turn (WebRTC)
│   └── .env.example
└── mobile/                         Expo / React Native — app del oficial en campo
    ├── src/screens/ · src/lib/ · src/components/ · modules/bodycamhd (módulo nativo Android)
    └── app.json · eas.json
```

---

## Paso 1 — Crear el proyecto Supabase (gratis)

1. Crear cuenta en [supabase.com](https://supabase.com) y un proyecto nuevo (plan gratuito).
2. En el dashboard: **SQL Editor** → pegar y ejecutar, en este orden, el contenido de cada archivo de `supabase/migrations/` (`0001` … `0041`). Las migraciones se aplican **manualmente** (no se auto-corren). Al agregar esquema, crear el siguiente archivo numerado y correrlo.
3. En **Authentication → Providers**, dejar habilitado correo/contraseña, y crear un primer usuario de prueba desde **Authentication → Users → Add user**. Al crearse, el trigger `trg_crear_perfil_nuevo_usuario` le genera automáticamente un perfil con rol `oficial` en `usuarios_perfil`. Para hacerlo `administrador`, editar esa fila manualmente desde **Table Editor** la primera vez.
4. En **Settings → API**, copiar la `Project URL` y la `anon public key`.

**Importante sobre el plan gratuito:** el proyecto se pausa automáticamente tras 7 días sin uso — hay que reactivarlo desde el dashboard antes de una demo si estuvo inactivo.

---

## Paso 2 — Correr el frontend en tu máquina

```bash
cd frontend
cp .env.example .env.local
# editar .env.local con la URL y anon key del paso 1

npm install
npm run dev        # servidor de desarrollo en el puerto 3100
```

Abrir `http://localhost:3100`, iniciar sesión con el usuario creado en el paso 1, y
probar cualquier módulo (p. ej. Personas): agregar un registro, cancelarlo (nota que
desaparece de la vista normal pero sigue en la tabla con estatus "cancelado") y crear
un vínculo. **Verificación real** = `npm run build` (atrapa errores que `tsc` no ve,
como `useSearchParams` sin `<Suspense>`).

> **App móvil** (`mobile/`): `npx tsc --noEmit` para typecheck y
> `npx eas-cli build --profile preview --platform android` para el APK. Las dependencias
> nativas (WebRTC, push, bodycam) **no** funcionan en Expo Go — requieren un build de EAS.

---

## Paso 3 — Verificar la bitácora

Desde el **Table Editor** de Supabase, abrir la tabla `bitacora` después de usar el frontend. Deberías ver un registro por cada alta, modificación, cancelación y consulta, con `usuario_id` (resuelto automáticamente por Supabase Auth), `ip_address` y `computadora_id`.

Sobre `computadora_id`: en esta demo se genera un identificador provisional en el navegador (ver `lib/deviceId.ts`), marcado explícitamente como no confiable para fines legales. El reemplazo por un catálogo de dispositivos registrados por TI (la opción recomendada en el documento de arquitectura) es un paso pendiente antes de producción.

Sobre `ip_address`: la función de bitácora la lee de los headers de la petición HTTP (`request.headers` expuesto por PostgREST). **Esto hay que confirmarlo con el proyecto Supabase real** — la disponibilidad exacta de headers puede variar; si `ip_address` llega vacío en las pruebas, es la primera cosa a ajustar en `0002_bitacora.sql`.

---

## Paso 4 — Camino a producción on-premise

Cuando llegue el momento de instalar en el servidor de una agencia (en vez de usar Supabase Cloud), el mismo esquema SQL y el mismo frontend se despliegan contra una instancia de **Supabase auto-hospedado** (Docker Compose, open source): ver la sección 2 del documento de arquitectura. No hace falta reescribir nada — solo cambia dónde vive la infraestructura.

---

## Ya construido

- Módulos completos de **Personas**, **Vehículos**, **Ubicaciones**, **Casos/Incidentes**, **Personal**, **Citatorios/Órdenes**, **Bienes/Evidencias**, **Asuntos Internos**, **CAD/Despacho** y **Barandilla**: alta, consulta, cancelación (nunca borrado) y registro en bitácora.
- **CAD / Despacho**: atención de llamadas con georreferencia (mapa) y despacho de unidades (oficial + patrulla) con seguimiento de estado (Enterado → En Ruta → En el Lugar → Cerrado). **Barandilla**: registro de custodia ligado a Personas. Las integraciones de telefonía/radio/CCTV en tiempo real quedan para el despliegue on-premise de cada agencia.
- **Incidentes** (`/incidentes`): informe de incidente levantado a partir de un reporte de CAD (hereda su ubicación), con estado, narrativa, mapa, fotos, vínculos y **novedades** (append-only). Es la base que consumirá la app móvil del policía.
- **App móvil (Expo, Android)** en `mobile/`: rediseño "Consola de Operaciones" con Inicio (8 indicadores), Perfil (Mi elemento / Mi unidad / Mi bodycam / accesos / Recordatorios de turno), consulta rápida, Mis incidentes, **Tareas asignadas** (con respuestas), informe de incidente / accidente / abordamiento con **fotos**, mapa (Leaflet en WebView), **estatus de unidad**, **Enviar Alerta** (pánico) y **push** de despachos/tareas.
- **Vista de bitácora** (`/bitacora`) para supervisor/administrador: consulta con filtros (acción, módulo) de todo el registro de auditoría, con resolución de nombre de usuario.
- **Equipo policial** (`/equipo`): inventario de armas, radios, bodycams, patrullas y motos, asignable a personal, con fotos.
- **Foliador único y administrable**: cada módulo con folio recibe uno automático `AAAA + II + NNNNNN` (año + iniciales del módulo + consecutivo de 6 dígitos, reinicio anual). Se administra en `/admin` (solo administrador): iniciales por módulo y ajuste de consecutivos.
- **Módulo de administración** (`/admin`): gestión de los foliadores y de **usuarios y roles** (`/admin/usuarios`) — el administrador asigna rol (oficial/supervisor/investigador/asuntos_internos/administrador) y activa/desactiva usuarios, con guard anti-autobloqueo.
- **Asuntos Internos** con **RLS estricta por rol**: solo el rol `asuntos_internos` (o `administrador`) puede ver/gestionar estos registros; deliberadamente NO se exponen en vínculos ni fotos por confidencialidad. Cifrado por registro pendiente para producción.
- **Evidencias** con fotos y **cadena de custodia inmutable (append-only / WORM)**: cada movimiento (recolección, traslado, análisis, entrega, devolución, destrucción) queda registrado y no se puede editar ni borrar; se refuerza a nivel de base de datos con triggers.
- **Citatorios y Órdenes** (aprehensión, cateo, comparecencia) con estado de trámite (emitida → notificada → cumplida → vencida), ligados a casos y personas vía vínculos. La firma electrónica queda pendiente de definir el estándar para producción.
- **Casos** con folio, tipo, prioridad y estado de investigación editable (abierto → en_investigación → cerrado → archivado), que agrupan a las demás entidades vía vínculos.
- **Personal** de la agencia (placa, rango, adscripción, estado laboral) ligado al índice maestro de Personas — no duplica datos biográficos.
- **Fotografías** en Personas y Vehículos: subida a Supabase Storage con captura directa desde la cámara del dispositivo y galería en la ficha.
- **Ubicaciones con mapa**: captura de coordenadas (botón "usar mi ubicación" vía geolocalización del navegador) y mapa con marcador en el detalle (embed de OpenStreetMap, sin API key).
- **Vínculos** entre cualquier par de entidades (persona, vehículo, ubicación, caso, personal, orden), con selector de entidad (búsqueda por etiqueta, sin pegar UUID a mano) y cancelación de vínculos.
- Navegación entre módulos y panel de vínculos reutilizable (`app/components/VinculosPanel.tsx`).
- **CAD / Despacho ampliado**: unidad que atiende en lista/mapa/detalle con colores de estado (Realtime), **cierre de reporte** con conclusión (Atendido/en Falso/Cancelado), **historial de atención** con fecha/hora/usuario y **PDF oficial** imprimible.
- **Accidentes viales** (croquis, vehículos y personas) y **Abordamientos**, en web y móvil.
- **Tareas** (Operaciones): solicitud a unidades en servicio con vigencia, lugar, instrucciones y foto; respuestas Enterado/Atendiendo/Completada y **push** a la app.
- **Bodycam en vivo (WebRTC)**: al Enviar Alerta el teléfono transmite y el despacho ve/**graba como evidencia** (bucket privado `videos` + custodia); señalización por Realtime, TURN Metered; el smartphone se valida/vincula como bodycam tipo *Smartphone*.
- **Bodycam HD local (Android)**: módulo nativo (CameraX + foreground service) que graba HD con la pantalla bloqueada, en **segmentos** que se descargan en la agencia por WiFi como evidencia. Se puede **iniciar desde un módulo** (Informe, Despacho, Tarea, Abordamiento, Accidente) y la evidencia queda **ligada al folio de origen**.
- **Notificaciones push** (Expo + FCM) vía trigger en DB → edge function `enviar_push`.
- **Copiloto IA** (RAG con Claude): edge functions `indexar-ia` / `buscar-ia` / `copiloto`.
- **Panel / Dashboard**: KPIs semanales y anuales, galerías de últimos registros, mapa de reportes abiertos y gráficas de bitácora; se auto-refresca al volver a la pestaña.

## Qué falta (siguiente iteración)

- Confirmar en el proyecto Supabase que `request.headers` expone IP y el header de dispositivo; resolver `computadora_id` con un catálogo de dispositivos registrados por TI.
- **Diferido a producción** (hardening): bucket privado general, firma electrónica de órdenes, grabación de bodycam garantizada aunque nadie observe, protección para que los videos de evidencia no se puedan borrar, cifrado por registro en Asuntos Internos.
- **Opcional**: suscribir el Panel a Supabase Realtime (como el CAD) para actualización en vivo sin re-enfocar la pestaña.
