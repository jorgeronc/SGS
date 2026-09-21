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
        .select("personal_id, etiqueta, unidad, latitud, longitud, actualizado_en, estatus_servicio, motivo_pausa")
        .eq("en_linea", true)
        .gt("actualizado_en", cutoff);
      const rows = (data as GuardiaMapa[]) ?? [];
      // Estado operativo (p. ej. "atendiendo_incidente" por un despacho CAD activo):
      // vive en personal.estatus_operativo; se une por personal_id.
      const ids = rows.map((r) => r.personal_id);
      if (ids.length) {
        const [{ data: per }, { data: perf }, { data: uni }] = await Promise.all([
          supabase.from("personal").select("id, usuario_id, estatus_operativo").in("id", ids),
          supabase.from("usuarios_perfil").select("id, rol"),
          supabase.from("patrullas").select("numero, marca, modelo, placas, asignado_personal_id").in("asignado_personal_id", ids).eq("estatus", "activo"),
        ]);
        const rolPorUsuario = new Map(((perf as any[]) ?? []).map((p) => [p.id, p.rol]));
        const perById = new Map(((per as any[]) ?? []).map((p) => [p.id, p]));
        const uniByPersonal = new Map(((uni as any[]) ?? []).map((u) => {
          const et = [u.numero ? `#${u.numero}` : null, [u.marca, u.modelo].filter(Boolean).join(" "), u.placas].filter(Boolean).join(" · ");
          return [u.asignado_personal_id, et || "Unidad"];
        }));
        rows.forEach((r) => {
          const p = perById.get(r.personal_id);
          (r as GuardiaMapa).estatus_operativo = p?.estatus_operativo ?? null;
          (r as GuardiaMapa).rol = p?.usuario_id ? (rolPorUsuario.get(p.usuario_id) ?? null) : null;
          (r as GuardiaMapa).unidad_asignada = uniByPersonal.get(r.personal_id) ?? null;
        });
      }
      if (!cancelado) setGuardias(rows);
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
    // Refrescar al volver a la pestaña/ventana (además del intervalo de 15s).
    const onVis = () => { if (!document.hidden) cargar(); };
    window.addEventListener("focus", cargar);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelado = true;
      if (timer) clearInterval(timer);
      supabase.removeChannel(ch);
      window.removeEventListener("focus", cargar);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);
  return guardias;
}
