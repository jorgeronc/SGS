# SGS — Flujo Operativo Funcional

**Sistema de Gestión de Seguridad · Seguridad privada**
Funcionamiento del sistema desde la perspectiva del usuario
Central de Operaciones (web) · Guardia en campo (app móvil)

Documento de referencia operativa · **Versión 2.5 · Octubre 2026**

---

## 1. Objetivo y alcance

Describe el flujo operativo funcional de SGS tal como lo vive el usuario: qué hace cada actor, en qué orden y con qué propósito, de principio a fin.

SGS integra dos experiencias complementarias:

- **Central de Operaciones (web):** administración, supervisión, monitoreo en vivo, despacho y **custodia de movimientos de carga**. Aquí se dan de alta clientes y sitios, se planifica el rol de turnos, se emiten los QR, se asignan tareas, se atienden incidencias/alertas, se supervisan rondines y se orquestan los movimientos logísticos.
- **Guardia en campo (app móvil):** ejecución del servicio. El guardia registra rondines (QR/NFC o geocerca), levanta incidentes y evidencias, hace inspecciones, atiende tareas, controla accesos en caseta, se comunica con la central y puede enviar una alerta de emergencia con video en vivo.

**En una frase:** la Central planifica, monitorea y despacha desde la web; el Guardia ejecuta y reporta desde el móvil; y toda la actividad queda registrada de forma trazable e inalterable.

---

## 2. Actores y perspectivas de usuario

| Rol / Actor | Dónde opera | Qué hace principalmente |
|---|---|---|
| **Administrador** | Web | Configura el sistema, gestiona usuarios y catálogos, define parámetros (incluido el rastreo GPS). |
| **Coordinador / Supervisor / Jefe de turno** | Web y móvil | Planifica turnos, asigna tareas, atiende el despacho, monitorea GPS y supervisa rondines. En el móvil tiene además Buscar y Supervisión. |
| **Monitorista / Central** | Web | Vigila la operación en vivo, recibe alertas y video, coordina por chat y despacha guardias. |
| **Guardia / Escolta** | Móvil | Ejecuta el servicio: rondines, incidentes, evidencias, inspecciones, control de acceso, tareas, alerta y comunicación. |

**Seguridad de acceso:** la web exige usuario, contraseña y **segundo factor (2FA/aal2)**. En el móvil, guardia/supervisor solo entran con un **turno vigente que cubra la hora** (gate de sesión), y las funciones de mando (Buscar, Supervisión) solo aparecen para supervisor o superior.

---

## 3. Ciclo operativo de un vistazo

1. Dar de alta al **cliente** y sus **sitios** (puestos), con ubicación en el mapa y geocerca.
2. Registrar a los **guardias** (categoría, control de confianza, vigencias) y vincular su cuenta↔guardia.
3. Definir **puntos de control** por sitio y emitir/imprimir su **QR/NFC** (o dejarlos validados por geocerca).
4. Planificar el **rol de turnos**: supervisor + guardias por sitio, con anti-fatiga; activar.
5. **Operar en campo:** rondines, incidentes, evidencias, inspecciones, control de acceso, tareas y alertas.
6. **Monitorear, despachar y supervisar:** GPS en vivo, Central/Despacho, muro de cámaras, supervisión de rondines y de movimientos logísticos.
7. **Consultar y auditar:** todo con folio, bitácora y expedientes, con trazabilidad completa.

> Los registros **no se borran**: se cancelan con un motivo. La telemetría (GPS) es la excepción: se acumula como historial del recorrido.

---

## 4. Central de Operaciones (aplicación web)

### 4.1 Central / Despacho (CAD)
Atiende incidencias y alertas en tiempo real y despacha guardias. Consola con registro rápido de incidente, buscador y filtros (fechas, prioridad, despacho) y tablero con folio, prioridad (P1/P2/P3), guardia/unidad asignada, tiempo transcurrido en vivo e indicadores de la jornada. Recibe automáticamente las **alertas de pánico** del móvil (prioridad alta) con **video en vivo**. Estados en vivo (recibida → despachada → en atención → resuelta) con indicador **EN VIVO**. **Cámaras cercanas** a la incidencia por distancia. Cierre con conclusión; la grabación queda como evidencia con cadena de custodia.

