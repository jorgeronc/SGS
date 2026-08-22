import { useEffect, useRef, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useIsFocused } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { T } from "../theme";
import { getMiOficial, type MiOficial } from "../lib/oficial";
import { marcarRondin } from "../lib/rondin";

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
  const yaEscaneado = useRef(false);

  useEffect(() => { getMiOficial().then(setMio); }, []);

  function alEscanear(data: string) {
    if (yaEscaneado.current) return;
    yaEscaneado.current = true;
    setCodigo(data.trim());
    setFase("confirmar");
  }

  async function registrar() {
    if (!codigo.trim()) { Alert.alert("Falta el código", "Escanea o teclea el código del punto."); return; }
    setEnviando(true);
    const r = await marcarRondin(codigo, novedad);
    setEnviando(false);
    if (!r.ok) { Alert.alert("No se registró", r.error ?? "Intenta de nuevo."); return; }
    setFase("hecho");
  }

  function reiniciar() {
    yaEscaneado.current = false;
    setCodigo(""); setNovedad(""); setFase("escanear");
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Text style={styles.titulo}>Rondín</Text>
      <Text style={styles.sub}>{mio?.etiqueta ? `Guardia: ${mio.etiqueta}` : "Selecciona tu elemento en Perfil para registrar como guardia."}</Text>

      {fase === "escanear" && (
        <View style={{ flex: 1, padding: 16 }}>
          <View style={styles.camaraBox}>
            {!permiso?.granted ? (
              <View style={styles.permiso}>
                <Ionicons name="qr-code-outline" size={48} color={T.textMute} />
                <Text style={styles.permisoTxt}>Se necesita la cámara para escanear el punto de control.</Text>
                <TouchableOpacity style={styles.btn} onPress={pedirPermiso}><Text style={styles.btnTxt}>Permitir cámara</Text></TouchableOpacity>
              </View>
            ) : enfocado ? (
              <CameraView
                style={{ flex: 1 }}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: ["qr", "code128", "code39", "ean13"] }}
                onBarcodeScanned={({ data }) => alEscanear(data)}
              />
            ) : (
              <View style={styles.permiso}>
                <Ionicons name="pause-circle-outline" size={48} color={T.textMute} />
                <Text style={styles.permisoTxt}>Cámara en pausa</Text>
              </View>
            )}
          </View>
          <Text style={styles.oManual}>o teclea el código:</Text>
          <View style={styles.filaManual}>
            <TextInput style={styles.input} placeholder="Código del punto" placeholderTextColor={T.textMute} value={codigo} onChangeText={setCodigo} autoCapitalize="characters" />
            <TouchableOpacity style={styles.btn} onPress={() => { if (codigo.trim()) setFase("confirmar"); }}><Text style={styles.btnTxt}>Usar</Text></TouchableOpacity>
          </View>
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
          <Ionicons name="checkmark-circle" size={72} color="#2e9e6b" />
          <Text style={styles.hechoTxt}>Paso registrado</Text>
          <Text style={styles.sub}>{codigo}</Text>
          <TouchableOpacity style={styles.btnGrande} onPress={reiniciar}><Ionicons name="qr-code" size={20} color={T.white} /><Text style={styles.btnGrandeTxt}>Escanear otro</Text></TouchableOpacity>
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
