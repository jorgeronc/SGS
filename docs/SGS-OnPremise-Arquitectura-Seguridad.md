# SGS — Arquitectura, Seguridad y Despliegue On-Premise

**Sistema de Gestión de Seguridad (seguridad privada)**
Documento técnico para el **equipo de TI del cliente**
Arquitectura · Seguridad · Dependencias · Operación · FAQ

**Versión 1.0 · Octubre 2026**

> Propósito: responder las preguntas de arquitectura, seguridad y operación que surgen cuando un cliente quiere SGS **en su propia infraestructura (On-Premise)**. Pensado para arquitectos, seguridad de la información (CISO/SecOps) e infraestructura.

---

## 1. Resumen ejecutivo

SGS es una plataforma web + móvil para operar servicios de seguridad privada (rondines, turnos, monitoreo GPS, control de accesos, videovigilancia, seguridad logística, cumplimiento). Técnicamente se compone de:

- **Aplicación web** (Next.js / React) — la Central de Operaciones.
- **Backend de datos y servicios** (Supabase: PostgreSQL + Auth + Storage + Realtime + Edge Functions).
- **App móvil** (Android, Expo/React Native) para el guardia en campo.

Se ofrece en dos modelos: **SaaS gestionado** (nube) y **On-Premise** (infraestructura del cliente). On-Premise reutiliza los **mismos componentes**, desplegados en servidores del cliente, con las salvedades de las funciones que dependen de servicios de terceros (sección 6).

---

## 2. Arquitectura del sistema (componentes)

| Componente | Tecnología | Función |
|---|---|---|
| **Central de Operaciones (web)** | Next.js 14 (React, TypeScript), SSR/estático | UI de administración, monitoreo, despacho, reportes |
| **Base de datos** | PostgreSQL (vía Supabase) | Fuente de verdad; toda la lógica de negocio vive en SQL (RLS, triggers, folios, auditoría) |
| **Autenticación** | Supabase Auth (GoTrue), JWT | Usuarios, sesiones, **2FA/MFA (TOTP)** |
| **Almacenamiento de archivos** | Supabase Storage (compatible S3) | Fotos, evidencias, video de bodycam, adjuntos de chat (buckets privados) |
| **Tiempo real** | Supabase Realtime (WebSockets) | Mapa en vivo, CAD, chat, estados |
| **Funciones de servidor** | Edge Functions (Deno) | `copiloto` (IA), `crear_usuario`, `enviar_push`, `indexar-ia`, `buscar-ia`, `camara_vista` |
| **App móvil** | Expo SDK 54 / React Native (Android) | Rondines, incidentes, evidencias, control de acceso, alertas |

**Flujo general:** tanto la web como la app móvil hablan **directo** con el backend (Supabase) vía HTTPS/WebSocket usando `@supabase/supabase-js`. **No hay un servidor de aplicación intermedio propietario**: la seguridad y la lógica se aplican en la base de datos (RLS + funciones). Esto simplifica el despliegue on-premise.

```
   [ Web (Next.js) ]         [ App móvil Android ]
            \                        /
             \   HTTPS / WSS        /
              \                    /
        ┌─────────────────────────────────┐
        │   Backend (Supabase)            │
        │  PostgreSQL · Auth · Storage    │
        │  Realtime · Edge Functions      │
        └─────────────────────────────────┘
                     │ (opcional, saliente)
            Servicios de terceros (IA, push, TURN, mapas, VMS)
```

---

## 3. SaaS vs On-Premise

| Criterio | SaaS (nube gestionada) | On-Premise (infra del cliente) |
|---|---|---|
| Dónde viven los datos | Nube gestionada por el proveedor | **Infraestructura del cliente** |
| Quién opera la plataforma | El proveedor | El cliente, con soporte del proveedor (AMS) |
| Actualizaciones | Automáticas y continuas | Por versión, en ventana pactada |
| Costo | Suscripción por guardia/mes | Licencia + implementación + mantenimiento anual (AMS) |
| Funciones que usan internet (IA, cámaras públicas, push, video en vivo, mapas) | Incluidas | Requieren salida a internet controlada o una **alternativa self-host** (sección 6) |
| Tiempo de arranque | Días | Semanas |
| Ideal para | La mayoría | Soberanía de datos, cumplimiento, licitaciones, redes aisladas |