### 4.2 Mapa Operacional
Mapa oscuro de alto contraste en tiempo real con capas activables: sitios (pin naranja), puntos de control (rombo teal), **guardias en vivo** con su estatus (En posición / En rondín / En pausa), incidencias/alertas (triángulo rojo) y **cámaras** (círculo morado). Clic en un guardia → su estatus; clic en un incidente → su panel y **chat del incidente** sobre el mapa; clic en una cámara → señal en vivo / enviar al muro. **Refresco automático cada minuto sin mover ni reencuadrar** el mapa. La ubicación de los guardias solo la ven mandos.

### 4.3 Videovigilancia — consola de monitoreo
Consola dedicada para el operador de video, independiente del Mapa: árbol de cámaras por sitio, **doble vista** con arrastrar y soltar, eventos recientes, mini-mapa que sigue a la cámara y panel de **salud** (en línea / sin señal / mantenimiento). Inspector por cámara (Detalle, Eventos, Historial) con **snapshot→evidencia** y **crear incidente** precargado. Complementa la bodycam del guardia (aquí son cámaras fijas del lugar). El video no se guarda; la señal se resuelve al momento y la llave del proveedor nunca baja al navegador.

**Integración con VMS: ISS SecurOS ya disponible** — al conectarlo se habilitan video en vivo real, PTZ, grabación y eventos analíticos sin cambiar la pantalla; Milestone y Genetec a evaluación.

- **Alta de cámaras por sitio:** se elige el sitio y el sistema da de alta las cámaras alrededor (radio configurable) sin capturar identificadores; o se agrega una cámara manual (NVR/DVR) pegando su URL (HLS/MJPEG/embed) y ubicándola en el mapa.
- **Muro de cámaras:** hasta **24 cámaras**, con buscador y filtro por sitio; cada una se refresca sola y puede maximizarse; la selección se conserva entre sesiones.
- **Cámaras cercanas a una incidencia:** ordenadas por distancia (radio ajustable).
- Estado por cámara (activa / inactiva / mantenimiento); solo las activas aparecen en mapa y muro.

### 4.4 Sitios / Puestos de servicio
Lugar físico donde se presta la seguridad; unidad operativa de turnos, puntos y rondines. Se crea eligiendo el cliente; define tipo, dirección, número de guardias, horario, **geocerca (lat/lng + radio)** y ubicación en el mapa.

### 4.5 Puntos de control y códigos QR
Checkpoints del sitio. Se crea el punto (código único que también sirve de tag NFC, orden y descripción, tipo —incluye caseta—). Desde la ficha se imprime su **QR** (uno, todos los del sitio, o todos), en hoja de etiquetas. El QR se coloca físicamente y su contenido es lo que valida el sistema.

### 4.6 Rondines (verificados por QR/NFC y por geocerca)
La evidencia de que el guardia recorrió los puntos.
- Lectura por **QR o NFC**; el móvil registra guardia, hora, GPS, método, tipo de evento (entrada/salida/control) y **distancia a la etiqueta**.
- **Validación de lugar (geocerca):** si el guardia está fuera del radio + margen por GPS, el paso se registra pero queda **"fuera de rango"**.
- **Checkpoints por geocerca sin QR/NFC:** en áreas amplias sin etiquetas, el punto se da por cumplido **solo con el GPS** cuando el guardia permanece dentro del radio el tiempo suficiente.
- **Sesiones de rondín automáticas:** el recorrido se abre y cierra solo por geocerca del sitio, con su folio, y arroja **reproducción del trayecto (playback)**, cumplimiento de puntos y señales de anomalía.
- La central ve los rondines por sitio, punto, guardia y fecha, resaltando novedades y fuera de rango.

### 4.7 Supervisión de rondín
Revisión por fecha → cliente → sitio → guardia (filtros en cascada). Mapa con **trayecto GPS** (línea) y punto de lectura de cada QR/NFC (rojo si hubo novedad o fuera de rango). Historial agrupado por sitio y guardia, colapsable, con su línea de tiempo. **Exportación a PDF** por guardia o por sitio, para archivo o entrega al cliente.

