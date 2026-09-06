"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Captura de foto REAL desde la cámara del dispositivo (o una cámara conectada por
// USB/puerto). Lista las cámaras disponibles y permite elegir. Al capturar entrega
// un Blob + dataURL de vista previa. Requiere HTTPS (o localhost) para getUserMedia.
export default function CamaraFoto({ onCapture, alto = 320 }: { onCapture: (blob: Blob, dataUrl: string) => void; alto?: number }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [dispositivos, setDispositivos] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string>("");
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);

  const detener = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const arrancar = useCallback(async (id?: string) => {
    setError(null); setListo(false);
    detener();
    try {
      const constraints: MediaStreamConstraints = { video: id ? { deviceId: { exact: id } } : { facingMode: "user" }, audio: false };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play().catch(() => {}); }
      // Enumerar cámaras (con permiso ya otorgado, aparecen sus etiquetas).
      const devs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput");
      setDispositivos(devs);
      const actual = stream.getVideoTracks()[0]?.getSettings().deviceId;
      if (actual) setDeviceId(actual);
      setListo(true);
    } catch (e: any) {
      setError(e?.name === "NotAllowedError" ? "Permiso de cámara denegado." : (e?.message ?? "No se pudo abrir la cámara."));
    }
  }, [detener]);

  useEffect(() => { arrancar(); return () => detener(); /* eslint-disable-next-line */ }, []);

  function cambiar(id: string) { setDeviceId(id); setPreview(null); arrancar(id); }

  function capturar() {
    const v = videoRef.current; if (!v) return;
    const w = v.videoWidth || 640, h = v.videoHeight || 480;
    const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
    const ctx = cv.getContext("2d"); if (!ctx) return;
    ctx.drawImage(v, 0, 0, w, h);
    const dataUrl = cv.toDataURL("image/jpeg", 0.85);
    setPreview(dataUrl);
    cv.toBlob((b) => { if (b) onCapture(b, dataUrl); }, "image/jpeg", 0.85);
  }

  function retomar() { setPreview(null); if (!streamRef.current) arrancar(deviceId || undefined); }

  const marco: React.CSSProperties = { width: "100%", maxWidth: alto * 0.75 * 1.34, height: alto, borderRadius: 10, background: "#111", objectFit: "cover", border: "1px solid var(--sc-card-line)" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
        {/* Imagen / vista previa a la izquierda */}
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {preview ? <img src={preview} alt="Foto capturada" style={marco} /> : <video ref={videoRef} playsInline muted style={marco} />}
        </div>
        {/* Controles a la derecha: selector arriba, botón abajo (alineados a la izquierda) */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-start" }}>
          {dispositivos.length > 1 && (
            <label className="dash-sub" style={{ display: "flex", flexDirection: "column", gap: 4 }}>Cámara
              <select value={deviceId} onChange={(e) => cambiar(e.target.value)}>
                {dispositivos.map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Cámara ${i + 1}`}</option>)}
              </select>
            </label>
          )}
          {!preview ? (
            <button type="button" onClick={capturar} disabled={!listo} style={{ background: "var(--sc-btn,#f4a03f)", color: "#fff", border: "none", borderRadius: 9, padding: "10px 18px", fontWeight: 700, cursor: "pointer" }}>📸 Tomar foto</button>
          ) : (
            <button type="button" onClick={retomar} style={{ border: "1px solid var(--sc-card-line)", background: "transparent", color: "var(--sc-text)", borderRadius: 9, padding: "10px 18px", fontWeight: 700, cursor: "pointer" }}>↻ Retomar</button>
          )}
        </div>
      </div>
      {error && <p style={{ color: "#b00020", fontSize: 13 }}>{error} <button type="button" onClick={() => arrancar(deviceId || undefined)} style={{ marginLeft: 6 }}>Reintentar</button></p>}
    </div>
  );
}
