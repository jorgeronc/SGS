import { useEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, ActivityIndicator, Image, Switch } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { decode } from "base64-arraybuffer";
import { supabase, BUCKET_FOTOS } from "../lib/supabase";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import Croquis from "../components/Croquis";
import UbicacionPicker from "../components/UbicacionPicker";
import FechaInput from "../components/FechaInput";
import BodycamBoton from "../components/BodycamBoton";
import { asociarBodycamActual } from "../lib/bodycamHd";
import { getMiOficialValido } from "../lib/oficial";
import { getMiBodycam } from "../lib/bodycam";
import { T, UI } from "../theme";

interface Foto { base64: string; mime: string; uri: string; }

interface VehiculoForm {
  placa: string;
  marca: string;
  modelo: string;
  color: string;
  anio: string;
  vin: string;
  tarjeta: string;         // tarjeta de circulación (folio/número)
  tipoVehiculo: string[];
  tipoServicio: string[];
  rol: string[];
  asegurado: boolean;
  compania: string;
  foto: Foto | null;      // foto del vehículo
  docs: Foto[];           // fotos de documentos del vehículo
  conductorNombre: string;
  conductorApP: string;
  conductorApM: string;
  conductorSexo: string[];
  conductorNac: string;    // fecha de nacimiento AAAA-MM-DD
  conductorCurp: string;
  conductorLicencia: string;    // folio/número de la licencia de conducir
  conductorFoto: Foto | null;   // foto de la persona (conductor)
  conductorDocs: Foto[];        // fotos de documentos del conductor
}

function vehiculoVacio(): VehiculoForm {
  return {
    placa: "", marca: "", modelo: "", color: "", anio: "", vin: "", tarjeta: "",
    tipoVehiculo: [], tipoServicio: [], rol: [], asegurado: false, compania: "",
    foto: null, docs: [],
    conductorNombre: "", conductorApP: "", conductorApM: "", conductorSexo: [], conductorNac: "",
    conductorCurp: "", conductorLicencia: "", conductorFoto: null, conductorDocs: [],
  };
}

const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const TOTALES = ["1", "2", "3", "4", "5", "6-10"];

// Chips de un catálogo (cat_opciones). multi=false → selección única.
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

