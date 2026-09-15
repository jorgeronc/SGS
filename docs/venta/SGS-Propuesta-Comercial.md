# SGS — Sistema de Gestión de Seguridad

**Plataforma integral para empresas de seguridad privada**
Propuesta de Valor · Presentación comercial del sistema

Rondines verificables con trazabilidad GPS · Control de accesos · **Seguridad Logística (custodia de carga)** · Monitoreo y videovigilancia · Alertas · Índice de cumplimiento y SLA

Documento comercial · **Versión 1.6 · Septiembre 2026**

---

## 1. Resumen ejecutivo

SGS (Sistema de Gestión de Seguridad) es una plataforma que digitaliza y controla, de principio a fin, la operación de una empresa de seguridad privada. Reúne en una sola herramienta el **rondín verificable con trazabilidad GPS** (por QR/NFC o por geocerca automática, incluso en áreas amplias sin infraestructura de etiquetas), el monitoreo y la **supervisión en vivo**, la videovigilancia de las cámaras del sitio, la **custodia de movimientos de carga (Seguridad Logística)**, la respuesta a emergencias con video en vivo, la supervisión con reportes, un asistente con inteligencia artificial y la gestión de clientes, sitios, guardias y turnos.

Funciona en dos frentes: una aplicación web para la **Central de Operaciones** y una app móvil para el **guardia en campo**. No requiere servidores propios y cada dato queda registrado de forma trazable e inalterable, lo que convierte a SGS en una herramienta de operación y, a la vez, en evidencia de servicio ante el cliente.

**En una frase:** SGS le da a la empresa de seguridad control total y visibilidad en vivo de su operación —incluida la custodia de la carga—, y a su cliente la certeza, con evidencia, de que el servicio se está cumpliendo.

> 📷 **[Imagen 1 — Hero: Mapa Operacional]** guardias, cámaras, incidentes y geocercas en vivo (`/mapa-operacional`).

---

## 2. El reto del sector

Las empresas de seguridad privada suelen operar con procesos en papel o desconectados, lo que genera:

- **Rondines no verificables:** no hay forma de comprobar que el guardia realmente recorrió los puntos, ni el trayecto que siguió entre ellos.
- **Áreas amplias sin infraestructura:** predios extensos, patios, ductos o perímetros donde no es viable colocar etiquetas QR/NFC en cada punto.
- **Falta de visibilidad en vivo:** la central no sabe dónde están sus guardias ni qué está pasando en el momento.
- **Custodia de carga sin control:** en CEDIS, patios y traslados no se garantiza que cada movimiento cumplió acceso, inspección y sello antes de salir.
- **Respuesta lenta a emergencias:** sin un canal inmediato para pedir apoyo con contexto.
- **Reportes tardíos y sin sustento:** difícil demostrar el servicio al cliente y retener contratos.
- **Información dispersa:** guardias, sitios, turnos, accesos y evidencias en distintos lugares.

---

## 3. Propuesta de valor

SGS resuelve lo anterior con capacidades pensadas para el negocio:

