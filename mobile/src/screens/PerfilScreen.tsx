import { useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Image, Alert, ActivityIndicator, Modal, TextInput } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import { SafeAreaView } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import * as ImagePicker from "expo-image-picker";
import { decode } from "base64-arraybuffer";
import { supabase, BUCKET_FOTOS } from "../lib/supabase";
import { urlFoto, primeraFoto } from "../lib/fotos";
import { getUnidadDelSistema, getTurnoVigente, type TurnoVigente } from "../lib/unidad";
import { getMiOficial, getMiOficialValido, setMiOficial, clearMiOficial } from "../lib/oficial";
import { actualizarPersonalPush } from "../lib/push";
import { validarBodycam, mensajeBloqueo, getMiBodycam, clearMiBodycam } from "../lib/bodycam";
import { iniciarRastreo, detenerRastreo } from "../lib/ubicacionVivo";
import { iniciarGeocercas, detenerGeocercas } from "../lib/geocercas";
import { pendientesBodycam, descargarPendientes, bodycamDisponible } from "../lib/bodycamHd";
import { recordatoriosVigentes, agregarRecordatorio, quitarRecordatorio, ventanaTurno, Recordatorio } from "../lib/recordatorios";
import HoraInput from "../components/HoraInput";
import { T, UI } from "../theme";

function turnoActual(): string {
  const h = new Date().getHours();
  return h >= 6 && h < 18 ? "Diurno" : "Nocturno";
}
const hhmm = (t: string | null) => (t ? String(t).slice(0, 5) : "—");

interface OficialOpc { id: string; etiqueta: string; }