### 4.8 Rol de turnos (con anti-fatiga y relevo)
Planifica quién cubre y supervisa cada jornada.
- Se crea el turno con **supervisor**, fecha y tipo/horario; nace como borrador.
- Se agregan los guardias por sitio con **arrastrar y soltar** desde el panel de **Disponibles**, filtrado por **anti-fatiga** (impide encadenar más turnos de los permitidos sin descanso).
- **Relevo forzado con motivo** (coordinador/admin), auditado. **Copiar turno** (guardias + supervisores + coordinador) a otra fecha. Activar borrador → activo.

> **Relevo automático (barrido de descubiertos):** cada pocos minutos el sistema detecta posiciones sin cobertura (turno vigente con guardias pero ninguno en línea dentro de la geocerca pasado el margen) y **abre un chat con central + coordinador + supervisor (con push)** indicando sitio, turno, fecha y hora de cambio; se cierra solo al restablecerse la cobertura.

### 4.9 Tareas (recurrencia + evidencia)
Instrucciones a los guardias con seguimiento.
- Se crea por **sitio** y opcionalmente por **guardia(s)** (uno/varios/todos), con tipo, asunto, instrucciones, prioridad, **vigencia** (fin automático +30 min, editable), ubicación en mapa y fotos de instrucción.
- **Repetición** (una vez / diaria / días de semana / por turno) como **plantilla** que genera instancias automáticamente.
- Al asignarse dispara **push**; el guardia responde (enterado → atendiendo → completada) con **evidencia (foto, bodycam o audio)** no borrable. El **supervisor ve las tareas de sus sitios**.

### 4.10 Control de accesos
Registro, autorización y auditoría de ingreso/salida de personas y vehículos por las casetas. Ideal para **CEDIS**.
- **Casetas y credenciales:** la caseta es un punto de control; el guardia identifica por credencial (QR/NFC/código temporal) o registra al visitante con foto.
- **Personas:** entrada/salida con motivo y tipo; el sistema sabe quién está dentro.
- **Vehículos y citas (CEDIS):** agenda de camiones (transportista, operador, placa, operación, andén) con máquina de estados programada → en caseta → en andén → carga/descarga → salida; el acceso del camión se **liga a su cita** y a su **movimiento logístico**.
- **Citas de visitantes con autoregistro:** el guardia genera un **enlace de un solo uso** (Copiar/WhatsApp); el visitante captura sus datos y vehículo desde su teléfono (se guardan en maestros) y el link se destruye al enviar. Con un clic se **emite su credencial de visitante (QR válido 12 h)**.
- **Autorización de excepción** por chat al supervisor; un acceso rechazado **genera un incidente** (con la persona/vehículo ligados).
- **Zonas internas** por horario/vigencia. Bitácora de accesos exportable a PDF por sitio y periodo.

### 4.11 Seguridad Logística — custodia de movimientos de carga
Para empresas que custodian carga (CEDIS, transporte carretero, ferroviario e intermodal). Controla el traslado de principio a fin y garantiza que cada movimiento cumplió el protocolo **antes de salir**.
- **Movimiento** como eje: activo de transporte, unidades de carga, origen/destino, programación y **nivel de riesgo** (derivado de la carga).
- **Inspecciones de seguridad** en campo (checklist por tipo: pre-salida, entrada, salida, patio, sello) con foto y GPS, que funciona **sin datos móviles**.
- **Sellos** de seguridad con validación (íntegro / alterado) como evidencia inalterable.
- **Control de acceso ligado al movimiento:** en la caseta el guardia valida al conductor contra su traslado.
- **Vista Operativa (orquestador):** un tablero que muestra el movimiento por etapas —Programado → Riesgo → Acceso → Inspección → **Liberación de seguridad** → Tránsito → Arribo → Cierre— con un **gate** que no libera la carga hasta cumplir todos los controles (acceso, identidad, inspección, sello, GPS, riesgo). Un **hallazgo** en monitoreo puede escalar a incidente.

### 4.12 Contratos
Gestión de los **contratos por cliente**: alta con sus datos, **estados del ciclo de vida** y **control de vencimientos**, más un **tablero de contratos** para ver de un vistazo qué vence y qué requiere atención.

