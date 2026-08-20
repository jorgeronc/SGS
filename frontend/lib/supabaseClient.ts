"use client";

import { createClient } from "@supabase/supabase-js";
import { getDeviceId } from "./deviceId";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;

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
