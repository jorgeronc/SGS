import { useCallback, useEffect, useState } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { SafeAreaView } from "react-native-safe-area-context";
import { cargarAlertas, getLeidas, marcarLeidas, type Alerta, type KindAlerta } from "../lib/alertas";
import { T, UI } from "../theme";

const ESTILO: Record<KindAlerta, { icon: keyof typeof Ionicons.glyphMap; fg: string; bg: string; etiqueta: string }> = {
  emergencia: { icon: "warning", fg: T.danger, bg: T.dangerBg, etiqueta: "EMERGENCIA" },
  despacho: { icon: "car", fg: T.accent, bg: T.accentBg, etiqueta: "DESPACHO" },
  orden: { icon: "shield", fg: T.warn, bg: T.warnBg, etiqueta: "ORDEN" },
};

export default function AlertasScreen() {
  const nav = useNavigation<any>();
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [leidas, setLeidas] = useState<Set<string>>(new Set());
  const [cargando, setCargando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    const [a, l] = await Promise.all([cargarAlertas(), getLeidas()]);
    setAlertas(a);
    setLeidas(l);
    setCargando(false);
  }, []);

  useEffect(() => {
    const unsub = nav.addListener("focus", cargar);
    return unsub;
  }, [nav, cargar]);

  async function abrir(a: Alerta) {
    if (!leidas.has(a.id)) {
      await marcarLeidas([a.id]);
      setLeidas((p) => new Set(p).add(a.id));
    }
    if (a.kind === "orden") nav.navigate("Expediente", { tipo: "orden", id: a.refId, titulo: a.titulo });
    else nav.navigate("Despachos");
  }

  async function marcarTodas() {
    await marcarLeidas(alertas.map((a) => a.id));
    setLeidas(new Set(alertas.map((a) => a.id)));
  }

  const noLeidas = alertas.filter((a) => !leidas.has(a.id)).length;

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <View style={styles.head}>
        <View>
          <Text style={styles.titulo}>Alertas</Text>
          <Text style={styles.sub}>{noLeidas > 0 ? `${noLeidas} sin leer` : "Todo al día"}</Text>
        </View>
        {noLeidas > 0 && (
          <TouchableOpacity style={styles.marcar} onPress={marcarTodas}>
            <Ionicons name="checkmark-done" size={16} color={T.accent} />
            <Text style={styles.marcarTxt}>Marcar leídas</Text>
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={alertas}
        keyExtractor={(a) => a.id}
        contentContainerStyle={{ padding: 16, paddingTop: 6 }}
        refreshControl={<RefreshControl refreshing={cargando} onRefresh={cargar} tintColor={T.accent} />}
        ListEmptyComponent={!cargando ? <Text style={styles.vacio}>Sin alertas prioritarias.</Text> : null}
        renderItem={({ item }) => {
          const e = ESTILO[item.kind];
          const noLeida = !leidas.has(item.id);
          return (
            <TouchableOpacity style={[styles.card, noLeida && styles.cardNoLeida]} onPress={() => abrir(item)} activeOpacity={0.75}>
              <View style={[styles.icono, { backgroundColor: e.bg }]}>
                <Ionicons name={e.icon} size={22} color={e.fg} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.filaTop}>
                  <Text style={[styles.etiqueta, { color: e.fg }]}>{e.etiqueta}</Text>
                  {noLeida && <View style={styles.punto} />}
                </View>
                <Text style={styles.cardTitulo} numberOfLines={1}>{item.titulo}</Text>
                <Text style={styles.cardSub} numberOfLines={1}>{item.sub}</Text>
                {item.fecha && <Text style={styles.fecha}>{new Date(item.fecha).toLocaleString()}</Text>}
              </View>
              <Ionicons name="chevron-forward" size={20} color={T.textMute} />
            </TouchableOpacity>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.bg },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 8 },
  titulo: { color: T.text, fontSize: 24, fontWeight: "900" },
  sub: { color: T.textDim, fontSize: 13, marginTop: 2 },
  marcar: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: T.border, borderRadius: 20, paddingVertical: 8, paddingHorizontal: 12 },
  marcarTxt: { color: T.accent, fontWeight: "700", fontSize: 13 },
  vacio: { color: T.textMute, textAlign: "center", marginTop: 40 },

  card: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: UI.radius, padding: 14, marginBottom: 10 },
  cardNoLeida: { borderColor: T.accentDim, backgroundColor: T.surfaceAlt },
  icono: { width: 46, height: 46, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  filaTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  etiqueta: { fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },
  punto: { width: 8, height: 8, borderRadius: 4, backgroundColor: T.accent },
  cardTitulo: { color: T.text, fontSize: 16, fontWeight: "700", marginTop: 2 },
  cardSub: { color: T.textDim, fontSize: 13, marginTop: 1 },
  fecha: { color: T.textMute, fontSize: 12, marginTop: 4 },
});