// Selector Sí/No (radios de la imagen).
function SiNo({ valor, onChange }: { valor: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.chips}>
      {[{ k: true, t: "Sí" }, { k: false, t: "No" }].map((o) => (
        <TouchableOpacity key={o.t} style={[styles.chip, valor === o.k && styles.chipOn]} onPress={() => onChange(o.k)}>
          <Text style={[styles.chipTxt, valor === o.k && styles.chipTxtOn]}>{o.t}</Text>
        </TouchableOpacity>
      ))}
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

async function subirFoto(tabla: string, id: string, foto: { base64: string; mime: string }, sufijo = ""): Promise<string | null> {
  const ext = foto.mime.includes("png") ? "png" : "jpg";
  const path = `${tabla}/${id}/${Date.now()}${sufijo}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET_FOTOS).upload(path, decode(foto.base64), { contentType: foto.mime });
  return error ? null : path;
}

// Captura de varias fotos (p. ej. documentos del vehículo o de la persona).
function MultiFoto({ fotos, onAdd, onDel, label }: { fotos: Foto[]; onAdd: (f: Foto) => void; onDel: (i: number) => void; label: string }) {
  return (
    <View style={{ marginTop: 8 }}>
      <View style={styles.fotoRow}>
        <TouchableOpacity style={styles.fotoBtn} onPress={async () => { const f = await elegirFoto("camara"); if (f) onAdd(f); }}>
          <Ionicons name="camera" size={16} color={T.accent} /><Text style={styles.fotoBtnTxt}>{label}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.fotoBtn} onPress={async () => { const f = await elegirFoto("galeria"); if (f) onAdd(f); }}>
          <Ionicons name="images" size={16} color={T.accent} /><Text style={styles.fotoBtnTxt}>Galería</Text>
        </TouchableOpacity>
      </View>
      {fotos.length > 0 && (
        <View style={styles.galeria}>
          {fotos.map((f, i) => (
            <View key={i} style={styles.galItem}>
              <Image source={{ uri: f.uri }} style={styles.thumb} />
              <TouchableOpacity style={styles.galDel} onPress={() => onDel(i)}><Ionicons name="close-circle" size={18} color="#fff" /></TouchableOpacity>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

export default function AccidenteScreen() {
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const llamada = route.params?.llamada;

  const [tab, setTab] = useState<"generales" | "vehiculos" | "parte">("generales");
  const [guardando, setGuardando] = useState(false);

  // Generales
  const hoy = new Date();
  const [fecha, setFecha] = useState(hoy.toISOString().slice(0, 10));
  const [hora, setHora] = useState(hoy.toTimeString().slice(0, 5));
  const [bodycam, setBodycam] = useState("");
  const [tipoHecho, setTipoHecho] = useState<string[]>([]);
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [direccion, setDireccion] = useState(llamada?.direccion ?? "");
  const [entreCalles, setEntreCalles] = useState("");
  const [colonia, setColonia] = useState("");
  const [municipio, setMunicipio] = useState("");
  const [estadoUbic, setEstadoUbic] = useState("");
  const [sentido, setSentido] = useState<string[]>([]);
  const [tipoVia, setTipoVia] = useState<string[]>([]);
  const [pavimentada, setPavimentada] = useState(true);
  const [totalVeh, setTotalVeh] = useState("2");
  const [lesionados, setLesionados] = useState(false);
  const [fallecidos, setFallecidos] = useState(false);
  const [clima, setClima] = useState<string[]>([]);
  // Estatus controlado del informe: Atendiendo (default, en captura), Abierto
  // (guardado por el oficial), Cerrado (atención finalizada, requiere conclusión).
  const [estatus, setEstatus] = useState("Atendiendo");
  const [conclusion, setConclusion] = useState<string[]>([]);
  const [descripcion, setDescripcion] = useState("");

  // Vehículos / participantes
  const [vehiculos, setVehiculos] = useState<VehiculoForm[]>([vehiculoVacio(), vehiculoVacio()]);

  // Parte
  const [croquis, setCroquis] = useState<string>("");   // dataURL PNG
  const [fotosParte, setFotosParte] = useState<Foto[]>([]);

  // Lugar (GPS / mapa)

  const dia = (() => { try { return DIAS[new Date(fecha + "T00:00:00").getDay()]; } catch { return ""; } })();

  // Hereda la bodycam del elemento (Perfil).
  useEffect(() => { getMiBodycam().then((b) => { if (b?.folio) setBodycam(b.folio); }); }, []);

  useEffect(() => {
    if (llamada?.latitud != null && llamada?.longitud != null) {
      setLat(Number(llamada.latitud)); setLng(Number(llamada.longitud)); return;
    }
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

  function setVeh(i: number, patch: Partial<VehiculoForm>) {
    setVehiculos((prev) => prev.map((v, k) => (k === i ? { ...v, ...patch } : v)));
  }

  async function guardar() {
    if (tipoHecho.length === 0 && !direccion.trim()) {
      Alert.alert("Falta información", "Indica al menos el tipo de hecho o el lugar del accidente.");
      return;
    }
    if (estatus === "Cerrado" && !conclusion[0]) {
      Alert.alert("Conclusión requerida", "Para cerrar el informe elige una conclusión.");
      return;
    }
    setGuardando(true);
    try {
      // 1) Accidente (generales)
      const oficial = await getMiOficialValido();
      const { data: acc, error: eAcc } = await supabase.from("accidentes").insert({
        llamada_id: llamada?.id ?? null,
        oficial_personal_id: oficial?.personalId ?? null,
        fecha: fecha || null, hora: hora || null, dia,
        bodycam: bodycam || null, tipo_hecho: tipoHecho[0] || null,
        latitud: lat, longitud: lng, direccion: direccion || null,
        sentido_circulacion: sentido[0] || null, entre_calles: entreCalles || null,
        tipo_via: tipoVia[0] || null, pavimentada, total_vehiculos: totalVeh,
        lesionados, fallecidos, condicion_clima: clima[0] || null,
        estatus_atencion: estatus, conclusion: conclusion[0] || null, descripcion: descripcion || null,
      }).select("id, folio").single();
      if (eAcc) throw eAcc;
      const accId = acc.id as string;
      // Liga la grabación de bodycam en curso (si la hay) a este folio de accidente.
      await asociarBodycamActual({ tipo: "accidente", id: accId, folio: acc.folio ?? null });

      // 2) Croquis + fotos del parte
      if (croquis.startsWith("data:")) {
        const base64 = croquis.split(",")[1] ?? "";
        if (base64) { const r = await subirFoto("accidentes", accId, { base64, mime: "image/png" }, "-croquis"); if (r) await supabase.from("accidentes").update({ croquis: r }).eq("id", accId); }
      }
      if (fotosParte.length) {
        const rutas: string[] = [];
        for (const f of fotosParte) { const r = await subirFoto("accidentes", accId, f); if (r) rutas.push(r); }
        if (rutas.length) await supabase.from("accidentes").update({ fotografias: rutas }).eq("id", accId);
      }

      // 3) Vehículos participantes (a maestros + tabla hija)
      let orden = 0;
      for (const v of vehiculos) {
        orden += 1;
        const tieneVeh = v.placa.trim() || v.tipoVehiculo.length || v.conductorNombre.trim();
        if (!tieneVeh) continue;

        // Vehículo → tabla maestra Vehiculos (con foto + fotos de documentos).
        const { data: vd, error: ev } = await supabase.from("vehiculos").insert({
          placas: v.placa.trim() || null,
          marca: v.marca.trim() || null, modelo: v.modelo.trim() || null,
          color: v.color.trim() || null, anio: v.anio.trim() ? Number(v.anio) : null,
          vin: v.vin.trim() || null,
          datos_adicionales: { tipo_vehiculo: v.tipoVehiculo[0] || null, tipo_servicio: v.tipoServicio[0] || null, asegurado: v.asegurado, compania: v.compania || null, tarjeta_circulacion: v.tarjeta.trim() || null },
        }).select("id").single();
        if (ev) throw ev;
        const vehiculoId = vd.id as string;
        const rutasVeh: string[] = [];
        if (v.foto) { const r = await subirFoto("vehiculos", vehiculoId, v.foto); if (r) rutasVeh.push(r); }
        for (const d of v.docs) { const r = await subirFoto("vehiculos", vehiculoId, d, "-doc"); if (r) rutasVeh.push(r); }
        if (rutasVeh.length) await supabase.from("vehiculos").update({ fotografias: rutasVeh }).eq("id", vehiculoId);
        const fotoRuta: string | null = rutasVeh[0] ?? null;

        // Conductor → tabla maestra Personas (con foto + fotos de documentos).
        let conductorId: string | null = null;
        if (v.conductorNombre.trim()) {
          const { data: pd, error: ep } = await supabase.from("personas").insert({
            nombre: v.conductorNombre.trim(),
            apellido_paterno: v.conductorApP.trim() || null,
            apellido_materno: v.conductorApM.trim() || null,
            sexo: v.conductorSexo[0] || null,
            fecha_nacimiento: v.conductorNac || null,
            curp: v.conductorCurp.trim() || null,
          }).select("id").single();
          if (ep) throw ep;
          conductorId = pd.id;
          const rutasP: string[] = [];
          if (v.conductorFoto) { const r = await subirFoto("personas", conductorId, v.conductorFoto); if (r) rutasP.push(r); }
          for (const d of v.conductorDocs) { const r = await subirFoto("personas", conductorId, d, "-doc"); if (r) rutasP.push(r); }
          if (rutasP.length) await supabase.from("personas").update({ fotografias: rutasP }).eq("id", conductorId);
        }

        const { error: eav } = await supabase.from("accidente_vehiculos").insert({
          accidente_id: accId, orden, vehiculo_id: vehiculoId, conductor_persona_id: conductorId,
          placa: v.placa.trim() || null, tipo_vehiculo: v.tipoVehiculo[0] || null,
          tipo_servicio: v.tipoServicio[0] || null, rol: v.rol[0] || null,
          licencia_conducir: v.conductorLicencia.trim() || null,
          asegurado: v.asegurado, compania: v.compania || null, foto: fotoRuta,
        });
        if (eav) throw eav;
      }

      Alert.alert("Accidente registrado", `Folio ${acc.folio ?? "asignado"}. Enviado al Sistema Central Policial.`, [
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
      <View style={styles.tabbar}>
        {([["generales", "Generales"], ["vehiculos", "Vehículos"], ["parte", "Parte"]] as const).map(([k, t]) => (
          <TouchableOpacity key={k} style={[styles.tab, tab === k && styles.tabOn]} onPress={() => setTab(k)}>
            <Text style={[styles.tabTxt, tab === k && styles.tabTxtOn]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>
        <KeyboardAwareScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled" bottomOffset={24}>
          {llamada?.folio && <Text style={styles.dim}>Desde reporte {llamada.folio}</Text>}

          <BodycamBoton style={{ marginBottom: 6 }} />
          <Text style={styles.bodycamHint}>Actívala al llegar al accidente; al registrar, el video quedará ligado a este folio.</Text>

          {tab === "generales" && (
            <>
              <Text style={styles.titulo}>Informe de accidente</Text>
              <View style={styles.dosCol}>
                <View style={styles.col}><Text style={styles.label}>Fecha</Text>
                  <TextInput style={styles.input} placeholder="AAAA-MM-DD" placeholderTextColor={T.textMute} value={fecha} onChangeText={setFecha} /></View>
                <View style={styles.col}><Text style={styles.label}>Hora</Text>
                  <TextInput style={styles.input} placeholder="HH:MM" placeholderTextColor={T.textMute} value={hora} onChangeText={setHora} /></View>
              </View>
              <Text style={styles.dim}>Día: {dia || "—"}</Text>

              <TextInput style={styles.input} placeholder="Bodycam" placeholderTextColor={T.textMute} value={bodycam} onChangeText={setBodycam} />

              <Text style={styles.label}>Tipo de hecho de tránsito</Text>
              <Chips categoria="tipo_hecho_transito" valor={tipoHecho} onChange={setTipoHecho} />

              <Text style={styles.label}>Lugar del accidente</Text>
              <UbicacionPicker
                valor={{ lat, lng, direccion, colonia, municipio, estado: estadoUbic }}
                onChange={(v) => { setLat(v.lat); setLng(v.lng); setDireccion(v.direccion); setColonia(v.colonia); setMunicipio(v.municipio); setEstadoUbic(v.estado); }}
              />
              <TextInput style={styles.input} placeholder="Entre calles" placeholderTextColor={T.textMute} value={entreCalles} onChangeText={setEntreCalles} />

              <Text style={styles.label}>Sentido de circulación</Text>
              <Chips categoria="sentido_circulacion" valor={sentido} onChange={setSentido} />
              <Text style={styles.label}>Tipo de vía</Text>
              <Chips categoria="tipo_via" valor={tipoVia} onChange={setTipoVia} />
              <Text style={styles.label}>Pavimentada</Text>
              <SiNo valor={pavimentada} onChange={setPavimentada} />

              <Text style={styles.label}>Total de vehículos</Text>
              <View style={styles.chips}>
                {TOTALES.map((t) => (
                  <TouchableOpacity key={t} style={[styles.chip, totalVeh === t && styles.chipOn]} onPress={() => setTotalVeh(t)}>
                    <Text style={[styles.chipTxt, totalVeh === t && styles.chipTxtOn]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.dosCol}>
                <View style={styles.col}>
                  <Text style={styles.label}>Lesionados</Text>
                  <SiNo valor={lesionados} onChange={setLesionados} />
                </View>
                <View style={styles.col}>
                  <Text style={styles.label}>Fallecidos</Text>
                  <SiNo valor={fallecidos} onChange={setFallecidos} />
                </View>
              </View>

              <Text style={styles.label}>Condición del clima</Text>
              <Chips categoria="condicion_clima" valor={clima} onChange={setClima} />

              <Text style={styles.label}>Estatus</Text>
              <View style={styles.chips}>
                {["Atendiendo", "Abierto", "Cerrado"].map((e) => (
                  <TouchableOpacity key={e} style={[styles.chip, estatus === e && styles.chipOn]} onPress={() => setEstatus(e)}>
                    <Text style={[styles.chipTxt, estatus === e && styles.chipTxtOn]}>{e}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {estatus === "Cerrado" && (
                <>
                  <Text style={styles.label}>Conclusión</Text>
                  <Chips categoria="conclusion_accidente" valor={conclusion} onChange={setConclusion} />
                </>
              )}

              <TextInput style={[styles.input, styles.textarea]} placeholder="Descripción / hechos" placeholderTextColor={T.textMute} value={descripcion} onChangeText={setDescripcion} multiline />
            </>
          )}

          {tab === "vehiculos" && (
            <>
              <Text style={styles.titulo}>Vehículos participantes</Text>
              {vehiculos.map((v, i) => (
                <View key={i} style={styles.vehCard}>
                  <View style={styles.vehHead}>
                    <Text style={styles.vehTitulo}>Vehículo {i + 1}</Text>
                    {vehiculos.length > 1 && (
                      <TouchableOpacity onPress={() => setVehiculos((prev) => prev.filter((_, k) => k !== i))}>
                        <Ionicons name="close-circle" size={22} color={T.textMute} />
                      </TouchableOpacity>
                    )}
                  </View>
                  <TextInput style={styles.input} placeholder="Placa" placeholderTextColor={T.textMute} autoCapitalize="characters" value={v.placa} onChangeText={(t) => setVeh(i, { placa: t })} />
                  <View style={styles.dosCol}>
                    <View style={styles.col}><TextInput style={styles.input} placeholder="Marca" placeholderTextColor={T.textMute} value={v.marca} onChangeText={(t) => setVeh(i, { marca: t })} /></View>
                    <View style={styles.col}><TextInput style={styles.input} placeholder="Modelo" placeholderTextColor={T.textMute} value={v.modelo} onChangeText={(t) => setVeh(i, { modelo: t })} /></View>
                  </View>
                  <View style={styles.dosCol}>
                    <View style={styles.col}><TextInput style={styles.input} placeholder="Color" placeholderTextColor={T.textMute} value={v.color} onChangeText={(t) => setVeh(i, { color: t })} /></View>
                    <View style={styles.col}><TextInput style={styles.input} placeholder="Año" placeholderTextColor={T.textMute} keyboardType="number-pad" value={v.anio} onChangeText={(t) => setVeh(i, { anio: t })} /></View>
                  </View>
                  <TextInput style={styles.input} placeholder="VIN (Serie)" placeholderTextColor={T.textMute} autoCapitalize="characters" value={v.vin} onChangeText={(t) => setVeh(i, { vin: t })} />
                  <TextInput style={styles.input} placeholder="Tarjeta de circulación (folio/número)" placeholderTextColor={T.textMute} value={v.tarjeta} onChangeText={(t) => setVeh(i, { tarjeta: t })} />
                  <Text style={styles.label}>Tipo de vehículo</Text>
                  <Chips categoria="tipo_vehiculo_accidente" valor={v.tipoVehiculo} onChange={(x) => setVeh(i, { tipoVehiculo: x })} />
                  <Text style={styles.label}>Tipo de servicio</Text>
                  <Chips categoria="tipo_servicio_vehiculo" valor={v.tipoServicio} onChange={(x) => setVeh(i, { tipoServicio: x })} />
                  <Text style={styles.label}>Rol en el accidente</Text>
                  <Chips categoria="rol_participante_accidente" valor={v.rol} onChange={(x) => setVeh(i, { rol: x })} />
                  <FotoBtn foto={v.foto} set={(f) => setVeh(i, { foto: f })} label="Foto vehículo" />
                  <Text style={styles.label}>Documentos del vehículo</Text>
                  <MultiFoto fotos={v.docs} label="Documento" onAdd={(f) => setVeh(i, { docs: [...v.docs, f] })} onDel={(k) => setVeh(i, { docs: v.docs.filter((_, j) => j !== k) })} />

                  <Text style={styles.label}>Conductor</Text>
                  <TextInput style={styles.input} placeholder="Nombre(s) del conductor" placeholderTextColor={T.textMute} value={v.conductorNombre} onChangeText={(t) => setVeh(i, { conductorNombre: t })} />
                  <View style={styles.dosCol}>
                    <View style={styles.col}><TextInput style={styles.input} placeholder="Apellido paterno" placeholderTextColor={T.textMute} value={v.conductorApP} onChangeText={(t) => setVeh(i, { conductorApP: t })} /></View>
                    <View style={styles.col}><TextInput style={styles.input} placeholder="Apellido materno" placeholderTextColor={T.textMute} value={v.conductorApM} onChangeText={(t) => setVeh(i, { conductorApM: t })} /></View>
                  </View>
                  <TextInput style={styles.input} placeholder="CURP (opcional)" placeholderTextColor={T.textMute} autoCapitalize="characters" value={v.conductorCurp} onChangeText={(t) => setVeh(i, { conductorCurp: t })} />
                  <Text style={styles.label}>Sexo</Text>
                  <Chips categoria="sexo" valor={v.conductorSexo} onChange={(x) => setVeh(i, { conductorSexo: x })} />
                  <Text style={styles.label}>Fecha de nacimiento</Text>
                  <FechaInput value={v.conductorNac} onChange={(t) => setVeh(i, { conductorNac: t })} placeholder="Fecha de nacimiento" />
                  <TextInput style={styles.input} placeholder="Licencia de conducir (folio/número)" placeholderTextColor={T.textMute} value={v.conductorLicencia} onChangeText={(t) => setVeh(i, { conductorLicencia: t })} />
                  <FotoBtn foto={v.conductorFoto} set={(f) => setVeh(i, { conductorFoto: f })} label="Foto conductor" />
                  <Text style={styles.label}>Documentos del conductor</Text>
                  <MultiFoto fotos={v.conductorDocs} label="Documento" onAdd={(f) => setVeh(i, { conductorDocs: [...v.conductorDocs, f] })} onDel={(k) => setVeh(i, { conductorDocs: v.conductorDocs.filter((_, j) => j !== k) })} />

                  <View style={styles.switchRow}>
                    <Text style={styles.switchTxt}>Asegurado</Text>
                    <Switch value={v.asegurado} onValueChange={(x) => setVeh(i, { asegurado: x })} trackColor={{ true: T.accent }} />
                  </View>
                  {v.asegurado && <TextInput style={styles.input} placeholder="Compañía aseguradora" placeholderTextColor={T.textMute} value={v.compania} onChangeText={(t) => setVeh(i, { compania: t })} />}
                </View>
              ))}
              <TouchableOpacity style={styles.addBtn} onPress={() => setVehiculos((prev) => [...prev, vehiculoVacio()])}>
                <Ionicons name="add-circle" size={20} color={T.accent} /><Text style={styles.addBtnTxt}>Agregar vehículo</Text>
              </TouchableOpacity>
            </>
          )}

          {tab === "parte" && (
            <>
              <Text style={styles.titulo}>Parte</Text>
              <Text style={styles.label}>Croquis</Text>
              <Croquis onCambio={setCroquis} />

              <Text style={[styles.label, { marginTop: 20 }]}>Fotos para el parte</Text>
              <View style={styles.fotoRow}>
                <TouchableOpacity style={styles.fotoBtn} onPress={async () => { const f = await elegirFoto("camara"); if (f) setFotosParte((p) => [...p, f]); }}>
                  <Ionicons name="camera" size={16} color={T.accent} /><Text style={styles.fotoBtnTxt}>Cámara</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.fotoBtn} onPress={async () => { const f = await elegirFoto("galeria"); if (f) setFotosParte((p) => [...p, f]); }}>
                  <Ionicons name="images" size={16} color={T.accent} /><Text style={styles.fotoBtnTxt}>Galería</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.galeria}>
                {fotosParte.map((f, i) => (
                  <View key={i} style={styles.galItem}>
                    <Image source={{ uri: f.uri }} style={styles.galThumb} />
                    <TouchableOpacity style={styles.galDel} onPress={() => setFotosParte((p) => p.filter((_, k) => k !== i))}>
                      <Ionicons name="close-circle" size={20} color="#fff" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            </>
          )}

          <TouchableOpacity style={styles.guardar} onPress={guardar} disabled={guardando}>
            {guardando ? <ActivityIndicator color={T.white} /> : (<><Ionicons name="send" size={18} color={T.white} /><Text style={styles.guardarTxt}>Registrar accidente</Text></>)}
          </TouchableOpacity>
        </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.bg },
  tabbar: { flexDirection: "row", backgroundColor: T.surface, borderBottomWidth: 1, borderBottomColor: T.border },
  tab: { flex: 1, paddingVertical: 14, alignItems: "center", borderBottomWidth: 3, borderBottomColor: "transparent" },
  tabOn: { borderBottomColor: T.accent },
  tabTxt: { color: T.textDim, fontWeight: "700", fontSize: 14 },
  tabTxtOn: { color: T.accent },
  titulo: { color: T.text, fontSize: 22, fontWeight: "900", marginBottom: 10 },
  label: { color: T.textDim, fontSize: 13, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4, marginTop: 16, marginBottom: 8 },
  dim: { color: T.textMute, fontSize: 13, marginBottom: 8 },
  bodycamHint: { color: T.textMute, fontSize: 11.5, marginTop: 6, marginBottom: 4, lineHeight: 15 },
  input: { backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: UI.radiusSm, paddingHorizontal: 14, minHeight: 50, color: T.text, fontSize: 16, marginBottom: 8 },
  textarea: { minHeight: 90, paddingTop: 12, textAlignVertical: "top", marginTop: 12 },
  dosCol: { flexDirection: "row", gap: 10 },
  col: { flex: 1 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1, borderColor: T.border, borderRadius: 18, paddingVertical: 8, paddingHorizontal: 13, backgroundColor: T.surface },
  chipOn: { backgroundColor: T.accent, borderColor: T.accent },
  chipTxt: { color: T.textDim, fontWeight: "600", fontSize: 13 },
  chipTxtOn: { color: T.white },
  vehCard: { backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: UI.radius, padding: 14, marginBottom: 14 },
  vehHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  vehTitulo: { color: T.text, fontSize: 16, fontWeight: "800" },
  addBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1, borderColor: T.accentDim, borderRadius: UI.radiusSm, paddingVertical: 12, marginBottom: 8 },
  addBtnTxt: { color: T.accent, fontWeight: "800", fontSize: 15 },
  fotoRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10, flexWrap: "wrap" },
  fotoBtn: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: T.accentDim, borderRadius: UI.radiusSm, paddingVertical: 10, paddingHorizontal: 14 },
  fotoBtnTxt: { color: T.text, fontWeight: "700", fontSize: 14 },
  thumb: { width: 46, height: 46, borderRadius: 8, backgroundColor: T.surfaceHi },
  galeria: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 12 },
  galItem: { position: "relative" },
  galThumb: { width: 84, height: 84, borderRadius: 8, backgroundColor: T.surfaceHi },
  galDel: { position: "absolute", top: -6, right: -6, backgroundColor: "#00000088", borderRadius: 12 },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12, paddingVertical: 4 },
  switchTxt: { color: T.text, fontSize: 15, fontWeight: "600" },
  guardar: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: T.accent, borderRadius: UI.radiusSm, height: 54, marginTop: 26 },
  guardarTxt: { color: T.white, fontWeight: "800", fontSize: 16 },
});
