import { useCallback, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, FlatList, RefreshControl, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";
import { getMiOficialValido } from "../lib/oficial";
import { T, UI } from "../theme";

interface Inc {
  id: string;
  folio: string | null;
  tipo: string | null;
  delito: string | null;
  estado: string | null;
  direccion: string | null;
  creado_en: string;
}

// Color e ícono por estado del incidente.
function estadoInfo(e: string | null): { label: string; color: string } {
  switch (e) {
    case "abierto": return { label: "Abierto", color: "#0a7c2f" };
    case "en_proceso": return { label: "En proceso", color: "#b06a00" };
    default: return { label: e ?? "—", color: T.textMute };
  }
}

// Mis incidentes: los que generé (soy el elemento) y que aún NO están cerrados.
export default function MisIncidentesScreen() {
  const nav = useNavigation<any>();
  const [items, setItems] = useState<Inc[]>([]);
  const [cargando, setCargando] = useState(false);
  const [sinOficial, setSinOficial] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    const oficial = await getMiOficialValido();
    setSinOficial(!oficial);
    if (!oficial) { setItems([]); setCargando(false); return; }
    const { data } = await supabase
      .from("incidentes")
      .select("id, folio, tipo, delito, estado, direccion, creado_en")
      .eq("oficial_personal_id", oficial.personalId)
      .eq("estatus", "activo")
      .neq("estado", "cerrado")
      .order("creado_en", { ascending: false })
      .limit(200);
    setItems(((data as any[]) ?? []) as Inc[]);
    setCargando(false);
  }, []);

  useFocusEffect(useCallback(() => { cargar(); }, [cargar]));

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ padding: 16 }}
        refreshControl={<RefreshControl refreshing={cargando} onRefresh={cargar} tintColor={T.accent} />}
        ListHeaderComponent={
          <Text style={styles.seccion}>
            {sinOficial ? "Sin elemento asignado" : `Abiertos y en proceso (${items.length})`}
          </Text>
        }
        ListEmptyComponent={
          !cargando ? (
            <Text style={styles.dim}>
              {sinOficial
                ? "Selecciona tu elemento en Perfil para ver tus incidentes."
                : "No tienes incidentes abiertos."}
            </Text>
          ) : <ActivityIndicator color={T.accent} style={{ marginTop: 24 }} />
        }
        renderItem={({ item }) => {
          const est = estadoInfo(item.estado);
          return (
            <TouchableOpacity
              style={styles.card}
              activeOpacity={0.7}
              onPress={() => nav.navigate("Informe", { incidenteId: item.id })}
            >
              <View style={[styles.icon, { backgroundColor: T.accentBg }]}>
                <Ionicons name="document-text" size={18} color={T.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.titulo} numberOfLines={1}>
                  {item.folio ?? "s/folio"} · {item.delito ?? item.tipo ?? "incidente"}
                </Text>
                <Text style={styles.dim} numberOfLines={1}>{item.direccion ?? "Sin dirección"}</Text>
                <Text style={styles.fecha}>{new Date(item.creado_en).toLocaleString()}</Text>
              </View>
              <View style={{ alignItems: "flex-end", gap: 6 }}>
                <View style={[styles.badge, { borderColor: est.color }]}>
                  <Text style={[styles.badgeTxt, { color: est.color }]}>{est.label}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={T.textMute} />
              </View>
            </TouchableOpacity>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.bg },
  seccion: { color: T.textDim, fontSize: 13, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 },
  dim: { color: T.textMute, fontSize: 13 },
  card: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: UI.radiusSm, padding: 12, marginBottom: 10 },
  icon: { width: 40, height: 40, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  titulo: { color: T.text, fontSize: 15, fontWeight: "700" },
  fecha: { color: T.textMute, fontSize: 11, marginTop: 2 },
  badge: { borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  badgeTxt: { fontSize: 11, fontWeight: "800" },
});
