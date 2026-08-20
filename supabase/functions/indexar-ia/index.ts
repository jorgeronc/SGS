// Edge Function: indexar-ia
// (Re)construye el índice semántico (documentos_ia) a partir de las fuentes de
// texto del sistema. Genera los embeddings con el modelo gte-small ejecutado
// DENTRO de Supabase (Supabase.ai) — no sale información a terceros.
//
// Uso (requiere service_role):
//   POST /functions/v1/indexar-ia            -> reindexa todas las fuentes
//   POST /functions/v1/indexar-ia  {"tabla":"incidentes"}  -> sólo una fuente
//
// Deno / Edge runtime.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { json, preflight } from "../_shared/cors.ts";
import { FUENTES, trocear } from "../_shared/fuentes.ts";

// deno-lint-ignore no-explicit-any
const Sesion = (globalThis as any).Supabase?.ai?.Session;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(url, serviceKey);
    const modelo = new Sesion("gte-small");

    const body = await req.json().catch(() => ({}));
    const soloTabla: string | undefined = body?.tabla;
    const fuentes = soloTabla ? FUENTES.filter((f) => f.tabla === soloTabla) : FUENTES;
    if (soloTabla && fuentes.length === 0) return json({ error: `Fuente desconocida: ${soloTabla}` }, 400);

    const resumen: Record<string, number> = {};

    for (const f of fuentes) {
      let desde = 0;
      const pagina = 500;
      let totalDocs = 0;

      for (;;) {
        let q = supabase.from(f.tabla).select(f.select).range(desde, desde + pagina - 1);
        if (f.filtroActivo) q = q.eq("estatus", "activo");
        const { data, error } = await q;
        if (error) return json({ error: `Leyendo ${f.tabla}: ${error.message}` }, 500);
        const filas = (data as any[]) ?? [];
        if (filas.length === 0) break;

        for (const r of filas) {
          const texto = f.texto(r);
          const fragmentos = trocear(texto);
          // Si el registro quedó sin texto, retira sus documentos previos.
          if (fragmentos.length === 0) {
            await supabase.from("documentos_ia").delete().eq("fuente_tabla", f.tabla).eq("fuente_id", String(r.id));
            continue;
          }
          const docs = [];
          for (let i = 0; i < fragmentos.length; i++) {
            const emb: number[] = await modelo.run(fragmentos[i], { mean_pool: true, normalize: true });
            docs.push({
              fuente_tabla: f.tabla,
              fuente_id: String(r.id),
              folio: f.folio(r),
              titulo: f.titulo(r),
              chunk: i,
              texto: fragmentos[i],
              embedding: "[" + emb.join(",") + "]",
              nivel_acceso: f.nivelAcceso,
              metadatos: f.metadatos ? f.metadatos(r) : {},
              actualizado_en: new Date().toISOString(),
            });
          }
          // Reemplaza los fragmentos del registro (evita duplicados al reindexar).
          await supabase.from("documentos_ia").delete().eq("fuente_tabla", f.tabla).eq("fuente_id", String(r.id));
          const { error: eUp } = await supabase.from("documentos_ia").insert(docs);
          if (eUp) return json({ error: `Indexando ${f.tabla}/${r.id}: ${eUp.message}` }, 500);
          totalDocs += docs.length;
        }

        desde += pagina;
        if (filas.length < pagina) break;
      }
      resumen[f.tabla] = totalDocs;
    }

    return json({ ok: true, documentos: resumen });
  } catch (e) {
    return json({ error: String((e as { message?: string })?.message ?? e) }, 500);
  }
});
