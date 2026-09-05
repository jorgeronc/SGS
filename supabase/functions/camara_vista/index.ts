// Edge Function: camara_vista  (resuelve la señal de una cámara AL VUELO)
//
// Mantiene la API key del proveedor FUERA del navegador: el cliente pide la vista
// de una cámara y recibe una URL de imagen/reproductor ya resuelta (efímera). Para
// cámaras 'manual' devuelve su stream_url fija sin llamar a nadie.
//
// Acciones (body JSON):
//   { accion: 'vista',    camara_id }                              -> VistaCamara
//   { accion: 'importar', sitio_id, radio_km?, limite?, proveedor? } -> alta masiva
//
// Todo se hace con un cliente CON EL JWT DEL USUARIO, así la RLS aplica igual que
// en el resto del sistema (ver = cualquiera; importar/alta = supervisor/admin).
//
// Requiere el secreto WINDY_API_KEY sólo si se usan cámaras del proveedor 'windy'
// (las 'manual' no necesitan llave). npx supabase secrets set WINDY_API_KEY=...
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { json, preflight } from "../_shared/cors.ts";

const WINDY_BASE = "https://api.windy.com/webcams/api/v3";

// ---- Proveedor Windy (ejemplo de proveedor con llave) ---------------------
// La API v3 de Windy espera las COMAS LITERALES en `include`/`nearby` (no las
// admite URL-encodeadas como %2C), por eso el query se arma a mano y sólo se
// codifican los valores que lo necesitan.
async function windyGet(path: string, params: Record<string, string>): Promise<any> {
  const key = Deno.env.get("WINDY_API_KEY") ?? "";
  if (!key) throw { code: 503, msg: "Falta configurar el secreto WINDY_API_KEY en Supabase." };
  const qs = Object.entries(params)
    .map(([k, v]) => `${k}=${v.replace(/ /g, "%20")}`)  // comas y signos quedan literales
    .join("&");
  let resp: Response;
  try {
    resp = await fetch(`${WINDY_BASE}${path}?${qs}`, {
      headers: { "X-WINDY-API-KEY": key, "Accept": "application/json" },
    });
  } catch {
    throw { code: 504, msg: "El proveedor de video no respondió (timeout/red)." };
  }
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const detalle = data?.message ?? data?.error ?? data?.detail ?? "";
    throw { code: 502, msg: `Proveedor de video: HTTP ${resp.status}${detalle ? ` — ${detalle}` : ""}` };
  }
  return data;
}

// El webcamId de Windy es un entero. Acepta que en proveedor_ref se haya
// guardado una URL o texto con el id y extrae el número (el último largo).
function windyRef(ref: string): string {
  const t = String(ref ?? "").trim();
  if (/^\d+$/.test(t)) return t;
  const nums = t.match(/\d{4,}/g);
  return nums && nums.length ? nums[nums.length - 1] : t;
}

async function windyVista(refCrudo: string) {
  const ref = windyRef(refCrudo);
  if (!/^\d+$/.test(ref)) throw { code: 409, msg: `El proveedor_ref no es un webcamId numérico de Windy: "${refCrudo}".` };
  const w = await windyGet(`/webcams/${ref}`, { include: "images,player" });
  const actual = (w?.images ?? {}).current ?? {};
  const player = w?.player ?? {};
  return {
    imagen_url: actual.preview ?? actual.thumbnail ?? null,
    player_url: player.live ?? player.day ?? player.month ?? null,
    en_vivo: Boolean(player.live),
    actualizado_en: w?.lastUpdatedOn ?? null,
    titulo: w?.title ?? null,
    expira_en_s: 540, // refresca antes de ~10 min
  };
}

async function windyCercanas(lat: number, lng: number, radio_km: number, limite: number) {
  const data = await windyGet("/webcams", {
    nearby: `${lat},${lng},${Math.max(1, Math.min(Math.round(radio_km), 250))}`,
    include: "location,player",
    limit: String(Math.min(limite, 50)),
  });
  return ((data?.webcams ?? []) as any[])
    .filter((w) => w?.location)
    .map((w) => ({
      ref: String(w.webcamId),
      nombre: w.title ?? "Cámara",
      lat: Number(w.location.latitude),
      lng: Number(w.location.longitude),
    }));
}