export default function PerfilScreen() {
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const [correo, setCorreo] = useState("");

  // Mi elemento (identidad del oficial) + su fotografía
  const [oficiales, setOficiales] = useState<OficialOpc[]>([]);
  const [miOficialId, setMiOficialId] = useState<string | null>(null);
  const [miOficialEtq, setMiOficialEtq] = useState<string>("");
  const [fotoPath, setFotoPath] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [editandoOficial, setEditandoOficial] = useState(false);
  const [miBodycam, setMiBodycamState] = useState<string | null>(null);   // folio
  const [unidad, setUnidad] = useState<string | null>(null);              // sitio del turno (sistema)
  const [turno, setTurno] = useState<TurnoVigente | null>(null);
  const [validando, setValidando] = useState(false);
  // Grabaciones de bodycam pendientes de descargar (subir en WiFi).
  const [pendientesBc, setPendientesBc] = useState(0);
  const [descargandoBc, setDescargandoBc] = useState(false);
  const [progresoBc, setProgresoBc] = useState("");

  // Recordatorios del turno (locales; expiran al terminar el turno)
  const [recordatorios, setRecordatorios] = useState<Recordatorio[]>([]);
  const [modalRecord, setModalRecord] = useState(false);
  const [recordBorrador, setRecordBorrador] = useState("");
  const [recordHora, setRecordHora] = useState(""); // "HH:MM" de la alarma (obligatoria)

  const [aviso, setAviso] = useState<string | null>(null);

  // Scroll: para llevar a la sección de bodycam al iniciar descarga desde Inicio.
  const scrollRef = useRef<any>(null);
  const bodycamY = useRef(0);

  async function cargarOficiales() {
    const { data } = await supabase
      .from("personal")
      .select("id, numero_placa, rango, persona:personas(nombre, apellido_paterno, apellido_materno, estatus)")
      .eq("estatus", "activo")
      .limit(500);
    const opc: OficialOpc[] = ((data as any[]) ?? [])
      .filter((p) => (p.persona?.estatus ?? "activo") === "activo")
      .map((p) => {
        const nom = p.persona ? `${p.persona.nombre ?? ""} ${p.persona.apellido_paterno ?? ""} ${p.persona.apellido_materno ?? ""}`.trim() : "";
        const emp = `${p.rango ?? ""}${p.numero_placa ? ` #${p.numero_placa}` : ""}`.trim();
        return { id: p.id as string, etiqueta: [nom, emp].filter(Boolean).join(" — ") || p.id };
      });
    opc.sort((a, b) => a.etiqueta.localeCompare(b.etiqueta));
    setOficiales(opc);
  }

  async function cargarMiFoto(pid: string) {
    const { data } = await supabase.from("personal").select("persona:personas(fotografias)").eq("id", pid).maybeSingle();
    const fotos = (data as any)?.persona?.fotografias;
    setFotoPath(primeraFoto(fotos));
  }

  async function cargarUnidadYTurno(pid: string) {
    setUnidad(await getUnidadDelSistema(pid));
    setTurno(await getTurnoVigente(pid));
  }

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCorreo(data.user?.email ?? ""));
    cargarOficiales();
    getMiBodycam().then((b) => setMiBodycamState(b?.folio ?? null));
    pendientesBodycam().then(setPendientesBc);
    cargarRecordatorios();
    (async () => {
      const guardado = await getMiOficial();
      const valido = await getMiOficialValido(); // limpia la selección si fue cancelada
      if (valido) {
        setMiOficialId(valido.personalId); setMiOficialEtq(valido.etiqueta); cargarMiFoto(valido.personalId); cargarUnidadYTurno(valido.personalId);
      } else if (guardado) {
        setMiOficialId(null); setMiOficialEtq(""); setFotoPath(null);
        setAviso("Tu elemento fue dado de baja; selecciona otro.");
      }
    })();
  }, []);

  // Acciones disparadas desde Inicio (parámetros de navegación).
  useEffect(() => {
    const p = route.params ?? {};
    if (p.nuevoRecordatorio) {
      setRecordBorrador(""); setRecordHora(""); setModalRecord(true);
      nav.setParams({ nuevoRecordatorio: undefined });
    }
    if (p.iniciarDescarga) {
      nav.setParams({ iniciarDescarga: undefined });
      setTimeout(() => scrollRef.current?.scrollTo?.({ y: Math.max(0, bodycamY.current - 12), animated: true }), 350);
      descargarBodycam();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.params]);

  async function elegirOficial(o: OficialOpc) {
    // Valida que ESTE teléfono sea la bodycam-smartphone asignada al oficial.
    setValidando(true);
    const r = await validarBodycam(o.id);
    setValidando(false);
    if (!r.ok) {
      setEditandoOficial(false);
      Alert.alert("No se puede asignar este elemento", mensajeBloqueo(r));
      return;
    }
    setMiOficialId(o.id);
    setMiOficialEtq(o.etiqueta);
    setEditandoOficial(false);
    setMiBodycamState(r.folio ?? null);
    await setMiOficial({ personalId: o.id, etiqueta: o.etiqueta });
    await supabase.rpc("rpc_vincular_usuario_elemento", { p_personal: o.id });
    await actualizarPersonalPush(o.id);
    await cargarMiFoto(o.id);
    await cargarUnidadYTurno(o.id);
    iniciarRastreo();
    iniciarGeocercas();
    setAviso(r.vinculado
      ? `Elemento asignado. Smartphone vinculado a la bodycam ${r.folio}.`
      : `Elemento asignado. Bodycam ${r.folio}.`);
  }

  async function quitarOficial() {
    setMiOficialId(null); setMiOficialEtq(""); setFotoPath(null); setMiBodycamState(null); setUnidad(null); setTurno(null);
    await clearMiOficial();
    await clearMiBodycam();
    await actualizarPersonalPush(null);
    await detenerRastreo();
    await detenerGeocercas();
    setAviso("Ya no hay elemento asignado en este dispositivo.");
  }

  async function cargarRecordatorios() {
    setRecordatorios(await recordatoriosVigentes());
  }

  // La alarma del recordatorio es OBLIGATORIA: siempre suena por el sistema del dispositivo.
  async function guardarRecordatorio() {
    const t = recordBorrador.trim();
    if (!t) { Alert.alert("Recordatorio", "Escribe el recordatorio."); return; }
    if (!recordHora) { Alert.alert("Alarma requerida", "Elige la hora de la alarma (siempre suena por el sistema)."); return; }
    const m = recordHora.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) { Alert.alert("Hora inválida", "Elige una hora válida."); return; }
    const { inicio, fin } = ventanaTurno();
    let a = new Date(); a.setHours(Number(m[1]), Number(m[2]), 0, 0);
    if (a < inicio) a = new Date(a.getTime() + 24 * 3600 * 1000);
    if (a < inicio || a > fin) {
      Alert.alert("Hora fuera del turno", `La alarma debe estar entre ${inicio.getHours()}:00 y ${fin.getHours()}:00 (tu turno).`);
      return;
    }
    if (a.getTime() <= Date.now()) { Alert.alert("Hora pasada", "Elige una hora futura dentro de tu turno."); return; }
    await agregarRecordatorio(t, a);
    setRecordBorrador(""); setRecordHora("");
    setModalRecord(false);
    await cargarRecordatorios();
  }

  async function borrarRecordatorio(id: string) {
    await quitarRecordatorio(id);
    await cargarRecordatorios();
  }

  async function cambiarFoto() {
    if (!miOficialId) { Alert.alert("Elemento", "Primero selecciona tu elemento."); return; }
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { Alert.alert("Permiso", "Se requiere permiso de cámara."); return; }
    const res = await ImagePicker.launchCameraAsync({ quality: 0.6, base64: true, cameraType: ImagePicker.CameraType.front });
    if (res.canceled) return;
    await subirFoto(res.assets[0].base64, res.assets[0].mimeType);
  }
  async function elegirFotoGaleria() {
    if (!miOficialId) { Alert.alert("Elemento", "Primero selecciona tu elemento."); return; }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert("Permiso", "Se requiere permiso de galería."); return; }
    const res = await ImagePicker.launchImageLibraryAsync({ quality: 0.6, base64: true, mediaTypes: ["images"] });
    if (res.canceled) return;
    await subirFoto(res.assets[0].base64, res.assets[0].mimeType);
  }

  async function subirFoto(base64?: string | null, mime?: string | null) {
    if (!miOficialId || !base64) return;
    setSubiendo(true);
    try {
      const { data: per } = await supabase.from("personal").select("persona_id").eq("id", miOficialId).maybeSingle();
      const personaId = (per as any)?.persona_id;
      if (!personaId) { Alert.alert("Sin persona", "El elemento no tiene persona asociada."); setSubiendo(false); return; }
      const ext = mime && mime.includes("png") ? "png" : "jpg";
      const path = `personas/${personaId}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from(BUCKET_FOTOS).upload(path, decode(base64), { contentType: mime ?? "image/jpeg" });
      if (error) throw error;
      const { data: cur } = await supabase.from("personas").select("fotografias").eq("id", personaId).maybeSingle();
      const previas = Array.isArray((cur as any)?.fotografias) ? (cur as any).fotografias : [];
      await supabase.from("personas").update({ fotografias: [path, ...previas], actualizado_en: new Date().toISOString() }).eq("id", personaId);
      setFotoPath(path);
    } catch (e: any) {
      Alert.alert("Error", e.message ?? String(e));
    } finally {
      setSubiendo(false);
    }
  }

  async function descargarBodycam() {
    const n = await pendientesBodycam();
    if (n === 0) { Alert.alert("Bodycam", "No hay grabaciones pendientes por descargar."); return; }
    setDescargandoBc(true); setProgresoBc(`0/${n}`);
    const r = await descargarPendientes((h, t) => setProgresoBc(`${h}/${t}`));
    setDescargandoBc(false); setProgresoBc("");
    setPendientesBc(await pendientesBodycam());
    Alert.alert(
      "Descarga de bodycam",
      `Subidos: ${r.subidos}.${r.fallidos ? ` Con error: ${r.fallidos} (quedan para reintentar).\n\nMotivo: ${r.error ?? "desconocido"}` : " Completado."}`
    );
  }

  async function cerrarSesion() {
    const n = await pendientesBodycam();
    if (n > 0) {
      Alert.alert("Descarga pendiente", `Tienes ${n} grabación(es) de bodycam sin descargar. Conéctate a WiFi y usa «Descargar bodycam» antes de cerrar sesión.`);
      return;
    }
    supabase.auth.signOut();
  }

  const fotoUrl = urlFoto(fotoPath);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <KeyboardAwareScrollView ref={scrollRef} contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled" bottomOffset={24}>
        <View style={styles.hero}>
          <TouchableOpacity style={styles.avatar} onPress={cambiarFoto} onLongPress={elegirFotoGaleria} activeOpacity={0.8}>
            {subiendo ? <ActivityIndicator color={T.accent} />
              : fotoUrl ? <Image source={{ uri: fotoUrl }} style={styles.avatarImg} />
              : <Ionicons name="person" size={44} color={T.accent} />}
            <View style={styles.avatarCam}><Ionicons name="camera" size={14} color={T.white} /></View>
          </TouchableOpacity>
          <Text style={styles.nombre} numberOfLines={1}>{miOficialEtq || correo || "Elemento en campo"}</Text>
          <Text style={styles.rol}>Toca la foto para cambiarla (mantén para galería)</Text>
        </View>

        {/* Mi elemento */}
        <Text style={styles.seccion}>Mi elemento (identidad)</Text>
        <View style={styles.card}>
          <TouchableOpacity style={styles.rowSel} onPress={() => setEditandoOficial((v) => !v)}>
            <Ionicons name="id-card-outline" size={20} color={T.accent} style={{ width: 28 }} />
            <Text style={[styles.l, { flex: 1, color: T.text }]} numberOfLines={1}>{miOficialEtq || "Sin elemento asignado"}</Text>
            <Ionicons name={editandoOficial ? "chevron-up" : "chevron-down"} size={18} color={T.textMute} />
          </TouchableOpacity>
          {editandoOficial && oficiales.map((o) => {
            const sel = o.id === miOficialId;
            return (
              <TouchableOpacity key={o.id} style={[styles.row, styles.rowBorder]} onPress={() => elegirOficial(o)}>
                <Ionicons name={sel ? "radio-button-on" : "radio-button-off"} size={20} color={sel ? T.accent : T.textMute} style={{ width: 28 }} />
                <Text style={[styles.l, { flex: 1, color: T.text }]} numberOfLines={1}>{o.etiqueta}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {validando && <Text style={styles.bodycamLbl}>Validando bodycam del elemento…</Text>}
        {miOficialId && miBodycam && (
          <Text style={styles.bodycamLbl}>
            <Ionicons name="videocam" size={13} color={T.accent} /> Bodycam: <Text style={{ color: T.text, fontWeight: "800" }}>{miBodycam}</Text>
          </Text>
        )}
        {miOficialId && (
          <Text style={styles.bodycamLbl}>
            <Ionicons name="location-outline" size={13} color={T.accent} /> Unidad: <Text style={{ color: T.text, fontWeight: "800" }}>{unidad || "sin unidad"}</Text>
          </Text>
        )}
        {miOficialId && <TouchableOpacity onPress={quitarOficial}><Text style={styles.quitar}>Quitar elemento de este dispositivo</Text></TouchableOpacity>}

        {/* Recordatorios del turno (expiran al finalizar el turno) */}
        <View style={styles.seccionRow}>
          <Text style={[styles.seccion, { marginTop: 0 }]}>Recordatorios del turno</Text>
          <TouchableOpacity style={styles.recordAdd} onPress={() => { setRecordBorrador(""); setRecordHora(""); setModalRecord(true); }}>
            <Ionicons name="add" size={15} color={T.accent} />
            <Text style={styles.recordAddTxt}>Recordatorio+</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.card}>
          {recordatorios.length === 0 ? (
            <Text style={[styles.vacio, { marginTop: 0 }]}>Sin recordatorios. Los que agregues expiran al terminar tu turno y siempre suena su alarma.</Text>
          ) : recordatorios.map((r, i) => (
            <View key={r.id} style={[styles.row, i < recordatorios.length - 1 && styles.rowBorder]}>
              <Ionicons name="alarm-outline" size={20} color={T.gold} style={{ width: 28 }} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.l, { color: T.text }]}>{r.texto}</Text>
                {r.hora && <Text style={{ color: T.textMute, fontSize: 12 }}>⏰ {new Date(r.hora).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</Text>}
              </View>
              <TouchableOpacity onPress={() => borrarRecordatorio(r.id)} hitSlop={8}>
                <Ionicons name="close-circle" size={20} color={T.textMute} />
              </TouchableOpacity>
            </View>
          ))}
        </View>

        {/* Bodycam: descargar (subir) las grabaciones guardadas en el teléfono */}
        {bodycamDisponible && (
          <View style={{ alignSelf: "stretch" }} onLayout={(e) => { bodycamY.current = e.nativeEvent.layout.y; }}>
            <Text style={styles.seccion}>Bodycam</Text>
            <View style={styles.card}>
              <TouchableOpacity style={styles.row} onPress={descargarBodycam} disabled={descargandoBc}>
                <Ionicons name="cloud-upload-outline" size={20} color={T.accent} style={{ width: 28 }} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.l, { color: T.text }]}>
                    {descargandoBc ? `Descargando… ${progresoBc}` : "Descargar bodycam"}
                  </Text>
                  <Text style={{ color: T.textMute, fontSize: 12 }}>
                    {pendientesBc > 0 ? `${pendientesBc} grabación(es) pendiente(s) · conéctate a WiFi` : "Sin grabaciones pendientes"}
                  </Text>
                </View>
                {pendientesBc > 0 && !descargandoBc && (
                  <View style={styles.bcBadge}><Text style={styles.bcBadgeTxt}>{pendientesBc}</Text></View>
                )}
                {descargandoBc && <ActivityIndicator color={T.accent} />}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Cuenta: usuario + turno con su horario */}
        <Text style={styles.seccion}>Cuenta</Text>
        <View style={styles.card}>
          <View style={[styles.row, styles.rowBorder]}>
            <Ionicons name="person-circle-outline" size={20} color={T.accent} style={{ width: 28 }} />
            <Text style={styles.l}>Usuario</Text>
            <Text style={styles.v} numberOfLines={1}>{correo || "—"}</Text>
          </View>
          <View style={styles.rowCol}>
            <View style={styles.row}>
              <Ionicons name="time-outline" size={20} color={T.accent} style={{ width: 28 }} />
              <Text style={styles.l}>Turno</Text>
              <Text style={styles.v}>{turnoActual()}</Text>
            </View>
            <Text style={styles.turnoHorario}>
              {turno ? `${turno.fecha} · ${hhmm(turno.horaInicio)}–${hhmm(turno.horaFin)}` : "Sin turno activo en el sistema"}
            </Text>
          </View>
        </View>

        {aviso && <Text style={styles.aviso}>{aviso}</Text>}

        <TouchableOpacity style={styles.salir} onPress={cerrarSesion}>
          <Ionicons name="log-out-outline" size={20} color={T.danger} />
          <Text style={styles.salirTxt}>Cerrar sesión</Text>
        </TouchableOpacity>
        <View style={{ height: 24 }} />
      </KeyboardAwareScrollView>

      {/* Nuevo recordatorio del turno (con alarma obligatoria) */}
      <Modal visible={modalRecord} transparent animationType="fade" onRequestClose={() => setModalRecord(false)}>
        <View style={styles.modalBack}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitulo}>Nuevo recordatorio</Text>
            <Text style={styles.modalSub}>Solo durante tu turno; expira al terminar ({turnoActual()}). La alarma siempre suena.</Text>
            <TextInput
              style={[styles.modalInput, { height: 80, textAlignVertical: "top", paddingTop: 12 }]}
              placeholder="Ej. Revisar cámara del cruce; entregar oficio a las 14:00"
              placeholderTextColor={T.textMute}
              value={recordBorrador}
              onChangeText={setRecordBorrador}
              autoFocus
              multiline
            />
            <Text style={[styles.modalSub, { marginTop: 10, marginBottom: 4 }]}>Alarma (obligatoria, dentro de tu turno):</Text>
            <HoraInput value={recordHora} onChange={setRecordHora} placeholder="Toca para elegir la hora de la alarma" />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setModalRecord(false)}>
                <Text style={styles.modalCancelTxt}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalOk} onPress={guardarRecordatorio}>
                <Text style={styles.modalOkTxt}>Guardar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.bg },
  wrap: { alignItems: "center", padding: 20, paddingTop: 16, paddingBottom: 40 },
  hero: { alignSelf: "stretch", alignItems: "center", backgroundColor: T.surface, borderRadius: UI.radiusLg, borderWidth: 1, borderColor: T.borderSoft, paddingVertical: 22, paddingHorizontal: 16, marginBottom: 4 },
  avatar: { width: 96, height: 96, borderRadius: 48, backgroundColor: T.surfaceAlt, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: T.accent, shadowColor: T.accent, shadowOpacity: 0.5, shadowRadius: 14, shadowOffset: { width: 0, height: 0 }, elevation: 6 },
  avatarImg: { width: 96, height: 96, borderRadius: 48 },
  avatarCam: { position: "absolute", right: 2, bottom: 2, width: 30, height: 30, borderRadius: 15, backgroundColor: T.accent, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: T.surface },
  nombre: { color: T.text, fontSize: 19, fontWeight: "800", marginTop: 14, maxWidth: "100%", letterSpacing: -0.2 },
  rol: { color: T.textMute, fontSize: 12, marginTop: 3, textAlign: "center" },
  card: { alignSelf: "stretch", backgroundColor: T.surface, borderRadius: UI.radius, borderWidth: 1, borderColor: T.border, paddingHorizontal: 14, marginTop: 10 },
  row: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 52 },
  rowCol: { paddingVertical: 4 },
  rowSel: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 52 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: T.border },
  l: { color: T.textDim, fontSize: 14, flex: 1 },
  v: { color: T.text, fontSize: 15, fontWeight: "700", maxWidth: "60%" },
  turnoHorario: { color: T.textMute, fontSize: 12, marginLeft: 36, marginBottom: 8 },
  seccion: { alignSelf: "flex-start", color: T.textDim, fontSize: 12, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5, marginTop: 22, marginBottom: 2 },
  seccionRow: { alignSelf: "stretch", flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 22, marginBottom: 2 },
  recordAdd: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: T.surfaceAlt, borderWidth: 1, borderColor: T.accent, borderRadius: 20, paddingVertical: 4, paddingHorizontal: 10 },
  recordAddTxt: { color: T.accent, fontSize: 12, fontWeight: "800" },
  vacio: { alignSelf: "flex-start", color: T.textMute, fontSize: 13, marginTop: 10 },
  quitar: { alignSelf: "flex-start", color: T.textMute, fontSize: 13, marginTop: 10, textDecorationLine: "underline" },
  bodycamLbl: { alignSelf: "flex-start", color: T.textDim, fontSize: 13, marginTop: 8 },
  bcBadge: { minWidth: 24, height: 24, borderRadius: 12, backgroundColor: T.danger, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  bcBadgeTxt: { color: "#fff", fontWeight: "800", fontSize: 12 },
  aviso: { color: T.accent, fontSize: 13, textAlign: "center", marginTop: 14 },
  salir: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, alignSelf: "stretch", borderWidth: 1, borderColor: T.danger, borderRadius: UI.radiusSm, height: 52, marginTop: 28 },
  salirTxt: { color: T.danger, fontWeight: "800", fontSize: 16 },

  modalBack: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", padding: 24 },
  modalCard: { backgroundColor: T.surface, borderRadius: UI.radius, borderWidth: 1, borderColor: T.border, padding: 20 },
  modalTitulo: { color: T.text, fontSize: 17, fontWeight: "800" },
  modalSub: { color: T.textMute, fontSize: 12, marginTop: 4 },
  modalInput: { marginTop: 14, backgroundColor: T.bg, borderWidth: 1, borderColor: T.border, borderRadius: UI.radiusSm, color: T.text, fontSize: 15, paddingHorizontal: 12, height: 48 },
  modalBtns: { flexDirection: "row", gap: 10, marginTop: 16 },
  modalCancel: { flex: 1, borderWidth: 1, borderColor: T.border, borderRadius: UI.radiusSm, height: 48, alignItems: "center", justifyContent: "center" },
  modalCancelTxt: { color: T.textDim, fontWeight: "700", fontSize: 15 },
  modalOk: { flex: 1, backgroundColor: T.accent, borderRadius: UI.radiusSm, height: 48, alignItems: "center", justifyContent: "center" },
  modalOkTxt: { color: T.white, fontWeight: "800", fontSize: 15 },
});
