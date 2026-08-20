import { useCallback, useState } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { T } from "../theme";
import type { RootStackParamList } from "../types";
import { listarCanales, noLeidosPorCanal, type CanalMovil } from "../lib/chat";

// Lista de canales del oficial. La gestión (crear/integrar/cerrar) vive en la web;
// aquí solo participa. Al tocar un canal se abre la conversación.
export default function ChatScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [canales, setCanales] = useState<CanalMovil[]>([]);
  const [noLeidos, setNoLeidos] = useState<Record<string, number>>({});
  const [cargando, setCargando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    const [cs, nl] = await Promise.all([listarCanales(), noLeidosPorCanal()]);
    setCanales(cs);
    setNoLeidos(nl);
    setCargando(false);
  }, []);

  useFocusEffect(useCallback(() => { cargar(); }, [cargar]));

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Text style={styles.titulo}>Comunicación</Text>
      <FlatList
        data={canales}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{ padding: 12, paddingBottom: 30 }}
        refreshControl={<RefreshControl refreshing={cargando} onRefresh={cargar} tintColor={T.accent} />}
        ListEmptyComponent={
          !cargando ? <Text style={styles.vacio}>No perteneces a ningún canal. El central te integra desde la web.</Text> : null
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.fila}
            onPress={() => nav.navigate("ChatCanal", { canalId: item.id, nombre: item.nombre })}
          >
            <View style={styles.icono}><Ionicons name="chatbubbles" size={20} color={T.accent} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.nombre}>
                {item.nombre}
                {!!item.tema && <Text style={styles.tema}>{"  "}{item.tema}</Text>}
              </Text>
            </View>
            {(noLeidos[item.id] ?? 0) > 0 && (
              <View style={styles.badge}><Text style={styles.badgeTxt}>{noLeidos[item.id]}</Text></View>
            )}
            <Ionicons name="chevron-forward" size={18} color={T.textMute} />
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.bg },
  titulo: { color: T.text, fontSize: 22, fontWeight: "800", paddingHorizontal: 16, paddingTop: 8 },
  vacio: { color: T.textMute, textAlign: "center", marginTop: 40, paddingHorizontal: 24, lineHeight: 20 },
  fila: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: T.surface, borderColor: T.border, borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 10 },
  icono: { width: 40, height: 40, borderRadius: 20, backgroundColor: T.accentBg, alignItems: "center", justifyContent: "center" },
  nombre: { color: T.text, fontSize: 15, fontWeight: "700" },
  tema: { color: T.textDim, fontSize: 13, fontWeight: "400" },
  badge: { backgroundColor: T.danger, borderRadius: 999, minWidth: 22, paddingHorizontal: 6, paddingVertical: 1, alignItems: "center", justifyContent: "center", marginRight: 4 },
  badgeTxt: { color: T.white, fontSize: 12, fontWeight: "800" },
});
