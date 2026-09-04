# SGS Secure Access
## Especificación funcional y técnica para evaluación e implementación

### 1. Objetivo
Implementar acceso móvil **passwordless** para guardias, sin usuario ni contraseña memorizados, combinando:

1. **Algo que tiene:** credencial NFC asignada.
2. **Algo que es:** biometría validada localmente por el smartphone.
3. **Dispositivo autorizado:** smartphone corporativo previamente enrolado y asignado.

```text
NFC → DISPOSITIVO AUTORIZADO → BIOMETRÍA → PRUEBA CRIPTOGRÁFICA → BACKEND SGS → SESIÓN
```

Ningún elemento por sí solo debe permitir el acceso.

---

## 2. Principios de seguridad

- SGS no almacena huellas, rostro ni plantillas biométricas.
- El NFC no contiene contraseña, PIN, access token, refresh token ni clave privada.
- El UID de un TAG NFC simple no se considera prueba suficiente de identidad.
- La clave privada del dispositivo no abandona el almacenamiento seguro del teléfono.
- El backend valida cada nueva autenticación.
- Credencial, dispositivo y sesiones deben poder revocarse.
- Toda autenticación, rechazo, revocación y excepción queda auditada.
- IMEI, Android ID o UUID declarado por la app no deben ser la única prueba de identidad del dispositivo.
- El acceso normal requiere conexión al backend; el modo offline se considera una ampliación separada.

---

## 3. Regla de autorización

```text
guard.status == ACTIVE
AND credential.status == ACTIVE
AND credential.guard_id == guard.id
AND device.status == ACTIVE
AND device.guard_id == guard.id
AND challenge.signature == VALID
AND local_user_authentication == SUCCESS
AND access_policy == ALLOW
```

Resultado:

```text
TRUE  → crear sesión
FALSE → ACCESS_DENIED
```

---

## 4. Arquitectura

```text
┌──────────────────┐
│ Credencial NFC   │
└────────┬─────────┘
         ↓
┌────────────────────────┐
│ APP MÓVIL SGS          │
│ NFC Reader             │
│ Biometric API          │
│ Secure Keystore        │
│ Challenge Signing      │
│ Session Manager        │
└────────┬───────────────┘
         │ TLS
         ↓
┌────────────────────────┐
│ SGS SECURE ACCESS API  │
│ Auth Service           │
│ Device Service         │
│ Credential Service     │
│ Policy Engine          │
│ Session Service        │
│ Audit Service          │
└────────┬───────────────┘
         ↓
┌────────────────────────┐
│ Base de datos SGS      │
└────────────────────────┘
```

---

## 5. Componentes

### App móvil
- Lectura NFC.
- Enrolamiento controlado.
- API biométrica del sistema operativo.
- almacenamiento seguro de clave privada.
- firma de challenges.
- almacenamiento seguro de tokens.
- administración de sesión.
- hooks para integridad/MDM.

### Backend
```text
SecureAccessService
DeviceEnrollmentService
NFCCredentialService
AuthenticationChallengeService
AccessPolicyService
SessionService
AuditService
```

### Administración web
```text
Secure Access Dashboard
Dispositivos
Credenciales NFC
Asignaciones
Sesiones
Intentos rechazados
Revocaciones
Auditoría
Políticas
```

---

## 6. Modelo de datos

### SecureDevice
```text
device_id
device_uuid
device_name
platform
platform_version
app_version
public_key
key_algorithm
key_created_at
assigned_guard_id
enrollment_status
security_status
last_seen_at
revoked_at
revoked_by
created_at
```

Estados:
`PENDING | ACTIVE | SUSPENDED | REVOKED | REPLACED`

### NFCCredential
```text
credential_id
credential_reference
credential_type
card_serial_reference
assigned_guard_id
status
issued_at
expires_at
revoked_at
revoked_by
metadata
```

Estados:
`PENDING | ACTIVE | SUSPENDED | REVOKED | EXPIRED | LOST | REPLACED`

### DeviceAssignment
```text
assignment_id
guard_id
device_id
assigned_at
assigned_by
valid_from
valid_until
status
```

### CredentialAssignment
```text
assignment_id
guard_id
credential_id
assigned_at
assigned_by
valid_from
valid_until
status
```

### AuthenticationChallenge
```text
challenge_id
device_id
credential_id
nonce
created_at
expires_at
used_at
status
```

El nonce debe ser criptográficamente aleatorio, de un solo uso y de corta vigencia.

