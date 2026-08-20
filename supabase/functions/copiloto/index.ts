// Edge Function: copiloto   (RAG en vivo + generación con citas)
//
// Recupera el contexto DIRECTAMENTE de las tablas operativas (respetando la RLS
// del usuario) según las palabras clave de la pregunta — no depende de un índice
// de embeddings que haya que mantener. Claude redacta la respuesta usando SÓLO
// ese contexto, cita el folio de cada fuente y se abstiene si no hay evidencia.
// Todo queda auditado en ia_consultas.
//
// Requiere el secreto ANTHROPIC_API_KEY (npx supabase secrets set ...).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { json, preflight } from "../_shared/cors.ts";

const MODELO = "claude-opus-4-8";

// Llama a la API de Mensajes de Anthropic con fetch directo (sin SDK), para
// evitar incompatibilidades del SDK npm dentro del runtime Deno de Supabase.
// Devuelve el texto de la respuesta o lanza con el error EXACTO de la API.
async function llamarClaude(apiKey: string, system: string, prompt: string): Promise<string> {
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODELO,
      max_tokens: 1500,
      system,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    // deno-lint-ignore no-explicit-any
    const msg = (data as any)?.error?.message ?? `HTTP ${resp.status}`;
    throw new Error(`Anthropic: ${msg}`);
  }
  // deno-lint-ignore no-explicit-any
  return ((data as any)?.content ?? [])
    .filter((b: any) => b.type === "text").map((b: any) => b.text).join("").trim();
}

// Ruta del expediente por tabla origen (para enlazar la cita).
const RUTA: Record<string, string> = {
  incidentes: "incidentes", casos: "casos", llamadas_cad: "cad", barandilla: "barandilla",
  evidencias: "evidencias", ordenes: "ordenes", abordamientos: "abordamientos", accidentes: "accidentes",
};
function hrefFuente(tabla: string, id: string): string | null {
  return RUTA[tabla] ? `/${RUTA[tabla]}/${id}` : null;
}

// Tablas consultables en vivo: columnas de texto a buscar + cómo describir la fila.
// deno-lint-ignore no-explicit-any
type Cfg = { t: string; cols: string[]; sel: string; titulo: (r: any) => string; texto: (r: any) => string };
const nom = (p: any) => (p ? `${p.nombre ?? ""} ${p.apellido_paterno ?? ""}`.trim() : "");
const linea = (...xs: (string | null | undefined)[]) => xs.filter(Boolean).join(" · ");
const TABLAS: Cfg[] = [
  { t: "incidentes", cols: ["tipo", "delito", "narrativa", "direccion"], sel: "id, folio, tipo, delito, narrativa, direccion, estado",
    titulo: (r) => r.delito ?? r.tipo ?? "Incidente", texto: (r) => linea(r.narrativa, r.direccion, `estado: ${r.estado}`) },
  { t: "casos", cols: ["titulo"], sel: "id, folio, titulo, estado_investigacion",
    titulo: (r) => r.titulo ?? "Caso", texto: (r) => `estado: ${r.estado_investigacion ?? "—"}` },
  { t: "barandilla", cols: ["motivo", "celda"], sel: "id, folio, motivo, celda, estado, persona:personas(nombre, apellido_paterno)",
    titulo: (r) => `Custodia · ${nom(r.persona) || "detenido"}`, texto: (r) => linea(r.motivo, r.celda ? `celda: ${r.celda}` : "", `estado: ${r.estado}`) },
  { t: "llamadas_cad", cols: ["tipo", "descripcion", "direccion"], sel: "id, folio, tipo, descripcion, direccion, prioridad, estado_despacho",
    titulo: (r) => r.tipo ?? "Reporte", texto: (r) => linea(r.descripcion, r.direccion, `prioridad: ${r.prioridad}`, `despacho: ${r.estado_despacho}`) },
  { t: "abordamientos", cols: ["motivo", "observaciones", "resultado"], sel: "id, folio, motivo, observaciones, resultado",
    titulo: (r) => r.motivo ?? "Abordamiento", texto: (r) => linea(r.observaciones, r.resultado ? `resultado: ${r.resultado}` : "") },
  { t: "accidentes", cols: ["tipo_hecho", "direccion", "descripcion"], sel: "id, folio, tipo_hecho, direccion, descripcion, estatus_atencion",
    titulo: (r) => r.tipo_hecho ?? "Accidente vial", texto: (r) => linea(r.descripcion, r.direccion, `atención: ${r.estatus_atencion ?? "—"}`) },
  { t: "ordenes", cols: ["tipo", "asunto", "autoridad_emisora"], sel: "id, folio, tipo, asunto, autoridad_emisora, estado",
    titulo: (r) => r.asunto ?? r.tipo ?? "Orden", texto: (r) => linea(r.tipo ? `tipo: ${r.tipo}` : "", r.autoridad_emisora, `estado: ${r.estado}`) },
  { t: "evidencias", cols: ["tipo", "descripcion"], sel: "id, folio, tipo, descripcion, estado_evidencia",
    titulo: (r) => r.tipo ?? "Evidencia", texto: (r) => linea(r.descripcion, `estado: ${r.estado_evidencia ?? "—"}`) },
];

const STOP = new Set(["para", "como", "donde", "cuando", "cuales", "cual", "que", "los", "las", "del", "con", "una", "uno",
  "por", "sobre", "entre", "hay", "tiene", "tienen", "este", "esta", "estos", "estas", "son", "fue", "han", "dame", "dime",
  "muestra", "lista", "cuantos", "cuantas", "cuanto", "todos", "todas", "algun", "alguna", "reporte", "reportes"]);
