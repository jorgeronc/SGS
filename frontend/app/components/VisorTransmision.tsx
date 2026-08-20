"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { iceServers } from "@/lib/turn";

// Visor de la transmisión en vivo del oficial (bodycam). Se conecta por WebRTC:
// el teléfono es la fuente; este componente recibe y muestra el video. La
// señalización (oferta/respuesta/ICE) viaja por Supabase Realtime broadcast en
// el canal `tx:{id}`.
//
// GRABACIÓN (evidencia): mientras el despacho ve, se graba lo recibido con
// MediaRecorder; al terminar se sube al bucket privado 'videos' y se registra
// como evidencia con su cadena de custodia. Solo se graba mientras alguien ve.
export default function VisorTransmision({ transmisionId }: { transmisionId: string }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [estado, setEstado] = useState<"conectando" | "en_vivo" | "finalizada" | "error">("conectando");
  const [grabacion, setGrabacion] = useState<"inactiva" | "grabando" | "guardando" | "guardada" | "error">("inactiva");

  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const inicioRef = useRef<number>(0);
  const finalizadaRef = useRef(false);
  const posterRef = useRef<Blob | null>(null); // cuadro para la miniatura de la lista

  useEffect(() => {
    let pc: RTCPeerConnection | null = null;
    let cancelado = false;

    const canal = supabase.channel(`tx:${transmisionId}`, { config: { broadcast: { self: false } } });

    // Captura un cuadro del video para usarlo como miniatura de la evidencia.
    function capturarPoster() {
      try {
        const v = videoRef.current;
        if (!v || !v.videoWidth) return;
        const w = Math.min(v.videoWidth, 640);
        const h = Math.round((v.videoHeight / v.videoWidth) * w);
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(v, 0, 0, w, h);
        canvas.toBlob((b) => { if (b) posterRef.current = b; }, "image/jpeg", 0.7);
      } catch { /* ignore */ }
    }

    function iniciarGrabacion(stream: MediaStream) {
      if (recRef.current) return; // ya grabando
      try {
        const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")
          ? "video/webm;codecs=vp8,opus"
          : "video/webm";
        const rec = new MediaRecorder(stream, { mimeType: mime });
        rec.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data); };
        rec.start(1000); // corta en fragmentos de 1 s
        recRef.current = rec;
        inicioRef.current = Date.now();
        setGrabacion("grabando");
      } catch {
        setGrabacion("error");
      }
    }

    // Sube el video grabado y lo registra como evidencia con cadena de custodia.
    async function guardarGrabacion() {
      const rec = recRef.current;
      if (!rec || finalizadaRef.current) return;
      finalizadaRef.current = true;
      setGrabacion("guardando");

      const blob: Blob = await new Promise((resolve) => {
        rec.onstop = () => resolve(new Blob(chunksRef.current, { type: rec.mimeType || "video/webm" }));
        if (rec.state !== "inactive") rec.stop(); else resolve(new Blob(chunksRef.current, { type: "video/webm" }));
      });
      recRef.current = null;
      if (blob.size === 0) { setGrabacion("error"); return; }

      const dur = Math.round((Date.now() - inicioRef.current) / 1000);
      const ruta = `transmisiones/${transmisionId}/${Date.now()}.webm`;
      const { error: errUp } = await supabase.storage.from("videos").upload(ruta, blob, { contentType: "video/webm", upsert: false });
      if (errUp) { setGrabacion("error"); return; }

      // Datos de la transmisión + identidad del elemento y unidad, para dejar
      // constancia en la evidencia y su cadena de custodia.
      const { data: tx } = await supabase
        .from("transmisiones")
        .select("folio, bodycam_folio, bodycam_id, despacho_id, llamada_id, personal_id, evidencia_id, personal:personal(numero_placa, rango, persona:personas(nombre, apellido_paterno, apellido_materno)), patrulla:patrullas(numero)")
        .eq("id", transmisionId)
        .maybeSingle();

      const per = (tx as any)?.personal;
      const nombre = per?.persona ? `${per.persona.nombre ?? ""} ${per.persona.apellido_paterno ?? ""} ${per.persona.apellido_materno ?? ""}`.trim() : "";
      const elemento = [per?.rango, nombre, per?.numero_placa ? `#${per.numero_placa}` : ""].filter(Boolean).join(" ").trim();
      const patNum = (tx as any)?.patrulla?.numero;
      const unidadTxt = patNum ? `Unidad #${patNum}` : "";
      const txFolio = (tx as any)?.folio ?? transmisionId;
      const bodycamFolio = (tx as any)?.bodycam_folio ?? null;   // número de bodycam

      await supabase.from("transmisiones")
        .update({ video_ruta: ruta, duracion_seg: dur, actualizado_en: new Date().toISOString() })
        .eq("id", transmisionId);

      // Registrar como evidencia solo si aún no hay (evita duplicados si hay
      // varios visores). El video vive en datos_adicionales (bucket privado).
      if (!(tx as any)?.evidencia_id) {
        const { data: u } = await supabase.auth.getUser();
        const responsable = u.user?.email ?? "despacho";
        const { data: ev } = await supabase.from("evidencias").insert({
          tipo: "video_bodycam",
          descripcion: `Video ${bodycamFolio ? `bodycam ${bodycamFolio}` : `transmisión ${txFolio}`} — ${elemento || "elemento sin identificar"}${unidadTxt ? " · " + unidadTxt : ""}.`,
          estado_evidencia: "recolectada",
          fecha_recoleccion: new Date().toISOString(),
          datos_adicionales: {
            bucket: "videos", video_ruta: ruta, transmision_id: transmisionId, transmision_folio: txFolio,
            bodycam_folio: bodycamFolio, bodycam_id: (tx as any)?.bodycam_id ?? null,
            duracion_seg: dur, personal_id: (tx as any)?.personal_id ?? null, elemento, unidad: unidadTxt,
          },
        }).select("id").single();

        const evidenciaId = (ev as any)?.id;
        if (evidenciaId) {
          // Miniatura: sube el cuadro capturado al bucket público 'fotos' y lo
          // pone como fotografía (así la lista de evidencias muestra la miniatura).
          if (posterRef.current) {
            const posterPath = `evidencias/${evidenciaId}/poster_${Date.now()}.jpg`;
            const { error: ep } = await supabase.storage.from("fotos").upload(posterPath, posterRef.current, { contentType: "image/jpeg", upsert: false });
            if (!ep) {
              await supabase.from("evidencias").update({ fotografias: [posterPath], actualizado_en: new Date().toISOString() }).eq("id", evidenciaId);
            }
          }
          await supabase.from("cadena_custodia").insert({
            evidencia_id: evidenciaId,
            tipo_evento: "recoleccion",
            responsable,
            ubicacion: "Almacenamiento digital (bucket privado 'videos')",
            notas: `Grabación de la transmisión ${txFolio}${bodycamFolio ? ` · Bodycam ${bodycamFolio}` : ""}. Elemento: ${elemento || "sin identificar"}${unidadTxt ? " · " + unidadTxt : ""}. Registrada por el despacho.`,
          });
          await supabase.from("transmisiones").update({ evidencia_id: evidenciaId }).eq("id", transmisionId);
        }
      }
      setGrabacion("guardada");
    }

    async function manejarOferta(payload: any) {
      if (!pc || cancelado) return;
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(payload));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        canal.send({ type: "broadcast", event: "answer", payload: pc.localDescription });
      } catch {
        setEstado("error");
      }
    }

    pc = new RTCPeerConnection({ iceServers: iceServers() });
    pc.ontrack = (e) => {
      if (videoRef.current && e.streams[0]) {
        videoRef.current.srcObject = e.streams[0];
        setEstado("en_vivo");
        iniciarGrabacion(e.streams[0]);
        // Captura la miniatura ~2.5 s después (ya con imagen real).
        setTimeout(() => capturarPoster(), 2500);
      }
    };
    pc.onicecandidate = (e) => {
      if (e.candidate) canal.send({ type: "broadcast", event: "ice", payload: { from: "web", candidate: e.candidate } });
    };
    pc.onconnectionstatechange = () => {
      if (pc && (pc.connectionState === "failed" || pc.connectionState === "disconnected")) {
        setEstado((s) => (s === "finalizada" ? s : "error"));
        guardarGrabacion();
      }
    };

    canal.on("broadcast", { event: "offer" }, ({ payload }) => manejarOferta(payload));
    canal.on("broadcast", { event: "ice" }, ({ payload }: any) => {
      if (payload?.from === "movil" && payload.candidate && pc) {
        pc.addIceCandidate(new RTCIceCandidate(payload.candidate)).catch(() => {});
      }
    });
    canal.on("broadcast", { event: "end" }, () => { setEstado("finalizada"); guardarGrabacion(); });

    canal.subscribe((s) => {
      if (s === "SUBSCRIBED") {
        canal.send({ type: "broadcast", event: "viewer-ready", payload: {} });
      }
    });

    return () => {
      cancelado = true;
      guardarGrabacion(); // intenta guardar al cerrar el visor
      try { pc?.close(); } catch { /* ignore */ }
      try { supabase.removeChannel(canal); } catch { /* ignore */ }
    };
  }, [transmisionId]);

  const gLabel: Record<string, string> = {
    inactiva: "", grabando: "⚫ Grabando", guardando: "Guardando grabación…",
    guardada: "✔ Grabación guardada como evidencia", error: "No se pudo guardar la grabación",
  };

  return (
    <div className="visor-tx">
      <div className="visor-tx-head">
        <span className={`visor-tx-badge ${estado}`}>
          {estado === "en_vivo" ? "● EN VIVO" : estado === "conectando" ? "Conectando…" : estado === "finalizada" ? "Finalizada" : "Sin señal"}
        </span>
        {grabacion !== "inactiva" && <span className={`visor-tx-rec ${grabacion}`}>{gLabel[grabacion]}</span>}
      </div>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        controls
        style={{ width: "100%", borderRadius: 8, background: "#000", aspectRatio: "16 / 9" }}
      />
      {estado === "conectando" && <p className="dash-sub">Esperando la cámara del oficial…</p>}
      {estado === "error" && <p style={{ color: "#b00020", fontSize: 13 }}>No se pudo conectar el video (revisa el TURN/red del oficial).</p>}
      {estado === "finalizada" && <p className="dash-sub">El oficial finalizó la transmisión.</p>}
    </div>
  );
}
