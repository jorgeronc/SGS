# SGS vs. Clave 10 — Comparativa / Benchmark

**Fecha:** Septiembre 2026
**Fuentes:** funcionalidad de **SGS** según el sistema construido; funcionalidad de **Clave 10** según su sitio público (clave10.com) a esta fecha — nivel *marketing*, no evaluación práctica. Se marca "s/i" cuando no hay información pública suficiente.

---

## 1. Posicionamiento (importante antes de comparar)

Los dos sistemas **no atacan exactamente al mismo comprador**:

- **SGS** está diseñado para la **empresa que PRESTA el servicio de seguridad** (guardias, rondines, clientes/sitios, SLA por cliente) y añade un módulo fuerte de **Seguridad Logística / custodia de carga** (CEDIS y transporte). Su eje es *demostrarle al cliente que el servicio se cumple* (evidencia, GPS, cumplimiento).
- **Clave 10** está orientado a la **empresa que administra su PROPIA seguridad patrimonial e industrial** ("tu empresa, tus ubicaciones"), con foco en **control de accesos, rondines, incidencias, artículos (paquetería/concesión/extravío)** y, de forma diferenciada, **gestión de contratistas (Seguridad Industrial / EHS)**. Está *powered by Linkaform* y presume integraciones con Oracle, SAP, Odoo, Power BI y Tableau.

**Conclusión de posicionamiento:** SGS es más profundo en *operación de guardias verificable + logística*; Clave 10 es más amplio en *seguridad corporativa in-house + contratistas + integraciones BI/ERP*.

---

## 2. Tabla comparativa

Leyenda: ✓ = sí / robusto · ◑ = parcial o básico · ✗ = no lo tiene · s/i = sin información pública.

| Capacidad | SGS | Clave 10 |
|---|:--:|:--:|
| **Control de accesos (personas/vehículos)** | ✓ | ✓ |
| **Pases / credenciales con QR** | ✓ (QR/NFC/temporal, plantillas, credencial visitante QR 12 h) | ✓ (pases QR) |
| **Citas / pre-registro de visitantes** | ✓ (link de un solo uso, autoregistro + vehículo, emite credencial) | ✓ (pre-registro de visitas) |
| **Rondines por QR/NFC** | ✓ | ✓ |
| **Rondines por geocerca (sin QR/NFC)** | ✓ (validación solo GPS por permanencia) | s/i (no anunciado) |
| **Trayecto GPS / playback del recorrido** | ✓ (real vs esperado, anomalías) | s/i |
| **Inspecciones (checklist en app)** | ✓ | ✓ |
| **Reporte de incidencias** | ✓ (con despacho/CAD y video) | ✓ |
| **Gestión de turnos de guardias** | ✓ (rol por sitio, tipos de turno) | ✓ |
| **Anti-fatiga (turnos encadenados)** | ✓ (bloqueo + relevo forzado auditado) | s/i |
| **Relevo automático (detección de descubiertos)** | ✓ (chat + push a central/coordinador/supervisor) | s/i |
| **Monitoreo en vivo en mapa (guardias/sitios/cámaras)** | ✓ | s/i (no anunciado como mapa en vivo) |
| **Videovigilancia (cámaras) integrada** | ✓ (consola, muro, snapshot→evidencia; lista para VMS) | ✗ (no lo ofrecen) |
| **Video en vivo / bodycam (WebRTC + HD local)** | ✓ | ✗ |
| **Alerta/emergencia con despacho** | ✓ | s/i |
| **Seguridad Logística / custodia de carga** | ✓ (movimientos, sellos, riesgo, gate de liberación) | ✗ (no es su alcance) |
| **Gestión de contratistas (Seguridad Industrial/EHS)** | ✗ | ✓ (módulo dedicado: documentos, normas, órdenes de servicio) |
| **Artículos perdidos / concesión / paquetería** | ✗ | ✓ (módulo dedicado) |
| **Índice de cumplimiento / SLA por cliente** | ✓ | s/i (no orientado a proveedor de seguridad) |
| **Reporte de horas (normales/extra) por cliente** | ✓ | s/i |
| **Asistente con IA (copiloto sobre los datos)** | ✓ | ✗ (no anunciado) |
| **App móvil** | ✓ (Android; iOS por TestFlight) | ✓ (iOS y Android publicadas) |
| **Operación offline (sin datos móviles)** | ✓ | ✓ |
| **Auditoría / bitácora inmutable** | ✓ (antes/después completo, retención, export admin) | ◑ (bitácoras y registros para auditorías; alcance s/i) |
| **Integraciones BI/ERP (Power BI, SAP, Oracle, Tableau, Odoo)** | ◑ (vía API/Supabase; no listadas como conectores) | ✓ (anunciadas; "módulo open source") |
| **Multi-ubicación / multi-cliente** | ✓ (clientes → sitios) | ✓ (multi-ubicación) |
| **Web (central) + móvil** | ✓ | ✓ |
| **Sin servidores propios (nube)** | ✓ | ✓ |

