# SGS — Sistema de Gestión de Seguridad

Plataforma **web + móvil** para empresas de **seguridad privada**: rondines verificables, rol de turnos, monitoreo GPS en vivo, control de accesos, videovigilancia, **seguridad logística (custodia de carga)**, cumplimiento/SLA y más.

Monorepo con tres entregables, todos conectados **directo a Supabase** (Postgres + Auth + Storage + Realtime); no hay servidor API intermedio.

| Componente | Carpeta | Stack | Despliegue |
|---|---|---|---|
| Web (Central de Operaciones) | `frontend/` | Next.js 14 (App Router, TS) | **Vercel** (proyecto `sgs`, Root = `frontend`; push a `main` = deploy → `sgs-two-phi.vercel.app`) |
| Móvil (guardia en campo) | `mobile/` | Expo SDK 54 / RN 0.81 | **EAS** (`sgs-movil`, APK Android) |
| Backend | `supabase/` | Postgres (migraciones `0001`–`0132`) + Edge Functions (Deno) | Supabase (ref `rdyjjfbehjfggpldmmur`) |

> **Repo GitHub:** `jorgeronc/SGS` · **Branding:** igual al diseño base salvo los **botones en naranja claro** (`--sc-btn: #f4a03f` en `globals.css`).
>
> **Guía para contribuir** (comandos, arquitectura y convenciones): `CLAUDE.md`. **Documentación** (funcional, comercial, técnica): carpeta `docs/` (ver abajo).

> **Alcance:** SGS es un **fork puro** de un sistema previo (SCP, policial). Los módulos policiales quedaron **dormidos a propósito** (sus tablas existen en la BD porque se corrieron todas las migraciones, pero sin UI). Lo nuevo de SGS vive en las migraciones `0050+`. No se tocan ni se reactivan los módulos policiales.

---

## Estructura

```
SGS/
├── supabase/
│   ├── migrations/      0001…0132 — se corren MANUALMENTE en orden en el SQL Editor
│   │                    (core, bitácora, WORM, RLS, folios, CAD, foliador… y 0050+ el dominio SGS:
│   │                     sitios, turnos, puntos de control, rondines, relevos, control de accesos,
│   │                     seguridad logística, videovigilancia, citas de visitantes, contratos, RBAC…)
│   ├── functions/       Edge Functions (Deno): crear_usuario, copiloto, enviar_push,
│   │                    indexar-ia, buscar-ia, camara_vista
│   └── seed.sql         Datos de prueba (opcional)
├── frontend/            Next.js 14 (App Router) — Central de Operaciones (web)
│   ├── app/             rutas + components/ (AppShell, ListaMaestra, VinculosPanel…)
│   ├── lib/             supabaseClient, types, config, geo (LocationIQ), turn (WebRTC), mapStyle…
│   └── .env.example
├── mobile/              Expo / React Native — app del guardia en campo
│   ├── src/screens/ · src/lib/ · src/components/ · modules/bodycamhd (módulo nativo Android)
│   └── app.json · eas.json
└── docs/                Documentación (ver sección "Documentación")
```

---

## Puesta en marcha

### Paso 1 — Backend (Supabase)
1. En el proyecto Supabase, **SQL Editor** → ejecutar en orden el contenido de cada archivo de `supabase/migrations/` (`0001` … `0132`). Las migraciones se aplican **manualmente** (no se auto-corren). Al agregar esquema, crear el siguiente archivo numerado y correrlo.
2. En **Authentication → Users**, crear un usuario de prueba; el trigger de perfil le asigna un rol inicial. Para dejarlo `administrador`, editar su fila en `usuarios_perfil` desde **Table Editor** la primera vez.
3. En **Settings → API**, copiar `Project URL` y `anon public key`.

### Paso 2 — Frontend (web)
```bash
cd frontend
cp .env.example .env.local      # editar con la URL y anon key del paso 1
npm install
npm run dev                     # servidor de desarrollo en el puerto 3100
```
Abrir `http://localhost:3100`, iniciar sesión y probar un módulo. **Verificación real** = `npm run build` (atrapa errores que `tsc` no ve, p. ej. `useSearchParams` sin `<Suspense>`).

### Paso 3 — Móvil
```bash
cd mobile
npx tsc --noEmit                                        # typecheck
npx eas-cli build --profile preview --platform android # APK instalable
```
Las dependencias nativas (WebRTC, push, bodycam HD, NFC) **no** funcionan en Expo Go — requieren un build de EAS. Las variables del móvil vienen de **EAS environments**, no de `eas.json`.

