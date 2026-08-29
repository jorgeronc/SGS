import { useCallback, useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, FlatList, ActivityIndicator, RefreshControl } from "react-native";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";
import { getMiOficialValido } from "../lib/oficial";
import { getRolActual, esMando } from "../lib/rol";
import { T, UI } from "../theme";

const DESP: Record<string, { t: string; c: string }> = {
  recibida: { t: "Recibida", c: "#b8860b" },
  despachada: { t: "Despachado", c: "#1e73be" },
  en_atencion: { t: "En atención", c: "#8a4b12" },
  resuelta: { t: "Resuelta", c: "#0a7c2f" },
};

// Incidentes: el guardia ve los que reportó; el supervisor puede ver también los
// de sus guardias (por los sitios de sus turnos). Se siguen hasta que se cierran.
export default function MisIncidentesScreen() {
  const nav = useNavigation<any>();
  const [mando, setMando] = useState(false);
  const [modo, setModo] = useState<"mios" | "guardias">("mios");
  const [items, setItems] = useState<any[]>([]);
  const [cargando, setCargando] = useState(true);
  const [personalId, setPersonalId] = useState<string | null>(null);

  useEffect(() => {
    getRolActual().then((r) => setMando(esMando(r)));
    getMiOficialValido().then((g) => setPersonalId(g?.personalId ?? null));
  }, []);

  const cargar = useCallback(async () => {
    setCargando(true);
    const g = await getMiOficialValido();
    const pid = g?.personalId ?? null;
    setPersonalId(pid);
    const sel = "id, folio, tipo, prioridad, estado_despacho, estatus, direccion, fecha_recepcion, sitio:sitios(nombre)";
    // Ventana por rol: guardia últimos 3 días; supervisor/superior últimos 30 días.
    const rol = await getRolActual();
    const dias = esMando(rol) ? 30 : 3;
    const desde = new Date(Date.now() - dias * 86400000).toISOString();
    let filas: any[] = [];
    if (modo === "guardias") {
      // Sitios de los turnos donde soy supervisor → incidencias de esos sitios.
      const { data: ts } = await supabase.from("turnos").select("id").eq("supervisor_id", pid ?? "");
      const turnoIds = ((ts as any[]) ?? []).map((t) => t.id);
      let sitioIds: string[] = [];
      if (turnoIds.length) {
        const { data: tg } = await supabase.from("turno_guardias").select("sitio_id").in("turno_id", turnoIds);
        sitioIds = Array.from(new Set(((tg as any[]) ?? []).map((x) => x.sitio_id).filter(Boolean)));
      }
      if (sitioIds.length) {
        const { data } = await supabase.from("llamadas_cad").select(sel)
          .in("sitio_id", sitioIds).gte("fecha_recepcion", desde).order("fecha_recepcion", { ascending: false }).limit(100);
        filas = (data as any[]) ?? [];
      }
    } else if (pid) {
      const { data } = await supabase.from("llamadas_cad").select(sel)
        .eq("datos_adicionales->>personal_id", pid).gte("fecha_recepcion", desde).order("fecha_recepcion", { ascending: false }).limit(100);
      filas = (data as any[]) ?? [];
    }
    setItems(filas);
    setCargando(false);
  }, [modo]);

  useFocusEffect(useCallback(() => { cargar(); }, [cargar]));

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      {mando && (
        <View style={styles.tabs}>
          <TouchableOpacity style={[styles.tab, modo === "mios" && styles.tabOn]} onPress={() => setModo("mios")}>
            <Text style={[styles.tabTxt, modo === "mios" && styles.tabTxtOn]}>Míos</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.tab, modo === "guardias" && styles.tabOn]} onPress={() => setModo("guardias")}>
            <Text style={[styles.tabTxt, modo === "guardias" && styles.tabTxtOn]}>De mis guardias</Text>
          </TouchableOpacity>
        </View>
      )}
      {cargando ? (
        <View style={styles.center}><ActivityIndicator color={T.accent} /></View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(x) => x.id}
          contentContainerStyle={{ padding: 12 }}
          refreshControl={<RefreshControl refreshing={false} onRefresh={cargar} tintColor={T.accent} />}
          ListEmptyComponent={<Text style={styles.vacio}>{modo === "guardias" ? "Sin incidentes de tus guardias." : "Aún no has levantado incidentes."}</Text>}
          renderItem={({ item }) => {
            const d = DESP[item.estado_despacho] ?? { t: item.estado_despacho, c: T.textMute };
            const cerrado = item.estatus !== "activo" || item.estado_despacho === "resuelta";
            return (
              <TouchableOpacity style={styles.card} onPress={() => nav.navigate("IncidenteDetalle", { id: item.id })}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.tipo}>{item.tipo ?? "Incidencia"}</Text>
                  <Text style={styles.meta}>{item.folio ?? "s/folio"}{item.sitio?.nombre ? ` · ${item.sitio.nombre}` : ""}</Text>
                  <Text style={styles.meta}>{item.fecha_recepcion ? new Date(item.fecha_recepcion).toLocaleString() : ""}</Text>
                </View>
                <View style={[styles.badge, { backgroundColor: cerrado ? "#5A6470" : d.c }]}>
                  <Text style={styles.badgeTxt}>{cerrado ? "Cerrado" : d.t}</Text>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  vacio: { color: T.textMute, textAlign: "center", marginTop: 40 },
  tabs: { flexDirection: "row", gap: 8, padding: 12, paddingBottom: 0 },
  tab: { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: UI.radiusSm, backgroundColor: T.surface, borderWidth: 1, borderColor: T.border },
  tabOn: { backgroundColor: T.accent, borderColor: T.accent },
  tabTxt: { color: T.textDim, fontWeight: "700" },
  tabTxtOn: { color: T.white },
  card: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: UI.radiusSm, padding: 14, marginBottom: 10 },
  tipo: { color: T.text, fontWeight: "800", fontSize: 15 },
  meta: { color: T.textMute, fontSize: 12.5, marginTop: 2 },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  badgeTxt: { color: T.white, fontWeight: "800", fontSize: 11 },
});