---

## 3. Dónde gana SGS

- **Rondín verdaderamente verificable:** validación **por GPS** (dentro del radio del punto) **y por geocerca sin QR/NFC** para áreas amplias, con **trayecto/playback** real vs esperado y detección de anomalías. Es evidencia del *cómo*, no solo del *dónde*.
- **Operación del proveedor de seguridad:** **SLA/Índice de cumplimiento por cliente** y **reporte de horas (normales/extra) por cliente** — pensado para retener contratos y facturar/nominar, algo que un sistema in-house no necesita resolver.
- **Continuidad del servicio:** **relevo automático** (detecta posiciones descubiertas y escala solo, con push) + **anti-fatiga** en el rol de turnos. Clave 10 no anuncia nada equivalente.
- **Video:** **videovigilancia integrada** (consola, muro, snapshot→evidencia, listo para VMS) y **video en vivo/bodycam (WebRTC + grabación HD local)**. Clave 10 no ofrece video.
- **Seguridad Logística / custodia de carga:** módulo completo (movimientos, inspecciones, sellos, riesgo y **gate de liberación** que impide salir sin cumplir el protocolo) — fuera del alcance de Clave 10.
- **Monitoreo en vivo en mapa** (guardias + cámaras + incidencias) y **copiloto con IA** sobre los propios registros.

## 4. Dónde gana Clave 10 (o SGS aún no tiene)

- **Gestión de contratistas / Seguridad Industrial (EHS):** documentos del contratista, cumplimiento de normas y **órdenes de servicio** — un módulo que **SGS no tiene**. Es su mayor diferenciador para el comprador industrial/corporativo.
- **Artículos perdidos, en concesión y paquetería:** control y bitácora de lost & found / consignación / paquetería — **SGS no lo tiene**.
- **Integraciones BI/ERP listas y visibles:** Power BI, Tableau, SAP, Oracle, Odoo, y ser un "**módulo open source**"/API abierta. SGS puede integrarse por API, pero **no ofrece conectores empaquetados** a esas herramientas.
- **App publicada en iOS y Android** de forma abierta; SGS aún distribuye iOS por TestFlight (interno).
- **Tracción/mercado:** Clave 10 muestra logos de clientes y testimonios; SGS es más nuevo comercialmente.

## 5. Recomendaciones para SGS (cerrar brechas)

Priorizadas por impacto comercial:

1. **Módulo de contratistas (EHS ligero):** expediente del contratista con documentos y vigencias, validación de requisitos antes del acceso y **orden de servicio** — reutilizable con el control de accesos y credenciales que ya existen. Cierra la brecha más visible frente a Clave 10.
2. **Artículos: paquetería / concesión / extravío:** un módulo de "artículos" (folio, estatus, resguardo, historial) apoyado en el patrón de catálogos + WORM que ya usa SGS.
3. **Conectores BI:** exponer una vista/So dataset para **Power BI/Looker/Tableau** (Supabase ya permite lectura vía API/Postgres) y documentarlo como "conector".
4. **Publicar iOS** (App Store) para paridad de distribución.
5. **Material de tracción:** casos, logos y testimonios (cuando la demo/piloto lo permita).

## 6. Conclusión

Para una **empresa que vende servicio de seguridad** (guardias, rondines verificables, custodia de carga, evidencia y SLA por cliente), **SGS es más completo y profundo**, sobre todo por el rondín GPS/geocerca con trayecto, el relevo automático, el video integrado y la Seguridad Logística. Para una **empresa que administra su propia seguridad patrimonial e industrial** con fuerte necesidad de **contratistas/EHS, artículos/paquetería e integraciones BI**, **Clave 10 cubre esas áreas que hoy SGS no tiene**. Las tres brechas a cerrar (contratistas, artículos y conectores BI) son abordables sobre la base actual de SGS.

---

*SGS — Comparativa vs. Clave 10 · documento de referencia · Septiembre 2026. Datos de Clave 10 tomados de su sitio público; conviene validarlos en una demo antes de usarlos con un cliente.*