function palabrasClave(q: string): string[] {
  return Array.from(new Set(
    q.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((w) => w.length >= 4 && !STOP.has(w))
  )).slice(0, 6);
}

const SYSTEM = `Eres el copiloto de investigación del Sistema Central Policial (SCP). Asistes a un usuario autorizado; no sustituyes su criterio.

REGLAS ESTRICTAS:
1. Responde ÚNICAMENTE con base en el CONTEXTO RECUPERADO que se te entrega (registros reales del sistema). No uses conocimiento externo ni inventes datos.
2. Cita SIEMPRE el folio exacto de cada fuente que uses, entre corchetes, p. ej. [2026IN000123]. Si un fragmento no trae folio, cítalo por su título entre corchetes.
3. Si el contexto es insuficiente o ambiguo, ABSTENTE: señala explícitamente que no hay evidencia suficiente y usa nivel_confianza "sin_evidencia".
4. Responde en español, concreto y verificable.

Responde EXCLUSIVAMENTE con un objeto JSON válido, sin texto adicional:
{"respuesta": "<texto con las citas [FOLIO] intercaladas>", "nivel_confianza": "alta|media|baja|sin_evidencia", "folios_citados": ["<folio o título>", ...]}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  try {
    const body = await req.json().catch(() => ({}));
    const pregunta: string = (body?.pregunta ?? "").toString().trim();
    if (!pregunta) return json({ error: "Falta 'pregunta'." }, 400);
    const contextoTipo = body?.contexto_tipo ?? null;
    const contextoId = body?.contexto_id ?? null;

    const url = Deno.env.get("SUPABASE_URL")!;
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: "No autorizado. Inicia sesión para usar el copiloto." }, 401);
    const auditar = async (fila: Record<string, unknown>) => { await supabase.from("ia_consultas").insert(fila); };

    // 1) Recuperación EN VIVO: por palabras clave (o registros recientes si no hay).
    const kws = palabrasClave(pregunta);
    // deno-lint-ignore no-explicit-any
    const fuentes: any[] = [];
    for (const cfg of TABLAS) {
      let q = supabase.from(cfg.t).select(cfg.sel).eq("estatus", "activo").limit(5);
      if (kws.length) {
        const cond = cfg.cols.flatMap((c) => kws.map((k) => `${c}.ilike.%${k}%`)).join(",");
        q = q.or(cond);
      }
      const { data, error } = await q;
      if (error) continue; // una tabla sin permiso/columna no rompe la consulta
      for (const r of (data as any[]) ?? []) {
        fuentes.push({
          fuente_tabla: cfg.t, fuente_id: r.id, folio: r.folio ?? null, titulo: cfg.titulo(r),
          texto: (cfg.texto(r) || cfg.titulo(r)).slice(0, 400), similitud: null, href: hrefFuente(cfg.t, r.id),
        });
      }
    }

    if (fuentes.length === 0) {
      const respuesta = "No encontré registros relacionados en el sistema para responder con evidencia. Reformula la consulta con otros términos (folio, nombre, placas, delito, dirección) o verifica que la información esté capturada.";
      await auditar({ pregunta, respuesta, citas: [], contexto_tipo: contextoTipo, contexto_id: contextoId, nivel_confianza: "sin_evidencia", modelo: MODELO });
      return json({ ok: true, respuesta, nivel_confianza: "sin_evidencia", fuentes: [], folios_citados: [] });
    }

    if (!Deno.env.get("ANTHROPIC_API_KEY")) {
      return json({ error: "Falta configurar el secreto ANTHROPIC_API_KEY en Supabase (Edge Functions → Secrets)." }, 500);
    }

    // 2) Contexto citable (hasta 20 fuentes).
    const usadas = fuentes.slice(0, 20);
    const contexto = usadas.map((d, i) => `Fuente ${i + 1} — folio: ${d.folio ?? "(sin folio)"} · tipo: ${d.fuente_tabla} · ${d.titulo}\n${d.texto}`).join("\n\n---\n\n");

    // 3) Generación con Claude (fetch directo a la API de Mensajes).
    const texto = await llamarClaude(
      Deno.env.get("ANTHROPIC_API_KEY")!, SYSTEM,
      `PREGUNTA:\n${pregunta}\n\nCONTEXTO RECUPERADO:\n${contexto}`,
    );

    let respuesta = texto, nivel = "media", citados: string[] = [];
    try {
      const jsonTxt = texto.slice(texto.indexOf("{"), texto.lastIndexOf("}") + 1);
      const parsed = JSON.parse(jsonTxt);
      respuesta = parsed.respuesta ?? texto;
      nivel = parsed.nivel_confianza ?? "media";
      citados = Array.isArray(parsed.folios_citados) ? parsed.folios_citados : [];
    } catch { /* texto tal cual */ }

    const citas = usadas.map((f) => ({ fuente_tabla: f.fuente_tabla, fuente_id: f.fuente_id, folio: f.folio }));
    await auditar({ pregunta, respuesta, citas, contexto_tipo: contextoTipo, contexto_id: contextoId, nivel_confianza: nivel, modelo: MODELO });

    return json({ ok: true, respuesta, nivel_confianza: nivel, folios_citados: citados, fuentes: usadas });
  } catch (e) {
    return json({ error: String((e as { message?: string })?.message ?? e) }, 500);
  }
});
