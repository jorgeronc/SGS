# scripts/migrar_fotos.mjs

Descarga las **fotos remotas** (`mementoserver.appspot.com`) referenciadas en los CSV de
P360 (`../../Datos/P360 *.csv`) y las sube al bucket de Storage de Supabase, generando un
**manifiesto** `fotos_manifest.json` con la forma `{ tabla: { idOrigen: [rutas] } }`.

Las rutas `file:///…droidbase…` **no** se pueden migrar (apuntan al almacenamiento interno
del teléfono origen); el script las ignora.

Sin dependencias: usa `fetch` nativo (Node 18+) y la API REST de Storage.

## Uso

### 1) Sólo descargar (no requiere credenciales)
```powershell
cd sistema-central-policial\scripts
node migrar_fotos.mjs --download-only
```

### 2) Descargar y SUBIR a Storage
Necesita la **service_role key** del proyecto. La forma fácil (sin escribir variables de
entorno): copia la plantilla y pega tu llave.

```powershell
cd sistema-central-policial\scripts
copy supabase.local.example.json supabase.local.json
# edita supabase.local.json y pega tu serviceKey (ese archivo está en .gitignore)
node migrar_fotos.mjs
```

**¿De dónde sale la service_role key?** En el dashboard de Supabase →
**Project Settings → API → Project API keys → `service_role` (secret)** → copiar.
Es una llave con permisos totales: no la compartas ni la subas a git (por eso
`supabase.local.json` está ignorado).

Alternativa con variables de entorno (PowerShell):
```powershell
$env:SUPABASE_URL = "https://xxxx.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOi..."
node migrar_fotos.mjs
```

Al subir, el script además **pobla la columna `fotografias`** de cada registro (cruzando por
`datos_adicionales->>'origen_id'`), así que las fotos aparecen en la ficha. Para que haya con
qué cruzar, primero corre `supabase/seed/seed_p360.sql` en Supabase.

### 3) Sólo enlazar (si las fotos YA están subidas)
Si ya subiste las fotos y sólo falta llenar el campo `fotografias` de los registros:
```powershell
node migrar_fotos.mjs --link-only
```
Lee `fotos_manifest.json` y hace `PATCH` de `fotografias` en personas/vehiculos/casos/incidentes.
Requiere la service_role JWT (en `supabase.local.json`) y que `seed_p360.sql` ya esté corrido.

Opciones: `--download-only` (no sube ni enlaza), `--link-only` (sólo enlaza), `--limit N`
(máx N imágenes por archivo, para pruebas), `--only personas|vehiculos|casos|incidentes`.

## Después: poblar `fotografias`

Las rutas quedan bajo `migracion/{tabla}/{idOrigen}/{n}.{ext}` en el bucket. Cuando se
carguen los registros de P360 (Personas, Vehículos, Casos, Informes) se guarda el id de
origen en `datos_adicionales.origen_id`, y luego un `update` cruza el manifiesto para poner
esas rutas en la columna `fotografias`. (Pendiente hasta migrar esos archivos.)

## Notas
- La carpeta local de descargas (`../../Datos/fotos_descargadas/`) y `fotos_manifest.json`
  quedan fuera de git.
- Probado en modo `--download-only`: descarga JPEG/PNG válidos desde `mementoserver`.