- ✓ **Rondines verificables con trazabilidad GPS.** El guardia lee el punto por QR o etiqueta NFC y el sistema valida con GPS que realmente estaba ahí (dentro del radio del punto); los intentos fuera de rango quedan marcados. Además queda registrado el **trayecto recorrido** entre puntos, comparable contra la ruta esperada. Control anti-fraude con evidencia real.
- ✓ **Rondín en áreas amplias sin QR/NFC (geocerca automática).** En predios extensos donde no hay etiquetas, el punto se valida **solo con el GPS**: cuando el guardia permanece dentro del radio del punto el tiempo suficiente, el sistema lo da por cumplido automáticamente. Sin infraestructura física en cada punto.
- ✓ **Sesiones de rondín automáticas.** El recorrido se abre y cierra solo (por geocerca del sitio), con su folio, y arroja **reproducción del trayecto (playback)**, cumplimiento de puntos y señales de anomalía.
- ✓ **Monitoreo y supervisión en vivo.** La central ve en un mapa a sus guardias (con su estatus: en posición, en rondín o en pausa), sitios, puntos de control, incidencias y cámaras, en tiempo real y sin perder el foco al actualizarse. El supervisor también da seguimiento **desde el móvil**, por guardia o por sitio.
- ✓ **Videovigilancia integrada.** Consola dedicada de monitoreo (doble vista de cámaras, árbol por sitio, arrastrar y soltar, eventos y salud del sistema), muro en vivo (hasta 24 cámaras) y cámaras cercanas a cada incidencia. Cada cámara tiene un inspector para tomar un snapshot como evidencia y crear un incidente en un clic. El video no se almacena: la señal se resuelve al momento, y la plataforma queda lista para integrar el VMS del cliente (ISS/SecurOS, Milestone o Genetec).
- ✓ **Seguridad Logística: custodia de movimientos de carga.** Traslados bajo custodia (carretero / ferroviario / intermodal / interno) con su activo de transporte, unidades de carga, inspecciones de seguridad (checklist), sellos y nivel de riesgo. El **control de acceso en caseta se liga al movimiento** (valida al conductor contra el traslado), y una **Vista Operativa** orquesta todo el proceso por etapas con un **gate de Liberación de seguridad** que no deja salir la carga hasta cumplir todos los controles.
- ✓ **Respuesta inmediata a emergencias.** Botón de alerta que abre un despacho con ubicación y transmisión de video en vivo.
- ✓ **Supervisión y reportes para el cliente.** Recorrido de cada rondín en mapa y línea de tiempo, exportable a PDF.
- ✓ **Control de accesos integral.** Entradas y salidas de personas y vehículos con credenciales (QR/NFC/temporal), citas y andenes para CEDIS, zonas restringidas por horario y bitácora auditable; un acceso rechazado genera un incidente.
- ✓ **Relevo garantizado (detección automática de descubiertos).** Si una posición queda sin guardia en el sitio pasado el margen del cambio de turno, el sistema abre automáticamente un chat entre central, coordinador y supervisor —con **notificación push** al móvil— indicando **sitio, turno, fecha y hora de cambio**, y lo cierra al restablecerse la cobertura.
- ✓ **Anti-fatiga en el rol de turnos.** El sistema impide encadenar más turnos de los permitidos sin descanso; el mando puede **forzar un relevo de emergencia con motivo**, que queda auditado.
- ✓ **Tareas al guardia con recurrencia y evidencia.** Instrucciones por **sitio** o por **guardia**, con vigencia, **repetición** (diaria / días de semana / por turno) y **evidencia** (foto o bodycam) ligada; estatus unificado (enterado → atendiendo → completada) y el **supervisor ve las tareas de sus sitios**.
- ✓ **Citas de visitantes con autoregistro.** El guardia genera un **enlace de un solo uso**; el visitante captura sus datos y vehículo desde su teléfono; con un clic se emite su **credencial de visitante (QR válido 12 h)**.
- ✓ **Supervisión de supervisores.** Tablero por supervisor: sitios visitados, brechas de relevo y cumplimiento de rondines de su turno.
- ✓ **Índice de Cumplimiento y SLA por cliente.** Una sola cifra 0–100 y el % de cumplimiento del servicio contratado, con reporte mensual listo para entregar al cliente.
- ✓ **Asistente con inteligencia artificial.** Responde en lenguaje natural preguntas sobre la operación a partir de los propios registros, citando su origen.
- ✓ **Opera sin datos móviles.** El guardia captura y **envía por WiFi aunque el teléfono no tenga SIM/datos**; sin señal, la captura se guarda y se sube sola al reconectar. Nada se pierde.
- ✓ **Trazabilidad total e inalterable.** Todo con folio y bitácora; los registros no se borran, se cancelan con motivo.
- ✓ **Web + móvil, sin infraestructura propia.** Listo para usarse desde el navegador y desde el teléfono del guardia.

---

## 4. Capacidades del sistema

Cada módulo resuelve una necesidad concreta del negocio:

| Capacidad | Qué aporta al negocio |
|---|---|
| **Rondines con trazabilidad GPS** | Comprueba cada recorrido, valida por GPS que el guardia estuvo en el punto y registra el trayecto seguido (real vs esperado); marca los intentos fuera de rango (anti-fraude). |
| **Checkpoints por geocerca (sin QR/NFC)** | Valida puntos solo con GPS por permanencia; habilita el rondín en áreas amplias sin colocar etiquetas físicas. |
| **Sesiones de rondín (automáticas)** | Abren/cierran solas por geocerca del sitio, con folio, reproducción del trayecto (playback), cumplimiento de puntos y detección de anomalías. |
| **Monitoreo en vivo multicapa** | Guardias (con su estatus: en posición/rondín/pausa), sitios, puntos, incidencias y cámaras en un mapa en tiempo real. |
| **Videovigilancia (cámaras)** | Consola dedicada (doble vista, árbol por sitio, eventos y salud), muro en vivo e inspector por cámara (snapshot→evidencia, crear incidente); sin almacenar video y lista para integrar un VMS. |
| **Seguridad Logística (movimientos)** | Custodia de traslados de carga: activo, unidades de carga, inspecciones, sellos y riesgo; caseta ligada al movimiento; gate que garantiza que nada sale sin cumplir el protocolo. |
| **Vista Operativa (flujo)** | Un solo tablero que orquesta el proceso de seguridad del movimiento por etapas (riesgo, acceso, inspección, liberación, tránsito, arribo, cierre) y su supervisión. |
| **Control de accesos (CEDIS)** | Entradas/salidas de personas y vehículos, citas, andenes, credenciales y zonas; todo auditable. |
| **Índice de cumplimiento y SLA** | Una cifra 0–100 y el % de SLA por cliente, con reporte mensual para retener contratos. |
| **Central / Despacho y Alertas** | Atención de incidencias y emergencias con video en vivo y seguimiento. |
| **Supervisión de rondín (web y móvil)** | Recorrido y trayecto en mapa y línea de tiempo, en vivo y por fecha; seguimiento del supervisor desde el móvil (por guardia o sitio) y reporte PDF para el cliente. |
| **Rol de turnos (con anti-fatiga)** | Planeación clara por sitio y jornada (supervisor, guardias, tipos de turno con horario); impide encadenar turnos sin descanso y permite relevo forzado auditado. Arrastrar y soltar para armar el rol; copiar un turno con sus supervisores. |
| **Relevo automático (descubiertos)** | Detecta posiciones sin cobertura y abre chat + push a central/coordinador/supervisor con sitio, turno, fecha y hora de cambio; se cierra al restablecerse. |
| **Tareas (recurrencia + evidencia)** | Por sitio o guardia, con vigencia y repetición (diaria/días de semana/por turno); foto o bodycam como evidencia ligada; visibles para el supervisor de sus sitios. |
| **Citas de visitantes** | Agenda por sitio; enlace de un solo uso para autoregistro del visitante y su vehículo; emisión de credencial (QR 12 h) en un clic. |
| **Evidencias y bodycam** | Fotos y video con cadena de custodia; respaldo ante reclamos. |
| **Auditoría / bitácora** | Registro inmutable con valores antes/después completos, retención configurable y exportación CSV/Excel (solo administrador). |
| **Reporte de horas (normales y extra)** | Por periodo y por cliente, agrupado por cliente con desglose por guardia; base para nómina y facturación. |
| **Copiloto con IA** | Respuestas en lenguaje natural sobre la operación a partir de los registros. |
| **Clientes, sitios y guardias** | Toda la operación organizada y lista para reportar. |
| **Tablero e indicadores** | Pulso diario de la operación de un vistazo. |

---

## 5. Seguridad Logística — custodia de movimientos de carga

Un módulo completo para empresas que **custodian carga** (CEDIS, transporte carretero, ferroviario e intermodal): controla el traslado de principio a fin y garantiza que cada movimiento cumplió el protocolo de seguridad **antes de salir**.

- **Movimiento** como eje: activo de transporte, unidades de carga, cargas con su **nivel de riesgo**, origen/destino y programación.
- **Inspecciones de seguridad** en campo (checklist por tipo: pre-salida, entrada, salida, patio, sello), con foto, GPS y captura que funciona **sin datos móviles**.
- **Sellos de seguridad** y su validación (íntegro / alterado) como evidencia inalterable.
- **Control de acceso ligado al movimiento:** en la caseta, el guardia registra al camión y **valida al conductor contra su traslado**.
- **Gestión de riesgo:** el nivel de riesgo del movimiento se deriva de su carga y define el protocolo requerido.
- **Vista Operativa (orquestador):** un tablero que muestra el movimiento por etapas —Programado → Riesgo → Acceso → Inspección → **Liberación de seguridad** → Tránsito → Arribo → Cierre— con un **gate** que no permite liberar la carga hasta cumplir todos los controles (acceso, identidad, inspección, sello, GPS, riesgo). Un **hallazgo** en monitoreo puede escalar a incidente.

> 📷 **[Imagen 2 — Seguridad Logística: Vista Operativa]** flujo por etapas con el checklist de Liberación (`/vista-operativa`).

---

## 6. Cómo funciona

El sistema acompaña el ciclo natural del servicio:

- Se configura el cliente, sus sitios y los puntos de control (con su QR impreso), y se dan de alta las cámaras del sitio.
- Se planifica el rol de turnos: supervisor y guardias con su sitio.
- El guardia opera en campo: marca los puntos por QR/NFC —o automáticamente por geocerca en áreas amplias—, mientras el sistema registra su trayecto; además captura accesos e inspecciones, levanta incidentes y evidencias, atiende tareas y, ante un riesgo, envía una alerta con video.
- En Seguridad Logística: el movimiento se programa, se inspecciona y sella, se controla su acceso en caseta y la Vista Operativa lo libera solo si cumplió el protocolo.
- La central monitorea en vivo (guardias, cámaras y movimientos), despacha emergencias, vigila el muro de cámaras y supervisa rondines y traslados.
- Se reporta y audita: recorridos en PDF, evidencias con cadena de custodia y bitácora completa.