### SecureAccessSession
```text
session_id
guard_id
device_id
credential_id
created_at
expires_at
last_activity_at
status
refresh_token_reference
revoked_at
revocation_reason
```

### SecureAccessAudit
```text
audit_id
timestamp
guard_id
device_id
credential_id
event_type
result
reason_code
ip_address
app_version
device_security_status
site_id
metadata
```

---

## 7. Enrolamiento del dispositivo

El guardia no debe poder autoasignarse libremente un nuevo dispositivo.

```text
Administrador selecciona guardia
        ↓
Inicia enrolamiento
        ↓
App genera par criptográfico
        ↓
PRIVATE KEY → almacenamiento seguro del dispositivo
PUBLIC KEY  → Backend SGS
        ↓
Backend registra dispositivo
        ↓
Administrador confirma asignación
        ↓
DEVICE = ACTIVE
```

La clave privada debe ser no exportable cuando la plataforma/hardware lo permita.

---

## 8. Enrolamiento NFC

```text
Administrador
   ↓
Selecciona guardia
   ↓
Lee/registra credencial
   ↓
SGS crea credential_id
   ↓
Asocia guardia
   ↓
Define vigencia
   ↓
ACTIVE
```

Debe permitir suspender, revocar, reportar pérdida, reemplazar y consultar historial.

### Datos en el NFC

Preferentemente solo una referencia opaca:

```text
sgs://credential/CRED-00921
```

No almacenar datos personales innecesarios, permisos, roles ni secretos.

Si se utiliza un TAG NFC simple, el NFC es **identificador/iniciador**, no autenticador fuerte único. Para necesidades superiores debe evaluarse una credencial NFC criptográfica.

---

## 9. Flujo normal de autenticación

```text
1. Abrir SGS
2. "Acerque su credencial"
3. Leer NFC
4. Obtener credential_reference
5. Enviar credential + device_id al backend
6. Backend valida guardia, credencial, dispositivo y asignaciones
7. Backend genera challenge aleatorio
8. App solicita autenticación biométrica/local
9. Autenticación válida
10. Almacenamiento seguro permite usar la private key
11. App firma challenge
12. Backend verifica firma con public key registrada
13. Policy Engine evalúa condiciones
14. Backend crea sesión
15. App recibe tokens de sesión
16. Acceso autorizado
```

### Secuencia

```text
APP                         BACKEND
 │                             │
 │ credential + device         │
 │────────────────────────────>│
 │                             │ Validar relaciones
 │<──────── challenge ─────────│
 │                             │
 │ biometría/local auth        │
 │ firma con private key       │
 │──────── signature ─────────>│
 │                             │ Verificar firma
 │                             │ Evaluar política
 │<──────── session ───────────│
```

---

## 10. API conceptual

### Inicio
```http
POST /api/secure-access/auth/start
```

```json
{
  "credential_reference": "CRED-00921",
  "device_id": "DEV-A82F921",
  "app_version": "1.0.0"
}
```

Respuesta:
```json
{
  "challenge_id": "CH-123",
  "challenge": "RANDOM_CHALLENGE",
  "expires_in": 60
}
```

### Completar
```http
POST /api/secure-access/auth/complete
```

```json
{
  "challenge_id": "CH-123",
  "device_id": "DEV-A82F921",
  "signature": "SIGNED_CHALLENGE"
}
```

Backend verifica challenge, expiración, no reutilización, clave pública, firma, credencial, dispositivo, guardia y políticas.

---

## 11. Biometría

SGS **no recibe ni almacena**:

```text
huella
rostro
imagen facial
template biométrico
```

La plataforma móvil realiza la autenticación local:

```text
BIOMETRÍA / CREDENCIAL LOCAL
        ↓
Sistema operativo
        ↓
Autoriza uso de clave privada
        ↓
Firma challenge
```

---

## 12. Sesiones

Después de autenticar:

```text
Access Token
Refresh Token
Session ID
Expiration
```

Requisitos:
- access token corto;
- refresh token protegido;
- rotación de refresh token;
- revocación server-side;
- cierre de sesiones al revocar guardia, dispositivo o credencial;
- tokens nunca almacenados en almacenamiento inseguro.

---

## 13. Escenarios de rechazo

### NFC correcto, teléfono incorrecto
```text
NFC ✓
Guardia ✓
Dispositivo ✕

ACCESS_DENIED
DEVICE_NOT_ASSIGNED
```

