import { Platform } from "react-native";

// Lectura de etiquetas NFC (NDEF). La etiqueta guarda el mismo `codigo` que el
// QR del punto de control, así que el registro del rondín es idéntico.
// Solo funciona en build de EAS (no Expo Go) y en dispositivos con NFC.
let Nfc: any = null;
let NfcTechRef: any = null;
let NdefRef: any = null;
try {
  const mod = require("react-native-nfc-manager");
  Nfc = mod.default;
  NfcTechRef = mod.NfcTech;
  NdefRef = mod.Ndef;
} catch {
  Nfc = null;
}

let iniciado = false;
async function asegurarInit(): Promise<boolean> {
  if (!Nfc) return false;
  if (iniciado) return true;
  try { await Nfc.start(); iniciado = true; return true; } catch { return false; }
}

export async function nfcDisponible(): Promise<boolean> {
  if (!Nfc || Platform.OS === "web") return false;
  try { const ok = await asegurarInit(); return ok && (await Nfc.isSupported()); } catch { return false; }
}

// Lee una etiqueta y devuelve el código (texto/URI NDEF; si no, el UID del tag).
export async function leerNfc(): Promise<{ ok: boolean; codigo?: string; error?: string }> {
  if (!Nfc) return { ok: false, error: "NFC no disponible en esta app." };
  try {
    await asegurarInit();
    await Nfc.requestTechnology(NfcTechRef.Ndef);
    const tag = await Nfc.getTag();
    let codigo = "";
    const rec = tag?.ndefMessage?.[0];
    if (rec?.payload) {
      try { codigo = NdefRef.text.decodePayload(rec.payload); } catch { /* no es texto */ }
      if (!codigo) { try { codigo = NdefRef.uri.decodePayload(rec.payload); } catch { /* no es uri */ } }
    }
    if (!codigo && tag?.id) codigo = String(tag.id); // respaldo: UID del tag
    codigo = (codigo || "").trim();
    return codigo ? { ok: true, codigo } : { ok: false, error: "La etiqueta no tiene un código legible." };
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    if (/cancell?ed/i.test(msg)) return { ok: false, error: "Lectura cancelada." };
    return { ok: false, error: msg };
  } finally {
    try { await Nfc.cancelTechnologyRequest(); } catch { /* ignore */ }
  }
}
