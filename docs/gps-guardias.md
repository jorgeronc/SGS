# GPS en vivo de guardias (SGS) — especificación de implementación

Portar a SGS el rastreo de ubicación que ya existe en SCP: el **móvil del guardia** reporta su posición cada N segundos (parámetro editable en la web, leído al iniciar sesión) y la **central de monitoreo** la ve en un mapa. Rastreo en **segundo plano / pantalla bloqueada**; lectura **restringida a mandos**.

> **Origen:** feature construida en SCP (`sistema-central-policial`, migración `0050_gps_oficiales.sql`). SGS es fork puro, así que backend y móvil son casi idénticos. **La diferencia grande está en la web:** SGS borró los mapas de CAD/incidentes, por lo que hay que **crear una página de monitoreo nueva** donde colgar a los guardias.

## Decisiones heredadas (ya tomadas en SCP)
- **Rastreo en segundo plano** (no solo con app abierta) → requiere `expo-task-manager` + permiso de ubicación *always* + servicio en primer plano (notificación persistente) + nuevo build EAS.
- **Lectura restringida a mandos** (no guardia↔guardia). En SGS la central de monitoreo = roles `supervisor` / `administrador` (ajusta si tienes un rol de "monitoreo").

## Diferencias clave SGS vs SCP
| Tema | SCP | SGS |
|---|---|---|
| Nº de migración | `0050` | **`0054`** (la última es `0053_rondines`) |
| Terminología | oficial | **guardia** |
| Tabla de posiciones | `ubicaciones_oficiales` | `ubicaciones_guardias` |
| Roles que leen | supervisor/investigador/administrador | **supervisor/administrador** |
| Dónde se ve | `/cad/mapa` y `/incidentes/mapa` (ya existían) | **página nueva** `/monitoreo` (los mapas policiales se borraron) |
| Contexto del mapa | incidentes/reportes | **sitios/puestos** (la tabla `sitios` ya tiene `latitud/longitud`) |

---

## 1) Backend — `supabase/migrations/0054_gps_guardias.sql`

Idéntico a `0050_gps_oficiales.sql` de SCP salvo: nombre de tabla, roles de lectura y comentarios. `config_sistema` ya existe en el fork.

```sql
-- =====================================================================
-- 0054_gps_guardias.sql
-- Ubicación en vivo de guardias: el móvil reporta su posición cada N seg
-- (parámetro en config_sistema, leído al iniciar sesión) y la central la ve
-- en el mapa de monitoreo. Solo mandos (supervisor/administrador) leen; cada
-- guardia solo escribe su propia fila. Telemetría viva (upsert), no WORM.
-- =====================================================================

-- 1) Parámetros de rastreo en la config del sistema (singleton) ---------
alter table config_sistema
  add column if not exists gps_activo        boolean not null default true,
  add column if not exists gps_intervalo_seg integer not null default 60,
  add column if not exists gps_ventana_seg   integer not null default 180;

comment on column config_sistema.gps_activo        is 'Interruptor maestro del rastreo GPS de guardias (lo lee el móvil al iniciar sesión).';
comment on column config_sistema.gps_intervalo_seg is 'Cada cuántos segundos reporta el móvil su ubicación (mínimo efectivo 10).';
comment on column config_sistema.gps_ventana_seg   is 'Segundos sin reportar tras los cuales el guardia deja de considerarse "en línea".';

do $$ begin
  alter table config_sistema add constraint chk_gps_intervalo check (gps_intervalo_seg between 10 and 3600);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table config_sistema add constraint chk_gps_ventana check (gps_ventana_seg between 30 and 7200);
exception when duplicate_object then null; end $$;

-- 2) Tabla de última posición por guardia ------------------------------
create table if not exists ubicaciones_guardias (
  personal_id    uuid primary key references personal(id),
  user_id        uuid not null,
  etiqueta       text,
  unidad         text,                             -- sitio/puesto o unidad asignada (viene del móvil)
  latitud        double precision not null,
  longitud       double precision not null,
  precision_m    double precision,
  rumbo          double precision,
  velocidad      double precision,
  en_linea       boolean not null default true,
  actualizado_en timestamptz not null default now()
);

create index if not exists idx_ubic_guardias_linea on ubicaciones_guardias(en_linea, actualizado_en);
comment on table ubicaciones_guardias is 'Última posición GPS conocida de cada guardia con la app móvil (telemetría viva, upsert por personal_id).';

-- 3) No se borran por la app (telemetría) ------------------------------
revoke delete on ubicaciones_guardias from authenticated, anon;

-- 4) RLS ---------------------------------------------------------------
alter table ubicaciones_guardias enable row level security;

-- Lectura: solo central/mandos.
drop policy if exists sel_ubic_guardias on ubicaciones_guardias;
create policy sel_ubic_guardias on ubicaciones_guardias for select to authenticated
  using (coalesce(fn_rol_actual(), '') in ('supervisor', 'administrador'));

-- Escritura: cada guardia solo su propia fila.
drop policy if exists ins_ubic_guardias on ubicaciones_guardias;
create policy ins_ubic_guardias on ubicaciones_guardias for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists upd_ubic_guardias on ubicaciones_guardias;
create policy upd_ubic_guardias on ubicaciones_guardias for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 5) Realtime ----------------------------------------------------------
do $$ begin
  alter publication supabase_realtime add table ubicaciones_guardias;
exception when duplicate_object then null; end $$;
```

