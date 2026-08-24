"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

// Un mosaico/tile de UNA cámara. Resuelve la señal AL VUELO por la Edge Function
// `camara_vista` (la API key del proveedor nunca baja al navegador), se auto-
// refresca por debajo del vencimiento de la URL (~5 min) y hace cache-bust del
// snapshot para no mostrar la toma vieja. Si no hay señal, muestra el motivo.
interface Vista {
  nombre?: string; proveedor?: string;
  imagen_url?: string | null; player_url?: string | null;
  en_vivo?: boolean; actualizado_en?: string | null; expira_en_s?: number | null;
  error?: string;
}

export default function VisorCamara({
  camaraId, nombre, alto = 220, refrescoMs = 300000,
}: {
  camaraId: string; nombre?: string; alto?: number; refrescoMs?: number;
}) {
  const [v, setV] = useState<Vista | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const primera = useRef(true);

  const cargar = useCallback(async () => {
    if (primera.current) setCargando(true);
    const { data, error: err } = await supabase.functions.invoke("camara_vista", {
      body: { accion: "vista", camara_id: camaraId },
    });
    setCargando(false); primera.current = false;
    if (err || (data as any)?.error) {
      let msg = (data as any)?.error ?? err?.message ?? "Sin señal.";
      try {
        const ctx = (err as any)?.context;
        if (ctx && typeof ctx.json === "function") { const b = await ctx.json(); if (b?.error) msg = b.error; }
      } catch { /* se conserva el mensaje */ }
      setError(msg); return;
    }
    setError(null); setV(data as Vista);
  }, [camaraId]);

  useEffect(() => {
    cargar();
    const t = setInterval(cargar, refrescoMs);
    return () => clearInterval(t);
  }, [cargar, refrescoMs]);

  const titulo = nombre ?? v?.nombre ?? "Cámara";
  const bust = (u: string) => `${u}${u.includes("?") ? "&" : "?"}_t=${Date.now()}`;

  return (
    <div style={{ border: "1px solid var(--sc-card-line, #e2e6ec)", borderRadius: 8, overflow: "hidden", background: "#0b1220" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 8px", background: "#11223C", color: "#fff", fontSize: 12.5 }}>
        {v?.en_vivo ? <span style={{ color: "#ff5252", fontWeight: 800 }}>● EN VIVO</span> : <span style={{ opacity: 0.7 }}>◦ Snapshot</span>}
        <b style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{titulo}</b>
        <button onClick={cargar} title="Actualizar" style={{ marginLeft: "auto", background: "transparent", border: "none", color: "#fff", cursor: "pointer" }}>↻</button>
      </div>
      <div style={{ height: alto, display: "flex", alignItems: "center", justifyContent: "center", color: "#8a94a6", fontSize: 13 }}>
        {cargando && "Cargando señal…"}
        {!cargando && error && <span style={{ color: "#ff8a80", padding: 10, textAlign: "center" }}>⚠ {error}</span>}
        {!cargando && !error && v?.imagen_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={bust(v.imagen_url)} alt={titulo} referrerPolicy="no-referrer"
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            onError={(e) => { (e.currentTarget.style.display = "none"); }} />
        )}
        {!cargando && !error && !v?.imagen_url && v?.player_url && (
          <iframe src={v.player_url} title={titulo} allow="autoplay; fullscreen" referrerPolicy="no-referrer"
            style={{ width: "100%", height: "100%", border: 0 }} />
        )}
        {!cargando && !error && !v?.imagen_url && !v?.player_url && <span>Sin señal disponible.</span>}
      </div>
    </div>
  );
}
