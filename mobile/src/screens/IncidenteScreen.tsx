import { useEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Image, Alert, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { SafeAreaView } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import * as FileSystem from "expo-file-system/legacy";
import { decode } from "base64-arraybuffer";
import { supabase, BUCKET_FOTOS } from "../lib/supabase";
import { getMiOficialValido } from "../lib/oficial";
import { T, UI } from "../theme";

const TIPOS_FALLBACK = [
  "Alarma activada", "Intrusión / acceso no autorizado", "Robo / hurto",
  "Persona sospechosa", "Riña / agresión", "Emergencia médica",
  "Incendio / conato", "Falla de servicio (CCTV, energía)", "Otro",
];

interface Foto { id: string; uri: string; nombre: string; mime: string }

// Levantar incidente (SGS): el guardia reporta una incidencia desde el campo.
// Crea una incidencia en CENTRAL/DESPACHO (tabla `llamadas_cad`, origen
// "incidente_movil") con GPS y fotos, para que la central la triaje/despache
// junto con el resto de reportes. Las fotos van al bucket público `fotos` y sus
// rutas quedan en datos_adicionales.fotografias (la web las muestra).
export default function IncidenteScreen() {
  const nav = useNavigation<any>();
  const [tipos, setTipos] = useState<string[]>(TIPOS_FALLBACK);
  const [tipo, setTipo] = useState("");
  const [narrativa, setNarrativa] = useState("");
  const [direccion, setDireccion] = useState("");
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [fotos, setFotos] = useState<Foto[]>([]);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    // Tipos desde el catálogo administrable (mismo que Central/Despacho).
    supabase.from("cat_opciones").select("valor").eq("categoria", "tipo_incidencia").eq("activo", true).order("orden")
      .then(({ data }) => { const v = ((data as any[]) ?? []).map((o) => o.valor); if (v.length) setTipos(v); });
    obtenerUbicacion();
  }, []);

  async function obtenerUbicacion() {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      const pos = await Location.getCurrentPositionAsync({});
      setLat(Number(pos.coords.latitude.toFixed(6)));
      setLng(Number(pos.coords.longitude.toFixed(6)));
    } catch { /* sin ubicación */ }
  }

  async function foto(desde: "camara" | "galeria") {
    const perm = desde === "camara"
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return Alert.alert("Permiso", "Se requiere el permiso correspondiente.");
    const res = desde === "camara"
      ? await ImagePicker.launchCameraAsync({ quality: 0.6 })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.6, mediaTypes: ["images"] });
    if (res.canceled) return;
    const a = res.assets[0];
    setFotos((p) => [...p, { id: `${Date.now()}_${p.length}`, uri: a.uri, nombre: a.fileName ?? "foto.jpg", mime: a.mimeType ?? "image/jpeg" }]);
  }

  async function subirFoto(f: Foto, llamadaId: string): Promise<string | null> {
    const base64 = await FileSystem.readAsStringAsync(f.uri, { encoding: FileSystem.EncodingType.Base64 });
    const ext = (f.nombre.match(/\.([a-z0-9]+)$/i)?.[1] ?? "jpg").toLowerCase();
    const path = `cad/${llamadaId}/${Date.now()}_${f.id}.${ext}`;
    const { error } = await supabase.storage.from(BUCKET_FOTOS).upload(path, decode(base64), { contentType: f.mime });
    return error ? null : path;
  }

  async function enviar() {
    if (!tipo && !narrativa.trim()) return Alert.alert("Falta información", "Indica el tipo o la narrativa del incidente.");
    setEnviando(true);
    try {
      const guardia = await getMiOficialValido();
      const dir = direccion.trim() || (lat != null && lng != null ? `GPS ${lat}, ${lng}` : "Reportado desde app móvil");
      const datos: Record<string, any> = {
        origen: "incidente_movil",
        personal_id: guardia?.personalId ?? null,
        elemento: guardia?.etiqueta ?? null,
      };
      // Se registra como incidencia de Central/Despacho, en estado "recibida"
      // para que la central la triaje o despache.
      const { data: ll, error } = await supabase.from("llamadas_cad").insert({
        tipo: tipo || null,
        prioridad: "media",
        reportante: guardia?.etiqueta ?? null,
        descripcion: narrativa.trim() || null,
        direccion: dir,
        latitud: lat, longitud: lng,
        estado_despacho: "recibida",
        datos_adicionales: datos,
      }).select("id, folio").single();
      if (error) throw error;

      if (fotos.length) {
        const rutas: string[] = [];
        for (const f of fotos) { const p = await subirFoto(f, ll.id); if (p) rutas.push(p); }
        if (rutas.length) await supabase.from("llamadas_cad").update({
          datos_adicionales: { ...datos, fotografias: rutas },
          actualizado_en: new Date().toISOString(),
        }).eq("id", ll.id);
      }

      Alert.alert("Incidente reportado", `Folio ${ll.folio ?? "asignado"}. La central ya lo ve en Central/Despacho.`, [
        { text: "OK", onPress: () => nav.goBack() },
      ]);
    } catch (e: any) {
      Alert.alert("Error al enviar", e.message ?? String(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <KeyboardAwareScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled" bottomOffset={24}>
        <Text style={styles.sub}>Reporta una incidencia desde el sitio · se registra con tu ubicación</Text>

        <Text style={styles.label}>Tipo de incidencia</Text>
        <View style={styles.chips}>
          {tipos.map((t) => (
            <TouchableOpacity key={t} style={[styles.chip, tipo === t && styles.chipOn]} onPress={() => setTipo(t)}>
              <Text style={[styles.chipTxt, tipo === t && styles.chipTxtOn]}>{t}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Narrativa</Text>
        <TextInput style={[styles.input, styles.textarea]} placeholder="¿Qué ocurrió?" placeholderTextColor={T.textMute} value={narrativa} onChangeText={setNarrativa} multiline />

        <Text style={styles.label}>Ubicación / referencia</Text>
        <TextInput style={styles.input} placeholder="Punto o referencia del sitio (opcional)" placeholderTextColor={T.textMute} value={direccion} onChangeText={setDireccion} />
        <Text style={styles.gps}>{lat != null && lng != null ? `📍 GPS ${lat}, ${lng}` : "Obteniendo ubicación…"}</Text>

        <Text style={styles.label}>Fotografías</Text>
        <View style={styles.grid}>
          <TouchableOpacity style={styles.cap} onPress={() => foto("camara")} disabled={enviando}><Ionicons name="camera" size={24} color={T.accent} /><Text style={styles.capTxt}>Foto</Text></TouchableOpacity>
          <TouchableOpacity style={styles.cap} onPress={() => foto("galeria")} disabled={enviando}><Ionicons name="image" size={24} color={T.accent} /><Text style={styles.capTxt}>Galería</Text></TouchableOpacity>
        </View>
        {fotos.length > 0 && (
          <View style={styles.thumbs}>
            {fotos.map((f) => (
              <View key={f.id} style={styles.thumbBox}>
                <Image source={{ uri: f.uri }} style={styles.thumb} />
                <TouchableOpacity style={styles.thumbDel} onPress={() => setFotos((p) => p.filter((x) => x.id !== f.id))}>
                  <Ionicons name="close-circle" size={20} color={T.danger} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        <TouchableOpacity style={styles.btnPrim} onPress={enviar} disabled={enviando}>
          {enviando ? <ActivityIndicator color={T.white} /> : (<><Ionicons name="shield-checkmark" size={18} color={T.white} /><Text style={styles.btnPrimTxt}>Levantar incidente</Text></>)}
        </TouchableOpacity>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.bg },
  sub: { color: T.textDim, fontSize: 14 },
  label: { color: T.textDim, fontSize: 13, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4, marginTop: 20, marginBottom: 8 },
  input: { backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: UI.radiusSm, paddingHorizontal: 14, minHeight: 52, color: T.text, fontSize: 16 },
  textarea: { minHeight: 100, paddingTop: 14, textAlignVertical: "top" },
  gps: { color: T.textMute, fontSize: 12.5, marginTop: 6 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1, borderColor: T.border, borderRadius: 20, paddingVertical: 8, paddingHorizontal: 14, backgroundColor: T.surface },
  chipOn: { backgroundColor: T.accent, borderColor: T.accent },
  chipTxt: { color: T.textDim, fontWeight: "700", fontSize: 13 },
  chipTxtOn: { color: T.white },
  grid: { flexDirection: "row", gap: 10 },
  cap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: T.surface, borderWidth: 1, borderColor: T.accentDim, borderRadius: UI.radiusSm, paddingVertical: 16 },
  capTxt: { color: T.text, fontWeight: "700", fontSize: 14 },
  thumbs: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 12 },
  thumbBox: { position: "relative" },
  thumb: { width: 76, height: 76, borderRadius: 10, backgroundColor: T.surfaceHi },
  thumbDel: { position: "absolute", top: -6, right: -6, backgroundColor: T.bg, borderRadius: 12 },
  btnPrim: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: T.accent, borderRadius: UI.radiusSm, height: 54, marginTop: 26 },
  btnPrimTxt: { color: T.white, fontWeight: "800", fontSize: 16 },
});
