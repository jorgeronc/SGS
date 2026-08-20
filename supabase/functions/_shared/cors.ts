export const cors: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-device-id, x-supabase-api-version, x-region",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Respuesta al preflight que REFLEJA las cabeceras que solicita el navegador
// (evita bloqueos por cabeceras extra como x-device-id).
export function preflight(req: Request): Response {
  const solicitadas = req.headers.get("Access-Control-Request-Headers");
  return new Response("ok", {
    headers: { ...cors, ...(solicitadas ? { "Access-Control-Allow-Headers": solicitadas } : {}) },
  });
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
