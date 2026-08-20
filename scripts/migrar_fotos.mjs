#!/usr/bin/env node
// =====================================================================
// migrar_fotos.mjs
// Descarga las fotos REMOTAS (mementoserver.appspot.com) referenciadas en los
// CSV de P360 y las sube al bucket de Storage de Supabase, generando un
// manifiesto  { tabla: { idOrigen: [rutas] } }  para poblar `fotografias`
// cuando se carguen esos registros.
//
// NOTA: las rutas file:///...droidbase... NO se pueden migrar (apuntan al
// almacenamiento interno del teléfono origen); este script las ignora.
//
// Uso:
//   # Sólo descargar a disco + manifiesto (no requiere credenciales):
//   node migrar_fotos.mjs --download-only
//
//   # Descargar y SUBIR a Storage (requiere la service_role key del proyecto):
//   SUPABASE_URL=https://xxxx.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi... \
//   node migrar_fotos.mjs
//
// Opciones:  --download-only   no sube a Storage
//            --limit N         procesa a lo más N imágenes por archivo (pruebas)
//            --only <tabla>    sólo una fuente: personas|vehiculos|casos|incidentes
//
// No requiere npm install: usa fetch nativo (Node 18+) y la API REST de Storage.
// =====================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..", ".."); // .../SCP
const DATOS = process.env.DATOS_DIR || path.join(REPO, "Datos");
const CACHE = path.join(DATOS, "fotos_descargadas");
const MANIFIESTO = path.join(__dirname, "fotos_manifest.json");

// Credenciales: primero variables de entorno; si no, un archivo local
// scripts/supabase.local.json  { "url": "...", "serviceKey": "..." }  (gitignored).
function credencialesLocales() {
  try {
    const p = path.join(__dirname, "supabase.local.json");
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (e) {
    console.warn("Aviso: no se pudo leer supabase.local.json:", e.message);
  }
  return {};
}
const local = credencialesLocales();
const SUPABASE_URL = (process.env.SUPABASE_URL || local.url || "").replace(/\/$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || local.serviceKey || "";
const BUCKET = process.env.BUCKET || local.bucket || "fotos";

const args = process.argv.slice(2);
const DOWNLOAD_ONLY = args.includes("--download-only") || !SERVICE_KEY || !SUPABASE_URL;
const LIMIT = (() => {
  const i = args.indexOf("--limit");
  return i >= 0 ? parseInt(args[i + 1], 10) : Infinity;
})();
const ONLY = (() => {
  const i = args.indexOf("--only");
  return i >= 0 ? args[i + 1] : null;
})();
const LINK_ONLY = args.includes("--link-only"); // sólo poblar `fotografias` desde el manifiesto

const FUENTES = [
  { archivo: "P360 PERSONAS.csv", idCol: "ID", tabla: "personas" },
  { archivo: "P360 VEHICULOS.csv", idCol: "ID", tabla: "vehiculos" },
  { archivo: "P360 CASOS.csv", idCol: "Caso No.", tabla: "casos" },
  { archivo: "P360 INFORMES.csv", idCol: "Folio#", tabla: "incidentes" },
];

const RE_MEMENTO = /https?:\/\/mementoserver\.appspot\.com\/blob\/get\?blob=[A-Za-z0-9_\-]+/g;

// --- Parser CSV robusto (comillas, comas y saltos de línea dentro de campos) ---
function parseCSV(text) {
  const rows = [];
  let field = "", row = [], inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ",") { row.push(field); field = ""; }
      else if (ch === "\r") { /* ignora */ }
      else if (ch === "\n") { row.push(field); rows.push(row); field = ""; row = []; }
      else field += ch;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function filas(csvText) {
  const raw = parseCSV(csvText);
  if (raw.length === 0) return [];
  const headers = raw[0];
  return raw.slice(1)
    .filter((r) => r.some((c) => (c ?? "").trim() !== ""))
    .map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ""])));
}