---

## 2) Web

### 2a) `frontend/lib/config.ts` — interfaz
Agregar a `ConfigSistema`: `gps_activo: boolean; gps_intervalo_seg: number; gps_ventana_seg: number;` (idéntico a SCP).

### 2b) `frontend/app/configuracion/page.tsx` — Parámetros
- En `VACIA`: `gps_activo: true, gps_intervalo_seg: 60, gps_ventana_seg: 180`.
- En el `update` de `guardar`: agregar los tres campos (clamp igual que SCP).
- En el form, sección nueva **"Rastreo GPS de guardias"**: checkbox `gps_activo` + inputs numéricos `gps_intervalo_seg` y `gps_ventana_seg`. Copiar el bloque de SCP y cambiar "oficiales" → "guardias".

### 2c) `frontend/app/components/MapaReportes.tsx` — capa en vivo
Portar tal cual de SCP (renombrando `OficialMapa`→`GuardiaMapa`, `pintarOficiales`→`pintarGuardias`, `oficialesRef/LayerRef`→`guardiasRef/LayerRef`). Los 4 cambios:
1. Interfaz `GuardiaMapa` + helper `hace()` + `pintarGuardias()` (punto azul `#1e88e5`, popup `👷 etiqueta · sitio · hace Ns`).
2. Prop `guardias?: GuardiaMapa[] = []` + refs `guardiasRef`, `guardiasLayerRef`.
3. En el effect base: crear `L.layerGroup().addTo(map)` y `pintarGuardias(...)` desde el ref.
4. Effect nuevo `[guardias]`: actualiza el ref y repinta la capa **sin reconstruir el mapa**.

> Código de referencia exacto: `sistema-central-policial/frontend/app/components/MapaReportes.tsx` (misma estructura, ya lo verás en el diff de SCP).

### 2d) `frontend/lib/guardiasVivo.ts` — hook (nuevo)
Copia de `oficialesVivo.ts` cambiando la tabla:

```ts
import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import type { GuardiaMapa } from "@/app/components/MapaReportes";

// Guardias con la app móvil "en línea" (reportando dentro de la ventana). La RLS
// solo devuelve filas a mandos; a un guardia le llega vacío.
export function useGuardiasEnLinea(): GuardiaMapa[] {
  const [guardias, setGuardias] = useState<GuardiaMapa[]>([]);
  useEffect(() => {
    let cancelado = false;
    let ventanaSeg = 180;
    let timer: ReturnType<typeof setInterval> | undefined;
    async function cargar() {
      const cutoff = new Date(Date.now() - ventanaSeg * 1000).toISOString();
      const { data } = await supabase
        .from("ubicaciones_guardias")
        .select("personal_id, etiqueta, unidad, latitud, longitud, actualizado_en")
        .eq("en_linea", true)
        .gt("actualizado_en", cutoff);
      if (!cancelado) setGuardias((data as GuardiaMapa[]) ?? []);
    }
    (async () => {
      const { data: cfg } = await supabase.from("config_sistema")
        .select("gps_ventana_seg").eq("id", true).maybeSingle();
      if (cfg?.gps_ventana_seg) ventanaSeg = Number(cfg.gps_ventana_seg);
      await cargar();
      timer = setInterval(cargar, 15000);
    })();
    const ch = supabase.channel("ubic-guardias")
      .on("postgres_changes", { event: "*", schema: "public", table: "ubicaciones_guardias" }, () => cargar())
      .subscribe();
    return () => { cancelado = true; if (timer) clearInterval(timer); supabase.removeChannel(ch); };
  }, []);
  return guardias;
}
```

### 2e) `frontend/app/monitoreo/page.tsx` — página nueva (lo único sin equivalente directo)
No hay mapa CAD en SGS, así que se crea uno de monitoreo: **sitios como pines + guardias como puntos azules en vivo**. Reusa `MapaReportes`.

- Registrar `/monitoreo` en `AppShell` como ruta **LIMPIA** (pantalla completa, como los mapas de SCP) — busca el arreglo `LIMPIAS` en `AppShell.tsx` y agrega `"/monitoreo"`.
- Agregar el enlace en el sidebar (sección Operaciones).
- Cargar sitios activos con `latitud/longitud` como `reportes` (pin), y `useGuardiasEnLinea()` para la capa `guardias`.

