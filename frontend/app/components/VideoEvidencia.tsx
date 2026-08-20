"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

// Reproductor del video de una evidencia de bodycam. La ruta vive en el bucket
// privado 'videos', así que se resuelve una URL firmada.
// Si la evidencia todavía NO tiene miniatura (fotografias), captura un cuadro del
// video la primera vez que se abre y lo sube al bucket público 'fotos' para que
// la lista de Evidencias muestre la miniatura (igual que los videos de la alerta).
export default function VideoEvidencia({
  ruta,
  duracion,
  poster,
  evidenciaId,
  yaTienePoster,
}: {
  ruta: string;
  duracion?: number | null;
  poster?: string | null;
  evidenciaId?: string;
  yaTienePoster?: boolean;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const capturado = useRef(false);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.storage.from("videos").createSignedUrl(ruta, 3600);
      if (error || !data?.signedUrl) { setError(true); return; }
      setUrl(data.signedUrl);
    })();
  }, [ruta]);

  // Al cargar los datos, salta a ~1 s para capturar un cuadro representativo.
  function alCargar() {
    if (capturado.current || yaTienePoster || !evidenciaId) return;
    const v = videoRef.current;
    if (!v) return;
    try { v.currentTime = Math.min(1, (v.duration || 2) * 0.1); } catch { /* ignore */ }
  }

  // Cuando terminó de posicionarse, dibuja el cuadro y lo sube como miniatura.
  async function alPosicionar() {
    if (capturado.current || yaTienePoster || !evidenciaId) return;
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    capturado.current = true;
    try {
      const canvas = document.createElement("canvas");
      canvas.width = v.videoWidth;
      canvas.height = v.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
      const blob: Blob | null = await new Promise((res) => canvas.toBlob((b) => res(b), "image/jpeg", 0.7));
      if (!blob) return;
      const posterPath = `evidencias/${evidenciaId}/poster_${Date.now()}.jpg`;
      const { error: ep } = await supabase.storage.from("fotos").upload(posterPath, blob, { contentType: "image/jpeg", upsert: false });
      if (!ep) {
        await supabase.from("evidencias").update({ fotografias: [posterPath], actualizado_en: new Date().toISOString() }).eq("id", evidenciaId);
      }
    } catch {
      // El cuadro puede quedar "tainted" (CORS) o fallar la subida; sin miniatura no es crítico.
    }
  }

  return (
    <section style={{ marginTop: 16 }}>
      <h3>🎥 Video (bodycam)</h3>
      {duracion ? (
        <p className="dash-sub" style={{ marginBottom: 8 }}>Duración {Math.floor(duracion / 60)}:{(duracion % 60).toString().padStart(2, "0")}</p>
      ) : null}
      {error ? (
        <p style={{ color: "#b00020", fontSize: 13 }}>No se pudo generar el enlace del video.</p>
      ) : url ? (
        <video
          ref={videoRef}
          src={url}
          poster={poster ?? undefined}
          crossOrigin="anonymous"
          controls
          onLoadedData={alCargar}
          onSeeked={alPosicionar}
          style={{ width: "100%", maxWidth: 640, borderRadius: 8, background: "#000", aspectRatio: "16 / 9" }}
        />
      ) : (
        <p className="dash-sub">Cargando video…</p>
      )}
      <p className="dash-sub" style={{ marginTop: 6 }}>
        <a href={url ?? "#"} download target="_blank" rel="noreferrer">Descargar</a> · enlace temporal (1 h)
      </p>
    </section>
  );
}
