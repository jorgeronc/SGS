import { supabase } from "./supabaseClient";

export interface RegistroSimilar {
  id: string;
  etiqueta: string;
  href: string;
  antecedentes?: string[]; // etiquetas de registros previos (detenciones, vínculos, etc.)
}

// Antecedentes de personas: detenciones (barandilla) y vínculos (casos, órdenes,
// vehículos, etc.). Devuelve un mapa id -> lista de etiquetas.
export async function antecedentesPersonas(ids: string[]): Promise<Record<string, string[]>> {
  const res: Record<string, string[]> = {};
  if (!ids.length) return res;
  const c: Record<string, { det: number; vin: number }> = {};
  ids.forEach((id) => (c[id] = { det: 0, vin: 0 }));

  const inList = ids.join(",");
  const [bar, vin] = await Promise.all([
    supabase.from("barandilla").select("persona_id").in("persona_id", ids).eq("estatus", "activo"),
    supabase
      .from("vinculos")
      .select("entidad_origen_tipo, entidad_origen_id, entidad_destino_tipo, entidad_destino_id")
      .or(`entidad_origen_id.in.(${inList}),entidad_destino_id.in.(${inList})`)
      .eq("estatus", "activo")
      .limit(500),
  ]);

  ((bar.data as any[]) ?? []).forEach((b) => { if (c[b.persona_id]) c[b.persona_id].det++; });
  ((vin.data as any[]) ?? []).forEach((v) => {
    if (v.entidad_origen_tipo === "persona" && c[v.entidad_origen_id]) c[v.entidad_origen_id].vin++;
    if (v.entidad_destino_tipo === "persona" && c[v.entidad_destino_id]) c[v.entidad_destino_id].vin++;
  });

  for (const id of ids) {
    const t: string[] = [];
    if (c[id].det) t.push(`🔴 ${c[id].det} detención${c[id].det > 1 ? "es" : ""}`);
    if (c[id].vin) t.push(`🔗 ${c[id].vin} vínculo${c[id].vin > 1 ? "s" : ""}`);
    res[id] = t;
  }
  return res;
}

// Antecedentes de vehículos: vínculos con casos/incidentes/personas/etc.
export async function antecedentesVehiculos(ids: string[]): Promise<Record<string, string[]>> {
  const res: Record<string, string[]> = {};
  if (!ids.length) return res;
  const cnt: Record<string, number> = {};
  ids.forEach((id) => (cnt[id] = 0));
  const inList = ids.join(",");
  const { data } = await supabase
    .from("vinculos")
    .select("entidad_origen_tipo, entidad_origen_id, entidad_destino_tipo, entidad_destino_id")
    .or(`entidad_origen_id.in.(${inList}),entidad_destino_id.in.(${inList})`)
    .eq("estatus", "activo")
    .limit(500);
  ((data as any[]) ?? []).forEach((v) => {
    if (v.entidad_origen_tipo === "vehiculo" && cnt[v.entidad_origen_id] !== undefined) cnt[v.entidad_origen_id]++;
    if (v.entidad_destino_tipo === "vehiculo" && cnt[v.entidad_destino_id] !== undefined) cnt[v.entidad_destino_id]++;
  });
  for (const id of ids) res[id] = cnt[id] ? [`🔗 ${cnt[id]} vínculo${cnt[id] > 1 ? "s" : ""}`] : [];
  return res;
}

function etiquetaPersona(p: any): string {
  return `${p.nombre ?? ""} ${p.apellido_paterno ?? ""} ${p.apellido_materno ?? ""}`.trim() + (p.curp ? ` · ${p.curp}` : "");
}

// Personas ya existentes con la misma CURP o nombre/apellido, con sus antecedentes.
export async function personasSimilares(opts: {
  curp?: string;
  nombre?: string;
  apellido_paterno?: string;
  excluir?: string;
}): Promise<RegistroSimilar[]> {
  const curp = opts.curp?.trim();
  const nom = opts.nombre?.trim();
  const ap = opts.apellido_paterno?.trim();
  const ors: string[] = [];
  if (curp) ors.push(`curp.ilike.${curp}`);
  if (nom) ors.push(`nombre.ilike.%${nom}%`);
  if (ors.length === 0) return [];

  const { data } = await supabase
    .from("personas")
    .select("id, nombre, apellido_paterno, apellido_materno, curp")
    .or(ors.join(","))
    .limit(20);

  const matches = ((data as any[]) ?? [])
    .filter((p) => !opts.excluir || p.id !== opts.excluir)
    .filter((p) => {
      if (curp && p.curp && p.curp.toLowerCase() === curp.toLowerCase()) return true;
      if (nom) {
        const okNom = (p.nombre ?? "").toLowerCase().includes(nom.toLowerCase());
        const okAp = !ap || (p.apellido_paterno ?? "").toLowerCase().includes(ap.toLowerCase());
        return okNom && okAp;
      }
      return false;
    });

  const ant = await antecedentesPersonas(matches.map((m) => m.id));
  return matches.map((p) => ({ id: p.id, etiqueta: etiquetaPersona(p), href: `/personas/${p.id}`, antecedentes: ant[p.id] ?? [] }));
}

