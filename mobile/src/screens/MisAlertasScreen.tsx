import { useCallback, useEffect, useState } from "react";
import { View, Text, FlatList, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { SafeAreaView } from "react-native-safe-area-context";
import { listarAlertasEnviadas, type AlertaEnviada } from "../lib/misAlertas";
import { T, UI } from "../theme";

export default function MisAlertasScreen() {
  const nav = useNavigation<any>();
  const [lista, setLista] = useState<AlertaEnviada[]>([]);

  const cargar = useCallback(async () => setLista(await listarAlertasEnviadas()), []);
  useEffect(() => {
    const unsub = nav.addListener("focus", cargar);
    cargar();
    return unsub;
  }, [nav, cargar]);

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <FlatList
        data={lista}
        keyExtractor={(a) => a.id}
        contentContainerStyle={{ padding: 16 }}
        ListEmptyComponent={<Text style={styles.vacio}>No has enviado alertas desde este dispositivo.</Text>}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.iconWrap}>
              <Ionicons name={item.tipo === "emergencia" ? "warning" : "alert-circle"} size={22} color={T.danger} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.titulo} numberOfLines={2}>{item.titulo}</Text>
              <Text style={styles.detalle} numberOfLines={2}>{item.detalle}</Text>
              <Text style={styles.fecha}>{new Date(item.fecha).toLocaleString()}</Text>
            </View>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.bg },
  vacio: { color: T.textMute, textAlign: "center", marginTop: 40 },
  card: { flexDirection: "row", gap: 12, alignItems: "center", backgroundColor: T.surface, borderRadius: UI.radius, borderWidth: 1, borderColor: T.border, padding: 14, marginBottom: 10 },
  iconWrap: { width: 40, height: 40, borderRadius: 20, backgroundColor: T.dangerBg, alignItems: "center", justifyContent: "center" },
  titulo: { color: T.text, fontSize: 15, fontWeight: "800" },
  detalle: { color: T.textDim, fontSize: 13, marginTop: 2 },
  fecha: { color: T.textMute, fontSize: 12, marginTop: 4 },
});
