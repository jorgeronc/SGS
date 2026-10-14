# Integración de videovigilancia SGS ↔ ISS SecurOS

**Documento técnico de integración — Videovigilancia**
Sistema de Gestión de Seguridad (SGS) · CONSULTECH
Versión 1.0 · 2026-09-24

---

## 1. Objetivo

Conectar las cámaras administradas por el VMS **ISS SecurOS** del cliente al módulo
de **Videovigilancia** de SGS, para poder:

1. **Ver en vivo** cada cámara desde el navegador (lista, muro y mapa operativo).
2. **Capturar snapshot → evidencia** con cadena de custodia (WORM).
3. **Recibir eventos/analítica** de SecurOS (movimiento, intrusión, LPR, tamper,
   pérdida de señal) en la línea de tiempo de la cámara y, si procede, convertirlos
   en incidente del CAD.
4. **Controlar PTZ** (cuando la cámara y el VMS lo soporten).

> **Alcance de fases:** la Fase 1 entrega **ver en vivo + snapshot** (el mayor valor
> inmediato). Eventos y PTZ son fases posteriores. Ver §7.

---

## 2. Punto de partida: SGS ya está "VMS-ready"

El módulo se diseñó desde el inicio para recibir un VMS real sin rehacer UI ni
esquema (migración `0067_videovigilancia_vms.sql`). Lo que ya existe:

| Pieza | Estado | Ubicación |
|---|---|---|
| Columnas de cámara para VMS (`proveedor`, `vms`, `ip`, `proveedor_ref`, `es_ptz`, `grabacion_disponible`, `retencion_dias`, `zona`, `resolucion`, `fps`) | ✅ Listo | `camaras` (0067) |
| Tabla receptora de eventos analíticos | ✅ Listo | `camara_eventos` (0067) |
| Resolución de señal al vuelo (mantiene llaves fuera del navegador) | ✅ Listo | Edge Function `camara_vista` |
| **Driver ISS/SecurOS** | 🟡 Esqueleto | `camara_vista` → rama `proveedor === 'iss' \|\| 'securos'` (hoy responde `NO_STREAM`) |
| Declaración de **capacidades** por driver (live/snapshot/ptz/grabación/eventos) | ✅ Listo | `camara_vista` → `capacidadesDe()` |
| Acción **PTZ** (relay al VMS) | 🟡 Esqueleto | `camara_vista` → `accion === 'ptz'` (501) |
| Snapshot → evidencia (server-side, sube a Storage, custodia + vínculo) | ✅ Listo | RPC `rpc_camara_snapshot_evidencia` |
| Crear incidente desde cámara | ✅ Listo | RPC `rpc_camara_crear_incidente` |
| Visor, muro (hasta 24 cámaras), inspector (Detalle/Eventos/Historial) | ✅ Listo | `VisorCamara`, `/videovigilancia/muro`, `CameraDetailDrawer` |
| **Webhook receptor de eventos SecurOS** | ❌ Falta | Edge Function nueva (§6) |

**Conclusión:** no se parte de cero. El trabajo es (a) resolver conectividad de red,
(b) terminar el driver de streaming y (c) agregar el webhook de eventos.

---

## 3. El reto técnico central

Los navegadores **no reproducen RTSP** (el transporte nativo de cámaras y VMS).
Toda integración de video web se reduce a obtener, por cámara, una URL reproducible:

- **HLS** (`.m3u8`) — universal, ~2–6 s de latencia. Suficiente para vigilancia.
- **WebRTC** — latencia sub-segundo, ideal para PTZ, más complejo de operar.

Y a que la **nube pueda alcanzar** al servidor SecurOS del cliente (normalmente en LAN).

---

## 4. Requisitos del lado de ISS SecurOS (a confirmar con el cliente / integrador)

1. **Licencia / módulo de integración habilitado.** SecurOS expone su API/SDK bajo
   licencia (HTTP API / Integration Manager). Confirmar que está activo.
2. **Forma de entrega del video** — una de:
   - **A) HLS/WebRTC nativo** desde el *SecurOS Web Server / Media Gateway* →
     escenario ideal, se consume directo desde el driver.
   - **B) RTSP** (del servidor SecurOS o directo de cámara/NVR) → requiere **gateway
     transcodificador** (ver §5).
