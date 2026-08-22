import { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Image,
  Alert,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import { SafeAreaView } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import * as Location from "expo-location";
import {
  useAudioRecorder,
  useAudioRecorderState,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from "expo-audio";
import * as FileSystem from "expo-file-system/legacy";
import { decode } from "base64-arraybuffer";
import { supabase, BUCKET_FOTOS } from "../lib/supabase";
import BodycamBoton from "../components/BodycamBoton";
import { T, UI } from "../theme";

type Kind = "foto" | "video" | "audio" | "documento";
interface Medio {
  id: string;
  kind: Kind;
  uri: string;
  nombre: string;
  mime: string;
}

const TIPOS = ["Arma", "Droga", "Documento", "Dispositivo", "Dinero", "Otro"];
const ICONO: Record<Kind, keyof typeof Ionicons.glyphMap> = {
  foto: "image",
  video: "videocam",
  audio: "musical-notes",
  documento: "document-text",
};

function extDe(nombre: string, mime: string): string {
  const m = nombre.match(/\.([a-z0-9]+)$/i);
  if (m) return m[1].toLowerCase();
  if (mime.includes("png")) return "png";
  if (mime.includes("mp4")) return "mp4";
  if (mime.includes("m4a") || mime.includes("mpeg")) return "m4a";
  if (mime.includes("pdf")) return "pdf";
  return "jpg";
}

export default function EvidenciaScreen() {
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const incidenteId: string | undefined = route.params?.incidenteId;
  const [tipo, setTipo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [cantidad, setCantidad] = useState("");
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [medios, setMedios] = useState<Medio[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recState = useAudioRecorderState(recorder);

  useEffect(() => {
    obtenerUbicacion();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function obtenerUbicacion() {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      const pos = await Location.getCurrentPositionAsync({});
      setLat(Number(pos.coords.latitude.toFixed(6)));
      setLng(Number(pos.coords.longitude.toFixed(6)));
    } catch {
      /* sin ubicación */
    }
  }

  function agregar(m: Omit<Medio, "id">) {
    setMedios((p) => [...p, { ...m, id: `${Date.now()}_${p.length}` }]);
  }
  function quitar(id: string) {
    setMedios((p) => p.filter((x) => x.id !== id));
  }

  async function foto(desde: "camara" | "galeria") {
    const perm =
      desde === "camara"
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return Alert.alert("Permiso", "Se requiere el permiso correspondiente.");
    const res =
      desde === "camara"
        ? await ImagePicker.launchCameraAsync({ quality: 0.6 })
        : await ImagePicker.launchImageLibraryAsync({ quality: 0.6, mediaTypes: ["images"] });
    if (res.canceled) return;
    const a = res.assets[0];
    agregar({ kind: "foto", uri: a.uri, nombre: a.fileName ?? `foto.jpg`, mime: a.mimeType ?? "image/jpeg" });
  }

  async function video(desde: "camara" | "galeria") {
    const perm =
      desde === "camara"
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return Alert.alert("Permiso", "Se requiere el permiso correspondiente.");
    const res =
      desde === "camara"
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ["videos"], quality: 0.6 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["videos"], quality: 0.6 });
    if (res.canceled) return;
    const a = res.assets[0];
    agregar({ kind: "video", uri: a.uri, nombre: a.fileName ?? "video.mp4", mime: a.mimeType ?? "video/mp4" });
  }

  async function documento() {
    const res = await DocumentPicker.getDocumentAsync({ type: "*/*", copyToCacheDirectory: true });
    if (res.canceled) return;
    const a = res.assets[0];
    agregar({ kind: "documento", uri: a.uri, nombre: a.name, mime: a.mimeType ?? "application/octet-stream" });
  }

  async function toggleAudio() {
    if (recState.isRecording) {
      await recorder.stop();
      if (recorder.uri) agregar({ kind: "audio", uri: recorder.uri, nombre: `audio_${Date.now()}.m4a`, mime: "audio/m4a" });
      return;
    }
    const { granted } = await requestRecordingPermissionsAsync();
    if (!granted) return Alert.alert("Permiso", "Se requiere permiso de micrófono.");
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
  }

  async function subirMedio(m: Medio, evidenciaId: string): Promise<string | null> {
    const base64 = await FileSystem.readAsStringAsync(m.uri, { encoding: FileSystem.EncodingType.Base64 });
    const path = `evidencias/${evidenciaId}/${Date.now()}_${m.id}.${extDe(m.nombre, m.mime)}`;
    const { error } = await supabase.storage.from(BUCKET_FOTOS).upload(path, decode(base64), { contentType: m.mime });
    return error ? null : path;
  }

  async function enviar() {
    if (!tipo && !descripcion.trim()) {
      return Alert.alert("Falta información", "Indica el tipo o la descripción de la evidencia.");
    }
    if (recState.isRecording) return Alert.alert("Audio", "Detén la grabación antes de enviar.");
    setEnviando(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const correo = u.user?.email ?? null;

      const { data: ev, error } = await supabase
        .from("evidencias")
        .insert({
          tipo: tipo || null,
          descripcion: descripcion.trim() || null,
          cantidad: cantidad.trim() || null,
          estado_evidencia: "recolectada",
          fecha_recoleccion: new Date().toISOString(),
          datos_adicionales: { gps: lat != null && lng != null ? { lat, lng } : null, origen: "app_movil" },
        })
        .select("id, folio")
        .single();
      if (error) throw error;

      // Sube los medios: imágenes → fotografias; el resto → datos_adicionales.archivos.
      if (medios.length) {
        setSubiendo(true);
        const fotos: string[] = [];
        const archivos: { path: string; tipo: Kind; mime: string; nombre: string }[] = [];
        for (const m of medios) {
          const path = await subirMedio(m, ev.id);
          if (!path) continue;
          if (m.kind === "foto") fotos.push(path);
          else archivos.push({ path, tipo: m.kind, mime: m.mime, nombre: m.nombre });
        }
        await supabase
          .from("evidencias")
          .update({
            fotografias: fotos,
            datos_adicionales: { gps: lat != null && lng != null ? { lat, lng } : null, origen: "app_movil", archivos },
            actualizado_en: new Date().toISOString(),
          })
          .eq("id", ev.id);
        setSubiendo(false);
      }

      // Abre la cadena de custodia (evento de recolección).
      await supabase.from("cadena_custodia").insert({
        evidencia_id: ev.id,
        tipo_evento: "recoleccion",
        responsable: correo,
        ubicacion: lat != null && lng != null ? `${lat}, ${lng}` : null,
        notas: "Recolección en campo desde la app móvil.",
      });

      // Si viene desde un informe, se vincula la evidencia al incidente.
      if (incidenteId) {
        await supabase.from("vinculos").insert({
          entidad_origen_tipo: "incidente", entidad_origen_id: incidenteId,
          entidad_destino_tipo: "evidencia", entidad_destino_id: ev.id,
          tipo_relacion: "EVIDENCIA",
        });
      }

      setTipo(""); setDescripcion(""); setCantidad(""); setMedios([]);
      Alert.alert("Evidencia registrada", `Folio ${ev.folio ?? "asignado"}. Cadena de custodia iniciada.`, [
        { text: "OK", onPress: () => nav.goBack() },
      ]);
    } catch (e: any) {
      Alert.alert("Error al enviar", e.message ?? String(e));
    } finally {
      setEnviando(false);
      setSubiendo(false);
    }
  }

  const ocupado = enviando || subiendo;
  const seg = Math.floor((recState.durationMillis ?? 0) / 1000);

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <KeyboardAwareScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled" bottomOffset={24}>
        <Text style={styles.sub}>Fotografía, video, audio y documentos · inicia la cadena de custodia</Text>

        {/* Tipo */}
        <Text style={styles.label}>Tipo de evidencia</Text>
        <View style={styles.chips}>
          {TIPOS.map((t) => (
            <TouchableOpacity key={t} style={[styles.chip, tipo === t && styles.chipOn]} onPress={() => setTipo(t)}>
              <Text style={[styles.chipTxt, tipo === t && styles.chipTxtOn]}>{t}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Descripción / cantidad */}
        <Text style={styles.label}>Descripción</Text>
        <TextInput
          style={[styles.input, styles.textarea]}
          placeholder="Descripción del objeto / evidencia"
          placeholderTextColor={T.textMute}
          value={descripcion}
          onChangeText={setDescripcion}
          multiline
        />
        <Text style={styles.label}>Cantidad</Text>
        <TextInput
          style={styles.input}
          placeholder='Ej. "2 piezas", "15.3 g"'
          placeholderTextColor={T.textMute}
          value={cantidad}
          onChangeText={setCantidad}
        />

        {/* Captura de medios */}
        <Text style={styles.label}>Capturar</Text>
        <View style={styles.grid}>
          <Cap icon="camera" label="Foto" onPress={() => foto("camara")} disabled={ocupado} />
          <Cap icon="image" label="Galería" onPress={() => foto("galeria")} disabled={ocupado} />
          <Cap icon="videocam" label="Video" onPress={() => video("camara")} disabled={ocupado} />
          <Cap icon="document-text" label="Documento" onPress={documento} disabled={ocupado} />
        </View>
        <TouchableOpacity
          style={[styles.audioBtn, recState.isRecording && styles.audioBtnOn]}
          onPress={toggleAudio}
          disabled={ocupado}
        >
          <Ionicons name={recState.isRecording ? "stop-circle" : "mic"} size={22} color={recState.isRecording ? T.white : T.accent} />
          <Text style={[styles.audioTxt, recState.isRecording && { color: T.white }]}>
            {recState.isRecording ? `Grabando… ${seg}s (tocar para detener)` : "Grabar audio"}
          </Text>
        </TouchableOpacity>

        {/* Bodycam HD en segundo plano (solo build Android): el video se descarga
            luego como evidencia independiente con cadena de custodia. */}
        <BodycamBoton style={{ marginTop: 10 }} />

        {/* Medios agregados */}
        {medios.length > 0 && (
          <>
            <Text style={styles.label}>Adjuntos ({medios.length})</Text>
            {medios.map((m) => (
              <View key={m.id} style={styles.medio}>
                {m.kind === "foto" ? (
                  <Image source={{ uri: m.uri }} style={styles.medioThumb} />
                ) : (
                  <View style={styles.medioIcono}><Ionicons name={ICONO[m.kind]} size={22} color={T.accent} /></View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.medioNombre} numberOfLines={1}>{m.nombre}</Text>
                  <Text style={styles.medioKind}>{m.kind}</Text>
                </View>
                <TouchableOpacity onPress={() => quitar(m.id)} hitSlop={8}>
                  <Ionicons name="trash-outline" size={20} color={T.danger} />
                </TouchableOpacity>
              </View>
            ))}
          </>
        )}

        <TouchableOpacity style={styles.btnPrim} onPress={enviar} disabled={ocupado}>
          {ocupado ? (
            <ActivityIndicator color={T.white} />
          ) : (
            <>
              <Ionicons name="shield-checkmark" size={18} color={T.white} />
              <Text style={styles.btnPrimTxt}>Registrar evidencia</Text>
            </>
          )}
        </TouchableOpacity>
        {subiendo && <Text style={styles.nota}>Subiendo adjuntos…</Text>}
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

function Cap({ icon, label, onPress, disabled }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <TouchableOpacity style={styles.cap} onPress={onPress} disabled={disabled}>
      <Ionicons name={icon} size={24} color={T.accent} />
      <Text style={styles.capTxt}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.bg },
  sub: { color: T.textDim, fontSize: 14 },
  label: { color: T.textDim, fontSize: 13, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4, marginTop: 20, marginBottom: 8 },
  input: { backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: UI.radiusSm, paddingHorizontal: 14, minHeight: 52, color: T.text, fontSize: 16 },
  textarea: { minHeight: 90, paddingTop: 14, textAlignVertical: "top" },

  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1, borderColor: T.border, borderRadius: 20, paddingVertical: 8, paddingHorizontal: 14, backgroundColor: T.surface },
  chipOn: { backgroundColor: T.accent, borderColor: T.accent },
  chipTxt: { color: T.textDim, fontWeight: "700", fontSize: 13 },
  chipTxtOn: { color: T.white },

  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  cap: { width: "47%", flexGrow: 1, alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: T.surface, borderWidth: 1, borderColor: T.accentDim, borderRadius: UI.radiusSm, paddingVertical: 16 },
  capTxt: { color: T.text, fontWeight: "700", fontSize: 14 },

  audioBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: T.surface, borderWidth: 1, borderColor: T.accentDim, borderRadius: UI.radiusSm, height: 54, marginTop: 10 },
  audioBtnOn: { backgroundColor: T.danger, borderColor: T.danger },
  audioTxt: { color: T.accent, fontWeight: "700", fontSize: 15 },

  medio: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: UI.radiusSm, padding: 10, marginBottom: 8 },
  medioThumb: { width: 46, height: 46, borderRadius: 8, backgroundColor: T.surfaceHi },
  medioIcono: { width: 46, height: 46, borderRadius: 8, backgroundColor: T.accentBg, alignItems: "center", justifyContent: "center" },
  medioNombre: { color: T.text, fontSize: 14, fontWeight: "600" },
  medioKind: { color: T.textMute, fontSize: 12, textTransform: "capitalize" },

  btnPrim: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: T.accent, borderRadius: UI.radiusSm, height: 54, marginTop: 26 },
  btnPrimTxt: { color: T.white, fontWeight: "800", fontSize: 16 },
  nota: { color: T.textMute, fontSize: 13, textAlign: "center", marginTop: 12 },
});
