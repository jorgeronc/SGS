import { useEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, ActivityIndicator, Image, Switch } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { decode } from "base64-arraybuffer";
import { supabase, BUCKET_FOTOS } from "../lib/supabase";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import UbicacionPicker from "../components/UbicacionPicker";
import FechaInput from "../components/FechaInput";
import BodycamBoton from "../components/BodycamBoton";
import { asociarBodycamActual } from "../lib/bodycamHd";
import { getMiOficialValido, getMiCrp } from "../lib/oficial";
import { getMiBodycam } from "../lib/bodycam";
import { T, UI } from "../theme";

interface Foto { base64: string; mime: string; uri: string; }

// Chips de un catálogo (cat_opciones). multi = varios seleccionables.
function Chips({ categoria, valor, onChange, multi }: { categoria: string; valor: string[]; onChange: (v: string[]) => void; multi?: boolean }) {
  const [opts, setOpts] = useState<string[]>([]);
  useEffect(() => {
    supabase.from("cat_opciones").select("valor").eq("categoria", categoria).eq("activo", true).order("orden")
      .then(({ data }) => setOpts(((data as any[]) ?? []).map((o) => o.valor)));
  }, [categoria]);
  return (
    <View style={styles.chips}>
      {opts.map((o) => {
        const on = valor.includes(o);
        return (
          <TouchableOpacity key={o} style={[styles.chip, on && styles.chipOn]} onPress={() => {
            if (multi) onChange(on ? valor.filter((x) => x !== o) : [...valor, o]);
            else onChange(on ? [] : [o]);
          }}>
            <Text style={[styles.chipTxt, on && styles.chipTxtOn]}>{o}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

async function elegirFoto(desde: "camara" | "galeria"): Promise<Foto | null> {
  const perm = desde === "camara" ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) { Alert.alert("Permiso", `Se requiere permiso de ${desde === "camara" ? "cámara" : "galería"}.`); return null; }
  const res = desde === "camara"
    ? await ImagePicker.launchCameraAsync({ quality: 0.6, base64: true })
    : await ImagePicker.launchImageLibraryAsync({ quality: 0.6, base64: true, mediaTypes: ["images"] });
  if (res.canceled) return null;
  const a = res.assets[0];
  return a.base64 ? { base64: a.base64, mime: a.mimeType ?? "image/jpeg", uri: a.uri } : null;
}

async function subirFoto(tabla: string, id: string, foto: Foto): Promise<string | null> {
  const ext = foto.mime.includes("png") ? "png" : "jpg";
  const path = `${tabla}/${id}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET_FOTOS).upload(path, decode(foto.base64), { contentType: foto.mime });
  return error ? null : path;
}

export default function AbordamientoScreen() {
  const nav = useNavigation<any>();
  const [tipoServicio, setTipoServicio] = useState("rutina");
  const [folioOperativo, setFolioOperativo] = useState("");
  const [crp, setCrp] = useState("");
  const [bodycam, setBodycam] = useState("");
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [direccion, setDireccion] = useState("");
  const [colonia, setColonia] = useState("");
  const [municipio, setMunicipio] = useState("");
  const [estado, setEstado] = useState("");
  const [motivos, setMotivos] = useState<string[]>([]);
  const [resultado, setResultado] = useState<string[]>([]);
  const [observaciones, setObservaciones] = useState("");
  // Persona
  const [pNombre, setPNombre] = useState("");
  const [pApP, setPApP] = useState("");
  const [pApM, setPApM] = useState("");
  const [pSexo, setPSexo] = useState<string[]>([]);
  const [pCurp, setPCurp] = useState("");
  const [pNac, setPNac] = useState("");
  const [pOriginario, setPOriginario] = useState("");
  const [pOcupacion, setPOcupacion] = useState("");
  const [pEstadoCivil, setPEstadoCivil] = useState<string[]>([]);
  const [pEscolaridad, setPEscolaridad] = useState<string[]>([]);
  const [pFoto, setPFoto] = useState<Foto | null>(null);
  // Vehículo
  const [vPlacas, setVPlacas] = useState("");
  const [vMarca, setVMarca] = useState("");
  const [vAnio, setVAnio] = useState("");
  const [vColor, setVColor] = useState("");
  const [vVin, setVVin] = useState("");
  const [vTarjeta, setVTarjeta] = useState("");
  const [vDescripcion, setVDescripcion] = useState("");
  const [vEstado, setVEstado] = useState("");
  const [vSeguro, setVSeguro] = useState(false);
  const [vFoto, setVFoto] = useState<Foto | null>(null);
  const [guardando, setGuardando] = useState(false);

  // Hereda CRP y bodycam del elemento (Perfil).
  useEffect(() => {
    (async () => {
      const c = await getMiCrp(); if (c) setCrp(c);
      const b = await getMiBodycam(); if (b?.folio) setBodycam(b.folio);
    })();
  }, []);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      try {
        const pos = await Location.getCurrentPositionAsync({});
        setLat(Number(pos.coords.latitude.toFixed(6)));
        setLng(Number(pos.coords.longitude.toFixed(6)));
      } catch { /* sin ubicación */ }
    })();
  }, []);

  async function guardar() {
    if (motivos.length === 0 && !pNombre.trim() && !vPlacas.trim() && !vMarca.trim()) {
      Alert.alert("Falta información", "Indica al menos el motivo o los datos de la persona/vehículo.");
      return;
    }
    setGuardando(true);
    try {
      let personaId: string | null = null;
      if (pNombre.trim()) {
        const { data, error } = await supabase.from("personas").insert({
          nombre: pNombre.trim(), apellido_paterno: pApP.trim() || null, apellido_materno: pApM.trim() || null,
          sexo: pSexo[0] || null, curp: pCurp.trim() || null, fecha_nacimiento: pNac.trim() || null,
          datos_adicionales: { originario: pOriginario || null, ocupacion: pOcupacion || null, estado_civil: pEstadoCivil[0] || null, escolaridad: pEscolaridad[0] || null },
        }).select("id").single();
        if (error) throw error;
        personaId = data.id;
        if (pFoto) { const r = await subirFoto("personas", personaId, pFoto); if (r) await supabase.from("personas").update({ fotografias: [r] }).eq("id", personaId); }
      }
      let vehiculoId: string | null = null;
      if (vPlacas.trim() || vMarca.trim()) {
        const { data, error } = await supabase.from("vehiculos").insert({
          placas: vPlacas.trim() || null, marca: vMarca.trim() || null, anio: vAnio ? Number(vAnio) : null, color: vColor.trim() || null,
          vin: vVin.trim() || null,
          datos_adicionales: { descripcion: vDescripcion || null, estado: vEstado || null, seguro_vigente: vSeguro, tarjeta_circulacion: vTarjeta.trim() || null },
        }).select("id").single();
        if (error) throw error;
        vehiculoId = data.id;
        if (vFoto) { const r = await subirFoto("vehiculos", vehiculoId, vFoto); if (r) await supabase.from("vehiculos").update({ fotografias: [r] }).eq("id", vehiculoId); }
      }
      const oficial = await getMiOficialValido();
      const { data: ab, error: eAb } = await supabase.from("abordamientos").insert({
        tipo_servicio: tipoServicio, folio_operativo: folioOperativo || null, crp: crp || null, bodycam: bodycam || null,
        oficial_personal_id: oficial?.personalId ?? null,
        motivo: motivos.join(", ") || null, direccion: direccion || null, colonia: colonia || null, latitud: lat, longitud: lng,
        resultado: resultado[0] || null, observaciones: observaciones || null, persona_id: personaId, vehiculo_id: vehiculoId,
      }).select("id, folio").single();
      if (eAb) throw eAb;
      // Si hay una grabación de bodycam en curso, liga sus segmentos a este folio.
      await asociarBodycamActual({ tipo: "abordamiento", id: ab.id as string, folio: ab.folio ?? null });
      Alert.alert("Abordamiento registrado", `Folio ${ab.folio ?? "asignado"}. Enviado al Sistema Central Policial.`, [
        { text: "OK", onPress: () => nav.goBack() },
      ]);
    } catch (e: any) {
      Alert.alert("Error", e.message ?? String(e));
    } finally {
      setGuardando(false);
    }
  }

  const FotoBtn = ({ foto, set, label }: { foto: Foto | null; set: (f: Foto | null) => void; label: string }) => (
    <View style={styles.fotoRow}>
      <TouchableOpacity style={styles.fotoBtn} onPress={async () => { const f = await elegirFoto("camara"); if (f) set(f); }}>
        <Ionicons name="camera" size={16} color={T.accent} /><Text style={styles.fotoBtnTxt}>{label}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.fotoBtn} onPress={async () => { const f = await elegirFoto("galeria"); if (f) set(f); }}>
        <Ionicons name="images" size={16} color={T.accent} /><Text style={styles.fotoBtnTxt}>Galería</Text>
      </TouchableOpacity>
      {foto && <Image source={{ uri: foto.uri }} style={styles.thumb} />}
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <KeyboardAwareScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled" bottomOffset={24}>
        <Text style={styles.titulo}>Nuevo abordamiento</Text>
        <Text style={styles.sub}>Persona/vehículo en circunstancias sospechosas</Text>

        <BodycamBoton style={{ marginTop: 12 }} />
        <Text style={styles.bodycamHint}>Actívala al iniciar el abordamiento; al registrar, el video quedará ligado a este folio.</Text>

        <Text style={styles.label}>Servicio</Text>
        <View style={styles.chips}>
          {["rutina", "operativo"].map((s) => (
            <TouchableOpacity key={s} style={[styles.chip, tipoServicio === s && styles.chipOn]} onPress={() => setTipoServicio(s)}>
              <Text style={[styles.chipTxt, tipoServicio === s && styles.chipTxtOn]}>{s === "rutina" ? "Rutina" : "Operativo"}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {tipoServicio === "operativo" && <TextInput style={styles.input} placeholder="Folio del operativo" placeholderTextColor={T.textMute} value={folioOperativo} onChangeText={setFolioOperativo} />}

        <Text style={styles.label}>Oficial</Text>
        <TextInput style={styles.input} placeholder="CRP" placeholderTextColor={T.textMute} value={crp} onChangeText={setCrp} />
        <TextInput style={styles.input} placeholder="Bodycam" placeholderTextColor={T.textMute} value={bodycam} onChangeText={setBodycam} />

        <Text style={styles.label}>Ubicación</Text>
        <UbicacionPicker
          valor={{ lat, lng, direccion, colonia, municipio, estado }}
          onChange={(v) => { setLat(v.lat); setLng(v.lng); setDireccion(v.direccion); setColonia(v.colonia); setMunicipio(v.municipio); setEstado(v.estado); }}
        />

        <Text style={styles.label}>Motivo</Text>
        <Chips categoria="motivo_abordamiento" valor={motivos} onChange={setMotivos} multi />

        <Text style={styles.seccion}>Datos de la persona</Text>
        <TextInput style={styles.input} placeholder="Nombre(s)" placeholderTextColor={T.textMute} value={pNombre} onChangeText={setPNombre} />
        <TextInput style={styles.input} placeholder="Apellido paterno" placeholderTextColor={T.textMute} value={pApP} onChangeText={setPApP} />
        <TextInput style={styles.input} placeholder="Apellido materno" placeholderTextColor={T.textMute} value={pApM} onChangeText={setPApM} />
        <TextInput style={styles.input} placeholder="CURP" placeholderTextColor={T.textMute} autoCapitalize="characters" value={pCurp} onChangeText={setPCurp} />
        <Text style={styles.label}>Sexo</Text>
        <Chips categoria="sexo" valor={pSexo} onChange={setPSexo} />
        <Text style={styles.label}>Fecha de nacimiento</Text>
        <FechaInput value={pNac} onChange={setPNac} placeholder="Fecha de nacimiento" />
        <TextInput style={styles.input} placeholder="Originario de" placeholderTextColor={T.textMute} value={pOriginario} onChangeText={setPOriginario} />
        <TextInput style={styles.input} placeholder="Ocupación" placeholderTextColor={T.textMute} value={pOcupacion} onChangeText={setPOcupacion} />
        <Text style={styles.label}>Estado civil</Text>
        <Chips categoria="estado_civil" valor={pEstadoCivil} onChange={setPEstadoCivil} />
        <Text style={styles.label}>Escolaridad</Text>
        <Chips categoria="escolaridad" valor={pEscolaridad} onChange={setPEscolaridad} />
        <FotoBtn foto={pFoto} set={setPFoto} label="Foto persona" />

        <Text style={styles.seccion}>Datos del vehículo</Text>
        <TextInput style={styles.input} placeholder="Placas" placeholderTextColor={T.textMute} autoCapitalize="characters" value={vPlacas} onChangeText={setVPlacas} />
        <TextInput style={styles.input} placeholder="Marca" placeholderTextColor={T.textMute} value={vMarca} onChangeText={setVMarca} />
        <TextInput style={styles.input} placeholder="Año" placeholderTextColor={T.textMute} keyboardType="number-pad" value={vAnio} onChangeText={setVAnio} />
        <TextInput style={styles.input} placeholder="Color" placeholderTextColor={T.textMute} value={vColor} onChangeText={setVColor} />
        <TextInput style={styles.input} placeholder="VIN (Serie)" placeholderTextColor={T.textMute} autoCapitalize="characters" value={vVin} onChangeText={setVVin} />
        <TextInput style={styles.input} placeholder="Tarjeta de circulación (folio/número)" placeholderTextColor={T.textMute} value={vTarjeta} onChangeText={setVTarjeta} />
        <TextInput style={styles.input} placeholder="Descripción vehicular" placeholderTextColor={T.textMute} value={vDescripcion} onChangeText={setVDescripcion} />
        <TextInput style={styles.input} placeholder="Estado (nuevo/usado…)" placeholderTextColor={T.textMute} value={vEstado} onChangeText={setVEstado} />
        <View style={styles.switchRow}>
          <Text style={styles.switchTxt}>Seguro vigente</Text>
          <Switch value={vSeguro} onValueChange={setVSeguro} trackColor={{ true: T.accent }} />
        </View>
        <FotoBtn foto={vFoto} set={setVFoto} label="Foto vehículo" />

        <Text style={styles.seccion}>Resultado</Text>
        <Chips categoria="resultado_abordamiento" valor={resultado} onChange={setResultado} />
        <TextInput style={[styles.input, styles.textarea]} placeholder="Observaciones" placeholderTextColor={T.textMute} value={observaciones} onChangeText={setObservaciones} multiline />

        <TouchableOpacity style={styles.guardar} onPress={guardar} disabled={guardando}>
          {guardando ? <ActivityIndicator color={T.white} /> : (<><Ionicons name="send" size={18} color={T.white} /><Text style={styles.guardarTxt}>Registrar abordamiento</Text></>)}
        </TouchableOpacity>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.bg },
  titulo: { color: T.text, fontSize: 24, fontWeight: "900" },
  sub: { color: T.textDim, fontSize: 14, marginTop: 2 },
  bodycamHint: { color: T.textMute, fontSize: 11.5, marginTop: 6, lineHeight: 15 },
  seccion: { color: T.accent, fontSize: 14, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.4, marginTop: 24, marginBottom: 6 },
  label: { color: T.textDim, fontSize: 13, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4, marginTop: 16, marginBottom: 8 },
  dim: { color: T.textMute, fontSize: 13, marginBottom: 8 },
  input: { backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: UI.radiusSm, paddingHorizontal: 14, minHeight: 50, color: T.text, fontSize: 16, marginBottom: 8 },
  textarea: { minHeight: 90, paddingTop: 12, textAlignVertical: "top" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1, borderColor: T.border, borderRadius: 18, paddingVertical: 8, paddingHorizontal: 13, backgroundColor: T.surface },
  chipOn: { backgroundColor: T.accent, borderColor: T.accent },
  chipTxt: { color: T.textDim, fontWeight: "600", fontSize: 13 },
  chipTxtOn: { color: T.white },
  fotoRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10 },
  fotoBtn: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: T.accentDim, borderRadius: UI.radiusSm, paddingVertical: 10, paddingHorizontal: 14 },
  fotoBtnTxt: { color: T.text, fontWeight: "700", fontSize: 14 },
  thumb: { width: 46, height: 46, borderRadius: 8, backgroundColor: T.surfaceHi },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8, paddingVertical: 4 },
  switchTxt: { color: T.text, fontSize: 15, fontWeight: "600" },
  guardar: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: T.accent, borderRadius: UI.radiusSm, height: 54, marginTop: 26 },
  guardarTxt: { color: T.white, fontWeight: "800", fontSize: 16 },
});