### 4.13 Cumplimiento y SLA (dirección y cliente)
- **Índice de Cumplimiento (0–100):** una sola cifra que combina cobertura, rondines, tiempo de respuesta e incidentes críticos.
- **SLA por cliente:** metas definidas y % de cumplimiento del periodo.
- **Reporte mensual** por cliente, listo para imprimir y entregar: la evidencia que ayuda a retener contratos.

### 4.14 Otros módulos
| Módulo | Para qué sirve |
|---|---|
| **Copiloto IA** | Responde en lenguaje natural sobre la operación a partir de los propios registros (RAG), citando su origen. |
| **Supervisores (tablero)** | Por supervisor y fecha: sitios asignados, % visitados (GPS en geocerca), brechas de relevo y cumplimiento de rondines. |
| **Chat** | Comunicación central ↔ guardias con adjuntos, no leídos, push y canales automáticos de relevo. |
| **Directorio de autoridades** | Contactos de autoridades y emergencias por jurisdicción. |
| **Evidencias** | Fotos, video y audio con folio, cadena de custodia y origen (tarea/incidente/rondín/acceso). |
| **Clientes / Guardias** | Quién contrata y el personal operativo (categoría, control de confianza, vigencias). |
| **Bienes** | Unidades, armamento, comunicación, smartphones (bodycams) y otros equipos; catálogos con folio y cadena de resguardo; kardex. |
| **Reportes** | Horas trabajadas (normales/extra) por periodo y cliente (CSV/Excel); reporte mensual SLA. |
| **Administración / Catálogos / Parámetros / Bitácora** | Usuarios y roles, catálogos editables, parámetros (GPS, retención), auditoría inmutable (export CSV/Excel solo admin). |

---

## 5. Guardia en campo (aplicación móvil)

### 5.1 Identidad del guardia
En **Perfil** el guardia selecciona "Mi elemento"; el teléfono valida que sea la **bodycam-smartphone** asignada y queda vinculado. Desde ahí, cada rondín/incidente/evidencia/tarea/alerta queda atribuido al guardia correcto, comienza a compartirse su GPS y se activan las geocercas de los sitios.

### 5.2 Inicio / Mi turno
Encabezado con el **turno vigente** (fecha local + ventana real, soporta cruce de medianoche), unidad/sitio asignado y estado en línea. Accesos: Registrar rondín, Levantar incidente, Mis incidentes, Control de acceso, Nueva evidencia, Mis tareas, bodycam y **ENVIAR ALERTA** (botón rojo). **Gate de sesión:** guardia/supervisor solo entran con turno que cubra la hora; la sesión se cierra al terminar el turno.

### 5.3 Rondín por QR / NFC / geocerca
El guardia lee el punto: **escanea el QR**, acerca la **etiqueta NFC** o lo valida por **geocerca**; confirma y agrega novedad (o "sin novedad"). Se envía con hora y GPS; si está fuera de rango, avisa y queda marcado. Funciona **offline** (se sube al reconectar). La central lo ve al instante.

### 5.4 Levantar incidente
Elige tipo (catálogo), narrativa, fotos y ubicación; queda visible para la central. Puede iniciar **bodycam** desde el incidente.

### 5.5 Control de acceso (caseta)
Escaneo de credencial/QR; valida vigencia (visitante 12 h → "código inválido"); registro de visitante; **ligado al movimiento** en logística. Un rechazo puede generar incidente.

### 5.6 Inspecciones
Checklist logístico por tipo con foto/GPS, **offline**; alimenta la Vista Operativa.

### 5.7 Enviar alerta (emergencia)
Genera un **despacho de emergencia** con la ubicación y arranca la **transmisión de video en vivo** a la central; la grabación queda como evidencia.