### Credencial robada
El poseedor sigue necesitando dispositivo asignado y autenticación local.

### Teléfono robado
Administrador:
```text
DEV-A82F921 → REVOKED
```
Backend rechaza nuevos challenges y revoca sesiones/tokens. Con MDM puede añadirse bloqueo o borrado corporativo.

---

## 14. Cambio de dispositivo o guardia

```text
Desasignar relación anterior
       ↓
Revocar sesiones
       ↓
Renovar/recrear claves según política
       ↓
Nueva asignación administrativa
       ↓
Activar
```

No reutilizar silenciosamente la identidad criptográfica anterior.

---

## 15. Login y asistencia son eventos distintos

```text
LOGIN != CHECK_IN
```

Después del login puede mostrarse:

```text
Guardia G-00281
Sitio: CEDIS Norte
Puesto: Acceso Principal
Turno: 14:00–22:00

[INICIAR TURNO]
```

Esto permite auditar separadamente autenticación y asistencia.

---

## 16. Política contextual opcional

Además de identidad, pueden evaluarse:

```text
guard.has_active_shift
guard.assigned_site == expected_site
current_time within allowed_window
device.managed == true
device.compliant == true
```

Conviene distinguir entre condiciones que **bloquean login** y condiciones que solo restringen funciones.

---

## 17. UI móvil

Pantalla 1:
```text
┌─────────────────────────┐
│           SGS           │
│                         │
│ Acerque su credencial   │
│                         │
│          ))) NFC        │
└─────────────────────────┘
```

Pantalla 2:
```text
Credencial reconocida
Dispositivo autorizado ✓

Confirme su identidad

[ BIOMETRÍA ]
```

Pantalla 3:
```text
IDENTIDAD CONFIRMADA

Sitio: CEDIS Norte
Puesto: Acceso Principal
Turno: 14:00–22:00

[INICIAR TURNO]
```

---

## 18. Consola administrativa

```text
Guardia G-00281
────────────────────────

Credencial
CRED-00921      ACTIVE

Dispositivo
DEV-A82F921     ACTIVE

Último acceso
03/09/2026 13:52

Sesiones activas: 1
Intentos rechazados: 0
```

Acciones:
```text
REVOCAR/SUSPENDER CREDENCIAL
REPORTAR CREDENCIAL PERDIDA
DESVINCULAR DISPOSITIVO
REVOCAR DISPOSITIVO
ASIGNAR NUEVO DISPOSITIVO
CERRAR SESIONES
VER AUDITORÍA
```

---

## 19. Códigos de resultado

```text
CREDENTIAL_UNKNOWN
CREDENTIAL_INACTIVE
CREDENTIAL_EXPIRED
CREDENTIAL_REVOKED
DEVICE_UNKNOWN
DEVICE_NOT_ASSIGNED
DEVICE_REVOKED
GUARD_INACTIVE
ASSIGNMENT_MISMATCH
CHALLENGE_EXPIRED
CHALLENGE_ALREADY_USED
INVALID_SIGNATURE
LOCAL_AUTH_NOT_AVAILABLE
DEVICE_SECURITY_FAILED
POLICY_DENIED
SESSION_REVOKED
```

Los detalles técnicos se registran en auditoría; al guardia se le muestra un mensaje sencillo.

---

## 20. Auditoría

Eventos mínimos:
```text
DEVICE_ENROLLED
DEVICE_ASSIGNED
DEVICE_REVOKED
CREDENTIAL_CREATED
CREDENTIAL_ASSIGNED
CREDENTIAL_REVOKED
AUTH_STARTED
AUTH_SUCCEEDED
AUTH_FAILED
SESSION_CREATED
SESSION_REFRESHED
SESSION_REVOKED
LOGOUT
SECURITY_POLICY_DENIED
```

---

## 21. Protección contra abuso

Aplicar rate limiting a autenticación y challenge-response por:

- dispositivo;
- credencial;
- IP;
- challenges inválidos;
- patrones repetitivos.

Implementar bloqueo temporal y alertas administrativas cuando corresponda.

---

## 22. MDM

Para smartphones corporativos, MDM puede aportar:

```text
dispositivo administrado
cifrado obligatorio
bloqueo de pantalla
versión mínima del SO
instalación controlada de SGS
revocación/bloqueo remoto
wipe corporativo
cumplimiento de políticas
```

El Policy Engine podría exigir:

```text
device.managed == true
AND device.compliant == true
```

---

## 23. Integridad del dispositivo

