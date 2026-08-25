import { useCallback, useEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import { SafeAreaView } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { supabase } from "../lib/supabase";
import { T, UI } from "../theme";

// Detalle de un incidente de Central/Despacho: el guardia (o supervisor) sigue el
// caso y agrega NOVEDADES (narrativas_cad) hasta que se cierra. Botón al chat.
export default function IncidenteDetalleScreen() {
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const id: string = route.params?.id;
  const [ll, setLl] = useState<any>(null);
  const [sitio, setSitio] = useState<string | null>(null);
  const [novedades, setNovedades] = useState<any[]>([]);
  const [texto, setTexto] = useState("");
  const [cargando, setCargando] = useState(true);
  const [enviando, setEnviando] = useState(false);

  const cargar = useCallback(async () => {
    const { data } = await supabase.from("llamadas_cad").select("*").eq("id", id).maybeSingle();
    setLl(data);
    if ((data as any)?.sitio_id) {
      const { data: s } = await supabase.from("sitios").select("nombre").eq("id", (data as any).sitio_id).maybeSingle();
      setSitio((s as any)?.nombre ?? null);
    }
    const { data: nv } = await supabase.from("narrativas_cad")
      .select("id, texto, usuario_email, creado_en").eq("llamada_id", id).order("creado_en", { ascending: true });
    setNovedades((nv as any[]) ?? []);
    setCargando(false);
  }, [id]);

  useEffect(() => { cargar(); }, [cargar]);

  const cerrado = !!ll && (ll.estatus !== "activo" || ll.estado_despacho === "resuelta");

  async function agregar() {
    const t = texto.trim();
    if (!t) return;
    setEnviando(true);
    const { error } = await supabase.rpc("rpc_registrar_narrativa_cad", { p_llamada: id, p_texto: t });
    setEnviando(false);
    if (error) { Alert.alert("Error", error.message); return; }
    setTexto("");
    cargar();
  }

  function irAlChat() {
    if (!ll?.chat_canal_id) { Alert.alert("Chat", "El chat de este incidente aún no está disponible."); return; }
    nav.navigate("ChatCanal", { canalId: ll.chat_canal_id, nombre: `Incidente ${ll.folio ?? ""}`.trim() });
  }

  if (cargando) return <SafeAreaView style={styles.safe}><View style={styles.center}><ActivityIndicator color={T.accent} /></View></SafeAreaView>;
  if (!ll) return <SafeAreaView style={styles.safe}><View style={styles.center}><Text style={styles.meta}>No se encontró el incidente.</Text></View></SafeAreaView>;

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <KeyboardAwareScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled" bottomOffset={24}>
        <Text style={styles.titulo}>{ll.tipo ?? "Incidencia"}</Text>
        <Text style={styles.meta}>{ll.folio ?? "s/folio"}{sitio ? ` · ${sitio}` : ""}</Text>
        <View style={[styles.badge, { backgroundColor: cerrado ? "#5A6470" : T.accent, alignSelf: "flex-start", marginTop: 6 }]}>
          <Text style={styles.badgeTxt}>{cerrado ? "Cerrado" : (ll.estado_despacho ?? "recibida")}</Text>
        </View>

        {ll.descripcion ? <Text style={styles.desc}>{ll.descripcion}</Text> : null}

        <TouchableOpacity style={styles.chatBtn} onPress={irAlChat}>
          <Ionicons name="chatbubbles" size={18} color={T.white} />
          <Text style={styles.chatTxt}>Ir al chat del incidente</Text>
        </TouchableOpacity>

        <Text style={styles.label}>Novedades</Text>
        {novedades.length === 0 && <Text style={styles.meta}>Sin novedades todavía.</Text>}
        {novedades.map((n) => (
          <View key={n.id} style={styles.nov}>
            <Text style={styles.novTxt}>{n.texto}</Text>
            <Text style={styles.novMeta}>{n.usuario_email ?? ""} · {n.creado_en ? new Date(n.creado_en).toLocaleString() : ""}</Text>
          </View>
        ))}

        {!cerrado ? (
          <View style={styles.addRow}>
            <TextInput style={styles.input} placeholder="Agregar novedad…" placeholderTextColor={T.textMute} value={texto} onChangeText={setTexto} multiline />
            <TouchableOpacity style={styles.send} onPress={agregar} disabled={enviando}>
              {enviando ? <ActivityIndicator color={T.white} /> : <Ionicons name="send" size={18} color={T.white} />}
            </TouchableOpacity>
          </View>
        ) : (
          <Text style={[styles.meta, { marginTop: 12 }]}>El incidente está cerrado; ya no admite novedades.</Text>
        )}
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  titulo: { color: T.text, fontWeight: "800", fontSize: 20 },
  meta: { color: T.textMute, fontSize: 13, marginTop: 2 },
  desc: { color: T.text, fontSize: 15, marginTop: 12, lineHeight: 21 },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  badgeTxt: { color: T.white, fontWeight: "800", fontSize: 11, textTransform: "capitalize" },
  chatBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: T.accent, borderRadius: UI.radiusSm, height: 48, marginTop: 16 },
  chatTxt: { color: T.white, fontWeight: "800", fontSize: 15 },
  label: { color: T.textDim, fontSize: 13, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4, marginTop: 22, marginBottom: 8 },
  nov: { backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: UI.radiusSm, padding: 12, marginBottom: 8 },
  novTxt: { color: T.text, fontSize: 14.5, lineHeight: 20 },
  novMeta: { color: T.textMute, fontSize: 11.5, marginTop: 6 },
  addRow: { flexDirection: "row", alignItems: "flex-end", gap: 8, marginTop: 12 },
  input: { flex: 1, backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: UI.radiusSm, paddingHorizontal: 14, paddingTop: 12, minHeight: 50, color: T.text, fontSize: 15 },
  send: { width: 50, height: 50, borderRadius: UI.radiusSm, backgroundColor: T.accent, alignItems: "center", justifyContent: "center" },
});
