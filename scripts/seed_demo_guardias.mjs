// =====================================================================
// seed_demo_guardias.mjs — Dotación de DEMO para SGS.
//
// Crea cuentas + personal suficientes para cubrir todos los sitios en 3 turnos,
// respetando 8 h/día, 6 días/semana, 1 descanso (factor de relevo 7/6). También
// crea cuentas para los guardias EXISTENTES que no tengan cuenta, y 3 supervisores
// (uno por turno; 1 sola ciudad = Monterrey). El coordinador ya existe.
//
// Correos: nombre.apellido@sgs.com (no son reales; email_confirm=true).
// Contraseña: Pruebas123!  (guardias y supervisores creados por este script).
//
// Requiere service_role: env SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY, o
// scripts/supabase.local.json = { "url": "...", "serviceKey": "..." }.
//
// Uso:
//   cd frontend && node ../scripts/seed_demo_guardias.mjs --dry-run   (solo analiza)
//   cd frontend && node ../scripts/seed_demo_guardias.mjs             (crea)
// (Se ejecuta desde frontend/ para resolver @supabase/supabase-js.)
// =====================================================================
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function credsLocales() {
  try { const p = path.join(__dirname, "supabase.local.json"); if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf8")); } catch { /* */ }
  return {};
}
const local = credsLocales();
const URL = (process.env.SUPABASE_URL || local.url || "").replace(/\/$/, "");
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || local.serviceKey || "";
const DRY = process.argv.includes("--dry-run");
const PASSWORD = "Pruebas123!";
const TURNOS = 3;

if (!URL || !KEY) { console.error("Falta SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (o scripts/supabase.local.json)."); process.exit(1); }
const supa = createClient(URL, KEY, { auth: { persistSession: false } });

const NOMBRES = ["José","Juan","Luis","Carlos","Miguel","Jorge","Pedro","Roberto","Ricardo","Fernando","Alejandro","Raúl","Sergio","Arturo","Héctor","Manuel","Francisco","Eduardo","Daniel","Óscar","Ana","María","Laura","Patricia","Rosa","Gabriela","Verónica","Claudia","Diana","Adriana"];
const APELLIDOS = ["García","Hernández","López","Martínez","González","Pérez","Rodríguez","Sánchez","Ramírez","Cruz","Flores","Gómez","Díaz","Reyes","Morales","Jiménez","Torres","Vázquez","Ramos","Castillo","Mendoza","Guerrero","Rojas","Medina","Aguilar","Vargas","Castro","Ortiz","Núñez","Silva"];
const slug = (s) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");

async function emailsExistentes() {
  const set = new Set(); let page = 1;
  for (;;) {
    const { data, error } = await supa.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    (data?.users ?? []).forEach((u) => u.email && set.add(u.email.toLowerCase()));
    if (!data?.users?.length || data.users.length < 1000) break;
    page++;
  }
  return set;
}
function emailUnico(nombre, apellido, usados) {
  const base = `${slug((nombre || "").split(" ")[0])}.${slug(apellido) || "guardia"}`;
  let e = `${base}@sgs.com`, i = 1;
  while (usados.has(e)) e = `${base}${++i}@sgs.com`;
  usados.add(e);
  return e;
}

// Crea cuenta auth + fija rol/nombre en usuarios_perfil + liga personal.usuario_id.
async function crearCuenta(email, nombreCompleto, rol, personalId) {
  const { data, error } = await supa.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { nombre: nombreCompleto } });
  if (error) throw error;
  const uid = data.user.id;
  await supa.from("usuarios_perfil").upsert({ id: uid, rol, nombre: nombreCompleto, activo: true });
  if (personalId) await supa.from("personal").update({ usuario_id: uid, actualizado_en: new Date().toISOString() }).eq("id", personalId);
  return uid;
}
// Crea persona + personal (sin cuenta aún). Devuelve personal.id.
async function crearPersonal(nombre, apPat, apMat, categoria, placa) {
  const { data: per, error: e1 } = await supa.from("personas").insert({ nombre, apellido_paterno: apPat, apellido_materno: apMat, datos_adicionales: { origen: "seed_demo" } }).select("id").single();
  if (e1) throw e1;
  const { data: pl, error: e2 } = await supa.from("personal").insert({ persona_id: per.id, numero_placa: placa, categoria, estado_laboral: "activo" }).select("id").single();
  if (e2) throw e2;
  return pl.id;
}

