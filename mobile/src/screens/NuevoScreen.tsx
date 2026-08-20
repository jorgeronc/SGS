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
import { useNavigation } from "@react-navigation/native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { decode } from "base64-arraybuffer";
import { supabase, BUCKET_FOTOS } from "../lib/supabase";
import { getMiUnidad } from "../lib/unidad";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { T, UI } from "../theme";

const BORRADOR = "scp_borrador_incidente";
const TIPOS_COMUNES = ["Robo", "Accidente", "Riña", "Violencia familiar", "Sospechoso", "Otro"];

// Reporte CAD asignado que puede originar el incidente (arrastra sus datos).
interface Reporte {
  llamadaId: string;
  folio: string | null;
  tipo: string | null;
  direccion: string | null;
  latitud: number | null;
  longitud: number | null;
  descripcion: string | null;
  fecha_recepcion: string | null;
  personal_id: string | null;
  unidad: string | null;
  estado: string;
  actualizado_en: string | null;
}

interface Foto {
  uri: string;
  base64: string;
  mime: string;
}
interface FormState {
  tipo: string;
  direccion: string;
  narrativa: string;
  latitud: number | null;
  longitud: number | null;
  fotos: Foto[];
}
const VACIO: FormState = { tipo: "", direccion: "", narrativa: "", latitud: null, longitud: null, fotos: [] };