function sanitizar(id) {
  return String(id).trim().replace(/[^A-Za-z0-9_.-]/g, "_") || "sin_id";
}
function extDe(contentType) {
  const c = (contentType || "").toLowerCase();
  if (c.includes("png")) return "png";
  if (c.includes("jpeg") || c.includes("jpg")) return "jpg";
  if (c.includes("gif")) return "gif";
  if (c.includes("webp")) return "webp";
  return "bin";
}

async function descargar(url) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return { buf, ext: extDe(res.headers.get("content-type")) };
}

async function subirStorage(rutaStorage, buf, ext) {
  const mime = ext === "png" ? "image/png" : ext === "jpg" ? "image/jpeg" : "application/octet-stream";
  const url = `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${rutaStorage}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": mime,
      "x-upsert": "true",
    },
    body: buf,
  });
  if (!res.ok) throw new Error(`Storage HTTP ${res.status}: ${await res.text()}`);
}

// Normaliza cualquier ruta del manifiesto a la ruta de Storage migracion/{tabla}/{id}/{n.ext}
function rutaStorage(p) {
  const s = String(p).replace(/\\/g, "/").split("/");
  return `migracion/${s[s.length - 3]}/${s[s.length - 2]}/${s[s.length - 1]}`;
}

// Pone las rutas en la columna `fotografias` del registro cuyo origen_id coincide.
async function enlazarFotografias(tabla, id, rutas) {
  const url = `${SUPABASE_URL}/rest/v1/${tabla}?datos_adicionales->>origen_id=eq.${encodeURIComponent(id)}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({ fotografias: rutas }),
  });
  if (!res.ok) throw new Error(`PATCH ${tabla} ${id}: HTTP ${res.status} ${await res.text()}`);
  const arr = await res.json();
  return Array.isArray(arr) ? arr.length : 0;
}

async function linkOnly() {
  if (!SERVICE_KEY.startsWith("eyJ") && !args.includes("--force-key")) {
    console.error("\n⚠  La serviceKey NO parece un JWT (debe empezar con 'eyJ'). Usa la service_role JWT.\n");
    process.exit(1);
  }
  if (!fs.existsSync(MANIFIESTO)) {
    console.error("No existe fotos_manifest.json. Corre antes: node migrar_fotos.mjs --download-only");
    process.exit(1);
  }
  const man = JSON.parse(fs.readFileSync(MANIFIESTO, "utf8"));
  let registros = 0, filas = 0;
  for (const tabla of ["personas", "vehiculos", "casos", "incidentes"]) {
    const g = man[tabla] || {};
    for (const [id, paths] of Object.entries(g)) {
      const rutas = paths.map(rutaStorage);
      try {
        const m = await enlazarFotografias(tabla, id, rutas);
        registros++; filas += m;
        if (m === 0) console.log(`  · ${tabla} origen_id=${id}: sin registro (¿corriste seed_p360.sql?)`);
      } catch (e) {
        console.log(`  ✗ ${tabla} ${id}: ${e.message}`);
      }
    }
  }
  console.log(`\nEnlace: ${registros} registros del manifiesto procesados, ${filas} filas con fotografias actualizadas.`);
  if (filas === 0) console.log("Ninguna fila coincidió: primero corre seed_p360.sql en Supabase para crear los registros.");
}

