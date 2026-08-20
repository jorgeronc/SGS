import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";

// Alertas / notificaciones prioritarias derivadas de datos en vivo. El estado
// "leída" se guarda localmente (no hay tabla de notificaciones): el badge
// refleja las alertas prioritarias que el elemento aún no ha visto.
const KEY_LEIDAS = "scp_alertas_leidas";

export type KindAlerta = "emergencia" | "despacho" | "orden";
export interface Alerta {
  id: string;
  kind: KindAlerta;
  titulo: string;
  sub: string;
  fecha: string | null;
  prioridad: 0 | 1 | 2; // 0 = crítica (emergencia), 1 = despacho, 2 = orden
  refId: string;
}

export async function cargarAlertas(): Promise<Alerta[]> {
  const [cad, desp, ord] = await Promise.all([
    supabase
      .from("llamadas_cad")
      .select("id, folio, tipo, direccion, fecha_recepcion")
      .eq("estatus", "activo")
      .eq("prioridad", "alta")
      .neq("estado_despacho", "resuelta")
      .order("fecha_recepcion", { ascending: false })
      .limit(30),
    supabase
      .from("despachos")
      .select("id, estado, fecha_asignacion, llamada:llamadas_cad(folio, tipo, direccion)")
      .eq("estatus", "activo")
      .neq("estado", "cerrado")
      .order("fecha_asignacion", { ascending: false })
      .limit(30),
    supabase
      .from("ordenes")
      .select("id, folio, tipo, asunto, fecha_emision, estado")
      .eq("estatus", "activo")
      .in("estado", ["emitida", "notificada"])
      .order("fecha_emision", { ascending: false })
      .limit(20),
  ]);

  const lista: Alerta[] = [];

  for (const c of ((cad.data as any[]) ?? [])) {
    lista.push({
      id: `cad:${c.id}`,
      kind: "emergencia",
      titulo: `${c.folio ?? "s/folio"} · ${c.tipo ?? "Emergencia"}`,
      sub: c.direccion ?? "Sin dirección",
      fecha: c.fecha_recepcion ?? null,
      prioridad: 0,
      refId: c.id,
    });
  }
  for (const d of ((desp.data as any[]) ?? [])) {
    const ll = d.llamada;
    lista.push({
      id: `desp:${d.id}`,
      kind: "despacho",
      titulo: `${ll?.folio ?? "Despacho"} · ${ll?.tipo ?? "asignación"}`,
      sub: `${d.estado} · ${ll?.direccion ?? "sin dirección"}`,
      fecha: d.fecha_asignacion ?? null,
      prioridad: 1,
      refId: d.id,
    });
  }
  for (const o of ((ord.data as any[]) ?? [])) {
    lista.push({
      id: `orden:${o.id}`,
      kind: "orden",
      titulo: `${o.folio ?? "Orden"} · ${o.tipo ?? ""}`.trim(),
      sub: o.asunto ?? o.estado ?? "Orden vigente",
      fecha: o.fecha_emision ?? null,
      prioridad: 2,
      refId: o.id,
    });
  }

  lista.sort((a, b) => a.prioridad - b.prioridad || (b.fecha ?? "").localeCompare(a.fecha ?? ""));
  return lista;
}

export async function getLeidas(): Promise<Set<string>> {
  const raw = await AsyncStorage.getItem(KEY_LEIDAS);
  if (!raw) return new Set();
  try {
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

export async function marcarLeidas(ids: string[]): Promise<void> {
  const actual = await getLeidas();
  ids.forEach((i) => actual.add(i));
  // Conserva sólo un histórico razonable para no crecer sin límite.
  const arr = Array.from(actual).slice(-500);
  await AsyncStorage.setItem(KEY_LEIDAS, JSON.stringify(arr));
}

export async function contarNoLeidas(): Promise<number> {
  const [alertas, leidas] = await Promise.all([cargarAlertas(), getLeidas()]);
  return alertas.filter((a) => !leidas.has(a.id)).length;
}
