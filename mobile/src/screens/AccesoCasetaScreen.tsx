import { useCallback, useEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Image, Alert, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useIsFocused, useNavigation } from "@react-navigation/native";
import { SafeAreaView } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import * as FileSystem from "expo-file-system/legacy";
import { decode } from "base64-arraybuffer";
import { supabase, BUCKET_FOTOS } from "../lib/supabase";
import { getMiOficialValido } from "../lib/oficial";
import { leerNfc, nfcDisponible } from "../lib/nfc";
import { T, UI } from "../theme";

// App de caseta (Control de Accesos, Fase 1): el guardia registra la entrada/
// salida de una persona. Identifica por credencial (QR/NFC/código) o captura un
// visitante; toma foto; autoriza o rechaza; y puede pedir autorización al
// supervisor o generar un incidente (ambos reusan el chat de incidencias).
export default function AccesoCasetaScreen() {
  const nav = useNavigation<any>();
  const enfocada = useIsFocused();
  const [permiso, pedirPermiso] = useCameraPermissions();

  const [tipo, setTipo] = useState<"entrada" | "salida">("entrada");
  const [codigo, setCodigo] = useState("");
  const [cred, setCred] = useState<any>(null);        // credencial resuelta
  const [visitante, setVisitante] = useState("");
  const [tipoPersona, setTipoPersona] = useState("");
  const [motivo, setMotivo] = useState("");
  const [tiposPersona, setTiposPersona] = useState<string[]>([]);
  const [motivos, setMotivos] = useState<string[]>([]);
  const [foto, setFoto] = useState<{ uri: string; mime: string } | null>(null);
  const [resultado, setResultado] = useState<"autorizado" | "rechazado">("autorizado");
  const [sitioId, setSitioId] = useState("");
  const [sitioNombre, setSitioNombre] = useState<string | null>(null);
  const [puntoId, setPuntoId] = useState<string | null>(null);
  const [personalId, setPersonalId] = useState<string | null>(null);
  const [escaneando, setEscaneando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  // Modo vehículo (Fase 2): placa + cita + andén.
  const [modo, setModo] = useState<"persona" | "vehiculo">("persona");
  const [placa, setPlaca] = useState("");
  const [remolque, setRemolque] = useState("");
  const [anden, setAnden] = useState("");
  const [citaId, setCitaId] = useState("");
  const [citas, setCitas] = useState<any[]>([]);

  useEffect(() => {
    supabase.from("cat_opciones").select("valor").eq("categoria", "tipo_persona_acceso").eq("activo", true).order("orden")
      .then(({ data }) => setTiposPersona(((data as any[]) ?? []).map((o) => o.valor)));
    supabase.from("cat_opciones").select("valor").eq("categoria", "motivo_acceso").eq("activo", true).order("orden")
      .then(({ data }) => setMotivos(((data as any[]) ?? []).map((o) => o.valor)));
    resolverCaseta();
  }, []);

  // Citas activas del sitio (para ligar el acceso del camión a su cita).
  useEffect(() => {
    if (!sitioId) { setCitas([]); return; }
    supabase.from("citas").select("id, folio, placa, anden, vehiculo:vehiculos(placas)")
      .eq("estatus", "activo").eq("sitio_id", sitioId)
      .not("estado", "in", "(finalizada,salida,cancelada)").order("programada_en").limit(100)
      .then(({ data }) => setCitas((data as any[]) ?? []));
  }, [sitioId]);

  async function resolverCaseta() {
    const g = await getMiOficialValido();
    setPersonalId(g?.personalId ?? null);
    if (!g) return;
    const hoy = new Date().toISOString().slice(0, 10);
    const { data: tg } = await supabase.from("turno_guardias")
      .select("sitio_id, sitios(nombre), turnos!inner(fecha, estado, estatus)")
      .eq("personal_id", g.personalId)
      .eq("turnos.fecha", hoy).eq("turnos.estado", "activo").eq("turnos.estatus", "activo").limit(1);
    const row = ((tg as any[]) ?? [])[0];
    if (row?.sitio_id) {
      setSitioId(row.sitio_id); setSitioNombre(row.sitios?.nombre ?? null);
      const { data: c } = await supabase.from("puntos_control").select("id, nombre")
        .eq("sitio_id", row.sitio_id).eq("tipo_punto", "caseta").eq("estatus", "activo").limit(1);
      if (((c as any[]) ?? [])[0]) setPuntoId((c as any[])[0].id);
    }
  }

  // Resuelve la credencial por su código (de QR/NFC/manual) → persona.
  const resolverCredencial = useCallback(async (code: string) => {
    const t = code.trim();
    if (!t) return;
    setCodigo(t);
    const { data } = await supabase.from("credenciales")
      .select("id, tipo, vigencia_fin, persona_id, descripcion, persona:personas(nombre, apellido_paterno)")
      .eq("codigo", t).eq("estatus", "activo").maybeSingle();
    if (!data) { setCred(null); Alert.alert("Credencial", "No se encontró una credencial activa con ese código. Puedes registrar al visitante manualmente."); return; }
    if ((data as any).vigencia_fin && new Date((data as any).vigencia_fin).getTime() < Date.now()) {
      Alert.alert("Credencial vencida", "La credencial existe pero está vencida.");
    }
    setCred(data);
  }, []);

  function alEscanearQR(data: string) {
    if (!escaneando) return;
    setEscaneando(false);
    resolverCredencial(data);
  }

  async function escanearNfc() {
    if (!(await nfcDisponible())) { Alert.alert("NFC", "Este dispositivo no tiene NFC disponible."); return; }
    const r = await leerNfc();
    if (r.ok && r.codigo) resolverCredencial(r.codigo);
    else if (r.error) Alert.alert("NFC", r.error);
  }

  async function tomarFoto() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return Alert.alert("Permiso", "Se requiere la cámara.");
    const res = await ImagePicker.launchCameraAsync({ quality: 0.6 });
    if (res.canceled) return;
    const a = res.assets[0];
    setFoto({ uri: a.uri, mime: a.mimeType ?? "image/jpeg" });
  }

  async function gps() {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return { lat: null as number | null, lng: null as number | null };
      const p = await Location.getCurrentPositionAsync({});
      return { lat: Number(p.coords.latitude.toFixed(6)), lng: Number(p.coords.longitude.toFixed(6)) };
    } catch { return { lat: null as number | null, lng: null as number | null }; }
  }

  // Divide un nombre completo en nombre + apellidos (heurística simple).
  function partirNombre(full: string): { nombre: string; ap: string | null; am: string | null } {
    const p = full.trim().split(/\s+/);
    if (p.length <= 1) return { nombre: p[0] ?? full.trim(), ap: null, am: null };
    if (p.length === 2) return { nombre: p[0], ap: p[1], am: null };
    return { nombre: p.slice(0, -2).join(" "), ap: p[p.length - 2], am: p[p.length - 1] };
  }

  // Crea una persona en el REGISTRO MAESTRO (visitante a pie u operador del vehículo).
  async function crearPersona(nombreCompleto: string): Promise<string | null> {
    const { nombre, ap, am } = partirNombre(nombreCompleto);
    const { data, error } = await supabase.from("personas")
      .insert({ nombre, apellido_paterno: ap, apellido_materno: am, datos_adicionales: { origen: "control_acceso" } })
      .select("id").single();
    return error ? null : (data as any).id;
  }

  // Encuentra (por placas) o crea el vehículo en el REGISTRO MAESTRO.
  async function encontrarOCrearVehiculo(placas: string): Promise<string | null> {
    const pl = placas.trim().toUpperCase();
    if (!pl) return null;
    const { data: ex } = await supabase.from("vehiculos").select("id").ilike("placas", pl).eq("estatus", "activo").limit(1);
    if (((ex as any[]) ?? [])[0]) return (ex as any[])[0].id;
    const { data, error } = await supabase.from("vehiculos")
      .insert({ placas: pl, datos_adicionales: { origen: "control_acceso" } })
      .select("id").single();
    return error ? null : (data as any).id;
  }

  // Sube la foto de la credencial/identificación COMO FOTO DE LA PERSONA (maestro).
  async function subirFotoPersona(personaId: string): Promise<string | null> {
    if (!foto) return null;
    const base64 = await FileSystem.readAsStringAsync(foto.uri, { encoding: FileSystem.EncodingType.Base64 });
    const path = `personas/${personaId}/${Date.now()}.jpg`;
    const { error } = await supabase.storage.from(BUCKET_FOTOS).upload(path, decode(base64), { contentType: foto.mime });
    if (error) return null;
    const { data: cur } = await supabase.from("personas").select("fotografias").eq("id", personaId).maybeSingle();
    const previas = Array.isArray((cur as any)?.fotografias) ? (cur as any).fotografias : [];
    await supabase.from("personas").update({ fotografias: [path, ...previas], actualizado_en: new Date().toISOString() }).eq("id", personaId);
    return path;
  }

  function validar(): string | null {
    if (!sitioId) return "No se detectó tu sitio/caseta (¿tienes turno activo hoy?).";
    if (modo === "vehiculo") {
      if (!placa.trim() && !citaId) return "Captura la placa o elige la cita del camión.";
      if (!visitante.trim()) return "Captura el nombre del operador (responsable del vehículo).";
      return null;
    }
    if (!cred && !visitante.trim()) return "Escanea la credencial o escribe el nombre del visitante.";
    return null;
  }

  // Inserta el acceso, guardando de paso en los REGISTROS MAESTROS: la persona
  // (visitante a pie u operador del vehículo, con su foto de identidad) y el
  // vehículo. En modo vehículo solo se registra el vehículo y su operador.
  async function insertarAcceso(res: "autorizado" | "rechazado" | "pendiente"): Promise<string | null> {
    const pos = await gps();
    const nombreLibre = visitante.trim();

    // Persona (maestro): credencial existente, o se crea a partir del nombre.
    let personaId: string | null = cred?.persona_id ?? null;
    if (!personaId && nombreLibre) personaId = await crearPersona(nombreLibre);

    // Vehículo (maestro): solo en modo vehículo.
    let vehiculoId: string | null = null;
    if (modo === "vehiculo" && placa.trim()) vehiculoId = await encontrarOCrearVehiculo(placa.trim());

    // La foto de la credencial/identificación queda como foto de la persona.
    let fotoPath: string | null = null;
    if (foto && personaId) fotoPath = await subirFotoPersona(personaId);

    const { data, error } = await supabase.from("accesos").insert({
      tipo,
      persona_id: personaId,
      visitante_nombre: personaId ? null : (nombreLibre || cred?.descripcion || null),
      vehiculo_id: vehiculoId,
      sitio_id: sitioId,
      punto_id: puntoId,
      personal_id: personalId,
      credencial_id: cred?.id ?? null,
      tipo_persona: tipoPersona || (modo === "vehiculo" ? "Transportista" : null),
      motivo: motivo || null,
      resultado: res,
      placa: modo === "vehiculo" ? (placa.trim() || null) : null,
      cita_id: modo === "vehiculo" ? (citaId || null) : null,
      anden: modo === "vehiculo" ? (anden.trim() || null) : null,
      remolque_placa: modo === "vehiculo" ? (remolque.trim() || null) : null,
      latitud: pos.lat, longitud: pos.lng,
      fotografias: fotoPath ? [fotoPath] : [],
      datos_adicionales: { origen: "caseta_movil" },
    }).select("id, folio").single();
    if (error) { Alert.alert("Error", error.message); return null; }
    return (data as any).id;
  }

  // Crea una incidencia (reusa el chat automático) ligada al acceso.
  async function crearIncidenteLigado(accesoId: string, titulo: string): Promise<string | null> {
    const g = await getMiOficialValido();
    const quien = cred?.persona ? `${cred.persona.nombre ?? ""} ${cred.persona.apellido_paterno ?? ""}`.trim() : (visitante.trim() || "visitante");
    const { data: ll, error } = await supabase.from("llamadas_cad").insert({
      tipo: titulo, prioridad: "media", reportante: g?.etiqueta ?? null, sitio_id: sitioId,
      direccion: sitioNombre ?? "Caseta", estado_despacho: "recibida",
      descripcion: `${titulo}: ${quien}${motivo ? ` · ${motivo}` : ""} (${tipo}).`,
      datos_adicionales: { origen: "incidente_movil", subtipo: "control_acceso", personal_id: g?.personalId ?? null, elemento: g?.etiqueta ?? null },
    }).select("id").single();
    if (error) { Alert.alert("Error", error.message); return null; }
    // El trigger ya creó el chat; leemos el canal para enlazar y navegar.
    const { data: full } = await supabase.from("llamadas_cad").select("chat_canal_id").eq("id", (ll as any).id).maybeSingle();
    const canal = (full as any)?.chat_canal_id ?? null;
    await supabase.from("accesos").update({ incidente_id: (ll as any).id, chat_canal_id: canal }).eq("id", accesoId);
    return canal;
  }

  async function registrar() {
    const err = validar(); if (err) return Alert.alert("Falta información", err);
    setEnviando(true);
    const id = await insertarAcceso(resultado);
    setEnviando(false);
    if (!id) return;
    if (resultado === "rechazado") {
      Alert.alert("Acceso rechazado", "¿Generar un incidente de este rechazo?", [
        { text: "No", style: "cancel", onPress: () => nav.goBack() },
        { text: "Generar incidente", onPress: async () => { const c = await crearIncidenteLigado(id, "Acceso rechazado"); if (c) nav.navigate("ChatCanal", { canalId: c, nombre: "Acceso rechazado" }); else nav.goBack(); } },
      ]);
    } else {
      Alert.alert("Acceso registrado", "Entrada/salida registrada correctamente.", [{ text: "OK", onPress: () => nav.goBack() }]);
    }
  }

  async function pedirAutorizacion() {
    const err = validar(); if (err) return Alert.alert("Falta información", err);
    setEnviando(true);
    const id = await insertarAcceso("pendiente");
    if (!id) { setEnviando(false); return; }
    const canal = await crearIncidenteLigado(id, "Autorización de acceso");
    setEnviando(false);
    if (canal) nav.navigate("ChatCanal", { canalId: canal, nombre: "Autorización de acceso" });
    else Alert.alert("Listo", "Solicitud registrada; el supervisor será notificado.");
  }

  const chips = (arr: string[], val: string, set: (v: string) => void) => (
    <View style={styles.chips}>
      {arr.map((x) => (
        <TouchableOpacity key={x} style={[styles.chip, val === x && styles.chipOn]} onPress={() => set(val === x ? "" : x)}>
          <Text style={[styles.chipTxt, val === x && styles.chipTxtOn]}>{x}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <KeyboardAwareScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled" bottomOffset={24}>
        <Text style={styles.sub}>Caseta: {sitioNombre ?? "sin sitio (revisa tu turno)"}</Text>

        <View style={styles.seg}>
          {(["entrada", "salida"] as const).map((t) => (
            <TouchableOpacity key={t} style={[styles.segBtn, tipo === t && styles.segOn]} onPress={() => setTipo(t)}>
              <Text style={[styles.segTxt, tipo === t && styles.segTxtOn]}>{t === "entrada" ? "Entrada" : "Salida"}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={[styles.seg, { marginTop: 10 }]}>
          {(["persona", "vehiculo"] as const).map((m) => (
            <TouchableOpacity key={m} style={[styles.segBtn, modo === m && styles.segOn]} onPress={() => setModo(m)}>
              <Text style={[styles.segTxt, modo === m && styles.segTxtOn]}>{m === "persona" ? "A pie" : "Vehículo"}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {modo === "vehiculo" && (
          <>
            <Text style={styles.label}>Vehículo</Text>
            <TextInput style={styles.input} placeholder="Placa" placeholderTextColor={T.textMute} value={placa} onChangeText={setPlaca} autoCapitalize="characters" />
            <TextInput style={styles.input} placeholder="Placa de remolque (opcional)" placeholderTextColor={T.textMute} value={remolque} onChangeText={setRemolque} autoCapitalize="characters" />
            <TextInput style={styles.input} placeholder="Andén (opcional)" placeholderTextColor={T.textMute} value={anden} onChangeText={setAnden} />
            {citas.length > 0 && (
              <>
                <Text style={styles.label}>Cita (opcional)</Text>
                <View style={styles.chips}>
                  {citas.map((c) => (
                    <TouchableOpacity key={c.id} style={[styles.chip, citaId === c.id && styles.chipOn]} onPress={() => { setCitaId(citaId === c.id ? "" : c.id); if (!placa) setPlaca(c.placa ?? c.vehiculo?.placas ?? ""); if (c.anden && !anden) setAnden(c.anden); }}>
                      <Text style={[styles.chipTxt, citaId === c.id && styles.chipTxtOn]}>{c.folio ?? "cita"}{(c.placa ?? c.vehiculo?.placas) ? ` · ${c.placa ?? c.vehiculo?.placas}` : ""}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}
            <Text style={styles.label}>Operador</Text>
            <TextInput style={styles.input} placeholder="Nombre del operador" placeholderTextColor={T.textMute} value={visitante} onChangeText={setVisitante} />
          </>
        )}

        {modo === "persona" && (<>
        <Text style={styles.label}>Credencial</Text>
        {escaneando && enfocada && permiso?.granted ? (
          <View style={styles.cam}>
            <CameraView style={{ flex: 1 }} facing="back" barcodeScannerSettings={{ barcodeTypes: ["qr", "code128", "code39", "ean13"] }} onBarcodeScanned={({ data }) => alEscanearQR(data)} />
            <TouchableOpacity style={styles.camCancel} onPress={() => setEscaneando(false)}><Text style={styles.camCancelTxt}>Cancelar</Text></TouchableOpacity>
          </View>
        ) : (
          <View style={styles.grid}>
            <TouchableOpacity style={styles.cap} onPress={async () => { if (!permiso?.granted) { const r = await pedirPermiso(); if (!r.granted) return; } setEscaneando(true); }}><Ionicons name="qr-code" size={22} color={T.accent} /><Text style={styles.capTxt}>Escanear QR</Text></TouchableOpacity>
            <TouchableOpacity style={styles.cap} onPress={escanearNfc}><Ionicons name="radio" size={22} color={T.accent} /><Text style={styles.capTxt}>Leer NFC</Text></TouchableOpacity>
          </View>
        )}
        <TextInput style={styles.input} placeholder="…o teclea el código" placeholderTextColor={T.textMute} value={codigo} onChangeText={setCodigo} onEndEditing={() => resolverCredencial(codigo)} autoCapitalize="characters" />
        {cred && <Text style={styles.ok}>✓ {cred.persona ? `${cred.persona.nombre ?? ""} ${cred.persona.apellido_paterno ?? ""}`.trim() : (cred.descripcion ?? "Credencial válida")}</Text>}

        {!cred && (
          <>
            <Text style={styles.label}>Visitante (si no tiene credencial)</Text>
            <TextInput style={styles.input} placeholder="Nombre del visitante" placeholderTextColor={T.textMute} value={visitante} onChangeText={setVisitante} />
          </>
        )}
        </>)}

        <Text style={styles.label}>Tipo de persona</Text>
        {chips(tiposPersona, tipoPersona, setTipoPersona)}

        <Text style={styles.label}>Motivo</Text>
        {chips(motivos, motivo, setMotivo)}

        <Text style={styles.label}>Foto (identificación / persona)</Text>
        <View style={styles.grid}>
          <TouchableOpacity style={styles.cap} onPress={tomarFoto}><Ionicons name="camera" size={22} color={T.accent} /><Text style={styles.capTxt}>Tomar foto</Text></TouchableOpacity>
          {foto && <Image source={{ uri: foto.uri }} style={styles.thumb} />}
        </View>

        <Text style={styles.label}>Resultado</Text>
        <View style={styles.seg}>
          {(["autorizado", "rechazado"] as const).map((r) => (
            <TouchableOpacity key={r} style={[styles.segBtn, resultado === r && (r === "rechazado" ? styles.segBad : styles.segOn)]} onPress={() => setResultado(r)}>
              <Text style={[styles.segTxt, resultado === r && styles.segTxtOn]}>{r === "autorizado" ? "Autorizar" : "Rechazar"}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity style={styles.btnPrim} onPress={registrar} disabled={enviando}>
          {enviando ? <ActivityIndicator color={T.white} /> : (<><Ionicons name="shield-checkmark" size={18} color={T.white} /><Text style={styles.btnPrimTxt}>Registrar acceso</Text></>)}
        </TouchableOpacity>
        <TouchableOpacity style={styles.btnSec} onPress={pedirAutorizacion} disabled={enviando}>
          <Ionicons name="help-buoy" size={18} color={T.accent} /><Text style={styles.btnSecTxt}>Pedir autorización al supervisor</Text>
        </TouchableOpacity>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.bg },
  sub: { color: T.textDim, fontSize: 14, fontWeight: "700" },
  label: { color: T.textDim, fontSize: 13, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4, marginTop: 20, marginBottom: 8 },
  input: { backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: UI.radiusSm, paddingHorizontal: 14, minHeight: 50, color: T.text, fontSize: 16, marginTop: 8 },
  ok: { color: "#0a7c2f", fontWeight: "700", marginTop: 8 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1, borderColor: T.border, borderRadius: 20, paddingVertical: 8, paddingHorizontal: 14, backgroundColor: T.surface },
  chipOn: { backgroundColor: T.accent, borderColor: T.accent },
  chipTxt: { color: T.textDim, fontWeight: "700", fontSize: 13 },
  chipTxtOn: { color: T.white },
  grid: { flexDirection: "row", gap: 10, alignItems: "center" },
  cap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: T.surface, borderWidth: 1, borderColor: T.accentDim, borderRadius: UI.radiusSm, paddingVertical: 16 },
  capTxt: { color: T.text, fontWeight: "700", fontSize: 14 },
  thumb: { width: 60, height: 60, borderRadius: 8, backgroundColor: T.surfaceHi },
  cam: { height: 260, borderRadius: UI.radiusSm, overflow: "hidden", marginTop: 8, position: "relative" },
  camCancel: { position: "absolute", bottom: 10, alignSelf: "center", backgroundColor: "rgba(0,0,0,.6)", paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  camCancelTxt: { color: "#fff", fontWeight: "700" },
  seg: { flexDirection: "row", gap: 8, marginTop: 8 },
  segBtn: { flex: 1, alignItems: "center", paddingVertical: 12, borderRadius: UI.radiusSm, backgroundColor: T.surface, borderWidth: 1, borderColor: T.border },
  segOn: { backgroundColor: T.accent, borderColor: T.accent },
  segBad: { backgroundColor: T.danger, borderColor: T.danger },
  segTxt: { color: T.textDim, fontWeight: "800" },
  segTxtOn: { color: T.white },
  btnPrim: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: T.accent, borderRadius: UI.radiusSm, height: 54, marginTop: 26 },
  btnPrimTxt: { color: T.white, fontWeight: "800", fontSize: 16 },
  btnSec: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: UI.radiusSm, height: 50, marginTop: 12, borderWidth: 1, borderColor: T.accentDim },
  btnSecTxt: { color: T.accent, fontWeight: "800", fontSize: 15 },
});
