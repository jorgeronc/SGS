import { useEffect, useState } from "react";
import { TouchableOpacity, Text, StyleSheet, Alert, View, Platform } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import {
  bodycamDisponible,
  bodycamGrabando,
  iniciarBodycam,
  detenerBodycam,
  pedirPermisosBodycam,
  type BodycamOrigen,
} from "../lib/bodycamHd";
import { T, UI } from "../theme";

// Botón para iniciar/detener la grabación de bodycam HD local asociada a un
// registro (Caso, Tarea, Informe, Accidente, Abordamiento, Despacho). El video
// se guarda en el teléfono y, al descargarlo en la agencia, queda como evidencia
// ligada al folio de `origen`. Se oculta si la bodycam local no está disponible
// (Expo Go / iOS): es una función del build de Android.
export default function BodycamBoton({
  origen,
  variant = "full",
  style,
}: {
  origen?: BodycamOrigen | null;
  variant?: "full" | "chip";
  style?: any;
}) {
  const [grabando, setGrabando] = useState(false);
  const nav = useNavigation<any>();

  useEffect(() => {
    setGrabando(bodycamGrabando());
    const i = setInterval(() => setGrabando(bodycamGrabando()), 1500);
    return () => clearInterval(i);
  }, []);

  if (!bodycamDisponible) return null;

  async function toggle() {
    // iOS: la grabación es en primer plano (pantalla dedicada con la cámara).
    if (Platform.OS === "ios") { nav.navigate("Bodycam", { origen: origen ?? null }); return; }
    if (grabando || bodycamGrabando()) {
      await detenerBodycam();
      setGrabando(false);
      Alert.alert(
        "Bodycam detenida",
        "Los videos quedaron en el teléfono. Descárgalos en Perfil → «Descargar bodycam» cuando estés en WiFi (en la agencia)."
      );
      return;
    }
    const ok = await pedirPermisosBodycam();
    if (!ok) { Alert.alert("Permiso", "Se requiere permiso de cámara y micrófono para la bodycam."); return; }
    const r = await iniciarBodycam(origen ?? null);
    if (!r.ok) { Alert.alert("Bodycam", r.error ?? "No se pudo iniciar."); return; }
    setGrabando(true);
    Alert.alert(
      "🔴 Bodycam activa",
      origen?.folio
        ? `Grabando en HD para ${origen.folio}. Puedes bloquear la pantalla y guardar el teléfono.`
        : "Grabando en HD en segundo plano. Puedes bloquear la pantalla y guardar el teléfono."
    );
  }

  const activo = grabando;
  const icon = activo ? "stop-circle" : "videocam";
  const label = activo ? "Detener bodycam" : "Activar bodycam";
  const color = activo ? T.danger : T.accent;

  const tint = activo ? T.dangerBg : T.accentBg;

  if (variant === "chip") {
    return (
      <TouchableOpacity
        style={[styles.chip, { borderColor: color, backgroundColor: tint }, style]}
        onPress={toggle}
        activeOpacity={0.8}
      >
        <Ionicons name={icon} size={15} color={color} />
        <Text style={[styles.chipTxt, { color }]}>{label}</Text>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity style={[styles.full, { borderColor: color, backgroundColor: tint }, style]} onPress={toggle} activeOpacity={0.85}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Ionicons name={icon} size={20} color={color} />
      <Text style={[styles.fullTxt, { color }]}>{label}</Text>
      {activo && <Text style={styles.rec}>REC</Text>}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  full: {
    flexDirection: "row", alignItems: "center", gap: 10,
    borderWidth: 1, borderRadius: UI.radiusSm,
    paddingVertical: 12, paddingHorizontal: 14,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  fullTxt: { fontSize: 15, fontWeight: "800", flex: 1 },
  rec: { color: T.danger, fontSize: 12, fontWeight: "900", letterSpacing: 1 },
  chip: {
    flexDirection: "row", alignItems: "center", gap: 5,
    borderWidth: 1, borderRadius: 20, paddingVertical: 5, paddingHorizontal: 11,
  },
  chipTxt: { fontSize: 12, fontWeight: "800" },
});