async function main() {
  console.log(`\n== SEED DEMO GUARDIAS ${DRY ? "(DRY-RUN)" : ""} ==\n${URL}\n`);

  // 1) Posiciones = Σ (num_guardias||1) × 3 turnos
  const { data: sitios, error: eS } = await supa.from("sitios").select("id, nombre, num_guardias").eq("estatus", "activo");
  if (eS) throw eS;
  const posiciones = (sitios ?? []).reduce((a, s) => a + (s.num_guardias || 1) * TURNOS, 0);
  const objetivo = Math.ceil((posiciones * 7) / 6);

  // 2) Personal activo actual (pool de guardias) + quiénes no tienen cuenta.
  const { data: personal, error: eP } = await supa.from("personal")
    .select("id, usuario_id, numero_placa, persona:personas(nombre, apellido_paterno, apellido_materno)")
    .eq("estatus", "activo").eq("estado_laboral", "activo");
  if (eP) throw eP;
  const activos = personal ?? [];
  const sinCuenta = activos.filter((p) => !p.usuario_id);
  const poolActual = activos.length;
  const aCrear = Math.max(0, objetivo - poolActual);

  console.log(`Sitios activos:        ${sitios?.length ?? 0}`);
  console.log(`Posiciones (×3 turnos): ${posiciones}`);
  console.log(`Guardias objetivo (⌈pos×7/6⌉): ${objetivo}`);
  console.log(`Personal activo actual: ${poolActual}  (sin cuenta: ${sinCuenta.length})`);
  console.log(`Guardias NUEVOS a crear: ${aCrear}`);
  console.log(`Supervisores a crear:   ${TURNOS} (Matutino/Vespertino/Nocturno, 1 ciudad)`);
  console.log(`Contraseña de todos:    ${PASSWORD}\n`);

  if (DRY) { console.log("DRY-RUN: no se creó nada.\n"); return; }

  const usados = await emailsExistentes();
  let cuentasExistentes = 0, nuevos = 0, sups = 0;

  // A) Cuentas para guardias EXISTENTES sin cuenta.
  for (const p of sinCuenta) {
    const nom = p.persona?.nombre || "Guardia";
    const ap = p.persona?.apellido_paterno || "";
    const email = emailUnico(nom, ap, usados);
    const nombreCompleto = `${nom} ${ap} ${p.persona?.apellido_materno || ""}`.trim();
    try { await crearCuenta(email, nombreCompleto, "guardia", p.id); cuentasExistentes++; console.log(`  cuenta existente: ${email}`); }
    catch (e) { console.warn(`  ! ${email}: ${e.message}`); }
  }

  // B) Guardias NUEVOS (persona + personal + cuenta).
  for (let i = 0; i < aCrear; i++) {
    const nom = NOMBRES[Math.floor(Math.random() * NOMBRES.length)];
    const ap = APELLIDOS[Math.floor(Math.random() * APELLIDOS.length)];
    const am = APELLIDOS[Math.floor(Math.random() * APELLIDOS.length)];
    const placa = `G-${String(poolActual + i + 1).padStart(3, "0")}`;
    const email = emailUnico(nom, ap, usados);
    try {
      const pid = await crearPersonal(nom, ap, am, "Guardia", placa);
      await crearCuenta(email, `${nom} ${ap} ${am}`, "guardia", pid);
      nuevos++; console.log(`  guardia nuevo: ${email} (${placa})`);
    } catch (e) { console.warn(`  ! ${email}: ${e.message}`); }
  }

  // C) Supervisores: 1 por turno (1 ciudad).
  for (const t of ["Matutino", "Vespertino", "Nocturno"]) {
    const email = emailUnico("supervisor", t, usados);
    try {
      const pid = await crearPersonal("Supervisor", t, "", "Supervisor", `S-${t.slice(0, 3).toUpperCase()}`);
      await crearCuenta(email, `Supervisor ${t}`, "supervisor", pid);
      sups++; console.log(`  supervisor: ${email}`);
    } catch (e) { console.warn(`  ! ${email}: ${e.message}`); }
  }

  console.log(`\nListo. Cuentas a existentes: ${cuentasExistentes} · Guardias nuevos: ${nuevos} · Supervisores: ${sups}.`);
  console.log(`Total pool de guardias ahora: ${poolActual + nuevos} (objetivo ${objetivo}).\n`);
}

main().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
