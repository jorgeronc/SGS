// Servidores ICE para el visor de video en vivo (WebRTC). STUN público de
// Google + TURN (Metered) desde variables de entorno. Mismo TURN que el móvil.
export function iceServers(): RTCIceServer[] {
  const url = process.env.NEXT_PUBLIC_TURN_URL ?? "";
  const user = process.env.NEXT_PUBLIC_TURN_USERNAME ?? "";
  const cred = process.env.NEXT_PUBLIC_TURN_CREDENTIAL ?? "";
  const s: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];
  if (url) {
    const urls = url.split(",").map((u) => u.trim()).filter(Boolean);
    s.push({ urls, username: user, credential: cred });
  }
  return s;
}