// Una persona por id con sus antecedentes (para módulos que ya la referencian).
export async function personaConAntecedentes(id: string): Promise<RegistroSimilar[]> {
  if (!id) return [];
  const { data } = await supabase.from("personas").select("id, nombre, apellido_paterno, apellido_materno, curp").eq("id", id).maybeSingle();
  if (!data) return [];
  const ant = await antecedentesPersonas([id]);
  return [{ id, etiqueta: etiquetaPersona(data), href: `/personas/${id}`, antecedentes: ant[id] ?? [] }];
}

function km(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

// Reportes previos en/cerca de una ubicación (inteligencia de "punto caliente"):
// llamadas CAD e incidentes cercanos (por coordenadas) o con la misma dirección.
export async function reportesCercanos(opts: { lat?: number | null; lng?: number | null; direccion?: string }): Promise<RegistroSimilar[]> {
  const { lat, lng } = opts;
  const dir = opts.direccion?.trim();
  const res: RegistroSimilar[] = [];

  if (lat != null && lng != null) {
    const [cad, inc] = await Promise.all([
      supabase.from("llamadas_cad").select("id, folio, tipo, latitud, longitud").eq("estatus", "activo").not("latitud", "is", null).limit(400),
      supabase.from("incidentes").select("id, folio, tipo, delito, latitud, longitud").eq("estatus", "activo").not("latitud", "is", null).limit(400),
    ]);
    for (const c of ((cad.data as any[]) ?? [])) if (km(lat, lng, c.latitud, c.longitud) <= 0.15)
      res.push({ id: `cad-${c.id}`, etiqueta: `${c.folio ?? "CAD"} · ${c.tipo ?? ""}`.trim(), href: `/cad/${c.id}`, antecedentes: ["📞 reporte CAD"] });
    for (const i of ((inc.data as any[]) ?? [])) if (km(lat, lng, i.latitud, i.longitud) <= 0.15)
      res.push({ id: `inc-${i.id}`, etiqueta: `${i.folio ?? "INC"} · ${i.delito ?? i.tipo ?? ""}`.trim(), href: `/incidentes/${i.id}`, antecedentes: ["📄 incidente"] });
  } else if (dir && dir.length >= 6) {
    const frag = dir.split(",")[0].trim();
    const [cad, inc] = await Promise.all([
      supabase.from("llamadas_cad").select("id, folio, tipo, direccion").eq("estatus", "activo").ilike("direccion", `%${frag}%`).limit(15),
      supabase.from("incidentes").select("id, folio, tipo, delito, direccion").eq("estatus", "activo").ilike("direccion", `%${frag}%`).limit(15),
    ]);
    for (const c of ((cad.data as any[]) ?? [])) res.push({ id: `cad-${c.id}`, etiqueta: `${c.folio ?? "CAD"} · ${c.direccion ?? ""}`, href: `/cad/${c.id}`, antecedentes: ["📞 reporte CAD"] });
    for (const i of ((inc.data as any[]) ?? [])) res.push({ id: `inc-${i.id}`, etiqueta: `${i.folio ?? "INC"} · ${i.direccion ?? ""}`, href: `/incidentes/${i.id}`, antecedentes: ["📄 incidente"] });
  }
  return res.slice(0, 20);
}

// Vehículos con la misma placa o VIN, con sus antecedentes.
export async function vehiculosSimilares(opts: { placas?: string; vin?: string; excluir?: string }): Promise<RegistroSimilar[]> {
  const ors: string[] = [];
  if (opts.placas?.trim()) ors.push(`placas.ilike.${opts.placas.trim()}`);
  if (opts.vin?.trim()) ors.push(`vin.ilike.${opts.vin.trim()}`);
  if (ors.length === 0) return [];

  const { data } = await supabase.from("vehiculos").select("id, placas, marca, modelo, vin").or(ors.join(",")).limit(20);
  const matches = ((data as any[]) ?? []).filter((v) => !opts.excluir || v.id !== opts.excluir);
  const ant = await antecedentesVehiculos(matches.map((m) => m.id));
  return matches.map((v) => ({
    id: v.id,
    etiqueta: `${v.placas ?? "s/placas"} · ${v.marca ?? ""} ${v.modelo ?? ""}`.trim(),
    href: `/vehiculos/${v.id}`,
    antecedentes: ant[v.id] ?? [],
  }));
}
