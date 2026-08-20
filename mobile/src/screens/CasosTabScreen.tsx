import { useCallback, useEffect, useState } from "react";
import { View, Text, FlatList, StyleSheet, RefreshControl, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";
import { T, UI } from "../theme";

interface Fila {
  id: string;
  folio: string | null;
  tipo: string | null;
  delito: string | null;
  estado: string | null;
  fecha_incidente: string | null;
}

// Pestaña "Casos": tareas y seguimiento. Muestra los incidentes recientes
// (los informes de campo del elemento). Sólo lectura por ahora.
export default function CasosTabScreen() {
  const nav = useNavigation<any>();
  const [filas, setFilas] = useState<Fila[]>([]);
  const [cargando, setCargando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    const { data } = await supabase
      .from("incidentes")
      .select("id, folio, tipo, delito, estado, fecha_incidente")
      .eq("estatus", "activo")
      .order("creado_en", { ascending: false })
      .limit(50);
    setFilas((data as any[]) ?? []);
    setCargando(false);
  }, []);

  useEffect(() => {
    const unsub = nav.addListener("focus", cargar);
    return unsub;
  }, [nav, cargar]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.head}><Text style={styles.titulo}>Casos y seguimiento</Text></View>
      <FlatList
        data={filas}
        keyExtractor={(f) => f.id}
        contentContainerStyle={{ padding: 16, paddingTop: 6 }}
        refreshControl={<RefreshControl refreshing={cargando} onRefresh={cargar} tintColor={T.accent} />}
        ListEmptyComponent={!cargando ? <Text style={styles.vacio}>Sin incidentes registrados.</Text> : null}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} onPress={() => nav.navigate("Informe", { incidenteId: item.id })}>
            <View style={styles.top}>
              <Text style={styles.folio}>{item.folio ?? "s/folio"}</Text>
              <View style={styles.estado}><Text style={styles.estadoTxt}>{item.estado ?? "—"}</Text></View>
            </View>
            <Text style={styles.tit}>{item.delito ?? item.tipo ?? "Incidente"}</Text>
            <View style={styles.fecha}>
              <Ionicons name="calendar-outline" size={13} color={T.textMute} />
              <Text style={styles.fechaTxt}>
                {item.fecha_incidente ? new Date(item.fecha_incidente).toLocaleString() : "sin fecha"}
              </Text>
              <Text style={styles.abrir}>Abrir ›</Text>
            </View>
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.bg },
  head: { paddingHorizontal: 16, paddingTop: 8 },
  titulo: { color: T.text, fontSize: 24, fontWeight: "900" },
  vacio: { color: T.textMute, textAlign: "center", marginTop: 40 },
  card: { backgroundColor: T.surface, borderRadius: UI.radius, borderWidth: 1, borderColor: T.border, borderLeftWidth: 4, borderLeftColor: T.accent, padding: 14, marginBottom: 12 },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  folio: { color: T.accent, fontWeight: "800", fontSize: 15 },
  estado: { backgroundColor: T.surfaceHi, borderRadius: 20, paddingVertical: 3, paddingHorizontal: 10 },
  estadoTxt: { color: T.textDim, fontSize: 11, fontWeight: "700", textTransform: "uppercase" },
  tit: { color: T.text, fontSize: 17, fontWeight: "700", marginTop: 6 },
  fecha: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 6 },
  fechaTxt: { color: T.textMute, fontSize: 12, flex: 1 },
  abrir: { color: T.accent, fontSize: 12, fontWeight: "700" },
});
