# SGS — Módulos y Funciones

**Sistema de Gestión de Seguridad (seguridad privada)**
Inventario funcional de módulos por área. Web (Central de Operaciones) + App móvil (guardia/supervisor).

Documento de referencia · **Septiembre 2026**

---

## Índice de áreas

1. Panel de Información
2. Central de Operaciones
3. Vigilancia en sitio
4. Control de Acceso
5. Seguridad Logística
6. Administración
7. Reportes
8. Configuración
9. App móvil (guardia y supervisor)
10. Transversales (aplican a todo el sistema)

---

## 1. Panel de Información

| Módulo | Funciones |
|---|---|
| **Panel Operativo** | Tablero con el pulso diario: indicadores clave, actividad reciente y accesos rápidos. Se refresca al volver a la pestaña. |
| **Copiloto IA** | Asistente que responde en lenguaje natural sobre la operación a partir de los propios registros (RAG), citando su origen. |
| **Cumplimiento SLA** | Índice de cumplimiento 0–100 y % de SLA por cliente; base del reporte mensual. |
| **Supervisores** | Tablero por supervisor y fecha: sitios asignados, % de sitios visitados (GPS en geocerca), brechas de relevo y cumplimiento de rondines. Solo coordinador/administrador/operador. |

## 2. Central de Operaciones

| Módulo | Funciones |
|---|---|
| **Central / Despacho (CAD)** | Recepción y atención de incidencias/llamadas, despacho de unidades, estados y línea de tiempo en vivo (Realtime). Vista imprimible. |
| **Mapa Operativo** | Mapa en vivo multicapa: guardias (con estatus en posición/rondín/pausa), sitios, puntos de control, incidencias y cámaras. |
| **Videovigilancia** | Consola (doble vista, árbol por sitio, arrastrar y soltar, eventos y salud), muro en vivo (hasta 24 cámaras) e inspector por cámara: snapshot→evidencia y crear incidente. Sin almacenar video; lista para integrar VMS. |
| **Chats** | Canales de conversación con adjuntos; lista de integrantes; canales automáticos de relevo. Notificaciones push (incl. mensajes de sistema) e indicador de no leídos. |
| **Directorio de autoridades** | Contactos de autoridades y emergencias por jurisdicción. |
| **Evidencias** | Repositorio de fotos/video con folio y cadena de custodia; origen (tarea, incidente, rondín, acceso). |
| **Alerta general** | Difusión de una alerta a la operación. |

## 3. Vigilancia en sitio

| Módulo | Funciones |
|---|---|
| **Sitios** | Alta de sitios (puestos) por cliente, con geocerca (lat/lng + radio) y número de guardias. |
| **Puntos de control** | Puntos por sitio con QR/NFC o validación por geocerca; tipo (incluye caseta). |
| **Programar rondín** | Rondines programados por sitio, con repetición. |
| **Tareas** | Alta por **sitio** y opcionalmente por **guardia(s)** (uno/varios/todos); vigencia (fin auto +30 min, editable); **repetición** (una vez / diaria / días de semana / por turno) como plantilla que genera instancias; lugar en mapa; fotos de instrucción. Detalle con Editar/Guardar; estatus unificado enterado/atendiendo/completada; evidencia del guardia (foto/bodycam, no borrable). Lista agrupable y filtro de plantillas. |
| **Bitácora de seguridad (Rondines)** | Registro de cada lectura de punto: GPS dentro/fuera de rango, novedad y trayecto; sesiones de rondín automáticas por geocerca con playback. |
| **Supervisión rondines** | Seguimiento por guardia o por sitio, en vivo y por fecha; mapa + línea de tiempo; tareas completadas del guardia en el día. |
| **Rol de turnos** | Cabecera (fecha, tipo de turno con horario, coordinador) + guardias por sitio + supervisor por sitio. Vista (roster agrupado por sitio) y edición con **arrastrar y soltar** desde panel de **Disponibles** (filtrado por **anti-fatiga**). **Relevo forzado** con motivo (coordinador/admin). Copiar turno (guardias + supervisores + coordinador). Activar borrador. |

**Relevo automático (barrido):** proceso que cada pocos minutos detecta posiciones sin cobertura (turno vigente con guardias, pero ninguno en línea dentro de la geocerca pasado el margen) y abre un chat con central + coordinador + supervisor (con push), indicando sitio, turno, fecha y hora de cambio; se cierra solo al restablecerse.

## 4. Control de Acceso

| Módulo | Funciones |
|---|---|
| **Bitácora de accesos** | Entradas/salidas de personas y vehículos; un acceso rechazado genera incidente. Vista imprimible. |
| **Citas CEDIS** | Agenda de camiones (transportista/operador/vehículo/operación/andén) con máquina de estados programada→salida. |
| **Citas visitantes** | Agenda de visitas por sitio; el guardia elige sitio, fecha/hora y **quién solicita** (con opción "el mismo que registra"); genera un **enlace de un solo uso** (Copiar/WhatsApp). El visitante autoregistra datos y vehículo (guardados en maestros); el link se destruye al enviar. Detalle con el link reeditable; botón **Emitir credencial de visitante** que prellena el alta por folio. Lista agrupada por sitio; consulta rápida muestra datos solo si está registrada. |
| **Credenciales** | Emisión por tipo (Empleado/Guardia/Visitante/Servicio) con QR/NFC/temporal, foto y acceso por sitios/zonas; **zonas dependientes del sitio**; **QR de visitante válido 12 h** desde emisión. Plantillas de impresión por tipo. Vista/impresión CR80. |
| **Proveedores (transportistas)** | Catálogo de transportistas/proveedores. |
| **Zonas de control** | Zonas por sitio, restringidas por horario. |

