# SGS — Precios (uso interno)

**Sistema de Gestión de Seguridad · Plataforma integral para seguridad privada**
Lista de precios, costos y márgenes · SaaS (nube) · On-Premise · Add-ons

**Documento interno — no compartir** · **Interno v1.4 · Noviembre 2026**

> Incluye costos por servicio y márgenes. Las cifras de **costo** son un MARCO estimado: sustitúyelas por tus tarifas reales antes de decidir precios.

---

## 1. Cómo se cobra

**Métrica de valor: por guardia activo al mes.** La Central de Operaciones (web) va incluida; no se cobra aparte.

- **Guardia activo:** elemento con la app usada en el mes.
- **Mínimo de facturación:** 25 guardias.
- **Compromiso anual = 2 meses gratis** (se pagan 10 de 12). Facturación mensual o anual prepagada.
- **Onboarding único** (configuración + capacitación) según tamaño. App Android incluida; **branding** del cliente es extra único.

> Precios lista sugerida en MXN, sin IVA. Ajustables por volumen y compromiso.

---

## 2. Planes SaaS (nube)

Tres planes; cada uno incluye lo del anterior. Precio **por guardia activo al mes**.

| | Esencial | Profesional | Empresarial |
|---|---|---|---|
| **Precio /guardia/mes (MXN)** | **$89** | **$159** | **$269** |
| Rondín QR + GPS | ✓ | ✓ | ✓ |
| Turnos, clientes/sitios, tareas, chat, evidencias | ✓ | ✓ | ✓ |
| Tableros (Operación + Dirección) | Básico | ✓ | ✓ |
| NFC + geocerca (anti-fraude) | — | ✓ | ✓ |
| Monitoreo en vivo multicapa | Básico | ✓ | ✓ |
| Supervisión + reporte PDF al cliente | — | ✓ | ✓ |
| Alerta de pánico + video en vivo + bodycam | — | ✓ | ✓ |
| Control de accesos (personas + credenciales) | — | ✓ | ✓ |
| **Gestión de contratos (estados + vencimientos + tablero)** | — | ✓ | ✓ |
| Control de accesos CEDIS (vehículos, citas, andenes) | — | Add-on | Add-on |
| **Seguridad Logística — custodia de carga** (movimientos, inspecciones, sellos, Vista Operativa) | — | Add-on | Add-on |
| Videovigilancia (consola + muro de cámaras) | — | Add-on | ✓ (10 incl.) |
| **Integración VMS (ISS SecurOS)** | — | Add-on (proyecto) | Add-on (proyecto) |
| Copiloto IA | — | Add-on | ✓ (cupo) |
| Índice de Cumplimiento + SLA + reporte mensual | — | — | ✓ |
| Retención de video/evidencia | 30 días | 90 días | 12 meses |
| Soporte | Correo | Correo + chat | Prioritario + SLA |

**Descuento por volumen (sugerido):** 100+ guardias −5%, 300+ −10%, 1,000+ negociado. Se acumula con el anual prepagado.

---

## 3. Add-ons y consumos

Los complementos con costo variable real se miden aparte para mantener el precio base bajo.

| Add-on | Precio (MXN) | Nota |
|---|---|---|
| Control de accesos CEDIS | $690 /sitio/mes | Citas, andenes, vehículos y zonas (además del acceso de personas, ya incluido en Profesional+). |
| **Seguridad Logística (custodia de carga)** | **por definir** (sugerido $/sitio/mes o $/movimiento) | Movimientos, inspecciones, sellos, riesgo y Vista Operativa con gate de liberación. Incluye el acceso ligado al movimiento. Definir métrica (por sitio vs. por movimiento) y tarifa real. |
| Tablero ejecutivo (Índice + SLA) | $1,200 /mes | Reporte mensual de cumplimiento por cliente; incluido en Empresarial. |
| Videovigilancia | $49 /cámara/mes | Empresarial incluye 10; cámaras extra a este precio. Consola e inspector incluidos. |
| **Integración VMS (ISS SecurOS / Milestone / Genetec)** | **por proyecto** (servicios profesionales) | SecurOS ya disponible; se cotiza implementación + conexión por alcance. Posible fee recurrente de integración a definir. |
| Copiloto IA | $1,500 /mes por paquete | O por consumo; cubre el costo del proveedor de IA. |
| Gestión de contratos | incluida en Profesional+ | Sin costo de terceros; sube valor del plan. |
| Almacenamiento extra de video | por GB/mes | Sobre la cuota incluida del plan (evidencia/bodycam). |
| Transmisión en vivo (TURN) | Fair-use; excedente medido | Video WebRTC de las alertas de pánico. |
| Branding del cliente (logo/colores) | Único | Personalización de la app y la web. |