### Paso 4 — Producción On-Premise
El mismo esquema SQL y el mismo frontend se despliegan contra una instancia de **Supabase auto-hospedado** (Docker). Detalle de arquitectura, seguridad y dependencias: `docs/SGS-OnPremise-Arquitectura-Seguridad.md`.

---

## Ya construido (dominio SGS)

Resumen por área (inventario completo en `docs/SGS-Modulos-y-Funciones.md`):

- **Panel e indicadores** — tablero operativo y de dirección; **Copiloto IA** (RAG con Claude); **Índice de Cumplimiento y SLA** por cliente; tablero de **Supervisores**.
- **Central / Despacho (CAD)** — atención de incidencias, despacho, estados en vivo (Realtime) y vista imprimible; **alerta de pánico** desde el móvil con video en vivo.
- **Mapa Operacional** — mapa en vivo multicapa (guardias con estatus, sitios, puntos, incidencias, cámaras).
- **Videovigilancia** — consola, muro (hasta 24 cámaras), inspector por cámara (snapshot→evidencia, crear incidente); **integración con ISS SecurOS** ya disponible.
- **Vigilancia en sitio** — Sitios/puestos con geocerca, Puntos de control (QR/NFC/geocerca), **Rondines** verificados con playback, **Supervisión de rondines**, **Rol de turnos** (anti-fatiga, relevo forzado) y **relevo automático de descubiertos** (chat + push).
- **Tareas** — por sitio o guardia, con recurrencia y evidencia (foto/bodycam/audio).
- **Control de Acceso** — bitácora de accesos, **Citas CEDIS** (vehículos/andenes), **Citas de visitantes** (autoregistro + credencial QR 12 h), **Credenciales** (QR/NFC/temporal), zonas por horario.
- **Seguridad Logística (custodia de carga)** — Vista Operativa por etapas con gate de **Liberación de seguridad**, movimientos, inspecciones, sellos, activos y unidades de carga.
- **Contratos** — gestión por cliente con estados y control de vencimientos, y tablero.
- **Administración** — Clientes, Guardias (personal), Bienes (unidades/armamento/comunicación/smartphones), catálogos, **usuarios y roles (RBAC)**, parámetros (GPS, retención) y **bitácora de auditoría** (antes/después, export admin).
- **App móvil (guardia/supervisor)** — Inicio/Mi turno (gate de sesión por turno), Rondín (QR/NFC/geocerca, offline), Tareas, Control de acceso en caseta, Incidentes, Inspecciones, Supervisión, **Bodycam** (HD local + transmisión WebRTC) y Chat.

**Transversales:** WORM (nada se borra; se cancela con motivo), folios automáticos, RLS por rol, 2FA (aal2) en la web, Realtime, push (Expo/FCM), anti-fatiga, operación sin datos móviles, mapas MapLibre/Leaflet, nube sin servidores propios.

---

## Documentación (`docs/`)

| Documento | Para qué |
|---|---|
| `docs/SGS-Modulos-y-Funciones.md` | **Documento técnico**: inventario funcional de todos los módulos |
| `docs/SGS-OnPremise-Arquitectura-Seguridad.md` | Arquitectura, seguridad y despliegue **On-Premise** (para TI del cliente) |
| `docs/SGS-Secure-Access.md` | Acceso móvil passwordless (NFC + biometría) — especificación |
| `docs/SGS-Integracion-SecurOS-ISS.md` | Integración de videovigilancia con ISS SecurOS |
| `docs/gps-guardias.md` | GPS en vivo de guardias |
| `docs/venta/` | Material **comercial**: Propuesta, Precios, Flujo Operativo, comparativa y **presentación (.pptx)** |

Los `.docx`/`.pptx` se generan desde los `.md` con `docs/tools/build-docx.sh`, `docs/venta/tools/build-docx.sh` y `docs/venta/tools/gen-presentacion.js`.

---

## Qué falta (hardening / siguiente iteración)

- Confirmar en Supabase que `request.headers` expone IP y header de dispositivo; resolver `computadora_id` con un catálogo de dispositivos registrados por TI.
- **SGS Secure Access** (login passwordless NFC + biometría): especificado, **no implementado** aún (ver `docs/SGS-Secure-Access.md`).
- Opcional: suscribir el Panel a Realtime para actualización en vivo sin re-enfocar la pestaña.