Evaluar mecanismos nativos para obtener señales sobre:

- integridad de la app;
- instalación legítima;
- dispositivo comprometido;
- entorno alterado.

Representar:

```text
TRUSTED
ACCEPTABLE
WARNING
BLOCKED
UNKNOWN
```

Una sola señal de integridad no debe ser el único control de acceso.

---

## 24. Operación offline

Debe tratarse como una ampliación de mayor riesgo.

Recomendación inicial:

```text
NUEVA AUTENTICACIÓN = ONLINE
```

Si posteriormente es requisito, evaluar una autorización offline firmada, ligada a guardia y dispositivo, de vigencia corta y alcance limitado.

Nunca implementar:

```text
"sin Internet → aceptar cualquier NFC conocido"
```

---

## 25. Recuperación y contingencia

Definir procedimientos para:

```text
NFC perdido
teléfono perdido
teléfono dañado
autenticación biométrica/local no disponible
cambio de dispositivo
cambio de guardia
guardia temporal
emergencia operacional
```

No utilizar una contraseña maestra compartida como bypass.

Una excepción administrativa debe requerir autorización, motivo, vigencia corta y auditoría reforzada.

---

## 26. Dependencias a evaluar con desarrollo

### Android
- NFC APIs.
- BiometricPrompt.
- Android Keystore.
- claves respaldadas por hardware cuando estén disponibles.
- StrongBox cuando el equipo lo soporte.
- almacenamiento seguro de tokens.
- señales de integridad.
- compatibilidad real de los modelos corporativos.

### iOS, si aplica
- Core NFC.
- LocalAuthentication.
- Keychain.
- Secure Enclave cuando corresponda.
- mecanismos de attestation/integridad adecuados.

### Backend
- generación segura de nonce;
- verificación de firmas;
- registro de claves públicas;
- sesiones y revocación;
- rate limiting;
- auditoría;
- Policy Engine.

---

## 27. Decisiones antes de desarrollar

1. Android solamente o Android+iOS.
2. Modelos exactos de smartphones.
3. Equipos corporativos o BYOD.
4. Uso o no de MDM.
5. Tipo exacto de credencial NFC.
6. Necesidad real de acceso offline.
7. Duración de sesión.
8. NFC en cada acceso o solo para crear una nueva sesión.
9. Reautenticación biométrica después de bloqueo/inactividad.
10. Número máximo de dispositivos por guardia.
11. Posibilidad de compartir/reasignar equipos entre turnos.
12. Procedimiento de contingencia.
13. Qué hacer si no existe autenticación biométrica disponible.
14. Condicionar o no el acceso al turno/sitio.
15. Nivel mínimo de integridad/compliance requerido.

---

## 28. Implementación por fases

### Fase 1 — MVP seguro
```text
Device enrollment
NFC credential
Device assignment
Local biometric authentication
Secure key pair
Challenge-response
Session management
Revocation
Audit
```

### Fase 2 — Administración
```text
Secure Access Dashboard
Credential lifecycle
Device lifecycle
Session control
Reason codes
Policies
Reports
```

### Fase 3 — Hardening
```text
MDM
Device compliance
App/device integrity
Advanced risk rules
Offline controlado
NFC criptográfico si el riesgo lo justifica
```

---

## 29. Pruebas obligatorias

Probar:

```text
NFC correcto + dispositivo correcto + biometría correcta
NFC correcto + dispositivo incorrecto
NFC incorrecto + dispositivo correcto
NFC revocado
Dispositivo revocado
Guardia inactivo
Challenge expirado
Challenge reutilizado
Firma incorrecta
Biometría/local auth fallida
Sin Internet
App reinstalada
Dispositivo reseteado
Sesión revocada desde backend
NFC perdido
Teléfono perdido
Cambio de guardia
```

---

## 30. Criterios de aceptación

SGS Secure Access se considera correctamente implementado cuando:

- El guardia no necesita usuario/contraseña en el flujo normal.
- NFC por sí solo no permite acceso.
- El dispositivo por sí solo no permite acceso.
- La biometría por sí sola no permite acceso.
- El backend verifica criptográficamente el dispositivo.
- Los challenges son de un solo uso y expiran.
- La clave privada permanece protegida localmente.
- SGS no almacena biométricos.
- Credenciales y dispositivos pueden revocarse.
- Las sesiones pueden cerrarse remotamente.
- Los rechazos quedan auditados.
- El administrador puede reconstruir quién, cuándo, desde qué dispositivo y con qué credencial inició sesión.

