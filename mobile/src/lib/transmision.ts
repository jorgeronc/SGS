import {
  mediaDevices,
  RTCPeerConnection,
  RTCIceCandidate,
  RTCSessionDescription,
} from "react-native-webrtc";
import { supabase } from "./supabase";

// Servidores ICE: STUN público de Google + TURN (Metered) desde variables de
// entorno. Sin TURN el video no cruza la mayoría de redes celulares.
const TURN_URL = process.env.EXPO_PUBLIC_TURN_URL ?? "";
const TURN_USER = process.env.EXPO_PUBLIC_TURN_USERNAME ?? "";
const TURN_CRED = process.env.EXPO_PUBLIC_TURN_CREDENTIAL ?? "";

function iceServers(): any[] {
  const s: any[] = [{ urls: "stun:stun.l.google.com:19302" }];
  if (TURN_URL) {
    // Admite una o varias URLs separadas por coma.
    const urls = TURN_URL.split(",").map((u) => u.trim()).filter(Boolean);
    s.push({ urls, username: TURN_USER, credential: TURN_CRED });
  }
  return s;
}

// Corte automático de seguridad (batería/datos): 5 minutos.
const LIMITE_MS = 5 * 60 * 1000;

export interface Transmision {
  id: string;
  stream: any;      // MediaStream local, para el preview (RTCView)
  stop: (motivo?: string) => Promise<void>;
}

interface Opts {
  despachoId?: string | null;
  llamadaId?: string | null;
  personalId?: string | null;
  patrullaId?: string | null;
  bodycamId?: string | null;
  bodycamFolio?: string | null;
}

// Inicia la transmisión en vivo: cámara + WebRTC + señalización por Realtime.
// El teléfono es la FUENTE de video; el visor web es quien recibe.
export async function iniciarTransmision(opts: Opts): Promise<Transmision | null> {
  // 1) Cámara trasera + micrófono.
  let stream: any;
  try {
    stream = await mediaDevices.getUserMedia({
      audio: true,
      video: { facingMode: "environment", frameRate: 24, width: 1280, height: 720 } as any,
    });
  } catch {
    return null; // sin permiso/cámara: la alerta con ubicación ya salió aparte.
  }

  // 2) Registra la sesión.
  const { data, error } = await supabase
    .from("transmisiones")
    .insert({
      despacho_id: opts.despachoId ?? null,
      llamada_id: opts.llamadaId ?? null,
      personal_id: opts.personalId ?? null,
      patrulla_id: opts.patrullaId ?? null,
      bodycam_id: opts.bodycamId ?? null,
      bodycam_folio: opts.bodycamFolio ?? null,
      estado: "en_vivo",
    })
    .select("id")
    .single();
  if (error || !data) {
    stream.getTracks().forEach((t: any) => t.stop());
    return null;
  }
  const id = (data as any).id as string;

  // 3) Conexión y canal de señalización (uno por transmisión).
  const pc = new RTCPeerConnection({ iceServers: iceServers() });
  stream.getTracks().forEach((t: any) => pc.addTrack(t, stream));

  const canal = supabase.channel(`tx:${id}`, { config: { broadcast: { self: false } } });

  (pc as any).addEventListener("icecandidate", (e: any) => {
    if (e.candidate) {
      canal.send({ type: "broadcast", event: "ice", payload: { from: "movil", candidate: e.candidate } });
    }
  });

  async function crearOferta() {
    try {
      const offer = await pc.createOffer({});
      await pc.setLocalDescription(offer);
      canal.send({ type: "broadcast", event: "offer", payload: (pc as any).localDescription });
    } catch {
      /* el visor puede reintentar con viewer-ready */
    }
  }

  // El visor web avisa cuando está listo → el móvil crea/renueva la oferta.
  canal.on("broadcast", { event: "viewer-ready" }, () => { crearOferta(); });
  canal.on("broadcast", { event: "answer" }, ({ payload }: any) => {
    pc.setRemoteDescription(new RTCSessionDescription(payload)).catch(() => {});
  });
  canal.on("broadcast", { event: "ice" }, ({ payload }: any) => {
    if (payload?.from === "web" && payload.candidate) {
      pc.addIceCandidate(new RTCIceCandidate(payload.candidate)).catch(() => {});
    }
  });

  let cerrado = false;
  let timer: any;
  async function stop(motivo = "manual") {
    if (cerrado) return;
    cerrado = true;
    clearTimeout(timer);
    try { canal.send({ type: "broadcast", event: "end", payload: {} }); } catch { /* ignore */ }
    try { pc.close(); } catch { /* ignore */ }
    try { stream.getTracks().forEach((t: any) => t.stop()); } catch { /* ignore */ }
    try { supabase.removeChannel(canal); } catch { /* ignore */ }
    await supabase
      .from("transmisiones")
      .update({ estado: "finalizada", motivo_fin: motivo, finalizado_en: new Date().toISOString() })
      .eq("id", id);
  }

  await canal.subscribe((estado) => {
    if (estado === "SUBSCRIBED") {
      // Avisa que la fuente está lista (por si el visor ya estaba esperando).
      canal.send({ type: "broadcast", event: "movil-ready", payload: { id } });
    }
  });

  timer = setTimeout(() => stop("limite_5min"), LIMITE_MS);

  return { id, stream, stop };
}