### 5.8 Tareas, evidencia, bodycam y chat
- **Mis tareas** (enterado / atendiendo / completada) con **foto, bodycam o audio** como evidencia; pestaña "De mis guardias" para supervisores.
- **Nueva evidencia:** fotos/notas/**audio** con cadena de custodia; bodycam HD por segmentos (foreground service) que se descarga como evidencia.
- **Chat** en tiempo real con no leídos y push.

### 5.9 Funciones de mando (supervisor o superior)
- **Buscar:** consulta de personas, vehículos e incidentes.
- **Supervisión:** por guardia o por sitio, GPS/estatus, rondines del día y tareas completadas, desde el teléfono.

---

## 6. Escenarios de principio a fin

### 6.1 Un turno típico
Planeación (web): el supervisor crea el turno, se asigna, agrega guardias por sitio (anti-fatiga) y lo activa. Inicio (móvil): el guardia confirma "Mi elemento" y empieza a compartir ubicación. Rondas (móvil): escanea los QR o se valida por geocerca; ante una novedad, la registra y levanta evidencia. Supervisión (web): la central lo ve en el mapa y, al terminar, revisa el recorrido en Supervisión de rondín y exporta el PDF.

### 6.2 Una emergencia
Alerta (móvil): el guardia toca **ENVIAR ALERTA**; se crea la emergencia con su ubicación y arranca el video. Atención (web): aparece en Central/Despacho con **EN VIVO**; el monitorista ve el video, coordina apoyo y da seguimiento. Cierre (web): se cierra con conclusión; el video grabado queda como evidencia.

### 6.3 Custodia de un movimiento de carga
Programación (web): se da de alta el movimiento con su activo, unidades de carga y riesgo. Caseta (móvil): el guardia valida al conductor contra su traslado. Inspección/sello (móvil): checklist con foto/GPS y validación del sello. **Liberación (web):** la Vista Operativa solo libera si se cumplieron acceso, identidad, inspección, sello, GPS y riesgo; un hallazgo escala a incidente. Tránsito → arribo → cierre.

---

## 7. Rastreo y supervisión del trabajo del personal

SGS rastrea en tres planos: **DÓNDE** están (GPS), **QUÉ** hacen (estatus y rondines verificados) y **QUÉ ocurrió** (historial y reportes).

- **Identidad y estatus:** "Mi elemento" validado contra el smartphone-bodycam; estatus En posición / En rondín / En pausa visible en vivo.
- **GPS en vivo:** el teléfono reporta cada N segundos mientras hay turno; "en línea" si reportó dentro de la ventana configurada. Solo lo ven mandos.
- **Rondín verificado (QR/NFC + geocerca):** hora, GPS, método, tipo de evento y distancia; fuera de rango se marca. Control anti-fraude clave.
- **Geocercas de sitio:** entrada/salida automáticas en segundo plano.
- **Recorrido histórico:** se acumula el trayecto GPS; con las lecturas reconstruye el recorrido de cualquier día (playback).
- **Supervisión y reportes:** por fecha/cliente/sitio/guardia, con exportación a PDF.

### Parámetros del rastreo GPS (Parámetros del sistema)
| Parámetro | Qué hace | Default |
|---|---|---|
| Rastreo activo | Enciende/apaga el rastreo GPS de guardias | Sí |
| Intervalo de reporte | Cada cuántos segundos reporta el móvil | 60 s |
| Ventana "en línea" | Segundos sin reportar tras los que cae del mapa | 180 s |
| Margen de geocerca | ± metros de tolerancia al validar el rondín | 20 m |

El rastreo se mantiene con pantalla bloqueada mediante un **servicio en primer plano**; se detiene al cerrar sesión o quitar el elemento.

---

## 8. Principios que el usuario debe conocer

- **Trazabilidad total (no se borra nada):** los registros se cancelan con motivo. Evidencias y cadena de custodia inalterables. El GPS se guarda como historial (telemetría).
- **Folios automáticos:** el usuario nunca teclea folios.
- **Catálogos administrables:** los tipos de los formularios se editan en Administración → Catálogos.
- **Roles y permisos:** cada quien ve y opera según su rol; la web exige 2FA y en el móvil las funciones de mando solo para supervisor o superior.
- **Tiempo real:** monitoreo GPS, alertas, video, despacho, chat y rondines en vivo.
- **Dos ejes de estado:** conservación (activo/cancelado) vs. operativo (turno: borrador/activo; incidencia: recibida/en atención/resuelta; tarea: enterado/atendiendo/completada).
- **Sin datos móviles:** captura por WiFi sin SIM y envío diferido al reconectar.

---

*SGS — Sistema de Gestión de Seguridad · Documento de flujo operativo funcional · v2.5 · Octubre 2026*