---

## 4. On-Premise (en infraestructura del cliente)

Para clientes que exigen datos en su propia infraestructura (gobierno, corporativos sensibles, licitaciones). Licencia anual por banda + implementación + soporte.

| Banda (guardias) | Licencia anual (MXN) | Implementación única (MXN) |
|---|---|---|
| Hasta 100 | $360,000 | desde $180,000 |
| 101–300 | $780,000 | desde $260,000 |
| 301–1,000 | $1,600,000 | desde $400,000 |
| 1,000+ | A la medida | A la medida |

**Soporte y mantenimiento anual (AMS):** 20% de la licencia (actualizaciones + soporte). Sin AMS no hay actualizaciones ni soporte.

> **Salvedad técnica:** en on-prem "aislado", las funciones que dependen de terceros —Copiloto IA, Videovigilancia, integración VMS, notificaciones push, video en vivo (TURN) y mapas/geocodificación— requieren llaves propias y salida a internet, o una alternativa self-host. Se activan como módulos.

---

## 5. SaaS vs On-Premise

| Criterio | SaaS (nube) | On-Premise |
|---|---|---|
| Dónde viven los datos | Nube gestionada | Infraestructura del cliente |
| Quién opera la infraestructura | Nosotros | El cliente (con nuestro soporte) |
| Costo inicial | Bajo (onboarding) | Alto (licencia + implementación) |
| Costo recurrente | Suscripción /guardia/mes | AMS anual (20%) |
| Actualizaciones | Automáticas y continuas | Por versión, en ventana pactada |
| Funciones que usan internet (IA, cámaras, push, video) | Incluidas | Requieren llaves/salida a internet |
| Tiempo de arranque | Días | Semanas |
| Ideal para | La mayoría; crecer rápido | Soberanía de datos / licitación |

---

## 6. Ejemplos de cuenta (SaaS)

| Escenario | Cálculo | Mensual (MXN) |
|---|---|---|
| Pequeña — 30 guardias, Esencial | 30 × $89 | $2,670 |
| Mediana — 120 guardias, Profesional + 15 cámaras | 120 × $159 + 15 × $49 | $19,815 |
| CEDIS — 60 guardias, Profesional + accesos CEDIS (2 sitios) | 60 × $159 + 2 × $690 | $10,920 |
| Grande — 400 guardias, Empresarial | 400 × $269 | $107,600 |

> Anual prepagado: la cuenta mediana paga 10 meses ≈ $198,150/año (2 meses gratis). El onboarding único se cobra aparte.

---

## 7. Estructura de costos (por servicio)

| Servicio | Para qué | Escala con | Modelo de costo |
|---|---|---|---|
| Supabase | BD / Auth / Storage / Realtime | Datos, almacenamiento y tráfico | Plan + consumo |
| Vercel | Web (central) | Uso de la web | Plan |
| EAS (Expo) | Build y entrega de la app | Builds | Plan / uso |
| Almacenamiento de video | Bodycam, grabaciones, fotos | GB acumulados | Por GB/mes |
| TURN (Metered) | Video en vivo (WebRTC) | Minutos de transmisión | Por uso |
| Anthropic | Copiloto IA | Consultas / tokens | Por uso |
| ISS SecurOS / VMS | Videovigilancia integrada | Integración + cámaras | Proyecto + licencia del cliente |
| LocationIQ / TomTom | Geocodificación / rutas | Llamadas | Cuota / plan |
| FCM / Expo push | Notificaciones | Envíos | Gratis / uso |

---

## 8. Márgenes y pass-through

- **Software (planes) = margen alto:** el costo marginal por guardia es bajo (BD + push). Es el corazón de la rentabilidad.
- **Control de accesos, contratos, tableros e Índice/SLA = software:** costo variable casi nulo, margen alto; los add-ons CEDIS/Seguridad Logística ($/sitio o $/movimiento) y el tablero ejecutivo suben el ticket sin costo de terceros.
- **Video, almacenamiento, IA, cámaras e integración VMS = costo variable real:** van como add-on medido o por proyecto, con markup sobre el costo del tercero (sugerido 1.5–2×).
- **Objetivo de margen bruto:** software ≥ ~75–85%; add-ons por encima de su costo de tercero.
- **Regla de oro:** nada que crezca sin límite (video/IA/cámaras) se incluye ilimitado en el precio base.

> **Pendiente:** cargar las tarifas reales de cada servicio para calcular el costo por guardia y el punto de equilibrio por plan, y **fijar precio de los add-ons nuevos** (Seguridad Logística, integración VMS).

---

## 9. Reglas de facturación y descuentos