3. **Snapshot por cámara**: URI de fotograma (ONVIF snapshot o endpoint del API).
4. **Empuje de eventos**: confirmar que SecurOS puede llamar un HTTP externo
   (webhook / macro / script) al disparar analítica.
5. **PTZ** (opcional): endpoint del API de SecurOS u ONVIF PTZ.
6. **Credenciales de servicio**: usuario/API key/token de solo lectura de video y
   eventos (principio de mínimo privilegio).
7. **Inventario de cámaras**: id de cada cámara en SecurOS (→ `proveedor_ref`),
   nombre, si es PTZ, si tiene grabación, días de retención.
8. **Versión de SecurOS** y módulos contratados (HTTP API, LPR/ANPR, etc.).

---

## 5. Requisitos de red / conectividad (bloqueo más común)

SecurOS suele vivir en la LAN del cliente; las Edge Functions corren en la nube.
Hay que establecer ruta, con una de estas opciones:

| Opción | Descripción | Notas |
|---|---|---|
| **Túnel** | Cloudflare Tunnel / Tailscale desde el servidor SecurOS (o el gateway) | Sin abrir puertos entrantes; recomendado |
| **VPN sitio-a-sitio** | Enlace entre la red del cliente y la infraestructura | Requiere TI del cliente |
| **DMZ / IP pública** | SecurOS o el gateway publicado con hostname + TLS | Exige endurecimiento y certificado válido |

Requisitos comunes: **hostname/DNS estable**, **TLS (HTTPS/WSS)**, puertos definidos,
y que la URL final sea alcanzable desde Supabase.

### Escenario típico asumido en este plan (hasta confirmar con el cliente)

```
Cámaras (RTSP/ONVIF)
      │
      ▼
ISS SecurOS (LAN del cliente)  ──RTSP──►  Gateway (MediaMTX / go2rtc)
                                                │  transcodifica a HLS/WebRTC
                                                ▼
                                     Cloudflare Tunnel (HTTPS)
                                                │
                                                ▼
        SGS · Edge Function camara_vista  ──►  URL HLS firmada/efímera
                                                │
                                                ▼
                            Navegador (VisorCamara reproduce HLS)
```

- **Gateway sugerido:** MediaMTX o go2rtc (ligeros, RTSP→HLS/WebRTC, corren junto al
  SecurOS o en un equipo en la misma LAN).
- El gateway (no SecurOS) queda expuesto por el túnel, reduciendo superficie.

---

## 6. Trabajo en SGS (entregables de desarrollo)

### 6.1 Secretos (Supabase)
```
ISS_BASE_URL      = https://<gateway-o-securos>            (URL alcanzable)
ISS_TOKEN         = <api key / token de servicio>          (si el API lo exige)
ISS_STREAM_TMPL   = plantilla de URL HLS por cámara        (si aplica)
```
`npx supabase secrets set ISS_BASE_URL=... ISS_TOKEN=...`

### 6.2 Driver de streaming en `camara_vista` (rama `securos`)
- Entrada: `proveedor='securos'` + `proveedor_ref` (id de la cámara en SecurOS).
- Salida (contrato ya esperado por el visor):
  ```json
  {
    "nombre": "...", "proveedor": "securos", "estado": "ONLINE",
    "player_url": "https://.../cam/<ref>/index.m3u8",
    "imagen_url": null, "en_vivo": true, "expira_en_s": 300,
    "capacidades": { "live": true, "snapshot": true, "ptz": false, "grabacion": false, "eventos": true }
  }
  ```
- Si el VMS entrega URL firmada/efímera, poblar `expira_en_s` para que el visor
  refresque a tiempo. Si no hay señal, `NO_STREAM` con mensaje claro (nunca pantalla
  negra) — ya implementado como fallback.

### 6.3 Snapshot
- Reusar `rpc_camara_snapshot_evidencia` (ya existe). El driver debe entregar una
  imagen fresca (endpoint de snapshot del VMS o frame del HLS) que la Edge Function
  descarga server-side y sube a Storage como evidencia con custodia.