Esqueleto:
```tsx
"use client";
import { useEffect, useState } from "react";
import MapaReportes, { type ReporteMapa } from "@/app/components/MapaReportes";
import { supabase } from "@/lib/supabaseClient";
import { useGuardiasEnLinea } from "@/lib/guardiasVivo";

export default function MonitoreoPage() {
  const [sitios, setSitios] = useState<ReporteMapa[]>([]);
  const guardias = useGuardiasEnLinea();
  async function cargar() {
    const { data } = await supabase.from("sitios")
      .select("id, folio, nombre, direccion, latitud, longitud")
      .eq("estatus", "activo").not("latitud", "is", null).not("longitud", "is", null);
    setSitios(((data as any[]) ?? []).map((s) => ({
      id: s.id, folio: s.folio ?? null,
      titulo: `${s.nombre ?? "Sitio"}${s.direccion ? `<br>${s.direccion}` : ""}`,
      latitud: Number(s.latitud), longitud: Number(s.longitud),
      href: `/sitios/${s.id}`, color: "#f4a03f", // naranja SGS
    })));
  }
  useEffect(() => { cargar(); const t = setInterval(cargar, 30000); return () => clearInterval(t); }, []);
  return (
    <div className="cadmapa">
      <header className="cadmapa-top">{/* título + conteo + leyenda "Guardia en línea" (#1e88e5) */}</header>
      <MapaReportes reportes={sitios} guardias={guardias} className="cadmapa-map" />
    </div>
  );
}
```
> Verifica los nombres de columnas reales de `sitios` en `0051_clientes_sitios.sql` (usa `nombre`/`direccion` si difieren) y que existan los estilos `cadmapa*` en el CSS del fork (vienen de SCP; si se borraron, cópialos).

---

## 3) Móvil (`mobile/`, `com.sgs.movil`)

### 3a) Dependencia
```bash
cd mobile && npx expo install expo-task-manager
```

### 3b) `mobile/src/lib/ubicacionVivo.ts` (nuevo)
**Idéntico** a `sistema-central-policial/mobile/src/lib/ubicacionVivo.ts`, cambiando solo:
- la tabla `ubicaciones_oficiales` → `ubicaciones_guardias` (en `reportar()` y en `detenerRastreo()`);
- textos de la notificación: `"SGS — Ubicación activa"` / `"Compartiendo tu ubicación con central durante el turno."`, color `#0b3d66` (o el de SGS).
- Reutiliza `getMiOficial` y `getMiCrp` de `./oficial` (existen en el fork; representan al guardia y su unidad/sitio). Si quieres que `unidad` sea el **sitio** del guardia en vez de la patrulla, reemplaza `getMiCrp()` por la lógica que resuelva el sitio asignado.

### 3c) `mobile/App.tsx`
- `import { iniciarRastreo, detenerRastreo } from "./src/lib/ubicacionVivo";`
- Effect anclado a `const logueado = !!session;` → `if (logueado) iniciarRastreo(); else detenerRastreo();` con deps `[logueado]`. (La estructura de tabs de SGS —Inicio/Buscar/Rondín/Chat/Perfil— no afecta esto.)

### 3d) `mobile/src/screens/PerfilScreen.tsx`
- `import { iniciarRastreo, detenerRastreo } from "../lib/ubicacionVivo";`
- Al fijar "Mi elemento": llamar `iniciarRastreo();` después de guardar.
- Al quitarlo: `await detenerRastreo();`.

### 3e) `mobile/app.json`
- `android.permissions`: agregar `ACCESS_BACKGROUND_LOCATION` y `FOREGROUND_SERVICE_LOCATION`.
- Plugin `expo-location`: agregar `locationAlwaysAndWhenInUsePermission`, `isAndroidBackgroundLocationEnabled: true`, `isAndroidForegroundServiceEnabled: true`.
- `ios.infoPlist`: agregar `NSLocationAlwaysAndWhenInUseUsageDescription` y `UIBackgroundModes: ["location"]`.

---

## 4) Verificación y pasos manuales
1. `cd frontend && npx next build` (atrapa el `useSearchParams`/Suspense y typos que `tsc` no).
2. `cd mobile && npx tsc --noEmit`.
3. **Correr** `0054_gps_guardias.sql` en el Supabase de SGS (`rdyjjfbehjfggpldmmur`).
4. **Rebuild del APK** de `sgs-movil` (`expo-task-manager` es nativo, no corre en Expo Go):
   `npx eas-cli build --platform android --profile preview`.
5. Prueba: guardia hace login → Perfil selecciona su elemento → notificación "Ubicación activa"; en `/monitoreo` (como supervisor/administrador) el punto azul se mueve sobre el mapa de sitios.

## 5) Notas
- El rastreo pide permiso **"Permitir siempre"**; con "solo mientras la app está abierta" deja de reportar al bloquear.
- La RLS hace que un guardia que abra `/monitoreo` no vea a nadie (lista vacía), no da error.
- `config_sistema`, `personal`, `fn_rol_actual()`, `MapaReportes` y la página de Parámetros ya existen en el fork; no se crean, se extienden.
```
