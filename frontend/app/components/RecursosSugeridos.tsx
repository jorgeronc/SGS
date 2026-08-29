"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

// Recursos sugeridos a despachar en un incidente: guardias cercanos (auto, por
// GPS), recursos propios (catálogo editable cat_opciones 'recurso_propio') y
// autoridades de seguridad (directorio_autoridades, contactables). Ver mig. 0068.
function distKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371, dLat = ((bLat - aLat) * Math.PI) / 180, dLng = ((bLng - aLng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}
const dist = (km: number) => (km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`);

interface Aut { id: string; folio: string | null; tipo: string | null; nombre: string; telefono: string | null; telefono_alt: string | null; contacto: string | null; correo: string | null; zona: string | null; notas: string | null }

export default function RecursosSugeridos({ latitud, longitud }: { latitud: number | null; longitud: number | null }) {
  const [guardias, setGuardias] = useState<any[]>([]);
  const [propios, setPropios] = useState<string[]>([]);
  const [autoridades, setAutoridades] = useState<Aut[]>([]);
  const [abierto, setAbierto] = useState<string | null>(null);

  useEffect(() => {
    supabase.from("cat_opciones").select("valor").eq("categoria", "recurso_propio").eq("activo", true).order("orden")
      .then(({ data }) => setPropios(((data as any[]) ?? []).map((r) => r.valor)));
    supabase.from("directorio_autoridades").select("id, folio, tipo, nombre, telefono, telefono_alt, contacto, correo, zona, notas").eq("estatus", "activo").order("tipo")
      .then(({ data }) => setAutoridades((data as any[]) ?? []));
    supabase.from("ubicaciones_guardias").select("personal_id, etiqueta, unidad, latitud, longitud, actualizado_en").eq("en_linea", true)
      .then(({ data }) => setGuardias((data as any[]) ?? []));
  }, []);

  const cercanos = useMemo(() => {
    if (latitud == null || longitud == null) return guardias.slice(0, 3).map((g) => ({ ...g, km: null }));
    return guardias.filter((g) => g.latitud != null)
      .map((g) => ({ ...g, km: distKm(Number(latitud), Number(longitud), Number(g.latitud), Number(g.longitud)) }))
      .sort((a, b) => (a.km ?? 9e9) - (b.km ?? 9e9)).slice(0, 3);
  }, [guardias, latitud, longitud]);

  const item = { display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", border: "1px solid var(--sc-card-line)", borderRadius: 9, marginBottom: 6 } as const;
  const ic = (bg: string, c: string) => ({ width: 28, height: 28, borderRadius: 7, background: bg, color: c, display: "grid", placeItems: "center", fontSize: 14, flex: "0 0 auto" } as const);
  const sub = { fontSize: 11, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--sc-text-faint)", margin: "4px 0 6px" } as const;

  return (
    <div>
      <div style={sub}>Recursos propios</div>
      {cercanos.map((g) => (
        <div key={g.personal_id} style={item}>
          <span style={ic("#e6f6ec", "#1f7a44")}>👮</span>
          <div style={{ flex: 1, minWidth: 0 }}><b>{g.etiqueta ?? "Guardia"}</b><div style={{ fontSize: 12, color: "var(--sc-text-soft)" }}>{g.unidad ? `${g.unidad} · ` : ""}{g.km != null ? `a ${dist(g.km)}` : "en línea"}</div></div>
        </div>
      ))}
      {cercanos.length === 0 && <div style={{ fontSize: 12.5, color: "var(--sc-text-soft)", padding: "2px 2px 6px" }}>Sin guardias en línea cercanos.</div>}
      {propios.map((p) => (
        <div key={p} style={item}><span style={ic("#e7effe", "#2f6bff")}>🧰</span><div style={{ flex: 1 }}>{p}</div></div>
      ))}

      <div style={{ ...sub, marginTop: 10 }}>Autoridades de seguridad</div>
      {autoridades.length === 0 && <div style={{ fontSize: 12.5, color: "var(--sc-text-soft)" }}>Aún no hay autoridades en el <a href="/directorio" style={{ color: "var(--sc-btn,#f4a03f)" }}>Directorio</a>.</div>}
      {autoridades.map((a) => (
        <div key={a.id}>
          <div style={{ ...item, cursor: "pointer" }} onClick={() => setAbierto((x) => (x === a.id ? null : a.id))}>
            <span style={ic("#fde7e7", "#e23b53")}>🚑</span>
            <div style={{ flex: 1, minWidth: 0 }}><b>{a.nombre}</b><div style={{ fontSize: 12, color: "var(--sc-text-soft)" }}>{a.tipo ?? ""}{a.zona ? ` · ${a.zona}` : ""}{a.telefono ? ` · ${a.telefono}` : ""}</div></div>
            <span style={{ color: "var(--sc-text-faint)" }}>{abierto === a.id ? "▾" : "›"}</span>
          </div>
          {abierto === a.id && (
            <div style={{ margin: "-2px 0 8px 38px", padding: "8px 10px", border: "1px solid var(--sc-card-line)", borderRadius: 9, fontSize: 12.5 }}>
              {a.contacto && <div style={{ color: "var(--sc-text-soft)" }}>Contacto: {a.contacto}</div>}
              {a.notas && <div style={{ color: "var(--sc-text-soft)" }}>{a.notas}</div>}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
                {a.telefono && <a href={`tel:${a.telefono}`} style={{ background: "#1f9d5c", color: "#fff", borderRadius: 8, padding: "6px 12px", fontWeight: 700, textDecoration: "none" }}>📞 Llamar {a.telefono}</a>}
                {a.telefono_alt && <a href={`tel:${a.telefono_alt}`} style={{ border: "1px solid var(--sc-card-line)", borderRadius: 8, padding: "6px 12px", textDecoration: "none", color: "var(--sc-text)" }}>📞 {a.telefono_alt}</a>}
                {a.correo && <a href={`mailto:${a.correo}`} style={{ border: "1px solid var(--sc-card-line)", borderRadius: 8, padding: "6px 12px", textDecoration: "none", color: "var(--sc-text)" }}>✉ Correo</a>}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