## 5. Seguridad Logística (custodia de carga)

| Módulo | Funciones |
|---|---|
| **Vista Operativa** | Orquestador del movimiento por etapas: Programado → Riesgo → Acceso → Inspección → **Liberación de seguridad** → Tránsito → Arribo → Cierre, con gate que no libera hasta cumplir todos los controles. Hallazgo puede escalar a incidente. |
| **Inspecciones** | Checklist de seguridad por tipo (pre-salida, entrada, salida, patio, sello) con foto y GPS; funciona sin datos móviles. |
| **Transportación (movimientos)** | Traslados bajo custodia (carretero/ferroviario/intermodal/interno) con origen/destino, programación y riesgo. |
| **Activos de transporte** | Tractocamiones, vagones y demás activos. |
| **Unidades de carga** | Contenedores/cajas y su relación con el movimiento. |
| **Sellos** | Sellos de seguridad y su validación (íntegro/alterado) como evidencia. |

## 6. Administración

| Módulo | Funciones |
|---|---|
| **Clientes** | Alta de clientes y su relación con sitios. |
| **Metas de SLA** | Definición de metas de SLA por cliente. |
| **Guardias (personal)** | Alta de personal (persona + datos laborales, categoría, placa); vínculo cuenta↔guardia para la app. |
| **Unidades / Armamento / Comunicación / Smartphones / Otros equipos** | Catálogos de recursos con folio, estatus y cadena de resguardo. Smartphones = bodycams de dispositivo. |
| **Auditoría (bitácora)** | Registro inmutable de altas, cambios (antes/después completos), cancelaciones y consultas; filtros por fecha/acción/módulo/usuario; **descarga CSV/Excel solo administrador**. Retención configurable en Parámetros. |

## 7. Reportes

| Módulo | Funciones |
|---|---|
| **Horas trabajadas (normales y extra)** | Por **periodo** (desde/hasta) y por **cliente**; con "Todos los clientes" se agrupa por cliente con desglose por guardia; horas normales vs extra (turnos adicionales del día). Exporta CSV/Excel. |
| **Reporte mensual (SLA)** | Reporte de cumplimiento/SLA por cliente listo para entregar. Vista imprimible. |

## 8. Configuración

| Módulo | Funciones |
|---|---|
| **Gestión del sistema (admin)** | Usuarios y roles; vínculo usuario↔guardia; catálogos; importación de empleados. |
| **Parámetros** | Rastreo GPS (intervalo, ventana "en línea", margen de geocerca), **días de retención de bitácora**, y personalización del menú por cuenta. |
| **Mi empresa** | Datos de la corporación y jurisdicción (rige la búsqueda de domicilios). |
| **Versión del sistema** | Información de versión. |

## 9. App móvil (guardia y supervisor)

| Función | Detalle |
|---|---|
| **Inicio / Mi turno** | Resuelve el elemento por la cuenta; muestra sitio asignado y turno vigente (fecha local + ventana real, soporta cruce de medianoche). |
| **Rondín** | Lectura de puntos por QR/NFC o por geocerca; novedad; funciona offline (se sube al reconectar). |
| **Tareas** | "Mis tareas" (enterado/atendiendo/completada) + **foto o bodycam** como evidencia; pestaña "De mis guardias" para supervisores (tareas de sus sitios, todos los estatus). |
| **Control de acceso (caseta)** | Escaneo de credencial/QR; valida vigencia (visitante 12 h → "código inválido"); registro de visitante; ligado al movimiento en logística. |
| **Incidentes** | Levantar incidente con foto/ubicación; "Mis incidentes" y, para supervisor, los de sus sitios del turno activo. |
| **Inspecciones** | Checklist logístico con foto/GPS, offline. |
| **Supervisión** | Por guardia o por sitio: GPS/estatus, rondines del día y tareas completadas. |
| **Bodycam** | Grabación HD local por segmentos (foreground service), transmisión en vivo (WebRTC) y evidencia ligada al origen. |
| **Chat** | Canales con no leídos y push (incl. avisos de relevo). |
| **Gate de sesión** | Guardia/supervisor solo con turno que cubra la hora; se cierra al terminar el turno. |

## 10. Transversales (aplican a todo el sistema)

- **WORM / trazabilidad:** nada se borra; se cancela con motivo. Folios automáticos por módulo. Bitácora de auditoría en cada tabla núcleo.
- **RLS y roles:** permisos por rol (oficial/guardia, supervisor, investigador, operador, coordinador, administrador, asuntos internos). La web exige 2FA (aal2).
- **Realtime:** CAD, mapa, chat y estados en vivo.
- **Notificaciones push (Expo/FCM):** tareas, despachos y chat (incl. sistema/relevo).
- **Anti-fatiga:** límite de turnos encadenados con override auditado.
- **Sin datos móviles:** captura por WiFi sin SIM y envío diferido al reconectar.
- **Mapas:** MapLibre + estilo Liberty (web) y Leaflet en WebView (móvil).
- **Nube:** sin servidores propios (Supabase + Vercel; móvil por EAS/Codemagic).

---

*SGS — Módulos y Funciones · documento de referencia · Septiembre 2026*
