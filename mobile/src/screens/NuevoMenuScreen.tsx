import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { SafeAreaView } from "react-native-safe-area-context";
import { T, UI } from "../theme";

// Pantalla del botón "+" (barra inferior): elige qué registrar.
export default function NuevoMenuScreen() {
  const nav = useNavigation<any>();
  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.wrap}>
        <Text style={styles.titulo}>Nuevo registro</Text>
        <Text style={styles.sub}>¿Qué deseas iniciar?</Text>

        <TouchableOpacity style={styles.opt} onPress={() => nav.navigate("NuevoIncidente")} activeOpacity={0.8}>
          <View style={styles.optIcon}><Ionicons name="document-text" size={26} color={T.accent} /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.optTitulo}>Informe Policial</Text>
            <Text style={styles.optSub}>Informe de campo a partir de un reporte o directo</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={T.textMute} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.opt} onPress={() => nav.navigate("Accidente")} activeOpacity={0.8}>
          <View style={styles.optIcon}><Ionicons name="car-sport" size={26} color={T.accent} /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.optTitulo}>Informe Accidente</Text>
            <Text style={styles.optSub}>Parte de accidente vial: vehículos, croquis y fotos</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={T.textMute} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.opt} onPress={() => nav.navigate("Abordamiento")} activeOpacity={0.8}>
          <View style={styles.optIcon}><Ionicons name="hand-left" size={26} color={T.accent} /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.optTitulo}>Abordamiento</Text>
            <Text style={styles.optSub}>Persona/vehículo en circunstancias sospechosas</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={T.textMute} />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.bg },
  wrap: { padding: 20, paddingTop: 28 },
  titulo: { color: T.text, fontSize: 24, fontWeight: "900" },
  sub: { color: T.textDim, fontSize: 14, marginTop: 2, marginBottom: 22 },
  opt: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: UI.radius, padding: 16, marginBottom: 14 },
  optIcon: { width: 56, height: 56, borderRadius: UI.radius, backgroundColor: T.accentBg, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: T.accentDim },
  optTitulo: { color: T.text, fontSize: 17, fontWeight: "800" },
  optSub: { color: T.textMute, fontSize: 13, marginTop: 2 },
});