async function main() {
  if (LINK_ONLY) return linkOnly();

  // La llave para subir debe ser el service_role en formato JWT (empieza con "eyJ").
  // Las llaves nuevas sb_secret_/sb_publishable_ NO sirven para el Storage por Bearer.
  if (!DOWNLOAD_ONLY && !SERVICE_KEY.startsWith("eyJ") && !args.includes("--force-key")) {
    console.error("\n⚠  La serviceKey NO parece un JWT (debe empezar con 'eyJ').");
    console.error("   Estás usando la llave equivocada. En Supabase:");
    console.error("   Project Settings → API → usa la 'service_role' que EMPIEZA CON eyJ");
    console.error("   (sección de llaves JWT / 'Legacy API keys'),");
    console.error("   NO la sb_secret_… ni la sb_publishable_… ni la anon.");
    console.error("   Pégala en scripts/supabase.local.json → \"serviceKey\".\n");
    process.exit(1);
  }
  console.log(DOWNLOAD_ONLY ? "Modo: SÓLO DESCARGA (sin subir a Storage)" : `Modo: descargar + subir a Storage bucket "${BUCKET}"`);
  fs.mkdirSync(CACHE, { recursive: true });

  const manifiesto = {};
  const resumen = [];

  for (const f of FUENTES) {
    if (ONLY && f.tabla !== ONLY) continue;
    const ruta = path.join(DATOS, f.archivo);
    if (!fs.existsSync(ruta)) { console.log(`(omitido, no existe) ${f.archivo}`); continue; }

    const rows = filas(fs.readFileSync(ruta, "utf8"));
    manifiesto[f.tabla] = manifiesto[f.tabla] || {};
    let urls = 0, ok = 0, fail = 0, subidas = 0;

    for (const row of rows) {
      const id = (row[f.idCol] || "").trim();
      if (!id) continue;
      // Junta todas las URLs remotas de cualquier columna de la fila.
      const encontradas = [...JSON.stringify(row).matchAll(RE_MEMENTO)].map((m) => m[0]);
      if (encontradas.length === 0) continue;

      let n = 0;
      for (const url of encontradas) {
        if (urls >= LIMIT) break;
        urls++; n++;
        const idSafe = sanitizar(id);
        const dirLocal = path.join(CACHE, f.tabla, idSafe);
        fs.mkdirSync(dirLocal, { recursive: true });
        try {
          // Cache local: si ya existe un archivo idSafe_n.*, reutilízalo.
          const existente = fs.readdirSync(dirLocal).find((x) => x.startsWith(`${n}.`));
          let buf, ext, localPath;
          if (existente) {
            ext = existente.split(".").pop();
            localPath = path.join(dirLocal, existente);
            buf = fs.readFileSync(localPath);
          } else {
            ({ buf, ext } = await descargar(url));
            localPath = path.join(dirLocal, `${n}.${ext}`);
            fs.writeFileSync(localPath, buf);
          }
          ok++;

          const destino = `migracion/${f.tabla}/${idSafe}/${n}.${ext}`;
          if (!DOWNLOAD_ONLY) { await subirStorage(destino, buf, ext); subidas++; }

          (manifiesto[f.tabla][id] ||= []).push(DOWNLOAD_ONLY ? path.relative(REPO, localPath).replace(/\\/g, "/") : destino);
        } catch (e) {
          fail++;
          console.log(`  ✗ ${f.tabla} ${id} #${n}: ${e.message}`);
        }
      }
      // Tras subir las fotos del registro, pobla su columna `fotografias`.
      if (!DOWNLOAD_ONLY && manifiesto[f.tabla][id]?.length) {
        try { await enlazarFotografias(f.tabla, id, manifiesto[f.tabla][id].map(rutaStorage)); }
        catch (e) { console.log(`  ✗ enlace ${f.tabla} ${id}: ${e.message}`); }
      }
      if (urls >= LIMIT) break;
    }
    resumen.push({ archivo: f.archivo, urls, ok, fail, subidas });
    console.log(`✔ ${f.archivo}: ${urls} urls · ${ok} descargadas · ${fail} fallidas${DOWNLOAD_ONLY ? "" : ` · ${subidas} subidas`}`);
  }

  fs.writeFileSync(MANIFIESTO, JSON.stringify(manifiesto, null, 2));
  console.log(`\nManifiesto: ${MANIFIESTO}`);
  console.table(resumen);
}

main().catch((e) => { console.error(e); process.exit(1); });