*Detalle operativo: el funcionamiento paso a paso, por rol y módulo, se describe en el documento anexo "SGS — Flujo Operativo Funcional".*

> 📷 **[Imagen 3 — Videovigilancia: Muro en vivo]** varias cámaras en cuadrícula (`/videovigilancia/muro`).

---

## 7. Diferenciadores

- ✓ **Enfoque 100% seguridad privada.** Diseñado para guardias, sitios, rondines, clientes **y custodia de carga**, no adaptado de otro giro.
- ✓ **Rondín en áreas amplias sin QR/NFC.** Validación de puntos por geocerca (solo GPS) para predios extensos, patios, ductos o perímetros donde colocar etiquetas no es viable — donde otros sistemas no llegan.
- ✓ **Trayecto, no solo puntos.** Se registra y reproduce el recorrido real del guardia (playback) y se compara con la ruta esperada, con detección de anomalías. Evidencia del *cómo*, no solo del *dónde*.
- ✓ **Custodia de carga con "gate" de liberación.** Un solo tablero garantiza que **nada sale sin cumplir el protocolo** (acceso, inspección, sello, GPS, riesgo) — argumento decisivo para CEDIS y transporte.
- ✓ **Relevo garantizado.** El sistema detecta solo cuando una posición queda descubierta y escala de inmediato (chat + push a central, coordinador y supervisor) — no depende de que alguien lo note. Con anti-fatiga que evita turnos encadenados.
- ✓ **Evidencia que retiene contratos.** El cliente recibe pruebas objetivas del servicio (recorridos, fotos, video, inspecciones, sellos).
- ✓ **Videovigilancia + rastreo en un solo mapa.** Cámaras fijas del sitio y guardias en vivo, juntos, con acceso inmediato al video del entorno de una incidencia.
- ✓ **Tiempo real de verdad.** GPS, alertas, video y despacho en vivo.
- ✓ **Opera aunque no haya datos móviles.** Captura por WiFi sin SIM y envío diferido al reconectar; ideal para casetas y patios.
- ✓ **Inteligencia artificial aplicada.** Un asistente que convierte los registros en respuestas útiles.
- ✓ **Demuestra cumplimiento con una cifra.** El Índice de Cumplimiento (0–100) y el SLA por cliente convierten la operación en evidencia contractual.
- ✓ **Adopción rápida.** App simple para el guardia y web clara para la central.

> 📷 **[Imagen 4 — App del guardia: Rondín QR/NFC]** pantalla de escaneo en marco de teléfono (app móvil).

---

## 8. Seguridad y confianza

- **Acceso protegido:** la web exige doble factor de autenticación (2FA); en el móvil, las funciones de mando solo las ve el supervisor o superior.
- **Identidad del guardia por relación cuenta↔guardia↔bodycam:** al iniciar sesión, el sistema resuelve automáticamente al elemento; el teléfono se valida como su bodycam-smartphone.
- **Registros inalterables:** nada se borra; se cancela con motivo. Evidencias y cadena de custodia protegidas.
- **Roles y permisos:** cada usuario ve y opera según su función (guardia, operador, coordinador, supervisor, administrador).
- **Trazabilidad:** folios automáticos y bitácora de altas, cambios y consultas.

---

## 9. Plataformas y entrega

- **Central de Operaciones (web):** monitoreo, despacho, Vista Operativa y administración.
- **App del guardia (Android):** rondín por QR, control de acceso, inspecciones, incidentes, evidencias, tareas, alerta y comunicación.
- **Sin servidores propios:** la plataforma opera en la nube; la empresa se concentra en su servicio.

> 📷 **[Imagen 5 — Valor al cliente: Índice de Cumplimiento / SLA]** la cifra 0–100 y el reporte mensual (`/` o `/reporte-sla`).

---

## 10. Siguientes pasos

Proponemos una demostración con datos de ejemplo para mostrar el flujo completo —rondín, monitoreo, **custodia de un movimiento de carga**, alerta y reportes— y, a partir de ahí, un plan de implementación a la medida de la empresa.

**Contacto:** [ nombre / correo / teléfono comercial ]

*SGS — Sistema de Gestión de Seguridad · Documento comercial · v1.6*
