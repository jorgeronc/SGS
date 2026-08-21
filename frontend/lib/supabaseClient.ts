"use client";

import { createClient } from "@supabase/supabase-js";
import { getDeviceId } from "./deviceId";

// Limpia el valor del env: quita espacios y CUALQUIER carácter no-Latin1 (>255),
// como espacios de ancho cero / BOM que a veces se cuelan al copiar/pegar la llave.
// El URL y el JWT anon son 100% ASCII, así que esto solo elimina basura invisible
// (evita el error "String contains non ISO-8859-1 code point" al armar los headers).
const limpiar = (s: string | undefined) => (s ?? "").replace(/[^\x00-\xFF]/g, "").trim();
const supabaseUrl = limpiar(process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabaseAnonKey = limpiar(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

// El header x-device-id viaja en cada petición a Supabase/PostgREST y lo
// lee la función de bitácora (fn_bitacora_generica) en 0002_bitacora.sql.
// La IP se obtiene del lado del servidor (x-forwarded-for), no hace falta
// enviarla manualmente desde el navegador.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    headers: {
      "x-device-id": typeof window !== "undefined" ? getDeviceId() : "server",
    },
  },
});
