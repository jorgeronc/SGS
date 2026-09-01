import * as Location from "expo-location";
import { supabase } from "./supabase";
import { registrarAlertaEnviada } from "./misAlertas";

export interface GPS {
  lat: number | null;
  lng: number | null;
  acc: number | null;
}

export async function ubicacionActual(): Promise<GPS> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") return { lat: null, lng: null, acc: null };
    const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    return {
      lat: Number(p.coords.latitude.toFixed(6)),
      lng: Number(p.coords.longitude.toFixed(6)),
      acc: p.coords.accuracy ?? null,
    };
  } catch {
    return { lat: null, lng: null, acc: null };
  }
}

async function registrarPing(g: GPS): Promise<void> {
  if (g.lat != null && g.lng != null) {
    await supabase.rpc("rpc_registrar_ubicacion", { p_lat: g.lat, p_lng: g.lng, p_precision: g.acc });
  }
}

// Verifica que el incidente de la "atención actual" siga abierto; si no, no se
// debe relacionar la alerta con él.
export async function incidenteAtendible(incidenteId: string): Promise<boolean> {
  const { data } = await supabase
    .from("incidentes")
    .select("estado, estatus")
    .eq("id", incidenteId)
    .maybeSingle();
  return !!data && (data as any).estatus === "activo" && (data as any).estado !== "cerrado";
}

// Pánico sin incidente en curso → nueva llamada CAD de emergencia + su despacho.
export interface OrigenAlerta {
  personalId?: string | null;
  patrullaId?: string | null;
  oficialEtq?: string | null;   // "Comisario Jorge Ron #1027"
  unidadEtq?: string | null;    // "#14 · Sedán Nissan"
  bodycamFolio?: string | null; // "2026BC000007"
  bodycamId?: string | null;
}

export async function panicoNuevoDespacho(
  g: GPS,
  correo: string | null,
  origen?: OrigenAlerta
): Promise<{ folio: string | null; despachoId: string | null; llamadaId: string | null }> {
  const dir = g.lat != null && g.lng != null ? `GPS ${g.lat}, ${g.lng}` : "Ubicación no disponible";
  // El reporte deja constancia de QUIÉN activó la alerta y desde qué unidad.
  const quien = origen?.oficialEtq ? `Elemento: ${origen.oficialEtq}. ` : "";
  const unidad = origen?.unidadEtq ? `Unidad: ${origen.unidadEtq}. ` : "";
  const bc = origen?.bodycamFolio ? `Bodycam: ${origen.bodycamFolio}. ` : "";
  const { data: ll, error: e1 } = await supabase
    .from("llamadas_cad")
    .insert({
      tipo: "EMERGENCIA - PÁNICO",
      prioridad: "alta",
      // Reportante = nombre del elemento (no el correo).
      reportante: origen?.oficialEtq ?? correo,
      descripcion: `Alerta de pánico activada por el elemento en campo. ${quien}${unidad}${bc}Solicita apoyo inmediato.`.replace(/\s+/g, " ").trim(),
      direccion: dir,
      latitud: g.lat,
      longitud: g.lng,
      estado_despacho: "despachada",
      datos_adicionales: {
        origen: "panico_movil",
        personal_id: origen?.personalId ?? null,
        patrulla_id: origen?.patrullaId ?? null,
        elemento: origen?.oficialEtq ?? null,
        unidad: origen?.unidadEtq ?? null,
        bodycam_folio: origen?.bodycamFolio ?? null,
        bodycam_id: origen?.bodycamId ?? null,
      },
    })
    .select("id, folio")
    .single();
  if (e1) throw e1;

  const { data: dp, error: e2 } = await supabase.from("despachos").insert({
    llamada_id: ll.id,
    personal_id: origen?.personalId ?? null,
    estado: "asignada",
    notas: `Despacho por alerta de pánico (app móvil). ${quien}${unidad}`.trim(),
  }).select("id").single();
  if (e2) throw e2;

  await registrarPing(g);
  const folio = (ll as any).folio ?? null;
  await registrarAlertaEnviada({
    tipo: "emergencia",
    titulo: `Emergencia / pánico ${folio ?? ""}`.trim(),
    detalle: g.lat != null && g.lng != null ? `Ubicación ${g.lat}, ${g.lng}` : "Sin ubicación",
  });
  return { folio, despachoId: (dp as any)?.id ?? null, llamadaId: (ll as any).id ?? null };
}

// Pánico durante la atención de un incidente → novedad de alerta en ese incidente.
export async function panicoRelacionarIncidente(incidenteId: string, g: GPS, correo: string | null): Promise<void> {
  const loc = g.lat != null && g.lng != null ? ` Ubicación: ${g.lat}, ${g.lng}.` : "";
  const { error } = await supabase.from("novedades").insert({
    incidente_id: incidenteId,
    texto: `🚨 ALERTA DE PÁNICO activada por el elemento. Solicito apoyo inmediato.${loc}`,
    reportado_por: correo,
  });
  if (error) throw error;
  await registrarPing(g);
  await registrarAlertaEnviada({
    tipo: "incidente",
    titulo: "Alerta de pánico en incidente",
    detalle: g.lat != null && g.lng != null ? `Ubicación ${g.lat}, ${g.lng}` : "Sin ubicación",
  });
}
