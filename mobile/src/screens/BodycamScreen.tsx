import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, AppState, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions, useMicrophonePermissions } from "expo-camera";
import { encolarSegmentoLocal, setGrabandoIOS, type BodycamOrigen } from "../lib/bodycamHd";
import { T } from "../theme";

// Grabación de bodycam en iOS EN PRIMER PLANO (la app debe estar abierta; iOS no
// permite cámara en segundo plano para apps normales). Graba por segmentos de
// ~5 min con expo-camera y los ENCOLA en la misma cola que "Descargar bodycam"
// (Perfil) sube como evidencia. En Android se usa el módulo nativo (segundo plano).
const SEG_MAX_SEG = 300; // 5 min por segmento

function mmss(s: number) { return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; }

export default function BodycamScreen() {
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const origen: BodycamOrigen | null = route.params?.origen ?? null;

  const [permCam, pedirCam] = useCameraPermissions();
  const [permMic, pedirMic] = useMicrophonePermissions();
  const [listo, setListo] = useState(false);
  const [grabando, setGrabando] = useState(false);
  const [seg, setSeg] = useState(0);
  const [nSeg, setNSeg] = useState(0);

  const camRef = useRef<CameraView>(null);
  const activoRef = useRef(true);
  const arrancadoRef = useRef(false);
  const segInicioRef = useRef(0);

  // Permisos al montar.
  useEffect(() => {
    (async () => {
      const c = permCam?.granted ? permCam : await pedirCam();
      const m = permMic?.granted ? permMic : await pedirMic();
      if (!c?.granted || !m?.granted) {
        Alert.alert("Permiso", "Se requiere cámara y micrófono para la bodycam.", [{ text: "OK", onPress: () => nav.goBack() }]);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Contador de segundos mientras graba.
  useEffect(() => {
    if (!grabando) return;
    const i = setInterval(() => setSeg((s) => s + 1), 1000);
    return () => clearInterval(i);
  }, [grabando]);

  // Detiene al ir a segundo plano (iOS pausa la cámara) y al desmontar.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => { if (s !== "active") detener(); });
    return () => { sub.remove(); activoRef.current = false; setGrabandoIOS(false); try { camRef.current?.stopRecording(); } catch { /* */ } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Bucle de grabación por segmentos: cada clip finalizado se encola; si sigue
  // activo, arranca el siguiente.
  const grabarSegmento = useCallback(async () => {
    if (!activoRef.current || !camRef.current) return;
    try {
      segInicioRef.current = Date.now();
      const clip = await camRef.current.recordAsync({ maxDuration: SEG_MAX_SEG });
      const dur = Date.now() - segInicioRef.current;
      if (clip?.uri) { await encolarSegmentoLocal(clip.uri, dur, origen); setNSeg((n) => n + 1); }
    } catch { /* interrumpido / sin permiso */ }
    if (activoRef.current) { setSeg(0); grabarSegmento(); }
    else { setGrabando(false); setGrabandoIOS(false); }
  }, [origen]);

  function onCameraReady() {
    setListo(true);
    if (arrancadoRef.current) return;
    arrancadoRef.current = true;
    activoRef.current = true;
    setGrabando(true); setGrabandoIOS(true);
    grabarSegmento();
  }

  function detener() {
    activoRef.current = false;
    try { camRef.current?.stopRecording(); } catch { /* */ }
  }

  async function terminar() {
    detener();
    setTimeout(() => nav.goBack(), 250);
  }

  return (
    <View style={styles.root}>
      <CameraView ref={camRef} style={StyleSheet.absoluteFill} facing="back" mode="video" onCameraReady={onCameraReady} />
      <SafeAreaView style={styles.overlay} edges={["top", "bottom"]}>
        <View style={styles.top}>
          <View style={styles.rec}>
            <View style={[styles.dot, { opacity: grabando ? 1 : 0.3 }]} />
            <Text style={styles.recTxt}>{grabando ? "REC" : listo ? "Listo" : "Cámara…"} {mmss(seg)}</Text>
          </View>
          {nSeg > 0 && <Text style={styles.segTxt}>{nSeg} segmento(s) guardado(s)</Text>}
        </View>

        <Text style={styles.nota}>
          Bodycam en primer plano{origen?.folio ? ` · ${origen.folio}` : ""}. Mantén la app abierta.{"\n"}
          Los videos se descargan luego en Perfil → «Descargar bodycam».
        </Text>

        <TouchableOpacity style={styles.stop} onPress={terminar} activeOpacity={0.85}>
          <Ionicons name="stop-circle" size={24} color="#fff" />
          <Text style={styles.stopTxt}>Detener y guardar</Text>
        </TouchableOpacity>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  overlay: { flex: 1, justifyContent: "space-between", padding: 18 },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  rec: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(0,0,0,0.55)", paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999 },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: "#e23b53" },
  recTxt: { color: "#fff", fontWeight: "900", letterSpacing: 1, fontVariant: ["tabular-nums"] },
  segTxt: { color: "#fff", fontSize: 12, backgroundColor: "rgba(0,0,0,0.55)", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  nota: { color: "#fff", fontSize: 13, textAlign: "center", backgroundColor: "rgba(0,0,0,0.45)", padding: 10, borderRadius: 10, lineHeight: 19 },
  stop: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: T.danger, borderRadius: 14, paddingVertical: 16 },
  stopTxt: { color: "#fff", fontSize: 17, fontWeight: "900" },
});