export default function NuevoScreen() {
  const nav = useNavigation<any>();
  const [f, setF] = useState<FormState>(VACIO);
  const [ubicando, setUbicando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [reportes, setReportes] = useState<Reporte[]>([]);
  const [reporteSel, setReporteSel] = useState<Reporte | null>(null);

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setF((p) => ({ ...p, [k]: v }));
  }

  // Carga los reportes asignados (despachos de mi unidad, o recientes) para
  // poder originar el incidente desde uno de ellos.
  async function cargarReportes() {
    const unidad = await getMiUnidad();
    let q = supabase
      .from("despachos")
      .select("id, estado, personal_id, actualizado_en, patrulla:patrullas(numero), llamada:llamadas_cad(id, folio, tipo, direccion, latitud, longitud, descripcion, fecha_recepcion)")
      .eq("estatus", "activo");
    if (unidad) q = q.eq("patrulla_id", unidad.patrullaId);
    const { data } = await q.order("fecha_asignacion", { ascending: false }).limit(30);
    const rows = ((data as any[]) ?? []).filter((d) => d.llamada);
    setReportes(rows.map((d) => ({
      llamadaId: d.llamada.id, folio: d.llamada.folio, tipo: d.llamada.tipo,
      direccion: d.llamada.direccion, latitud: d.llamada.latitud, longitud: d.llamada.longitud,
      descripcion: d.llamada.descripcion, fecha_recepcion: d.llamada.fecha_recepcion,
      personal_id: d.personal_id, unidad: d.patrulla?.numero ?? null, estado: d.estado, actualizado_en: d.actualizado_en,
    })));
  }

  // Elige/deselecciona un reporte; al elegirlo prefila lo que esté vacío.
  function elegirReporte(r: Reporte) {
    if (reporteSel?.llamadaId === r.llamadaId) { setReporteSel(null); return; }
    setReporteSel(r);
    setF((p) => ({
      ...p,
      tipo: p.tipo || r.tipo || "",
      direccion: p.direccion || r.direccion || "",
      narrativa: p.narrativa || r.descripcion || "",
      latitud: r.latitud ?? p.latitud,
      longitud: r.longitud ?? p.longitud,
    }));
  }

  // Al abrir: recupera borrador guardado (si existe) y toma el GPS.
  useEffect(() => {
    (async () => {
      const raw = await AsyncStorage.getItem(BORRADOR);
      if (raw) {
        try {
          const d = JSON.parse(raw) as FormState;
          Alert.alert("Borrador encontrado", "Tienes un incidente sin enviar. ¿Continuarlo?", [
            { text: "Descartar", style: "destructive", onPress: () => AsyncStorage.removeItem(BORRADOR) },
            { text: "Continuar", onPress: () => setF({ ...VACIO, ...d, fotos: d.fotos ?? [] }) },
          ]);
        } catch {
          /* ignora borrador corrupto */
        }
      }
      obtenerUbicacion();
      cargarReportes();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function obtenerUbicacion() {
    setUbicando(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setUbicando(false);
        return;
      }
      const pos = await Location.getCurrentPositionAsync({});
      setF((p) => ({
        ...p,
        latitud: Number(pos.coords.latitude.toFixed(6)),
        longitud: Number(pos.coords.longitude.toFixed(6)),
      }));
    } catch {
      /* sin ubicación */
    } finally {
      setUbicando(false);
    }
  }

  async function agregarFoto(desde: "camara" | "galeria") {
    const perm =
      desde === "camara"
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permiso", `Se requiere permiso de ${desde === "camara" ? "cámara" : "galería"}.`);
      return;
    }
    const res =
      desde === "camara"
        ? await ImagePicker.launchCameraAsync({ quality: 0.6, base64: true })
        : await ImagePicker.launchImageLibraryAsync({ quality: 0.6, base64: true, mediaTypes: ["images"] });
    if (res.canceled) return;
    const a = res.assets[0];
    if (!a.base64) {
      Alert.alert("Error", "No se pudo leer la imagen.");
      return;
    }
    set("fotos", [...f.fotos, { uri: a.uri, base64: a.base64, mime: a.mimeType ?? "image/jpeg" }]);
  }

  function quitarFoto(uri: string) {
    set("fotos", f.fotos.filter((x) => x.uri !== uri));
  }

  async function guardarBorrador() {
    try {
      await AsyncStorage.setItem(BORRADOR, JSON.stringify(f));
      Alert.alert("Borrador guardado", "Se guardó en el dispositivo. Podrás enviarlo después.");
    } catch {
      // Si las fotos exceden el almacenamiento, guarda sólo el texto.
      const { fotos, ...sinFotos } = f;
      await AsyncStorage.setItem(BORRADOR, JSON.stringify({ ...sinFotos, fotos: [] }));
      Alert.alert("Borrador guardado", "Guardado sin fotos (ocupaban demasiado espacio local).");
    }
  }

  async function enviar() {
    if (!f.tipo.trim() && !f.narrativa.trim()) {
      Alert.alert("Falta información", "Indica al menos el tipo o la descripción del incidente.");
      return;
    }
    setEnviando(true);
    try {
      // Si viene de un reporte asignado, arrastra sus datos al incidente.
      const desdeReporte = reporteSel
        ? {
            llamada_cad_id: reporteSel.llamadaId,
            delito: reporteSel.tipo,
            via_conocimiento: "LLAMADA 911",
            fecha_conocimiento: reporteSel.fecha_recepcion,
            oficial_personal_id: reporteSel.personal_id,
            unidad: reporteSel.unidad,
            ...(reporteSel.estado === "en_lugar" || reporteSel.estado === "cerrado"
              ? { fecha_arribo: reporteSel.actualizado_en }
              : {}),
          }
        : {};
      const { data: inc, error } = await supabase
        .from("incidentes")
        .insert({
          tipo: f.tipo.trim() || null,
          direccion: f.direccion.trim() || null,
          narrativa: f.narrativa.trim() || null,
          latitud: f.latitud,
          longitud: f.longitud,
          estado: "abierto",
          ...desdeReporte,
        })
        .select("id, folio")
        .single();
      if (error) throw error;

      // Sube las fotos al Storage y actualiza el arreglo del incidente.
      if (f.fotos.length) {
        setSubiendo(true);
        const paths: string[] = [];
        for (const foto of f.fotos) {
          const ext = foto.mime.includes("png") ? "png" : "jpg";
          const path = `incidentes/${inc.id}/${Date.now()}_${paths.length}.${ext}`;
          const { error: eUp } = await supabase.storage
            .from(BUCKET_FOTOS)
            .upload(path, decode(foto.base64), { contentType: foto.mime });
          if (!eUp) paths.push(path);
        }
        if (paths.length) {
          await supabase
            .from("incidentes")
            .update({ fotografias: paths, actualizado_en: new Date().toISOString() })
            .eq("id", inc.id);
        }
        setSubiendo(false);
      }

      await AsyncStorage.removeItem(BORRADOR);
      setF(VACIO);
      setReporteSel(null);
      const incId = inc.id;
      const incFolio = inc.folio;
      Alert.alert(
        "Incidente creado",
        `Folio ${incFolio ?? "asignado"}. Continúa el informe: agrega involucrados, fotos y novedades.`,
        [
          { text: "Después" },
          { text: "Continuar informe", onPress: () => nav.navigate("Informe", { incidenteId: incId }) },
        ]
      );
      obtenerUbicacion();
    } catch (e: any) {
      Alert.alert("Error al enviar", e.message ?? String(e));
    } finally {
      setEnviando(false);
      setSubiendo(false);
    }
  }

  const ocupado = enviando || subiendo;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <KeyboardAwareScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled" bottomOffset={24}>
        <Text style={styles.titulo}>Nuevo incidente</Text>
        <Text style={styles.sub}>Captura en campo · se envía al Sistema Central Policial</Text>

        {/* Reporte asignado (opcional): origina el incidente y arrastra sus datos */}
        {reportes.length > 0 && (
          <>
            <Text style={styles.label}>Reporte asignado (opcional)</Text>
            <View style={styles.chips}>
              {reportes.map((r) => {
                const on = reporteSel?.llamadaId === r.llamadaId;
                return (
                  <TouchableOpacity key={r.llamadaId} style={[styles.repChip, on && styles.chipOn]} onPress={() => elegirReporte(r)}>
                    <Text style={[styles.repFolio, on && styles.chipTxtOn]}>{r.folio ?? "s/folio"}</Text>
                    <Text style={[styles.repSub, on && styles.chipTxtOn]} numberOfLines={1}>{r.tipo ?? "—"}{r.direccion ? ` · ${r.direccion}` : ""}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {reporteSel && <Text style={styles.repNota}>Se asociará el reporte {reporteSel.folio ?? ""} y se arrastrarán sus datos (vía 911, oficial, unidad, fechas).</Text>}
          </>
        )}

        {/* Tipo */}
        <Text style={styles.label}>Tipo de incidente</Text>
        <TextInput
          style={styles.input}
          placeholder="Robo, accidente, riña…"
          placeholderTextColor={T.textMute}
          value={f.tipo}
          onChangeText={(v) => set("tipo", v)}
        />
        <View style={styles.chips}>
          {TIPOS_COMUNES.map((t) => (
            <TouchableOpacity key={t} style={[styles.chip, f.tipo === t && styles.chipOn]} onPress={() => set("tipo", t)}>
              <Text style={[styles.chipTxt, f.tipo === t && styles.chipTxtOn]}>{t}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Dirección */}
        <Text style={styles.label}>Dirección / referencia</Text>
        <TextInput
          style={styles.input}
          placeholder="Calle, número, colonia o referencia"
          placeholderTextColor={T.textMute}
          value={f.direccion}
          onChangeText={(v) => set("direccion", v)}
        />

        {/* Ubicación GPS */}
        <Text style={styles.label}>Ubicación (GPS automático)</Text>
        <View style={styles.gpsRow}>
          <View style={styles.gpsBox}>
            <Ionicons name="location" size={16} color={T.accent} />
            <Text style={styles.gpsTxt}>
              {f.latitud != null && f.longitud != null
                ? `${f.latitud}, ${f.longitud}`
                : ubicando
                ? "Obteniendo ubicación…"
                : "Sin ubicación"}
            </Text>
          </View>
          <TouchableOpacity style={styles.gpsBtn} onPress={obtenerUbicacion} disabled={ubicando}>
            {ubicando ? <ActivityIndicator color={T.white} size="small" /> : <Ionicons name="refresh" size={18} color={T.white} />}
          </TouchableOpacity>
        </View>

        {/* Descripción */}
        <Text style={styles.label}>Descripción de los hechos</Text>
        <TextInput
          style={[styles.input, styles.textarea]}
          placeholder="¿Qué ocurrió? Personas, vehículos, hechos relevantes…"
          placeholderTextColor={T.textMute}
          value={f.narrativa}
          onChangeText={(v) => set("narrativa", v)}
          multiline
        />

        {/* Fotos */}
        <Text style={styles.label}>Fotografías</Text>
        <View style={styles.fotoBtns}>
          <TouchableOpacity style={styles.fotoBtn} onPress={() => agregarFoto("camara")} disabled={ocupado}>
            <Ionicons name="camera" size={18} color={T.accent} />
            <Text style={styles.fotoBtnTxt}>Cámara</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.fotoBtn} onPress={() => agregarFoto("galeria")} disabled={ocupado}>
            <Ionicons name="images" size={18} color={T.accent} />
            <Text style={styles.fotoBtnTxt}>Galería</Text>
          </TouchableOpacity>
        </View>
        {f.fotos.length > 0 && (
          <View style={styles.galeria}>
            {f.fotos.map((foto) => (
              <View key={foto.uri} style={styles.thumbWrap}>
                <Image source={{ uri: foto.uri }} style={styles.thumb} />
                <TouchableOpacity style={styles.quitar} onPress={() => quitarFoto(foto.uri)}>
                  <Ionicons name="close" size={14} color={T.white} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* Acciones */}
        <View style={styles.acciones}>
          <TouchableOpacity style={styles.btnSec} onPress={guardarBorrador} disabled={ocupado}>
            <Ionicons name="save-outline" size={18} color={T.text} />
            <Text style={styles.btnSecTxt}>Guardar borrador</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btnPrim} onPress={enviar} disabled={ocupado}>
            {ocupado ? (
              <ActivityIndicator color={T.white} />
            ) : (
              <>
                <Ionicons name="send" size={18} color={T.white} />
                <Text style={styles.btnPrimTxt}>Enviar</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
        {subiendo && <Text style={styles.nota}>Subiendo fotografías…</Text>}
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.bg },
  titulo: { color: T.text, fontSize: 24, fontWeight: "900" },
  sub: { color: T.textDim, fontSize: 14, marginTop: 2 },

  label: { color: T.textDim, fontSize: 13, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4, marginTop: 20, marginBottom: 8 },
  input: { backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: UI.radiusSm, paddingHorizontal: 14, minHeight: 52, color: T.text, fontSize: 16 },
  textarea: { minHeight: 110, paddingTop: 14, textAlignVertical: "top" },

  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  chip: { borderWidth: 1, borderColor: T.border, borderRadius: 20, paddingVertical: 8, paddingHorizontal: 14, backgroundColor: T.surface },
  chipOn: { backgroundColor: T.accent, borderColor: T.accent },
  chipTxt: { color: T.textDim, fontWeight: "700", fontSize: 13 },
  chipTxtOn: { color: T.white },
  repChip: { borderWidth: 1, borderColor: T.border, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: T.surface, maxWidth: "100%" },
  repFolio: { color: T.accent, fontWeight: "800", fontSize: 13 },
  repSub: { color: T.textDim, fontSize: 12, marginTop: 2 },
  repNota: { color: T.accent, fontSize: 12, marginTop: 8 },

  gpsRow: { flexDirection: "row", gap: 10, alignItems: "center" },
  gpsBox: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: UI.radiusSm, paddingHorizontal: 14, height: 52 },
  gpsTxt: { color: T.text, fontSize: 15, fontWeight: "600" },
  gpsBtn: { width: 52, height: 52, borderRadius: UI.radiusSm, backgroundColor: T.accent, alignItems: "center", justifyContent: "center" },

  fotoBtns: { flexDirection: "row", gap: 10 },
  fotoBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: T.surface, borderWidth: 1, borderColor: T.accentDim, borderRadius: UI.radiusSm, height: 52 },
  fotoBtnTxt: { color: T.text, fontWeight: "700", fontSize: 15 },
  galeria: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 12 },
  thumbWrap: { position: "relative" },
  thumb: { width: 92, height: 92, borderRadius: UI.radiusSm, backgroundColor: T.surfaceHi },
  quitar: { position: "absolute", top: -6, right: -6, backgroundColor: T.danger, width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: T.bg },

  acciones: { flexDirection: "row", gap: 10, marginTop: 26 },
  btnSec: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1, borderColor: T.border, borderRadius: UI.radiusSm, height: 54 },
  btnSecTxt: { color: T.text, fontWeight: "700", fontSize: 15 },
  btnPrim: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: T.accent, borderRadius: UI.radiusSm, height: 54 },
  btnPrimTxt: { color: T.white, fontWeight: "800", fontSize: 16 },
  nota: { color: T.textMute, fontSize: 13, textAlign: "center", marginTop: 12 },
});