### 6.4 Webhook receptor de eventos (Edge Function nueva)
- Nombre sugerido: `securos_eventos`. Deploy con `--no-verify-jwt` (lo llama SecurOS,
  no una sesión de usuario) + validación de **secreto compartido** en cabecera
  (patrón `enviar_push`).
- Mapea el evento de SecurOS a un `insert` en `camara_eventos`
  (`tipo`, `severidad`, `descripcion`, `snapshot_url`, `ocurrido_en`, `datos_adicionales`),
  resolviendo la cámara por `proveedor_ref`.
- La UI (inspector, pestaña Eventos) y Realtime ya consumen esa tabla.

### 6.5 PTZ (fase posterior)
- Completar `accion === 'ptz'` en `camara_vista`: relay de
  `up/down/left/right/zoom/preset` al API de SecurOS. La UI ya habilita/deshabilita
  el control según `capacidades.ptz`.

### 6.6 Alta de cámaras SecurOS
- Añadir un flujo de alta (o importación desde el inventario del VMS) que capture
  `proveedor='securos'`, `vms='ISS SecurOS'`, `ip`, `proveedor_ref`, `es_ptz`,
  `grabacion_disponible`, `retencion_dias`. El esquema ya soporta estas columnas.

### 6.7 Visor
- Confirmar reproducción **HLS** (`.m3u8`) en `VisorCamara` (hls.js donde el navegador
  no lo soporte nativo). WebRTC solo si se elige ese transporte.

---

## 7. Fases

| Fase | Alcance | Depende de |
|---|---|---|
| **0 — Prueba de conectividad** | 1 cámara: RTSP→gateway→túnel→HLS reproducible manualmente | Red + gateway |
| **1 — Ver en vivo + snapshot** | Driver `securos` en `camara_vista`; alta de cámaras; visor HLS; snapshot→evidencia | Fase 0 |
| **2 — Eventos** | Webhook `securos_eventos`; mapeo a `camara_eventos`; validar/descartar y crear incidente | Empuje de eventos en SecurOS |
| **3 — PTZ y grabación** | Relay PTZ; enlace a grabación/retención del VMS | API PTZ / grabación del VMS |

---

## 8. Seguridad y cumplimiento

- **Llaves fuera del navegador:** el cliente nunca ve credenciales del VMS; todo pasa
  por `camara_vista` con el JWT del usuario (la RLS aplica igual que en el resto).
- **URLs de señal efímeras** siempre que el VMS lo permita (`expira_en_s`).
- **Mínimo privilegio** en la cuenta de servicio del VMS (solo video + eventos).
- **Webhook** protegido con secreto compartido (no GUC), como `enviar_push`.
- **WORM:** los snapshots quedan como evidencia inmutable con cadena de custodia.
- **Superficie mínima:** exponer el gateway, no el SecurOS completo.

---

## 9. Decisiones pendientes de confirmar con el cliente

1. **¿SecurOS entrega HLS/WebRTC nativo, o solo RTSP?** (define si hace falta gateway).
2. **¿Ruta de red** ya disponible (VPN/túnel/URL pública) de la nube al servidor, o la
   provee el cliente?
3. **Versión de SecurOS y módulos/licencias** (HTTP API, integración, LPR).
4. **Alcance de arranque:** ¿solo Fase 1 (ver + snapshot), o incluir eventos/PTZ?

---

## 10. Checklist de arranque

- [ ] Confirmar licencia de integración SecurOS.
- [ ] Definir transporte de video (HLS/WebRTC nativo vs. RTSP + gateway).
- [ ] Establecer conectividad (túnel/VPN/DMZ) y validar alcance desde la nube.
- [ ] Obtener credenciales de servicio e inventario de cámaras (`proveedor_ref`).
- [ ] **Fase 0:** reproducir 1 cámara vía HLS de extremo a extremo.
- [ ] **Fase 1:** driver `securos` + alta de cámaras + visor + snapshot.
- [ ] **Fase 2:** webhook `securos_eventos`.
- [ ] **Fase 3:** PTZ / grabación.

---

*Preparado para revisión. Los detalles del API de SecurOS (endpoints exactos de
streaming, snapshot y eventos) se ajustan tras confirmar versión y módulos con ISS /
el integrador del cliente.*