---

## 4. Arquitectura de referencia On-Premise

### 4.1 Stack desplegado por el cliente

Todo corre en **contenedores (Docker/Podman)** sobre servidores Linux del cliente:

- **Supabase self-hosted** (stack oficial en Docker): PostgreSQL, GoTrue (Auth), Storage API, Realtime, Kong (API gateway), Edge Runtime (Deno).
- **Aplicación web SGS** (Next.js) como contenedor Node, detrás de un **reverse proxy** (Nginx/Traefik) con **TLS**.
- **Almacenamiento de objetos**: Supabase Storage respaldado por disco local o un **S3 compatible on-prem** (p. ej. MinIO) para fotos/evidencias/video.
- **App móvil**: el APK se distribuye internamente (MDM/EMM del cliente o APK firmado); apunta por configuración a la URL del backend on-prem.

### 4.2 Requisitos de infraestructura (orientativos)

| Recurso | Mínimo sugerido (piloto / < 100 guardias) | Producción (según volumen) |
|---|---|---|
| SO | Linux x86-64 (Ubuntu/RHEL) con Docker | Igual, con orquestación (Compose/K8s) |
| CPU / RAM | 4 vCPU / 16 GB | Escalar por carga (DB + Realtime + Storage) |
| Disco | SSD; el **video/evidencia** domina el crecimiento | Dimensionar por política de retención (sección 7) |
| Red | TLS, DNS interno, reverse proxy | Alta disponibilidad / balanceo opcional |
| Respaldo | Backups de PostgreSQL + bucket de archivos | DR con réplica/off-site |

> El dato que más crece es el **video (bodycam/transmisiones) y las evidencias**; el dimensionamiento de disco se hace a partir de la **política de retención** acordada.

### 4.3 Red, puertos y exposición

- La web y la API se publican por **HTTPS (443)** detrás del reverse proxy del cliente.
- Realtime usa **WebSocket Secure (WSS)** sobre el mismo 443.
- La app móvil solo necesita alcanzar la **URL del backend** (si los guardias operan fuera de la red interna, se expone vía DMZ/VPN/reverse proxy, a criterio del cliente).
- Salida a internet: **solo** la requieren las funciones de la sección 6, y puede restringirse por lista blanca de hosts o deshabilitarse.

---

## 5. Seguridad (lo que TI siempre pregunta)

### 5.1 Autenticación
- **Supabase Auth (GoTrue)** con tokens **JWT** de corta vida y refresh.
- **2FA/MFA obligatorio (TOTP, nivel aal2)** para la web en rutas no públicas: sin segundo factor no se accede a la operación.
- En el móvil, las funciones de mando (Buscar, Supervisión) solo las ve supervisor o superior; el dispositivo se valida como bodycam-smartphone del elemento.

### 5.2 Autorización (control de acceso a datos)
- **RLS (Row Level Security) activo en todas las tablas núcleo**: cada consulta la filtra PostgreSQL según el **rol** y la identidad del usuario, no la aplicación. Aunque alguien obtuviera el token anónimo, la base no entrega lo que el rol no puede ver.
- **Roles**: oficial/guardia, supervisor, investigador, operador, coordinador, administrador, asuntos internos. Permisos por rol; `asuntos_internos` es el más restringido.

### 5.3 Integridad y no-repudio (WORM)
- **Nada se borra**: los registros se **cancelan con motivo** (un trigger bloquea los `DELETE` y se revoca el permiso de borrado). La operación es **append-only**.
- **Cadena de custodia** estrictamente append-only (no admite update ni delete).
- **Folios automáticos** por módulo (el usuario nunca teclea folios).
- **Bitácora de auditoría** por tabla: registra altas, cambios (valores **antes/después** completos), cancelaciones y consultas, con usuario, fecha e IP/dispositivo. Exportable a CSV/Excel **solo por administrador**. Retención configurable.