- Mínimo 25 guardias; guardia activo se cuenta por mes; altas/bajas prorratean al siguiente ciclo.
- Anual prepagado = 2 meses gratis (10/12). Onboarding no reembolsable.
- **Piso de precio:** nunca por debajo de costo + margen mínimo (definir por plan).
- **Palancas de descuento:** compromiso anual, banda de volumen (100+ −5%, 300+ −10%, 1,000+ negociado), multi-año (2–3 años) y caso de referencia/testimonial.
- **On-Premise:** AMS obligatorio (20%); la implementación se cotiza por alcance real (sitios, integraciones, migración).

---

## 10. Segmento Institucional / Centro de monitoreo (C5 estatal / C4 municipal)

Centros de monitoreo institucionales que gestionan **sus propias instalaciones**: un **C5 por estado** o un **C4 por municipio** — **un solo centro por jurisdicción** (mercado finito: ~32 estados + municipios grandes). No encaja el por-guardia ni el por-cámara (pueden ser pocas); compra gubernamental (licitación, soberanía) → **On-Premise** casi siempre.

**Modelo: licencia global (una instalación, principal) + por usuario de consola (secundario).**

- **Licencia global (monto fijo):** uso **ilimitado** de módulos C5, instalaciones, cámaras y **guardias en campo**, por **una instalación (el centro)**; incluye un **bloque base de usuarios de consola**. **Los guardias de la app NO cuentan** como usuario (si contaran, revienta el precio y mata el atractivo; "guardias ilimitados" es el diferenciador).
- **Banda de referencia = Estándar: 1 instalación + 25 usuarios** de consola incluidos — describe un C5 estatal típico. Básico para C4 municipal chico; Metropolitano para estado grande / 24-7 con HA.
- **Usuario de consola adicional (monto fijo):** operador/supervisor/admin por encima del bloque. Nombrado por defecto; concurrente para 24/7 grandes.

### Precios sugeridos (a calibrar)

> No hay lista pública de precios de C5 (se adjudica por licitación). Anclado a: **AMS estándar 18–22%** (Oracle 22%, SAP 19–22%, IBM 20–25%), comparables de software de seguridad y las bandas On-Premise de §4.

| Banda | Perfil | Usuarios incl. | Licencia global perpetua | AMS años 2+ (20%) | Alternativa suscripción anual |
|---|---|---|---|---|---|
| Básico | C4 municipal / chico | 10 | **$1.5 M** (1.2–1.8) | **~$300 k/año** | ~$600 k/año |
| **Estándar** *(ref.)* | **C5 estatal · 1 instalación · 25 usuarios** | **25** | **$2.8 M** (2.2–3.4) | **~$560 k/año** | **~$1.0 M/año** |
| Metropolitano | Estado grande / HA | 50 | **$4.8 M** (3.8–6.0) | **~$960 k/año** | ~$1.8 M/año |

*(Montos en MXN sin IVA; rangos entre paréntesis.)*

- **Usuario de consola adicional:** ~**$45 k** único (o ~$18–24 k/año en suscripción), sobre el bloque incluido.
- **Implementación única (On-Premise):** $300 k–$900 k según tamaño (instalaciones, integración VMS, migración).
- **Soporte años subsecuentes (AMS): 20% de la licencia global/año** (rango 18–22%). Incluye actualizaciones + soporte con SLA; **sin AMS no hay actualizaciones ni soporte**.
- **Perpetua vs suscripción:** perpetua ≈ 3× la anual + AMS 20% (capex, licitación de inversión); suscripción = todo incluido, se repaga cada año con tope de incremento p. ej. inflación (opex). Ofrecer **ambas** según ciclo presupuestal del cliente.
- **"Ilimitado" con salvedad:** módulos/instalaciones/cámaras/guardias/datos ilimitados, **pero retención/almacenamiento de video se dimensiona y cobra aparte** (en SaaS protege margen; en On-Premise es disco del cliente).
- **Márgenes:** alto en software (costo marginal por usuario casi nulo); el costo variable real es **video/almacenamiento** y la **integración VMS** (por proyecto). Sin IA → sin ese costo de tercero.
- **Notas / riesgos:** mercado finito (un centro por jurisdicción) → priorizar 2–3 cuentas faro y casos de referencia; ciclos de compra largos; exigen On-Premise y auditoría (apoyarse en `../SGS-OnPremise-Arquitectura-Seguridad.md`). Un C4 chico con pocos usuarios podría ver cara la global sola → la banda Básico + bloque de usuarios lo resuelve.
- **Pendiente:** validar estas cifras contra una cotización real / sondeo de mercado antes de presentarlas en firme.

---

*SGS — Sistema de Gestión de Seguridad · Precios (uso interno) · Interno v1.4 · Noviembre 2026 · No compartir.*
