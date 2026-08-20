import { useCallback, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, FlatList, RefreshControl, ActivityIndicator, Image, Alert, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";
import { urlFoto, primeraFoto } from "../lib/fotos";
import { getMiOficialValido } from "../lib/oficial";
import BodycamBoton from "../components/BodycamBoton";
import { T, UI } from "../theme";

interface Asignacion {
  id: string;
  respuesta: string;
  respondido_en: string | null;
  tarea: {
    id: string;
    folio: string | null;
    tipo: string | null;
    motivo: string | null;
    asunto: string | null;
    instrucciones: string | null;
    direccion: string | null;
    latitud: number | null;
    longitud: number | null;
    vigencia_hasta: string | null;
    prioridad: string | null;
    fotografias: unknown;
  } | null;
}

const RESPUESTAS: { k: string; label: string; color: string; icon: any }[] = [
  { k: "enterado", label: "Enterado", color: T.accent, icon: "checkmark-circle-outline" },
  { k: "atendiendo", label: "Atendiendo", color: T.warn, icon: "walk-outline" },
  { k: "completada", label: "Completada", color: T.ok, icon: "flag-outline" },
];

// Color de la franja de prioridad (izquierda de la tarjeta).
function colorPrioridad(p: string | null): string {
  if (p === "alta") return T.danger;
  if (p === "baja") return T.accent;
  return T.warn; // media / por defecto
}

function vence(t: Asignacion["tarea"]): { txt: string; vencida: boolean } {
  if (!t?.vigencia_hasta) return { txt: "Sin vencimiento", vencida: false };
  const f = new Date(t.vigencia_hasta);
  const vencida = f < new Date();
  return { txt: `${vencida ? "Venció" : "Vence"} ${f.toLocaleString()}`, vencida };
}

// Tareas asignadas a mi elemento: vigentes y las que expiraron hace menos de
// 24 h (la vista tareas_vigentes ya aplica ese corte).
export default function TareasScreen() {
  const [items, setItems] = useState<Asignacion[]>([]);
  const [cargando, setCargando] = useState(false);
  const [sinOficial, setSinOficial] = useState(false);
  const [guardando, setGuardando] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    const oficial = await getMiOficialValido();
    setSinOficial(!oficial);
    if (!oficial) { setItems([]); setCargando(false); return; }

    // El join contra tareas_vigentes deja fuera las que expiraron hace más de 24 h.
    const { data } = await supabase
      .from("tarea_asignaciones")
      .select("id, respuesta, respondido_en, tarea:tareas_vigentes!inner(id, folio, tipo, motivo, asunto, instrucciones, direccion, latitud, longitud, vigencia_hasta, prioridad, fotografias)")
      .eq("personal_id", oficial.personalId)
      .eq("estatus", "activo")
      .order("creado_en", { ascending: false })
      .limit(100);
    setItems(((data as any[]) ?? []) as Asignacion[]);
    setCargando(false);
  }, []);

  useFocusEffect(useCallback(() => { cargar(); }, [cargar]));

  async function responder(a: Asignacion, k: string) {
    setGuardando(a.id);
    const { error } = await supabase
      .from("tarea_asignaciones")
      .update({ respuesta: k })
      .eq("id", a.id);
    setGuardando(null);
    if (error) { Alert.alert("Error", error.message); return; }
    setItems((prev) => prev.map((x) => (x.id === a.id ? { ...x, respuesta: k, respondido_en: new Date().toISOString() } : x)));
  }

  function comoLlegar(t: Asignacion["tarea"]) {
    if (!t?.latitud || !t?.longitud) { Alert.alert("Sin ubicación", "Esta tarea no tiene coordenadas."); return; }
    Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${t.latitud},${t.longitud}&travelmode=driving`);
  }

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ padding: 16 }}
        refreshControl={<RefreshControl refreshing={cargando} onRefresh={cargar} tintColor={T.accent} />}
        ListHeaderComponent={<Text style={styles.seccion}>Tareas asignadas ({items.length})</Text>}
        ListEmptyComponent={
          !cargando ? (
            <Text style={styles.dim}>
              {sinOficial
                ? "Selecciona tu elemento en Perfil para ver tus tareas."
                : "No tienes tareas asignadas vigentes."}
            </Text>
          ) : <ActivityIndicator color={T.accent} style={{ marginTop: 24 }} />
        }
        renderItem={({ item }) => {
          const t = item.tarea;
          if (!t) return null;
          const v = vence(t);
          const foto = urlFoto(primeraFoto(t.fotografias));
          return (
            <View style={[styles.card, v.vencida && styles.cardVencida]}>
              <View style={[styles.stripe, { backgroundColor: colorPrioridad(t.prioridad) }]} />
              <View style={styles.head}>
                <View style={[styles.icon, { backgroundColor: t.prioridad === "alta" ? T.warnBg : T.accentBg }]}>
                  <Ionicons name="clipboard" size={18} color={t.prioridad === "alta" ? T.warn : T.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.titulo} numberOfLines={2}>
                    {t.folio ? `${t.folio} · ` : ""}{t.tipo ?? "Tarea"}
                  </Text>
                  {!!t.motivo && <Text style={styles.motivo}>Motivo: {t.motivo}</Text>}
                </View>
                {t.prioridad === "alta" && (
                  <View style={styles.prio}><Text style={styles.prioTxt}>ALTA</Text></View>
                )}
              </View>

              {!!t.asunto && <Text style={styles.asunto}>{t.asunto}</Text>}
              {!!foto && <Image source={{ uri: foto }} style={styles.foto} resizeMode="cover" />}
              {!!t.instrucciones && <Text style={styles.instr}>{t.instrucciones}</Text>}

              {!!t.direccion && (
                <TouchableOpacity style={styles.lugar} onPress={() => comoLlegar(t)} activeOpacity={0.7}>
                  <Ionicons name="location" size={15} color={T.accent} />
                  <Text style={styles.lugarTxt} numberOfLines={2}>{t.direccion}</Text>
                  <Ionicons name="navigate" size={15} color={T.accent} />
                </TouchableOpacity>
              )}

              <Text style={[styles.vence, v.vencida && { color: T.danger }]}>
                {v.txt}{v.vencida ? " · se oculta 24 h después" : ""}
              </Text>

              <View style={styles.btns}>
                {RESPUESTAS.map((r) => {
                  const on = item.respuesta === r.k;
                  return (
                    <TouchableOpacity
                      key={r.k}
                      style={[styles.btn, { borderColor: r.color }, on && { backgroundColor: r.color }]}
                      disabled={guardando === item.id}
                      onPress={() => responder(item, r.k)}
                    >
                      <Ionicons name={r.icon} size={15} color={on ? T.white : r.color} />
                      <Text style={[styles.btnTxt, { color: on ? T.white : r.color }]}>{r.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {!!item.respondido_en && (
                <Text style={styles.dim}>Respondiste el {new Date(item.respondido_en).toLocaleString()}</Text>
              )}

              <View style={styles.bodycamRow}>
                <BodycamBoton variant="chip" origen={{ tipo: "tarea", id: t.id, folio: t.folio }} />
              </View>
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.bg },
  seccion: { color: T.textDim, fontSize: 13, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 },
  dim: { color: T.textMute, fontSize: 12, marginTop: 6 },
  card: { backgroundColor: T.surface, borderWidth: 1, borderColor: T.borderSoft, borderRadius: UI.radius, padding: 14, paddingLeft: 18, marginBottom: 12, overflow: "hidden" },
  cardVencida: { opacity: 0.62 },
  bodycamRow: { flexDirection: "row", marginTop: 10 },
  stripe: { position: "absolute", left: 0, top: 0, bottom: 0, width: 5 },
  head: { flexDirection: "row", alignItems: "center", gap: 10 },
  icon: { width: 38, height: 38, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  titulo: { color: T.text, fontSize: 15, fontWeight: "800" },
  motivo: { color: T.textDim, fontSize: 12, marginTop: 1 },
  prio: { backgroundColor: T.danger, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  prioTxt: { color: T.white, fontSize: 10, fontWeight: "900" },
  asunto: { color: T.text, fontSize: 14, marginTop: 10 },
  foto: { width: "100%", height: 160, borderRadius: UI.radiusSm, marginTop: 10, backgroundColor: T.bg },
  instr: { color: T.textDim, fontSize: 13, marginTop: 8, lineHeight: 18 },
  lugar: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: T.bg, borderRadius: UI.radiusSm, padding: 10, marginTop: 10 },
  lugarTxt: { color: T.text, fontSize: 13, flex: 1 },
  vence: { color: T.textDim, fontSize: 12, marginTop: 8, fontWeight: "600" },
  btns: { flexDirection: "row", gap: 8, marginTop: 12 },
  btn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, borderWidth: 1.5, borderRadius: UI.radiusSm, height: 42, paddingHorizontal: 4 },
  btnTxt: { fontSize: 12, fontWeight: "800" },
});
