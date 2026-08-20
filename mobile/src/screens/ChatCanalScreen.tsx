import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList, Image, Alert, ActivityIndicator,
} from "react-native";
import { useReanimatedKeyboardAnimation } from "react-native-keyboard-controller";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { supabase } from "../lib/supabase";
import { T } from "../theme";
import type { RootStackParamList } from "../types";
import { colorUsuario } from "../lib/chatColor";
import {
  cargarMensajes, cargarMiembros, enviarTexto, enviarAdjunto, urlFirmada, miId, marcarLeido,
  type MensajeMovil,
} from "../lib/chat";

// Sello de tiempo del mensaje: hoy → solo hora; ayer → "ayer HH:MM";
// más antiguo → "12 ago 14:03 · hace N días".
function selloTiempo(iso: string): string {
  const d = new Date(iso);
  const hora = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const soloDia = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dias = Math.round((soloDia(new Date()) - soloDia(d)) / 86400000);
  if (dias <= 0) return hora;
  if (dias === 1) return `ayer ${hora}`;
  const fecha = d.toLocaleDateString([], { day: "2-digit", month: "short" });
  return `${fecha} ${hora} · hace ${dias} días`;
}

// Conversación de un canal. INSERT = fuente de verdad; Realtime difunde. Cada
// remitente se distingue por su nombre y color estable (colorUsuario).
export default function ChatCanalScreen() {
  // Desliza el contenedor con la ALTURA REAL del teclado (Reanimated), en vez de
  // KeyboardAvoidingView (que bajo edge-to-edge dejaba hueco o empalmaba). Se
  // compensa el safe-area inferior con progress para que el input quede pegado
  // al teclado cuando está abierto y sobre la barra de gestos cuando está cerrado.
  const kb = useReanimatedKeyboardAnimation();
  const insets = useSafeAreaInsets();
  const desliza = useAnimatedStyle(() => ({
    transform: [{ translateY: kb.height.value + kb.progress.value * insets.bottom }],
  }));
  const route = useRoute<RouteProp<RootStackParamList, "ChatCanal">>();
  const nav = useNavigation();
  const { canalId, nombre } = route.params;

  const [uid, setUid] = useState<string | null>(null);
  const [mensajes, setMensajes] = useState<MensajeMovil[]>([]);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const nombres = useRef<Record<string, string>>({});
  const [urls, setUrls] = useState<Record<string, string>>({});
  const listaRef = useRef<FlatList<MensajeMovil>>(null);

  useLayoutEffect(() => { nav.setOptions({ title: nombre }); }, [nav, nombre]);

  useEffect(() => {
    (async () => {
      setUid(await miId());
      const miem = await cargarMiembros(canalId);
      miem.forEach((m) => { if (m.nombre) nombres.current[m.usuario_id] = m.nombre; });
      setMensajes(await cargarMensajes(canalId));
      marcarLeido(canalId);   // al abrir, el canal queda al día
    })();

    const canal = supabase
      .channel(`chat:${canalId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_mensajes", filter: `canal_id=eq.${canalId}` },
        (payload) => {
          const m = payload.new as MensajeMovil;
          setMensajes((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
          marcarLeido(canalId);   // viéndolo en vivo → sigue al día
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(canal); };
  }, [canalId]);

  // Firmar URLs de adjuntos nuevos.
  useEffect(() => {
    const pend = mensajes.filter((m) => m.adjunto_url && !urls[m.adjunto_url]);
    if (pend.length === 0) return;
    (async () => {
      const nuevas: Record<string, string> = {};
      for (const m of pend) {
        const u = await urlFirmada(m.adjunto_url!);
        if (u) nuevas[m.adjunto_url!] = u;
      }
      if (Object.keys(nuevas).length) setUrls((p) => ({ ...p, ...nuevas }));
    })();
  }, [mensajes, urls]);

  function alFondo() { setTimeout(() => listaRef.current?.scrollToEnd({ animated: true }), 60); }

  async function enviar() {
    const t = texto.trim();
    if (!t || enviando) return;
    setTexto("");
    setEnviando(true);
    const err = await enviarTexto(canalId, t);
    setEnviando(false);
    if (err) { Alert.alert("Error", err); setTexto(t); }
  }

  async function adjuntar() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert("Permiso", "Se requiere acceso a fotos."); return; }
    const r = await ImagePicker.launchImageLibraryAsync({ quality: 0.6, mediaTypes: ["images"] });
    if (r.canceled || !r.assets?.[0]?.uri) return;
    setEnviando(true);
    const err = await enviarAdjunto(canalId, r.assets[0].uri);
    setEnviando(false);
    if (err) Alert.alert("Error", err);
  }

  function nombreDe(id: string | null): string {
    if (!id) return "Sistema";
    return nombres.current[id] ?? "Usuario";
  }

  return (
    <Animated.View style={[styles.cont, desliza]}>
      <FlatList
        ref={listaRef}
        data={mensajes}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: 12, paddingBottom: 16 }}
        onContentSizeChange={alFondo}
        renderItem={({ item: m }) => {
          if (m.tipo === "sistema") {
            return <Text style={styles.sistema}>{m.cuerpo}</Text>;
          }
          const propio = m.usuario_id === uid;
          const col = colorUsuario(m.usuario_id);
          return (
            <View style={[styles.fila, { justifyContent: propio ? "flex-end" : "flex-start" }]}>
              <View style={[styles.burbuja, propio ? styles.mia : styles.otra, !propio && { borderLeftColor: col, borderLeftWidth: 3 }]}>
                {!propio && <Text style={[styles.autor, { color: col }]}>{nombreDe(m.usuario_id)}</Text>}
                {!!m.adjunto_url && !!urls[m.adjunto_url] && (
                  <Image source={{ uri: urls[m.adjunto_url] }} style={styles.img} resizeMode="cover" />
                )}
                {!!m.cuerpo && <Text style={[styles.cuerpo, propio && { color: T.white }]}>{m.cuerpo}</Text>}
                <Text style={[styles.hora, propio && { color: "rgba(255,255,255,0.7)" }]}>
                  {selloTiempo(m.creado_en)}
                </Text>
              </View>
            </View>
          );
        }}
      />
      <View style={[styles.barra, { paddingBottom: 10 + insets.bottom }]}>
        <TouchableOpacity onPress={adjuntar} style={styles.adj} disabled={enviando}>
          <Ionicons name="image" size={22} color={T.accent} />
        </TouchableOpacity>
        <TextInput
          style={styles.input}
          value={texto}
          onChangeText={setTexto}
          placeholder="Mensaje…"
          placeholderTextColor={T.textMute}
          multiline
        />
        <TouchableOpacity onPress={enviar} style={styles.enviar} disabled={enviando || !texto.trim()}>
          {enviando ? <ActivityIndicator color={T.white} /> : <Ionicons name="send" size={18} color={T.white} />}
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  cont: { flex: 1, backgroundColor: T.bg },
  sistema: { color: T.textMute, fontSize: 12, textAlign: "center", marginVertical: 8 },
  fila: { flexDirection: "row", marginBottom: 8 },
  burbuja: { maxWidth: "80%", borderRadius: 14, paddingVertical: 8, paddingHorizontal: 11 },
  mia: { backgroundColor: T.accent2, borderTopRightRadius: 4 },
  otra: { backgroundColor: T.surfaceHi, borderTopLeftRadius: 4 },
  autor: { fontSize: 12, fontWeight: "800", marginBottom: 3 },
  cuerpo: { color: T.text, fontSize: 14.5, lineHeight: 19 },
  hora: { fontSize: 10, color: T.textMute, marginTop: 3, alignSelf: "flex-end" },
  img: { width: 200, height: 200, borderRadius: 10, marginBottom: 6, backgroundColor: T.surface },
  barra: { flexDirection: "row", alignItems: "flex-end", gap: 8, padding: 10, borderTopWidth: 1, borderTopColor: T.border, backgroundColor: T.surface },
  adj: { padding: 8 },
  input: { flex: 1, color: T.text, backgroundColor: T.surfaceAlt, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9, maxHeight: 120, fontSize: 15 },
  enviar: { width: 42, height: 42, borderRadius: 21, backgroundColor: T.accent2, alignItems: "center", justifyContent: "center" },
});
