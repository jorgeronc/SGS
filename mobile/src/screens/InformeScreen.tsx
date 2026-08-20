import { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { decode } from "base64-arraybuffer";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { supabase, BUCKET_FOTOS } from "../lib/supabase";
import { setAtencion, clearAtencion } from "../lib/atencion";
import Involucrados from "../components/Involucrados";
import Foto from "../components/Foto";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import type { RootStackParamList } from "../types";
import BodycamBoton from "../components/BodycamBoton";
import { getMiOficialValido } from "../lib/oficial";
import { getMiBodycam } from "../lib/bodycam";

type Props = NativeStackScreenProps<RootStackParamList, "Informe">;

const ESTADOS = ["abierto", "en_proceso", "cerrado"];

interface Novedad {
  id: number;
  texto: string;
  reportado_por: string | null;
  fecha: string;
}

export default function InformeScreen({ route, navigation }: Props) {
  const { llamada, incidenteId } = route.params;
  const [incId, setIncId] = useState<string | null>(null);
  const [evidencias, setEvidencias] = useState<{ id: string; folio: string | null; tipo: string | null }[]>([]);
  const [folio, setFolio] = useState<string | null>(null);
  const [estado, setEstado] = useState("abierto");
  const [narrativa, setNarrativa] = useState("");
  const [fotos, setFotos] = useState<string[]>([]);
  const [encabezado, setEncabezado] = useState(""); // tipo · dirección para el subtítulo
  const [novedades, setNovedades] = useState<Novedad[]>([]);
  const [nuevaNovedad, setNuevaNovedad] = useState("");
  const [cargando, setCargando] = useState(true);
  const [subiendo, setSubiendo] = useState(false);

  function aplicar(inc: any) {
    setIncId(inc.id);
    setFolio(inc.folio);
    setEstado(inc.estado);
    setNarrativa(inc.narrativa ?? "");
    setFotos((inc.fotografias as string[]) ?? []);
    setEncabezado(`${inc.tipo ?? "—"} · ${inc.direccion ?? "sin dirección"}`);
    // Marca este incidente como la "atención actual" (lo usa el botón de pánico).
    if (inc.estado !== "cerrado") setAtencion({ incidenteId: inc.id, folio: inc.folio });
  }

  // Abre por incidente existente (continuar editando) o busca/crea el de la llamada.
  useEffect(() => {
    (async () => {
      let inc: any = null;
      if (incidenteId) {
        const { data } = await supabase.from("incidentes").select("*").eq("id", incidenteId).maybeSingle();
        inc = data;
      } else if (llamada) {
        const { data: existente } = await supabase
          .from("incidentes").select("*").eq("llamada_cad_id", llamada.id)
          .order("creado_en", { ascending: false }).limit(1).maybeSingle();
        inc = existente;
        if (!inc) {
          const [oficial, bc] = await Promise.all([getMiOficialValido(), getMiBodycam()]);
          const { data: creado, error } = await supabase
            .from("incidentes")
            .insert({ llamada_cad_id: llamada.id, tipo: llamada.tipo, direccion: llamada.direccion, latitud: llamada.latitud, longitud: llamada.longitud, oficial_personal_id: oficial?.personalId ?? null, bodycam: bc?.folio ?? null })
            .select("*").single();
          if (error) { Alert.alert("Error", error.message); setCargando(false); return; }
          inc = creado;
        }
      }
      if (!inc) { Alert.alert("Error", "No se encontró el incidente."); setCargando(false); return; }
      aplicar(inc);
      await cargarNovedades(inc.id);
      await cargarEvidencias(inc.id);
      setCargando(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recarga las evidencias al volver de la pantalla de captura.
  useEffect(() => {
    const unsub = navigation.addListener("focus", () => { if (incId) cargarEvidencias(incId); });
    return unsub;
  }, [navigation, incId]);

  async function cargarEvidencias(id: string) {
    const { data: vin } = await supabase
      .from("vinculos")
      .select("entidad_destino_id")
      .eq("entidad_origen_tipo", "incidente").eq("entidad_origen_id", id)
      .eq("entidad_destino_tipo", "evidencia").eq("estatus", "activo");
    const ids = ((vin as any[]) ?? []).map((v) => v.entidad_destino_id);
    if (!ids.length) { setEvidencias([]); return; }
    const { data: evs } = await supabase.from("evidencias").select("id, folio, tipo").in("id", ids);
    setEvidencias((evs as any[]) ?? []);
  }

  async function cargarNovedades(id: string) {
    const { data } = await supabase
      .from("novedades")
      .select("*")
      .eq("incidente_id", id)
      .order("fecha", { ascending: true });
    setNovedades((data as any) ?? []);
  }

  async function guardarNarrativa() {
    if (!incId) return;
    const { error } = await supabase
      .from("incidentes")
      .update({ narrativa, actualizado_en: new Date().toISOString() })
      .eq("id", incId);
    if (error) Alert.alert("Error", error.message);
    else Alert.alert("Listo", "Narrativa guardada.");
  }

  async function cambiarEstado(nuevo: string) {
    if (!incId) return;
    const { error } = await supabase
      .from("incidentes")
      .update({ estado: nuevo, actualizado_en: new Date().toISOString() })
      .eq("id", incId);
    if (error) Alert.alert("Error", error.message);
    else {
      setEstado(nuevo);
      // Al cerrar el incidente deja de ser la "atención actual".
      if (nuevo === "cerrado") clearAtencion();
      else if (incId) setAtencion({ incidenteId: incId, folio });
    }
  }

  async function agregarNovedad() {
    if (!incId || !nuevaNovedad.trim()) return;
    const { error } = await supabase
      .from("novedades")
      .insert({ incidente_id: incId, texto: nuevaNovedad });
    if (error) {
      Alert.alert("Error", error.message);
      return;
    }
    setNuevaNovedad("");
    cargarNovedades(incId);
  }

  async function subirFoto(base64?: string | null, mime?: string | null) {
    if (!incId || !base64) {
      Alert.alert("Error", "No se pudo leer la imagen.");
      return;
    }
    setSubiendo(true);
    try {
      const ext = mime && mime.includes("png") ? "png" : "jpg";
      const path = `incidentes/${incId}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from(BUCKET_FOTOS)
        .upload(path, decode(base64), { contentType: mime ?? "image/jpeg" });
      if (error) throw error;
      const nuevas = [...fotos, path];
      await supabase
        .from("incidentes")
        .update({ fotografias: nuevas, actualizado_en: new Date().toISOString() })
        .eq("id", incId);
      setFotos(nuevas);
    } catch (e: any) {
      Alert.alert("Error al subir", e.message ?? String(e));
    } finally {
      setSubiendo(false);
    }
  }

  async function tomarFoto() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permiso", "Se requiere permiso de cámara.");
      return;
    }
    // base64:true → el asset trae el contenido listo para subir (sin expo-file-system).
    const res = await ImagePicker.launchCameraAsync({ quality: 0.6, base64: true });
    if (!res.canceled) subirFoto(res.assets[0].base64, res.assets[0].mimeType);
  }

  async function elegirGaleria() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permiso", "Se requiere permiso de galería.");
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      quality: 0.6,
      base64: true,
      mediaTypes: ["images"],
    });
    if (!res.canceled) subirFoto(res.assets[0].base64, res.assets[0].mimeType);
  }

  if (cargando) {
    return (
      <View style={styles.centro}>
        <ActivityIndicator size="large" color="#0b3d66" />
      </View>
    );
  }

  return (
    <KeyboardAwareScrollView style={[styles.contenedor, { backgroundColor: "#f4f6f8" }]} keyboardShouldPersistTaps="handled" bottomOffset={24}>
      <Text style={styles.folio}>{folio ?? "Informe"}</Text>
      <Text style={styles.sub}>{encabezado || "Incidente"}</Text>

      {incId && (
        <BodycamBoton origen={{ tipo: "incidente", id: incId, folio }} style={{ marginTop: 12 }} />
      )}

      <Text style={styles.seccion}>Estado</Text>
      <View style={styles.estados}>
        {ESTADOS.map((e) => (
          <TouchableOpacity
            key={e}
            style={[styles.chip, estado === e && styles.chipActivo]}
            onPress={() => cambiarEstado(e)}
          >
            <Text style={[styles.chipTexto, estado === e && styles.chipTextoActivo]}>{e}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.seccion}>Narrativa</Text>
      <TextInput
        style={styles.textarea}
        multiline
        placeholder="Descripción de los hechos"
        value={narrativa}
        onChangeText={setNarrativa}
      />
      <TouchableOpacity style={styles.boton} onPress={guardarNarrativa}>
        <Text style={styles.botonTexto}>Guardar narrativa</Text>
      </TouchableOpacity>

      <Text style={styles.seccion}>Fotografías</Text>
      <View style={styles.filaBotones}>
        <TouchableOpacity style={styles.botonMitad} onPress={tomarFoto} disabled={subiendo}>
          <Text style={styles.botonTexto}>📷 Cámara</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.botonMitad} onPress={elegirGaleria} disabled={subiendo}>
          <Text style={styles.botonTexto}>🖼️ Galería</Text>
        </TouchableOpacity>
      </View>
      {subiendo && <Text style={styles.nota}>Subiendo foto...</Text>}
      <View style={styles.galeria}>
        {fotos.map((p) => (
          <Foto key={p} path={p} style={styles.foto} />
        ))}
        {fotos.length === 0 && <Text style={styles.nota}>Sin fotos todavía.</Text>}
      </View>

      <Text style={styles.seccion}>Involucrados</Text>
      {incId && <Involucrados incidenteId={incId} />}

      <Text style={styles.seccion}>Evidencias</Text>
      {evidencias.map((e) => (
        <View key={e.id} style={styles.novedad}>
          <Text style={styles.novedadFecha}>{e.folio ?? "s/folio"}</Text>
          <Text>{e.tipo ?? "Evidencia"}</Text>
        </View>
      ))}
      {evidencias.length === 0 && <Text style={styles.nota}>Sin evidencias.</Text>}
      <TouchableOpacity style={styles.boton} onPress={() => incId && navigation.navigate("Evidencia", { incidenteId: incId })}>
        <Text style={styles.botonTexto}>＋ Registrar evidencia</Text>
      </TouchableOpacity>

      <Text style={styles.seccion}>Novedades</Text>
      {novedades.map((n) => (
        <View key={n.id} style={styles.novedad}>
          <Text style={styles.novedadFecha}>{new Date(n.fecha).toLocaleString()}</Text>
          <Text>{n.texto}</Text>
        </View>
      ))}
      {novedades.length === 0 && <Text style={styles.nota}>Sin novedades.</Text>}
      <TextInput
        style={styles.input}
        placeholder="Nueva novedad"
        value={nuevaNovedad}
        onChangeText={setNuevaNovedad}
      />
      <TouchableOpacity style={styles.boton} onPress={agregarNovedad}>
        <Text style={styles.botonTexto}>Agregar novedad</Text>
      </TouchableOpacity>

      <View style={{ height: 32 }} />
    </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  contenedor: { flex: 1, backgroundColor: "#f4f6f8", padding: 16 },
  centro: { flex: 1, justifyContent: "center", alignItems: "center" },
  folio: { fontWeight: "800", color: "#0b3d66", fontSize: 18 },
  sub: { color: "#555", marginBottom: 8 },
  seccion: { fontWeight: "700", marginTop: 18, marginBottom: 8, color: "#0b3d66" },
  estados: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: "#0b3d66",
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 14,
    margin: 4,
  },
  chipActivo: { backgroundColor: "#0b3d66" },
  chipTexto: { color: "#0b3d66", fontWeight: "700" },
  chipTextoActivo: { color: "#fff" },
  textarea: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 12,
    minHeight: 90,
    textAlignVertical: "top",
  },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
  },
  boton: {
    backgroundColor: "#0b3d66",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 10,
  },
  botonMitad: {
    backgroundColor: "#0b3d66",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
    flex: 1,
  },
  filaBotones: { flexDirection: "row", gap: 12 },
  botonTexto: { color: "#fff", fontWeight: "700" },
  galeria: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  foto: { width: 100, height: 100, borderRadius: 6, margin: 4, backgroundColor: "#ddd" },
  novedad: {
    backgroundColor: "#fff",
    borderRadius: 6,
    padding: 10,
    marginBottom: 6,
    borderLeftWidth: 3,
    borderLeftColor: "#0b3d66",
  },
  novedadFecha: { fontSize: 11, color: "#888" },
  nota: { color: "#888", fontSize: 13 },
});