### 5.4 Cifrado
- **En tránsito**: TLS (HTTPS/WSS) en todo el perímetro; responsabilidad del reverse proxy del cliente (certificados propios o CA interna).
- **En reposo**: cifrado a nivel de disco/volumen y de PostgreSQL según la política del cliente (p. ej. LUKS/cifrado de almacenamiento, TDE). On-prem queda **bajo control del cliente**.
- **Secretos** (llaves de terceros, claves de servicio): se inyectan como variables de entorno/secretos del orquestador; nunca viajan al navegador salvo las claves públicas por diseño (anon key, que de por sí está gobernada por RLS).

### 5.5 Aislamiento y soberanía de datos
- On-Premise, **todos los datos operativos y el video/evidencia residen en la infraestructura del cliente**.
- El video de cámaras **no se almacena por diseño**: la señal se resuelve al momento; la grabación de evidencia (bodycam/transmisión) sí se guarda, en el **Storage del cliente**.

### 5.6 Gestión de identidades corporativas (SSO/Directorio)
- La base es Supabase Auth (usuarios locales + 2FA). La integración con **SSO (SAML/OIDC) o directorio corporativo (LDAP/AD)** se **evalúa por proyecto** según la versión de Supabase desplegada y los requisitos del cliente.

---

## 6. Dependencias externas y cómo se manejan On-Premise

Esta es la parte clave para una red aislada. Algunas funciones usan servicios de terceros; para on-prem cada una tiene **modo conectado** (con salida a internet controlada) o **alternativa self-host / deshabilitar**.

| Función | Servicio de terceros | ¿Requiere internet? | Alternativa On-Premise |
|---|---|---|---|
| **Copiloto IA** (asistente sobre los datos) | Anthropic (API del modelo) | Sí (llave + salida HTTPS) | Deshabilitar el módulo, o evaluar un LLM self-host (por proyecto) |
| **Notificaciones push** (tareas, despachos, chat, relevo) | FCM (Google) + Expo | Sí | Operar con avisos **in-app**/Realtime; push externo requiere FCM |
| **Video en vivo / alerta de pánico** (WebRTC) | TURN (Metered) | Sí, salvo self-host | **coturn self-host** dentro de la red del cliente |
| **Mapas base** (Mapa Operacional, dashboards) | Protomaps / OpenFreeMap / OSM | Sí, salvo self-host | **Tiles self-host (PMTiles/OSM)**: variable `NEXT_PUBLIC_PMTILES_URL` apunta a un servidor interno → mapas **100% offline** |
| **Geocodificación / direcciones** | LocationIQ (y Nominatim fallback) | Sí, salvo self-host | **Nominatim self-host** sobre datos OSM |
| **Videovigilancia — cámaras públicas de demo** | Windy (webcams) | Sí | No aplica en producción del cliente: se usan **sus cámaras** (NVR/DVR o VMS) |
| **Integración VMS** (video real) | ISS SecurOS / Milestone / Genetec | No (es del cliente) | Se conecta al **VMS on-prem del cliente**; habilita video en vivo real, PTZ, grabación y analítica |

**Modos de operación on-prem:**
- **Conectado (recomendado):** salida a internet restringida por **lista blanca** a los hosts de las funciones que el cliente quiera conservar (IA, push, mapas). Todo lo demás, interno.
- **Aislado / air-gapped:** sin salida a internet. Se habilitan los **self-host** (tiles PMTiles, Nominatim, coturn) y la integración con el **VMS del cliente**; se desactivan Copiloto IA y push externo (o se sustituye push por avisos in-app). La operación central —rondines, GPS, turnos, accesos, incidentes, evidencias, reportes— **funciona completamente aislada**.

---

## 7. Datos: retención, respaldo y recuperación

- **Modelo de datos**: PostgreSQL con esquema versionado por migraciones. WORM (cancelación, no borrado) por diseño.
- **Retención**: configurable por política (p. ej. bitácora N días; video/evidencia por meses). El cliente define los periodos; dimensiona el disco en consecuencia.
- **Respaldo**: backup de PostgreSQL (dump/PITR) + respaldo del bucket de archivos (fotos/evidencias/video). Frecuencia y ventana a criterio del cliente.
- **Recuperación ante desastres (DR)**: réplica de base y copia off-site del almacenamiento; RTO/RPO a definir en el proyecto.

