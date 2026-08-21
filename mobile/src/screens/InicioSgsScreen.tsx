import { useCallback, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { T } from "../theme";
import { getMiOficial, type MiOficial } from "../lib/oficial";

// Inicio del guardia (SGS): saludo + accesos rápidos.
export default function InicioSgsScreen() {
  const nav = useNavigation<any>();
  const [mio, setMio] = useState<MiOficial | null>(null);
  useFocusEffect(useCallback(() => { getMiOficial().then(setMio); }, []));

  const accesos: { label: string; icon: keyof typeof Ionicons.glyphMap; to: string }[] = [
    { label: "Registrar rondín", icon: "qr-code", to: "Rondin" },
    { label: "Chat", icon: "chatbubbles", to: "Chat" },
    { label: "Nueva evidencia", icon: "camera", to: "Evidencia" },
    { label: "Mis tareas", icon: "checkbox", to: "Tareas" },
  ];

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Text style={styles.hola}>{mio?.etiqueta ? `Hola, ${mio.etiqueta}` : "Sistema de Gestión de Seguridad"}</Text>
        <Text style={styles.sub}>
          {mio?.etiqueta ? "Turno en curso · registra tus rondines" : "Selecciona tu elemento en Perfil para operar como guardia."}
        </Text>

        <View style={styles.grid}>
          {accesos.map((a) => (
            <TouchableOpacity key={a.to} style={styles.card} onPress={() => nav.navigate(a.to)}>
              <View style={styles.icoBox}><Ionicons name={a.icon} size={26} color={T.accent} /></View>
              <Text style={styles.cardTxt}>{a.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.bg },
  hola: { color: T.text, fontSize: 22, fontWeight: "800" },
  sub: { color: T.textDim, fontSize: 13.5, marginTop: 4, marginBottom: 18 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  card: { width: "47%", backgroundColor: T.surface, borderColor: T.border, borderWidth: 1, borderRadius: 16, padding: 16, gap: 10 },
  icoBox: { width: 46, height: 46, borderRadius: 12, backgroundColor: T.accentBg, alignItems: "center", justifyContent: "center" },
  cardTxt: { color: T.text, fontSize: 15, fontWeight: "700" },
});
