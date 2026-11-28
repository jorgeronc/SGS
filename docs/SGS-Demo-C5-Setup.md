# SGS — Preparar usuario de demostración C5 / C4

Guía para dejar un **usuario de demostración** de un **centro de monitoreo institucional**
(C5 por estado / C4 por municipio) que gestiona la seguridad de **sus propias instalaciones**.
Es un **operador de consola** con acceso solo a los módulos de gestión de instalaciones
(sin Copiloto IA ni Seguridad Logística).

> Todo se hace en **`/admin`** (hay que entrar con un usuario de rol `administrador`).
> El control de módulos por rol es la matriz rol → módulos (migraciones `0131`/`0132`):
> `roles.modulos = null` → sin restricción (ve todo); `array` → solo esos módulos.
> El menú y el acceso a cada pantalla se filtran por esto en `AppShell.tsx`.

---

## Paso 1 — Crear el rol (pestaña **Usuarios y roles → Roles**)

En **"Crear rol nuevo"**:

- **Clave:** `c5_instalaciones`
- **Nombre visible:** `C5 — Seguridad de instalaciones`
- Clic **Crear rol**.

Nace **restringido con 0 módulos** (los roles nuevos arrancan vacíos por diseño).
Aparece en la lista con la etiqueta `0 mód.`.

## Paso 2 — Asignar módulos al rol

Selecciona el rol en la lista de la izquierda. **Deja SIN marcar** "Sin restricción"
y palomea exactamente estas casillas (están agrupadas igual que en pantalla):

| Grupo (como se ve) | Casillas a marcar | href |
|---|---|---|
| **Panel de Información** | Panel Operativo | `/` |
| **Central de Operaciones** | Central / Despacho | `/cad` |
| | Mapa Operativo | `/mapa-operacional` |
| | Videovigilancia | `/videovigilancia` |
| | Chats | `/chat` |
| | Directorio de autoridades | `/directorio` |
| | Evidencias | `/evidencias` |
| | Alerta general | `/alertas` |
| **Vigilancia en sitio** | Sitios | `/sitios` |
| | Puntos de control | `/puntos-control` |
| | Programar rondín | `/rondines/programados` |
| | Tareas | `/tareas` |
| | Bitácora de seguridad | `/rondines` |
| | Supervisión rondines | `/supervision` |
| | Rol de turnos | `/turnos` |
| **Control de Acceso** | Bitácora de accesos | `/accesos` |
| | Citas visitantes | `/citas-visitantes` |
| | Credenciales | `/credenciales` |
| **Administración** | Guardias | `/personal` |
| | Unidades | `/patrullas` |
| | Smartphones | `/bodycams` |
| | Auditoría | `/bitacora` |

**Total: 22 módulos.** Clic **Guardar módulos del rol**.

**Dejar SIN marcar** (quedan ocultos al cliente): todo **Seguridad logística**,
**Copiloto IA**, **Cumplimiento / Metas de SLA**, **Contratos / Tablero de contratos /
Clientes**, **Citas CEDIS**, **Proveedores**, **Reportes SLA** y todo **Configuración**.

> `/perfil` y `/buscar` siempre están disponibles aunque no se marquen.
> `/admin` y Configuración quedan fuera porque no se marcaron — correcto para una demo.

### Opcionales (según lo que se quiera lucir)

- Rol de turnos con horas: añade **Horas trabajadas** (`/reporte-horas`).
- Si el centro maneja zonas / armamento / radios: **Zonas de control** (`/zonas`),
  **Armamento** (`/armamento`), **Comunicación** (`/comunicacion`).

## Paso 3 — Crear el usuario (pestaña **Usuarios**)

En **"Crear usuario nuevo"**:

- **Correo:** el de la demo (ej. `demo.c5@consultechseguridad.mx`)
- **Nombre:** `Operador C5 (Demo)`
- **Contraseña inicial:** mínimo 6 caracteres
- **Rol:** **C5 — Seguridad de instalaciones** (ya aparece en el desplegable)
- Clic **Crear usuario**.

La cuenta se crea **confirmada** y sirve para web y móvil. Déjalo
**"— Sin guardia —"** (el vínculo usuario ↔ guardia es solo para la app del guardia
en campo; un operador de consola no se liga a un elemento).

## Paso 4 — Primer acceso

- Entra a `sgs-two-phi.vercel.app` con ese correo/contraseña. En el **primer login se
  activa el 2FA**: ten a la mano una app de autenticación (Google Authenticator / Authy)
  para escanear el QR. Sin 2FA no se entra a las pantallas internas (requisito del sistema).
- Al entrar, el menú lateral mostrará **solo** los 22 módulos de arriba y aterrizará en
  el Panel Operativo.

---

## Para demostrar la app móvil del guardia

La app del guardia necesita un **usuario aparte** con rol `guardia`, **ligado a un elemento**
(columna "Guardia (app)" en Usuarios) y validado como bodycam-smartphone en Perfil
(`rpc_validar_bodycam`, id de dispositivo por `expo-application`).

---

*SGS — Sistema de Gestión de Seguridad · Guía interna de demostración (C5 / C4).*
