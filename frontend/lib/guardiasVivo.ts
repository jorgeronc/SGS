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
