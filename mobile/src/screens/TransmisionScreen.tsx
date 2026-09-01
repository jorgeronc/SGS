import { useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, BackHandler } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { RTCView } from "react-native-webrtc";
import { useNavigation, useRoute } from "@react-navigation/native";
import { iniciarTransmision, type Transmision } from "../lib/transmision";
import { setTransmisionActiva } from "../lib/ubicacionVivo";
import { T, UI } from "../theme";

const LIMITE_SEG = 5 * 60;

function mmss(s: number): string {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

// Pantalla de transmisión en vivo (bodycam). Se abre al Enviar Alerta: muestra
// la cámara del oficial, un contador de 5 min y el botón para detener.
export default function TransmisionScreen() {
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const p = route.params ?? {};

  const [tx, setTx] = useState<Transmision | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [restante, setRestante] = useState(LIMITE_SEG);
  const txRef = useRef<Transmision | null>(null);

  useEffect(() => {
    let vivo = true;
    // Fuerza el foreground-service mientras dura la transmisión, para que la
    // cámara no se congele al bloquear la pantalla.
    setTransmisionActiva(true);
    (async () => {
      const t = await iniciarTransmision({
        despachoId: p.despachoId ?? null,
        llamadaId: p.llamadaId ?? null,
        personalId: p.personalId ?? null,
        patrullaId: p.patrullaId ?? null,
        bodycamId: p.bodycamId ?? null,
        bodycamFolio: p.bodycamFolio ?? null,
      });
      if (!vivo) { t?.stop("cancelada"); return; }
      if (!t) { setError("No se pudo iniciar la cámara. Revisa los permisos."); setCargando(false); return; }
      txRef.current = t;
      setTx(t);
      setCargando(false);
    })();
    return () => { vivo = false; txRef.current?.stop("salida"); setTransmisionActiva(false); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cuenta regresiva de 5 min (el corte real lo hace el motor de transmisión).
  useEffect(() => {
    if (!tx) return;
    const iv = setInterval(() => {
      setRestante((r) => {
        if (r <= 1) { clearInterval(iv); return 0; }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(iv);
  }, [tx]);

  // El botón atrás del teléfono no debe cerrar sin confirmar.
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => { confirmarDetener(); return true; });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function detener(motivo = "manual") {
    await txRef.current?.stop(motivo);
    txRef.current = null;
    nav.goBack();
  }

  function confirmarDetener() {
    Alert.alert("Detener transmisión", "¿Finalizar la transmisión en vivo?", [
      { text: "Seguir transmitiendo", style: "cancel" },
      { text: "Detener", style: "destructive", onPress: () => detener("manual") },
    ]);
  }

  return (
    <View style={styles.root}>
      {tx?.stream ? (
        <RTCView streamURL={tx.stream.toURL()} style={styles.video} objectFit="cover" mirror={false} />
      ) : (
        <View style={[styles.video, styles.center]}>
          {error ? (
            <Text style={styles.err}>{error}</Text>
          ) : (
            <>
              <ActivityIndicator size="large" color={T.accent} />
              <Text style={styles.loading}>Iniciando cámara…</Text>
            </>
          )}
        </View>
      )}

      <SafeAreaView style={styles.overlay} pointerEvents="box-none">
        <View style={styles.topbar}>
          <View style={styles.liveTag}>
            <View style={styles.liveDot} />
            <Text style={styles.liveTxt}>EN VIVO</Text>
          </View>
          <View style={styles.timer}>
            <Ionicons name="time-outline" size={14} color={T.text} />
            <Text style={styles.timerTxt}>{mmss(restante)}</Text>
          </View>
        </View>

        <View style={{ flex: 1 }} pointerEvents="none">
          {!error && (
            <Text style={styles.hint}>
              El despacho está recibiendo tu cámara. Corte automático en {mmss(restante)}.
            </Text>
          )}
        </View>

        <View style={styles.bottom}>
          {error ? (
            <TouchableOpacity style={[styles.stop, { backgroundColor: T.surfaceAlt }]} onPress={() => nav.goBack()}>
              <Text style={styles.stopTxt}>Cerrar</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.stop} onPress={confirmarDetener} disabled={cargando} activeOpacity={0.85}>
              <Ionicons name="stop" size={22} color={T.white} />
              <Text style={styles.stopTxt}>DETENER TRANSMISIÓN</Text>
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  video: { ...StyleSheet.absoluteFillObject, backgroundColor: "#000" },
  center: { alignItems: "center", justifyContent: "center", gap: 12 },
  loading: { color: T.textDim, fontSize: 14 },
  err: { color: T.danger, fontSize: 15, textAlign: "center", paddingHorizontal: 32, fontWeight: "600" },

  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: "space-between" },
  topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16 },
  liveTag: { flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: T.danger, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  liveDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: "#fff" },
  liveTxt: { color: "#fff", fontWeight: "900", fontSize: 12, letterSpacing: 1 },
  timer: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(0,0,0,0.55)", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  timerTxt: { color: T.text, fontWeight: "800", fontSize: 13, fontVariant: ["tabular-nums"] },

  hint: { color: "rgba(255,255,255,0.85)", fontSize: 12.5, textAlign: "center", marginTop: 12, marginHorizontal: 24 },

  bottom: { padding: 20, paddingBottom: 28 },
  stop: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: T.danger, borderRadius: UI.radius, height: 58, shadowColor: T.danger, shadowOpacity: 0.6, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  stopTxt: { color: "#fff", fontWeight: "900", fontSize: 15, letterSpacing: 0.5 },
});