---

## 8. Actualizaciones, versionado y soporte

- **Versionado por release**: las actualizaciones on-prem se aplican en **ventanas pactadas** (a diferencia del SaaS, que es continuo).
- **Esquema**: cambios de base de datos como **migraciones SQL** numeradas y auditables.
- **AMS (mantenimiento anual)**: incluye actualizaciones y soporte; sin AMS no hay actualizaciones ni soporte.
- **App móvil**: nuevas versiones se compilan y se distribuyen internamente (MDM/EMM o APK firmado).

---

## 9. Operación (para el equipo de TI)

- **Observabilidad**: logs de la app web, de Supabase (API, Auth, Storage, Realtime) y de las Edge Functions; métricas de PostgreSQL. Se integran a la herramienta del cliente.
- **Alta disponibilidad (opcional)**: réplica de PostgreSQL, múltiples instancias de la web tras el balanceador, almacenamiento redundante.
- **Hardening**: TLS obligatorio, segmentación de red (DB no expuesta), rotación de secretos, principio de menor privilegio en los contenedores.

---

## 10. Responsabilidades (cliente vs proveedor)

| Área | Cliente (TI) | Proveedor (SGS) |
|---|---|---|
| Infraestructura (servidores, SO, Docker, red, TLS) | ✓ | Guía/arquitectura de referencia |
| Backups, DR, monitoreo | ✓ | Recomendaciones |
| Integración con VMS/SSO/directorio | ✓ (sus sistemas) | Soporte de integración |
| Despliegue y configuración de SGS | Apoyo | ✓ |
| Actualizaciones (AMS) | Ventana | ✓ |
| Capacitación y onboarding | Participa | ✓ |

---

## 11. Preguntas frecuentes del equipo de TI (FAQ)

**¿Dónde quedan nuestros datos?** En On-Premise, en **su infraestructura**; el proveedor no los aloja.

**¿Funciona sin internet?** La operación central (rondines, GPS, turnos, accesos, incidentes, evidencias, reportes) **sí**, en modo aislado. Las funciones que dependen de terceros (IA, push externo, mapas/geo, video TURN) requieren salida a internet **o** su alternativa self-host (sección 6).

**¿Cómo controlan el acceso a los datos?** Con **RLS en PostgreSQL** (la base filtra por rol en cada consulta) + **2FA obligatorio** en la web + roles diferenciados. No hay un backend propietario que puentee la base.

**¿Se puede borrar o alterar un registro?** No: **WORM**. Se cancela con motivo; la cadena de custodia es append-only; la bitácora guarda antes/después. Todo auditable y exportable por administrador.

**¿Cómo se cifra la información?** En tránsito con TLS (su reverse proxy / sus certificados); en reposo con el cifrado de disco/DB que ustedes definan. Los secretos se gestionan como variables del orquestador.

**¿Integra con nuestro VMS/CCTV?** Sí: **ISS SecurOS ya disponible**; Milestone/Genetec por proyecto. Se conecta al VMS **on-prem del cliente** (video en vivo real, PTZ, grabación, analítica).

**¿Integra con nuestro directorio (AD/LDAP) o SSO?** Se **evalúa por proyecto** sobre Supabase Auth.

**¿Qué puertos exponemos?** Esencialmente **443 (HTTPS/WSS)** detrás de su reverse proxy. La base de datos **no se expone** a la red.

**¿Cómo se actualiza?** Por **release en ventana pactada**; esquema por migraciones; cubierto por el AMS.

**¿Qué pasa con el video?** El de cámaras **no se almacena** (señal al momento); la grabación de evidencia (bodycam/transmisión) se guarda en **su** almacenamiento, con cadena de custodia.

**¿La app del guardia necesita nuestra red?** Solo necesita alcanzar la **URL del backend**. Si operan fuera de la red interna, ustedes deciden cómo exponerla (DMZ/VPN/reverse proxy).

---

*SGS — Arquitectura, Seguridad y Despliegue On-Premise · Documento técnico para TI · v1.0 · Octubre 2026*
