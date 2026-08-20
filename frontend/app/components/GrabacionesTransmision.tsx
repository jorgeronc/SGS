"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

interface Grab {
  id: string;
  folio: string | null;
  video_ruta: string;
  duracion_seg: number | null;
  iniciado_en: string;
  evidencia?: { fotografias: unknown } | null;
  url?: string | null;
  poster?: string | null;
}

function mmss(s: number | null): string {
  if (!s) return "—";
  const m = Math.floor(s / 60);
  return `${m}:${(s % 60).toString().padStart(2, "0")}`;
}

// Reproductor de las grabaciones (bodycam) de una llamada. El bucket es
// privado, así que se resuelve una URL firmada por cada video.
export default function GrabacionesTransmision({ llamadaId }: { llamadaId: string }) {
  const [grabs, setGrabs] = useState<Grab[]>([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("transmisiones")
        .select("id, folio, video_ruta, duracion_seg, iniciado_en, evidencia:evidencias(fotografias)")
        .eq("llamada_id", llamadaId)
        .eq("estatus", "activo")
        .not("video_ruta", "is", null)
        .order("iniciado_en", { ascending: false });
      const filas = ((data as any[]) ?? []) as Grab[];
      const conUrl = await Promise.all(
        filas.map(async (g) => {
          const { data: s } = await supabase.storage.from("videos").createSignedUrl(g.video_ruta, 3600);
          const fp = Array.isArray(g.evidencia?.fotografias) ? (g.evidencia!.fotografias as string[])[0] : null;
          const poster = fp ? supabase.storage.from("fotos").getPublicUrl(fp).data.publicUrl : null;
          return { ...g, url: s?.signedUrl ?? null, poster };
        })
      );
      setGrabs(conUrl);
    })();
  }, [llamadaId]);

  if (grabs.length === 0) return null;

  return (
    <section style={{ marginTop: 16 }}>
      <h3>🎥 Grabaciones de la transmisión ({grabs.length})</h3>
      {grabs.map((g) => (
        <div key={g.id} className="card" style={{ padding: 12, marginBottom: 12 }}>
          <p className="dash-sub" style={{ marginBottom: 8 }}>
            {g.folio ?? "TX"} · {new Date(g.iniciado_en).toLocaleString()} · duración {mmss(g.duracion_seg)} · evidencia con cadena de custodia
          </p>
          {g.url ? (
            <video src={g.url} poster={g.poster ?? undefined} controls style={{ width: "100%", borderRadius: 8, background: "#000", aspectRatio: "16 / 9" }} />
          ) : (
            <p style={{ color: "#b00020", fontSize: 13 }}>No se pudo generar el enlace del video.</p>
          )}
        </div>
      ))}
    </section>
  );
}