---

## 31. Implicaciones de implementación

### Complejidad baja/media
- NFC.
- UI passwordless.
- asignación guardia-dispositivo.
- catálogo de credenciales.
- consola administrativa básica.

### Complejidad media
- API biométrica.
- almacenamiento seguro.
- ciclo de vida de dispositivos.
- sesiones y revocación.
- auditoría.

### Complejidad media/alta
- claves no exportables;
- challenge-response;
- recuperación y rotación;
- políticas de dispositivo;
- compatibilidad entre fabricantes.

### Complejidad alta/opcional
- offline seguro;
- MDM multivendor;
- attestation avanzada;
- NFC criptográfico;
- políticas adaptativas de riesgo.

---

## 32. Arquitectura recomendada para primera versión

```text
NFC
 +
DISPOSITIVO CORPORATIVO ENROLADO
 +
BIOMETRÍA / AUTENTICACIÓN LOCAL
 +
CLAVE PRIVADA PROTEGIDA
 +
CHALLENGE-RESPONSE CON BACKEND
 +
SESIÓN TEMPORAL
 +
REVOCACIÓN
 +
AUDITORÍA
```

Evitar inicialmente la complejidad de autenticación offline y credenciales NFC criptográficas salvo que el análisis de riesgo del cliente lo exija.

---

## 33. Principio rector

> **La credencial NFC identifica lo que el guardia tiene; la autenticación biométrica/local confirma quién está usando el dispositivo; y la criptografía demuestra al backend SGS que la solicitud procede del dispositivo corporativo enrolado.**

Los tres elementos deben funcionar como controles complementarios.

---

## 34. La solución adecuada para SGS (modelo elegido)

> Esta sección es el **modelo que SGS va a implementar**. Toma la spec anterior como referencia de máxima garantía, pero la **simplifica para el modelo de amenaza real de seguridad privada**: acceso *simple* para el guardia, *suficientemente seguro*, y **encajado en la arquitectura que SGS ya tiene** (Supabase directo, sin API server). Se trabajará después.

### 34.1 Principio rector (versión SGS)

> **Para entrar necesitas, al mismo tiempo: desbloquear con tu biometría (quién eres), presentar tu Tag NFC (lo que tienes), estar en el smartphone asignado a ti (dispositivo enrolado), y estar en turno. Al terminar el turno, el sistema te expulsa.** Cada factor lo valida quien debe — la biometría el hardware del teléfono, el dispositivo y el turno el backend — de modo que es una **AND real**, no cuatro validaciones de pantalla.

### 34.2 Los cuatro factores sumados

```text
BIOMETRÍA (quién soy)          → prompt propio de SGS, no solo el unlock del SO
   +
TAG NFC (lo que tengo)         → identifica al guardia; posesión física revocable
   +
DISPOSITIVO ASIGNADO (enrolado)→ llave por hardware verificada por el backend
   +
EN TURNO (contexto)            → validado server-side
   ↓
SESIÓN (dura el turno) → AL CERRAR TURNO = EXPULSIÓN
```

### 34.3 Cómo funciona (técnico, aterrizado a SGS)

- **Login diario (lo que ve el guardia):** `Abrir SGS → acercar Tag → biometría → sesión lista`.
- **Sesión = Supabase Auth nativo (no se inventa).** Al enrolar, el admin crea la cuenta Supabase del guardia (ligada por `personal.usuario_id`). El **refresh token vive en el Keystore del teléfono (cifrado por hardware) y solo se libera tras la biometría de SGS**. Así **RLS, refresh, rotación y revocación las hace Supabase** — no se construye un "SessionService" ni se acuñan JWT a mano.
- **Prueba de dispositivo (anti-suplantación):** un **par de llaves no exportable en el Keystore** firma un *challenge* del backend en el **enrolamiento** (y opcional al renovar). Convierte "device id" (spoofeable) en prueba real de que es *el* teléfono corporativo. Es la única pieza criptográfica que se conserva; es barata.
- **NFC = posesión + check-in, no autenticador único.** El Tag identifica al guardia (por UID, compatible con el entitlement iOS `TAG`); su clonabilidad se neutraliza porque **sin el teléfono asignado no sirve**. El mismo NFC se usa para **check-in en el puesto/rondín**.
- **`asignado AND en_turno AND dispositivo_válido` se evalúa en el backend** (Edge Function / RLS), nunca en la UI.
- **Expulsión al cerrar turno:** la sesión se ata a la ventana del turno; al terminar, cierre server-side + logout. **Re-prompt biométrico al reanudar tras inactividad** (cubre el robo a media jornada).
- **Step-up biométrico** en acciones sensibles (iniciar turno, cerrar incidente) → no-repudio, todo a bitácora.

