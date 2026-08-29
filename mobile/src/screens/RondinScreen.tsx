import { useEffect, useRef, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useIsFocused } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { T } from "../theme";
import { getMiOficial, type MiOficial } from "../lib/oficial";
import { marcarRondin, type RondinResultado } from "../lib/rondin";
import { leerNfc, nfcDisponible } from "../lib/nfc";

type Fase = "escanear" | "confirmar" | "hecho";

// Rondín: el guardia escanea el QR del punto de control (o teclea el código) y
// registra su paso, con novedad opcional y GPS. Ver 0053_rondines.
export default function RondinScreen() {
  const [permiso, pedirPermiso] = useCameraPermissions();
  // La cámara solo se monta cuando esta pantalla está enfocada; al salir libera
  // la cámara para que no choque con react-native-webrtc (Enviar alerta) ni con
  // la bodycam. Rondín es un tab y, sin esto, retendría la cámara en segundo plano.
  const enfocado = useIsFocused();
  const [fase, setFase] = useState<Fase>("escanear");
  const [codigo, setCodigo] = useState("");
  const [novedad, setNovedad] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [mio, setMio] = useState<MiOficial | null>(null);
  const [metodo, setMetodo] = useState<"qr" | "nfc">("qr");
  const [nfcOk, setNfcOk] = useState(false);
  const [leyendoNfc, setLeyendoNfc] = useState(false);
  const [camActiva, setCamActiva] = useState(false);   // la cámara solo se prende al pulsar "Leer código QR"
  const [res, setRes] = useState<RondinResultado | null>(null);
  const yaEscaneado = useRef(false);

  useEffect(() => { getMiOficial().then(setMio); nfcDisponible().then(setNfcOk); }, []);

  function alEscanear(data: string) {
    if (yaEscaneado.current) return;
    yaEscaneado.current = true;
    setCamActiva(false);
    setMetodo("qr");
    setCodigo(data.trim());
    setFase("confirmar");
  }

  // "Leer código QR": pide permiso si hace falta y enciende la cámara en el cuadro.
  async function activarQR() {
    if (!permiso?.granted) { const r = await pedirPermiso(); if (!r.granted) { Alert.alert("Cámara", "Se necesita la cámara para leer el código QR."); return; } }
    yaEscaneado.current = false;
    setCamActiva(true);
  }

  // "Leer etiqueta NFC": apaga la cámara, valida que NFC esté disponible/activo y lee.
  async function leerEtiquetaNfc() {
    if (leyendoNfc) return;
    setCamActiva(false); // se apaga la cámara al usar NFC
    if (!(await nfcDisponible())) { Alert.alert("NFC", "La función NFC no está disponible o activada en este dispositivo. Actívala e inténtalo de nuevo."); return; }
    setLeyendoNfc(true);
    const r = await leerNfc();
    setLeyendoNfc(false);
    if (!r.ok) { if (r.error && !/cancel/i.test(r.error)) Alert.alert("NFC", r.error); return; }
    yaEscaneado.current = true;
    setMetodo("nfc");
    setCodigo((r.codigo ?? "").trim());
    setFase("confirmar");
  }

  async function registrar() {
    if (!codigo.trim()) { Alert.alert("Falta el código", "Escanea o teclea el código del punto."); return; }
    setEnviando(true);
    const r = await marcarRondin(codigo, novedad, metodo);
    setEnviando(false);
    if (!r.ok) { Alert.alert("No se registró", r.error ?? "Intenta de nuevo."); return; }
    setRes(r);
    if (r.dentro === false) {
      const permitido = (r.radio_m ?? 0) + (r.margen_m ?? 0);
      Alert.alert("⚠ Fuera de rango",
        `Estás a ${r.distancia_m ?? "?"} m del punto (permitido ${permitido} m). El paso quedó registrado como FUERA DE RANGO; acércate al punto para registrar dentro del rango.`);
    }
    setFase("hecho");
  }

  function reiniciar() {
    yaEscaneado.current = false;
    setCodigo(""); setNovedad(""); setMetodo("qr"); setRes(null); setFase("escanear");
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Text style={styles.titulo}>Rondín</Text>
      <Text style={styles.sub}>{mio?.etiqueta ? `Guardia: ${mio.etiqueta}` : "Selecciona tu elemento en Perfil para registrar como guardia."}</Text>

      {fase === "escanear" && (
        <View style={{ flex: 1, padding: 16 }}>
          <View style={styles.camaraBox}>
            {camActiva && enfocado && permiso?.granted ? (
              <CameraView
                style={{ flex: 1 }}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: ["qr", "code128", "code39", "ean13"] }}
                onBarcodeScanned={({ data }) => alEscanear(data)}
              />
            ) : (
              <View style={styles.permiso}>
                <Ionicons name={leyendoNfc ? "wifi" : "qr-code-outline"} size={48} color={T.textMute} />
                <Text style={styles.permisoTxt}>{leyendoNfc ? "Acerca la etiqueta NFC al teléfono…" : 'Toca "Leer código QR" para activar la cámara, o "Leer etiqueta NFC".'}</Text>
              </View>
            )}
          </View>
          <TouchableOpacity style={styles.accionBtn} onPress={activarQR}>
            <Ionicons name="qr-code" size={20} color={T.white} />
            <Text style={styles.accionTxt}>Leer código QR</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.accionBtnAlt} onPress={leerEtiquetaNfc} disabled={leyendoNfc}>
            {leyendoNfc ? <ActivityIndicator color={T.accent} /> : (<><Ionicons name="wifi" size={20} color={T.accent} /><Text style={styles.accionTxtAlt}>Leer etiqueta NFC</Text></>)}
          </TouchableOpacity>
        </View>
      )}

      {fase === "confirmar" && (
        <View style={{ flex: 1, padding: 16 }}>
          <View style={styles.tarjeta}>
            <Text style={styles.lbl}>Punto (código)</Text>
            <Text style={styles.codigo}>{codigo}</Text>
            <Text style={[styles.lbl, { marginTop: 12 }]}>Novedad (opcional)</Text>
            <TextInput style={[styles.input, { minHeight: 80, textAlignVertical: "top" }]} placeholder="Sin novedad, o describe lo encontrado…" placeholderTextColor={T.textMute} value={novedad} onChangeText={setNovedad} multiline />
          </View>
          <TouchableOpacity style={[styles.btnGrande, enviando && { opacity: 0.6 }]} onPress={registrar} disabled={enviando}>
            {enviando ? <ActivityIndicator color={T.white} /> : (<><Ionicons name="checkmark-circle" size={20} color={T.white} /><Text style={styles.btnGrandeTxt}>Registrar paso</Text></>)}
          </TouchableOpacity>
          <TouchableOpacity onPress={reiniciar} style={{ marginTop: 12, alignSelf: "center" }}><Text style={{ color: T.textDim }}>Cancelar / escanear otro</Text></TouchableOpacity>
        </View>
      )}

      {fase === "hecho" && (
        <View style={styles.hecho}>
          <Ionicons name={res?.dentro === false ? "warning" : "checkmark-circle"} size={72} color={res?.dentro === false ? T.danger : "#2e9e6b"} />
          <Text style={styles.hechoTxt}>Paso registrado</Text>
          {res?.punto ? <Text style={[styles.sub, { textAlign: "center" }]}>{res.punto} · {metodo === "nfc" ? "NFC" : "QR"}</Text> : <Text style={styles.sub}>{codigo}</Text>}
          {res?.distancia_m != null && (
            <Text style={{ color: res.dentro === false ? T.danger : "#2e9e6b", fontWeight: "700", fontSize: 14 }}>
              {res.dentro === false
                ? `⚠ Fuera de rango · a ${res.distancia_m} m (permitido ${(res.radio_m ?? 0) + (res.margen_m ?? 0)} m)`
                : `Dentro de rango · a ${res.distancia_m} m`}
            </Text>
          )}
          <TouchableOpacity style={styles.btnGrande} onPress={reiniciar}><Ionicons name="qr-code" size={20} color={T.white} /><Text style={styles.btnGrandeTxt}>Registrar otro</Text></TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.bg },
  titulo: { color: T.text, fontSize: 22, fontWeight: "800", paddingHorizontal: 16, paddingTop: 8 },
  sub: { color: T.textDim, fontSize: 13, paddingHorizontal: 16, marginTop: 2 },
  camaraBox: { flex: 1, borderRadius: 16, overflow: "hidden", backgroundColor: "#000", borderWidth: 1, borderColor: T.border },
  permiso: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 20 },
  permisoTxt: { color: T.textDim, textAlign: "center" },
  oManual: { color: T.textMute, textAlign: "center", marginTop: 12 },
  filaManual: { flexDirection: "row", gap: 8, marginTop: 8 },
  nfcBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 10, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: T.accentDim, backgroundColor: T.surface },
  nfcTxt: { color: T.accent, fontWeight: "700", fontSize: 15 },
  accionBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 14, paddingVertical: 15, borderRadius: 12, backgroundColor: T.accent2 },
  accionTxt: { color: T.white, fontWeight: "800", fontSize: 16 },
  accionBtnAlt: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 10, paddingVertical: 15, borderRadius: 12, borderWidth: 1, borderColor: T.accentDim, backgroundColor: T.surface },
  accionTxtAlt: { color: T.accent, fontWeight: "800", fontSize: 16 },
  input: { flex: 1, color: T.text, backgroundColor: T.surfaceAlt, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, borderWidth: 1, borderColor: T.border },
  tarjeta: { backgroundColor: T.surface, borderRadius: 14, borderWidth: 1, borderColor: T.border, padding: 16 },
  lbl: { color: T.textMute, fontSize: 12, fontWeight: "700" },
  codigo: { color: T.text, fontSize: 20, fontWeight: "800", marginTop: 4 },
  btn: { backgroundColor: T.accent2, borderRadius: 10, paddingHorizontal: 16, justifyContent: "center", alignItems: "center" },
  btnTxt: { color: T.white, fontWeight: "700" },
  btnGrande: { flexDirection: "row", gap: 8, backgroundColor: T.accent2, borderRadius: 12, paddingVertical: 14, alignItems: "center", justifyContent: "center", marginTop: 16 },
  btnGrandeTxt: { color: T.white, fontWeight: "800", fontSize: 16 },
  hecho: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, padding: 24 },
  hechoTxt: { color: T.text, fontSize: 20, fontWeight: "800" },
});