// Capacidades por DRIVER (proveedor) ∩ banderas de la cámara. La UI (inspector)
// muestra/oculta PTZ, grabación y eventos según esto — sin simular nada.
function capacidadesDe(cam: any, live: boolean) {
  const p = cam.proveedor;
  if (p === "manual") return { live: true, snapshot: false, ptz: false, grabacion: false, eventos: false };
  if (p === "windy") return { live, snapshot: true, ptz: false, grabacion: false, eventos: false };
  if (p === "iss" || p === "securos")
    return { live: true, snapshot: true, ptz: !!cam.es_ptz, grabacion: !!cam.grabacion_disponible, eventos: true };
  return { live: false, snapshot: false, ptz: false, grabacion: false, eventos: false };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
    );

    const body = await req.json().catch(() => ({}));
    const accion = body?.accion ?? "vista";

    // ---- VISTA: resolver imagen/reproductor de UNA cámara ----------------
    if (accion === "vista") {
      const camaraId = body?.camara_id;
      if (!camaraId) return json({ error: "Falta camara_id." }, 400);
      const { data: cam } = await supabase
        .from("camaras")
        .select("id, nombre, proveedor, proveedor_ref, stream_url, estado_operativo, estatus, es_ptz, grabacion_disponible")
        .eq("id", camaraId)
        .maybeSingle();
      if (!cam) return json({ error: "Cámara no encontrada." }, 404);
      if (cam.estatus !== "activo" || cam.estado_operativo !== "activa")
        return json({ error: `La cámara está ${cam.estado_operativo}.`, estado: cam.estado_operativo === "mantenimiento" ? "MAINTENANCE" : "OFFLINE" }, 409);

      // 'manual': stream fijo, sin llamar a nadie.
      if (cam.proveedor === "manual") {
        if (!cam.stream_url) return json({ error: "La cámara manual no tiene stream_url." }, 409);
        return json({
          nombre: cam.nombre, proveedor: "manual", estado: "ONLINE",
          player_url: cam.stream_url, imagen_url: null, en_vivo: true,
          actualizado_en: null, expira_en_s: null, capacidades: capacidadesDe(cam, true),
        });
      }
      // Proveedor con llave (Windy).
      if (cam.proveedor === "windy") {
        if (!cam.proveedor_ref) return json({ error: "La cámara no tiene proveedor_ref." }, 409);
        const v = await windyVista(cam.proveedor_ref);
        return json({ nombre: cam.nombre, proveedor: "windy", estado: (v.imagen_url || v.player_url) ? "ONLINE" : "NO_STREAM", ...v, capacidades: capacidadesDe(cam, Boolean(v.en_vivo)) });
      }
      // Driver ISS / SecurOS (VMS del cliente). Esqueleto listo: cuando el VMS
      // esté configurado (secretos ISS_* + su API REST / HLS), aquí se resuelve la
      // señal, el snapshot server-side, PTZ y eventos. Mientras, si la cámara trae
      // un stream_url directo (HLS o gateway RTSP->HLS) se usa; si no, NO_STREAM
      // con mensaje claro (nunca pantalla negra). Las capacidades ya se declaran.
      if (cam.proveedor === "iss" || cam.proveedor === "securos") {
        const caps = capacidadesDe(cam, true);
        if (cam.stream_url) {
          return json({ nombre: cam.nombre, proveedor: cam.proveedor, estado: "ONLINE", player_url: cam.stream_url, imagen_url: null, en_vivo: true, expira_en_s: null, capacidades: caps });
        }
        return json({ nombre: cam.nombre, proveedor: cam.proveedor, estado: "NO_STREAM", imagen_url: null, player_url: null, en_vivo: false, capacidades: caps, error: "Driver ISS/SecurOS pendiente de configurar (VMS del cliente)." });
      }
      return json({ error: `Proveedor no soportado: ${cam.proveedor}.` }, 501);
    }

    // ---- SNAPSHOT -> EVIDENCIA: descarga la imagen del proveedor (server-side,
    //      sin CORS), la SUBE al bucket 'fotos' y crea la evidencia con la RUTA
    //      de Storage (no la URL externa, que caducaba y daba 404 NoSuchKey). ----
    if (accion === "snapshot") {
      const camaraId = body?.camara_id;
      const nota = body?.nota ?? null;
      if (!camaraId) return json({ error: "Falta camara_id." }, 400);
      const { data: cam } = await supabase
        .from("camaras").select("id, nombre, proveedor, proveedor_ref, estado_operativo, estatus")
        .eq("id", camaraId).maybeSingle();
      if (!cam) return json({ error: "Cámara no encontrada." }, 404);
      if (cam.estatus !== "activo" || cam.estado_operativo !== "activa")
        return json({ error: `La cámara está ${cam.estado_operativo}.` }, 409);

      // Resolver una imagen FRESCA del proveedor (hoy solo Windy entrega snapshot).
      let imagenUrl: string | null = null;
      if (cam.proveedor === "windy") {
        if (!cam.proveedor_ref) return json({ error: "La cámara no tiene proveedor_ref." }, 409);
        imagenUrl = (await windyVista(cam.proveedor_ref)).imagen_url;
      } else if (typeof body?.imagen_url === "string" && body.imagen_url) {
        imagenUrl = body.imagen_url; // fallback: URL provista por el cliente
      }
      if (!imagenUrl) return json({ error: "El proveedor no entrega snapshot para esta cámara." }, 409);

      // Descargar la imagen (server-side) y subirla al bucket.
      let resp: Response;
      try { resp = await fetch(imagenUrl); }
      catch { return json({ error: "No se pudo descargar el snapshot del proveedor." }, 502); }
      if (!resp.ok) return json({ error: `El proveedor devolvió HTTP ${resp.status} al pedir el snapshot.` }, 502);
      const ct = resp.headers.get("content-type") ?? "image/jpeg";
      const ext = ct.includes("png") ? "png" : ct.includes("webp") ? "webp" : "jpg";
      const buf = new Uint8Array(await resp.arrayBuffer());
      const path = `evidencias/snapshot/${camaraId}/${Date.now()}.${ext}`;
      const up = await supabase.storage.from("fotos").upload(path, buf, { contentType: ct, upsert: true });
      if (up.error) return json({ error: `No se pudo guardar el snapshot: ${up.error.message}` }, 500);

      // Crear la evidencia con la RUTA de Storage (corre como el usuario -> auth.uid()).
      const { data: ev, error: evErr } = await supabase.rpc("rpc_camara_snapshot_evidencia", {
        p_camara: camaraId, p_imagen_url: path, p_nota: nota,
      });
      if (evErr) return json({ error: evErr.message }, 500);
      return json({ ...(ev as any), path });
    }

    // ---- IMPORTAR: alta masiva desde el proveedor (dedup por proveedor_ref) --
    if (accion === "importar") {
      const sitioId = body?.sitio_id;
      const proveedor = body?.proveedor ?? "windy";
      const radioKm = Number(body?.radio_km ?? 25);
      const limite = Number(body?.limite ?? 10);
      if (!sitioId) return json({ error: "Falta sitio_id." }, 400);
      if (proveedor !== "windy") return json({ error: `Importación no soportada para: ${proveedor}.` }, 501);

      const { data: sitio } = await supabase
        .from("sitios").select("id, nombre, latitud, longitud").eq("id", sitioId).maybeSingle();
      if (!sitio) return json({ error: "Sitio no encontrado." }, 404);
      if (sitio.latitud == null || sitio.longitud == null)
        return json({ error: "El sitio no tiene coordenadas para buscar cámaras cercanas." }, 409);

      const externas = await windyCercanas(Number(sitio.latitud), Number(sitio.longitud), radioKm, limite);
      let importadas = 0, omitidas = 0;
      const creadas: any[] = [];
      for (const e of externas) {
        // La RLS (insert = mando) y el índice único (proveedor,proveedor_ref) protegen.
        const { data, error } = await supabase.from("camaras").insert({
          nombre: e.nombre, sitio_id: sitioId, latitud: e.lat, longitud: e.lng,
          proveedor: "windy", proveedor_ref: e.ref,
        }).select("id, folio, nombre").maybeSingle();
        if (error) { omitidas++; continue; }
        importadas++; if (data) creadas.push(data);
      }
      return json({ importadas, omitidas, camaras: creadas });
    }

    // ---- PTZ: control listo, resuelto por el driver del VMS (ISS/Milestone/…) --
    // Cuando el driver del VMS esté configurado, aquí se relayan los comandos PTZ
    // (up/down/left/right/zoom/preset) a su API REST. Hoy no hay VMS conectado.
    if (accion === "ptz") {
      return json({ error: "PTZ listo, pero aún no hay un VMS conectado que ejecute el comando." }, 501);
    }

    return json({ error: `Acción no reconocida: ${accion}.` }, 400);
  } catch (e: any) {
    if (e && typeof e === "object" && "code" in e) return json({ error: e.msg }, e.code);
    return json({ error: e?.message ?? "Error inesperado." }, 500);
  }
});