### 34.4 Qué se conserva y qué se recorta de la spec original

| De la spec | Decisión SGS |
|---|---|
| Passwordless, biometría local, sin biométricos en servidor | **Se conserva** |
| Dispositivo enrolado por admin, todo revocable y auditado | **Se conserva** |
| Login ≠ check-in (§15) | **Se conserva** |
| Challenge-response con llave no exportable | **Se conserva** (para prueba de dispositivo) |
| NFC como **factor de login** con ciclo de credencial (alta/asignación/pérdida/reemplazo) | **Se recorta** → NFC pasa a **check-in** / posesión; se elimina ese ciclo de vida |
| "SessionService" propio + acuñar JWT + refresh/revocación a mano | **Se recorta** → **se reusa Supabase Auth** completo |

### 34.5 Las 4 condiciones que hacen real la seguridad

Sin estas, "sumar factores" se vuelve inseguro en silencio:

| # | Condición |
|---|---|
| a | **SGS pide la biometría él mismo** al entrar y al reanudar — no se apoya solo en que el teléfono esté desbloqueado |
| b | El dispositivo se ata por **llave de hardware verificada por el backend** (no device id, no el Tag) |
| c | **`asignado AND en_turno AND dispositivo_válido` se evalúa server-side** (RLS/Edge Function), no en la UI |
| d | En el equipo corporativo **solo está enrolada la huella del guardia** (política / MDM) |

### 34.6 Propiedades de seguridad conservadas

| Propiedad | ¿Se mantiene? |
|---|---|
| Passwordless para el guardia | ✅ |
| Ligado al dispositivo corporativo | ✅ (llave no exportable + token en Keystore) |
| Persona presente | ✅ (biometría en login y step-up) |
| Servidor no almacena biométricos | ✅ |
| Revocable (guardia / dispositivo / sesión) | ✅ (Supabase admin + revocar dispositivo) |
| Auditado / no-repudio | ✅ (bitácora) |
| Un solo factor no basta | ✅ (dispositivo **y** biometría **y** turno) |

### 34.7 Riesgos residuales y cuándo se atienden

- **Teléfono rooteado/comprometido** (podría burlar el gate biométrico o extraer el token): → **Play Integrity / attestation** en fase de hardening.
- **Colusión voluntaria** (el guardia presta teléfono + dedo + Tag): ningún MFA lo impide; se mitiga con auditoría y step-up.
- **Coacción:** fuera del alcance técnico.

Trade-off honesto asumido: se cambia la pureza de *"la llave privada nunca sale"* por *"refresh token en almacenamiento seguro gated por biometría"*. Aceptable en **equipos corporativos enrolados**; attestation lo cierra en fase posterior.

### 34.8 Encaje con lo que SGS ya tiene

- **`bodycams` + `rpc_validar_bodycam`** (device-binding por `expo-application`) → se **eleva** a llave por hardware.
- **`personal.usuario_id`** (`rpc_ligar_usuario_guardia`) → guardia ↔ cuenta Supabase para emitir sesión.
- **`react-native-nfc-manager`** (rondines, entitlement iOS `TAG`) → NFC de check-in.
- **Bitácora, RLS, roles, `crear_usuario`, folios, WORM** → andamiaje ya existente.

### 34.9 Alcance de la primera versión

- **Android primero** (equipos corporativos). iOS **eliminado** de esta versión.
- Fase 1 se reduce respecto a la spec original (se quitan el ciclo NFC-credencial y el session/JWT propio): **enrolamiento + llave/biometría en Keystore + reuso de Supabase Auth + validación server-side de asignación/turno + expulsión al cerrar turno + bitácora + pantallas + acciones admin de revocar**.
- Punto a confirmar antes de codificar el backend: **esquema de firma de JWT del proyecto** (HS256 legacy vs signing keys nuevas) — aunque al reusar el refresh token de Supabase, el impacto es menor.

### 34.10 Siguiente paso sugerido

**Spike Android** que valida el eslabón clave en un solo build: *biometría propia de SGS → la llave del Keystore firma un challenge → el backend valida dispositivo + turno → se libera la sesión de Supabase*. Si ese eslabón funciona, el resto es mecánico.
