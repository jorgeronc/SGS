"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FSDoc = Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => void };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FSEl = HTMLElement & { webkitRequestFullscreen?: () => void };

// Un mosaico/tile de UNA cámara. Resuelve la señal AL VUELO por la Edge Function
// `camara_vista` (la API key del proveedor nunca baja al navegador), se auto-
// refresca por debajo del vencimiento de la URL (~5 min) y hace cache-bust del
// snapshot para no mostrar la toma vieja. Si no hay señal, muestra el motivo.
interface Capacidades { live: boolean; snapshot: boolean; ptz: boolean; grabacion: boolean; eventos: boolean }
interface Vista {
  nombre?: string; proveedor?: string; estado?: string;
  imagen_url?: string | null; player_url?: string | null;
  en_vivo?: boolean; actualizado_en?: string | null; expira_en_s?: number | null;
  capacidades?: Capacidades;
  error?: string;
}

export default function VisorCamara({
  camaraId, nombre, alto = 220, refrescoMs = 300000, onVista, llenar = false,
}: {
  camaraId: string; nombre?: string; alto?: number; refrescoMs?: number;
  // Notifica la vista resuelta (incluye `capacidades`, `imagen_url`, `estado`)
  // para que el inspector reutilice el dato sin llamar otra vez a la edge function.
  onVista?: (v: Vista) => void;
  // `llenar`: el visor ocupa el 100% de su contenedor flex (para el reproductor
  // principal de la consola) en vez de una altura fija.
  llenar?: boolean;
}) {
  const [v, setV] = useState<Vista | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [fs, setFs] = useState(false);
  const primera = useRef(true);
  const boxRef = useRef<HTMLDivElement>(null);

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
    setError(null); setV(data as Vista); onVista?.(data as Vista);
  }, [camaraId, onVista]);

  useEffect(() => {
    cargar();
    const t = setInterval(cargar, refrescoMs);
    return () => clearInterval(t);
  }, [cargar, refrescoMs]);

  // Sincroniza el estado de pantalla completa (por si el usuario sale con Esc).
  useEffect(() => {
    const onFs = () => {
      const doc = document as FSDoc;
      setFs((doc.fullscreenElement ?? doc.webkitFullscreenElement) === boxRef.current);
    };
    document.addEventListener("fullscreenchange", onFs);
    document.addEventListener("webkitfullscreenchange", onFs);
    return () => { document.removeEventListener("fullscreenchange", onFs); document.removeEventListener("webkitfullscreenchange", onFs); };
  }, []);

  function alternarPantallaCompleta() {
    const doc = document as FSDoc;
    const el = boxRef.current as FSEl | null;
    if (doc.fullscreenElement || doc.webkitFullscreenElement) {
      (doc.exitFullscreen ?? doc.webkitExitFullscreen)?.call(doc);
    } else {
      (el?.requestFullscreen ?? el?.webkitRequestFullscreen)?.call(el);
    }
  }

  const titulo = nombre ?? v?.nombre ?? "Cámara";
  const bust = (u: string) => `${u}${u.includes("?") ? "&" : "?"}_t=${Date.now()}`;
  const altoMedia = fs ? "calc(100vh - 30px)" : alto;

  return (
    <div ref={boxRef} style={{ border: "1px solid var(--sc-card-line, #e2e6ec)", borderRadius: fs ? 0 : 8, overflow: "hidden", background: "#0b1220", height: fs ? "100vh" : (llenar ? "100%" : undefined), display: (fs || llenar) ? "flex" : undefined, flexDirection: (fs || llenar) ? "column" : undefined }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 8px", background: "#11223C", color: "#fff", fontSize: 12.5 }}>
        {v?.en_vivo ? <span style={{ color: "#ff5252", fontWeight: 800 }}>● EN VIVO</span> : <span style={{ opacity: 0.7 }}>◦ Snapshot</span>}
        <b style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{titulo}</b>
        <button onClick={cargar} title="Actualizar" style={{ marginLeft: "auto", background: "transparent", border: "none", color: "#fff", cursor: "pointer", fontSize: 14 }}>↻</button>
        <button onClick={alternarPantallaCompleta} title={fs ? "Salir de pantalla completa" : "Pantalla completa"} style={{ background: "transparent", border: "none", color: "#fff", cursor: "pointer", fontSize: 14 }}>{fs ? "🡼" : "⛶"}</button>
      </div>
      <div style={{ height: (fs || llenar) ? undefined : altoMedia, flex: (fs || llenar) ? 1 : undefined, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#8a94a6", fontSize: 13 }}>
        {cargando && "Cargando señal…"}
        {!cargando && error && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: 12, textAlign: "center" }}>
            <div style={{ fontSize: 34, opacity: 0.8 }}>📷</div>
            <div style={{ fontWeight: 700, fontSize: 13, color: /manten/i.test(error) ? "#d98a2b" : (/inactiv|sin señal|fuera/i.test(error) ? "#e23b53" : "#ff8a80") }}>{error}</div>
          </div>
        )}
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
