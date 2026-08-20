import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  Image,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Alert,
  PermissionsAndroid,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation } from "@react-navigation/native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";
import { getAtencion } from "../lib/atencion";
import { ubicacionActual, incidenteAtendible, panicoNuevoDespacho, panicoRelacionarIncidente } from "../lib/panico";
import { getMiOficialValido } from "../lib/oficial";
import { getMiUnidad } from "../lib/unidad";
import { getMiBodycam } from "../lib/bodycam";
import { getAccesos, accesoPorKey } from "../lib/accesos";
import { iniciarBodycam, detenerBodycam, bodycamGrabando, bodycamDisponible, pendientesBodycam } from "../lib/bodycamHd";
import { recordatoriosVigentes } from "../lib/recordatorios";
import { T, UI } from "../theme";

function turnoActual(): string {
  const h = new Date().getHours();
  if (h >= 6 && h < 14) return "Matutino";
  if (h >= 14 && h < 22) return "Vespertino";
  return "Nocturno";
}

type IconName = keyof typeof Ionicons.glyphMap;

export default function InicioScreen() {
  const nav = useNavigation<any>();
  const [despachos, setDespachos] = useState(0);
  const [informes, setInformes] = useState(0);
  const [abordamientos, setAbordamientos] = useState(0);
  const [accidentes, setAccidentes] = useState(0);
  const [misTareas, setMisTareas] = useState(0);
  const [videosDesc, setVideosDesc] = useState(0);
  const [incAtendidos, setIncAtendidos] = useState(0);
  const [recordatorios, setRecordatorios] = useState(0);
  const [ultimo, setUltimo] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [panicoOcupado, setPanicoOcupado] = useState(false);
  const [tengoOficial, setTengoOficial] = useState(true);
  const [accesos, setAccesos] = useState<string[]>([]);
  const [grabandoBc, setGrabandoBc] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setGrabandoBc(bodycamGrabando());
    setAccesos(await getAccesos());
    setVideosDesc(await pendientesBodycam());
    setRecordatorios((await recordatoriosVigentes()).length);

    const oficial = await getMiOficialValido();
    setTengoOficial(!!oficial);
    const pid = oficial?.personalId ?? null;

    if (pid) {
      const [cd, ci, ca, cac, ct, cia] = await Promise.all([
        supabase.from("despachos").select("id", { count: "exact", head: true })
          .eq("personal_id", pid).eq("estatus", "activo").neq("estado", "cerrado"),
        supabase.from("incidentes").select("id", { count: "exact", head: true })
          .eq("oficial_personal_id", pid).eq("estatus", "activo").in("estado", ["abierto", "en_proceso"]),
        supabase.from("abordamientos").select("id", { count: "exact", head: true })
          .eq("oficial_personal_id", pid).eq("estatus", "activo"),
        supabase.from("accidentes").select("id", { count: "exact", head: true })
          .eq("oficial_personal_id", pid).eq("estatus", "activo").or("estatus_atencion.is.null,estatus_atencion.ilike.Atend%"),
        supabase.from("tarea_asignaciones").select("id, tarea:tareas_vigentes!inner(id)", { count: "exact", head: true })
          .eq("personal_id", pid).eq("estatus", "activo").neq("respuesta", "completada"),
        supabase.from("despachos").select("id", { count: "exact", head: true })
          .eq("personal_id", pid).eq("estatus", "activo").eq("estado", "cerrado"),
      ]);
      setDespachos(cd.count ?? 0);
      setInformes(ci.count ?? 0);
      setAbordamientos(ca.count ?? 0);
      setAccidentes(cac.count ?? 0);
      setMisTareas(ct.count ?? 0);
      setIncAtendidos(cia.count ?? 0);

      const { data: ui } = await supabase
        .from("incidentes")
        .select("folio, tipo, delito, creado_en")
        .eq("oficial_personal_id", pid)
        .order("creado_en", { ascending: false })
        .limit(1)
        .maybeSingle();
      setUltimo(ui ? `${(ui as any).folio ?? "s/folio"} · ${(ui as any).delito ?? (ui as any).tipo ?? "—"}` : null);
    } else {
      setDespachos(0); setInformes(0); setAbordamientos(0); setAccidentes(0);
      setMisTareas(0); setIncAtendidos(0); setUltimo(null);
    }
    setCargando(false);
  }, []);

  useEffect(() => {
    const unsub = nav.addListener("focus", cargar);
    return unsub;
  }, [nav, cargar]);


  async function ejecutarNuevoDespacho(g: any, correoActual: string | null) {
    setPanicoOcupado(true);
    try {
      // Identidad + unidad + bodycam del oficial, para dejar constancia.
      const [oficial, unidad, bodycam] = await Promise.all([getMiOficialValido(), getMiUnidad(), getMiBodycam()]);
      const r = await panicoNuevoDespacho(g, correoActual, {
        personalId: oficial?.personalId ?? null,
        patrullaId: unidad?.patrullaId ?? null,
        oficialEtq: oficial?.etiqueta ?? null,
        unidadEtq: unidad?.etiqueta ?? null,
        bodycamFolio: bodycam?.folio ?? null,
        bodycamId: bodycam?.bodycamId ?? null,
      });
      // Arranca la transmisión en vivo (bodycam) ligada al despacho de pánico.
      cargar();
      nav.navigate("Transmision", {
        despachoId: r.despachoId,
        llamadaId: r.llamadaId,
        personalId: oficial?.personalId ?? null,
        patrullaId: unidad?.patrullaId ?? null,
        bodycamId: bodycam?.bodycamId ?? null,
        bodycamFolio: bodycam?.folio ?? null,
        folio: r.folio,
      });
    } catch (e: any) {
      Alert.alert("Error", e.message ?? String(e));
    } finally {
      setPanicoOcupado(false);
    }
  }

  async function ejecutarRelacion(incidenteId: string, folio: string | null, g: any, correoActual: string | null) {
    setPanicoOcupado(true);
    try {
      await panicoRelacionarIncidente(incidenteId, g, correoActual);
      Alert.alert("🚨 Alerta registrada", `Se agregó la alerta al incidente ${folio ?? "en atención"} y se envió tu ubicación.`);
    } catch (e: any) {
      Alert.alert("Error", e.message ?? String(e));
    } finally {
      setPanicoOcupado(false);
    }
  }

  async function enviarAlerta() {
    if (panicoOcupado) return;
    setPanicoOcupado(true);
    const g = await ubicacionActual();
    const { data: u } = await supabase.auth.getUser();
    const correoActual = u.user?.email ?? null;
    const at = await getAtencion();
    const atiende = at && (await incidenteAtendible(at.incidenteId)) ? at : null;
    setPanicoOcupado(false);

    if (atiende) {
      Alert.alert(
        "🚨 Enviar alerta",
        `Estás atendiendo ${atiende.folio ?? "un incidente"}. ¿Cómo registrar la alerta?`,
        [
          { text: "Cancelar", style: "cancel" },
          { text: "Nuevo despacho", onPress: () => ejecutarNuevoDespacho(g, correoActual) },
          { text: `Relacionar ${atiende.folio ?? "incidente"}`, style: "destructive", onPress: () => ejecutarRelacion(atiende.incidenteId, atiende.folio, g, correoActual) },
        ]
      );
    } else {
      Alert.alert(
        "🚨 Enviar alerta",
        "Se generará un despacho de emergencia con tu ubicación y se solicitará apoyo inmediato.",
        [
          { text: "Cancelar", style: "cancel" },
          { text: "Enviar alerta", style: "destructive", onPress: () => ejecutarNuevoDespacho(g, correoActual) },
        ]
      );
    }
  }

  async function toggleBodycam() {
    if (!bodycamDisponible) {
      Alert.alert("Bodycam", "Disponible solo en el build de la app en Android (no en Expo Go).");
      return;
    }
    if (grabandoBc || bodycamGrabando()) {
      await detenerBodycam();
      setGrabandoBc(false);
      Alert.alert("Bodycam detenida", "Los videos se guardaron en el teléfono. Descárgalos en Perfil → «Descargar bodycam» cuando estés en WiFi (en la agencia).");
      return;
    }
    if (Platform.OS === "android") {
      const perms: any[] = [PermissionsAndroid.PERMISSIONS.CAMERA, PermissionsAndroid.PERMISSIONS.RECORD_AUDIO];
      const notif = (PermissionsAndroid.PERMISSIONS as any).POST_NOTIFICATIONS;
      if (notif) perms.push(notif);
      const res = await PermissionsAndroid.requestMultiple(perms);
      if (res[PermissionsAndroid.PERMISSIONS.CAMERA] !== "granted") {
        Alert.alert("Permiso", "Se requiere permiso de cámara y micrófono para la bodycam.");
        return;
      }
    }
    const r = await iniciarBodycam();
    if (!r.ok) { Alert.alert("Bodycam", r.error ?? "No se pudo iniciar."); return; }
    setGrabandoBc(true);
    Alert.alert("🔴 Bodycam activa", "Grabando en HD en segundo plano. Móntala mirando al frente; puedes bloquear la pantalla y guardar el teléfono.");
  }

  const menu: { icon: IconName; label: string; sub: string; onPress: () => void }[] = [
    { icon: "search-outline", label: "Consulta rápida", sub: "Personas, vehículos, incidentes, órdenes y casos", onPress: () => nav.navigate("Buscar") },
    { icon: "add-circle-outline", label: "Nuevo registro", sub: "Informe, accidente o abordamiento", onPress: () => nav.navigate("Nuevo") },
    { icon: "clipboard-outline", label: "Mis tareas", sub: "Tareas asignadas a mi unidad", onPress: () => nav.navigate("Tareas") },
    { icon: "briefcase-outline", label: "Casos asignados", sub: "Ver casos y seguimiento", onPress: () => nav.navigate("Casos") },
    { icon: "location-outline", label: "Incidentes abiertos", sub: "Eventos en atención cerca de ti", onPress: () => nav.navigate("Ubicacion") },
  ];

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={cargando} onRefresh={cargar} tintColor={T.accent} />}
      >
        <View style={styles.header}>
          <Image source={require("../../assets/escudo.png")} style={styles.escudo} resizeMode="contain" />
          <Text style={styles.brand}>SCP Móvil</Text>
          <View style={styles.headMeta}>
            <Ionicons name="time-outline" size={13} color={T.textDim} />
            <Text style={styles.metaTxt}>{turnoActual()}</Text>
            <View style={styles.dotOk} />
            <Text style={styles.metaTxt}>En línea</Text>
          </View>
        </View>

        {/* Indicadores del usuario (grid de 8) */}
        <View style={styles.stats}>
          <Stat num={despachos} lbl="Despachos activos" color={T.accent} onPress={() => nav.navigate("Despachos")} />
          <Stat num={informes} lbl="Informes abiertos" color={T.busy} onPress={() => nav.navigate("MisIncidentes")} />
          <Stat num={abordamientos} lbl="Abordamientos" color={T.gold} />
          <Stat num={accidentes} lbl="Accidentes abiertos" color={T.ok} />
          <Stat num={misTareas} lbl="Mis tareas del día" color={T.busy} onPress={() => nav.navigate("Tareas")} />
          <Stat num={videosDesc} lbl="Videos por descargar" color={T.warn} onPress={() => nav.navigate("Perfil")} />
          <Stat num={incAtendidos} lbl="Incidentes atendidos" color={T.ok} onPress={() => nav.navigate("Despachos")} />
          <Stat num={recordatorios} lbl="Recordatorios" color={T.gold} onPress={() => nav.navigate("Perfil")} />
        </View>
        {!tengoOficial && (
          <TouchableOpacity style={styles.aviso} onPress={() => nav.navigate("Perfil")} activeOpacity={0.8}>
            <Ionicons name="person-circle-outline" size={16} color={T.warn} />
            <Text style={styles.avisoTxt}>Selecciona tu elemento en Perfil para ver tus indicadores.</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.ultimo} onPress={() => nav.navigate("Casos")} activeOpacity={0.8}>
          <Ionicons name="document-text-outline" size={16} color={T.textDim} />
          <Text style={styles.ultimoTxt} numberOfLines={1}>
            Último informe: <Text style={styles.ultimoStrong}>{ultimo ?? "sin informes"}</Text>
          </Text>
        </TouchableOpacity>

        {/* Accesos rápidos configurables */}
        <Text style={styles.seccion}>Accesos rápidos</Text>
        <View style={styles.quick}>
          {accesos.map((k) => {
            const a = accesoPorKey(k);
            if (!a) return null;
            return <QuickAction key={k} icon={a.icon} label={a.label} onPress={() => nav.navigate(a.ruta)} />;
          })}
        </View>

        {/* Menú principal */}
        <Text style={styles.seccion}>Módulos</Text>
        <View style={styles.card}>
          {menu.map((m, i) => (
            <TouchableOpacity
              key={m.label}
              style={[styles.row, i < menu.length - 1 && styles.rowBorder]}
              onPress={m.onPress}
              activeOpacity={0.7}
            >
              <Ionicons name={m.icon} size={24} color={T.accent} style={{ width: 30 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>{m.label}</Text>
                <Text style={styles.rowSub} numberOfLines={1}>{m.sub}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={T.textMute} />
            </TouchableOpacity>
          ))}
        </View>

        {/* Botón de alerta / emergencia (transmisión en vivo) */}
        <TouchableOpacity activeOpacity={0.85} onPress={enviarAlerta} disabled={panicoOcupado} style={styles.panicoWrap}>
          <LinearGradient colors={[T.danger, T.danger2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.panico}>
            <Ionicons name="warning" size={24} color={T.white} />
            <Text style={styles.panicoTxt}>{panicoOcupado ? "ENVIANDO…" : "ENVIAR ALERTA!"}</Text>
          </LinearGradient>
        </TouchableOpacity>

        {/* Bodycam: grabación local HD en segundo plano (manos libres) */}
        <TouchableOpacity style={[styles.bodycam, grabandoBc && styles.bodycamOn]} activeOpacity={0.85} onPress={toggleBodycam}>
          <Ionicons name={grabandoBc ? "stop-circle" : "videocam"} size={22} color={grabandoBc ? T.white : T.accent} />
          <Text style={[styles.bodycamTxt, grabandoBc && { color: T.white }]}>
            {grabandoBc ? "DETENER BODYCAM" : "ACTIVAR BODYCAM"}
          </Text>
          {grabandoBc && <View style={styles.recDot} />}
        </TouchableOpacity>
        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ num, lbl, color, onPress }: { num: number; lbl: string; color?: string; onPress?: () => void }) {
  const Cmp: any = onPress ? TouchableOpacity : View;
  const c = color ?? T.accent;
  return (
    <Cmp style={styles.stat} onPress={onPress} activeOpacity={0.85}>
      {/* Luces de patrulla: resplandor azul (arriba-izq) y rojo (abajo-der), sutil */}
      <View style={styles.glowAzul} />
      <View style={styles.glowRojo} />
      <Text style={[styles.statNum, { color: c }]}>{num}</Text>
      <Text style={styles.statLbl} numberOfLines={2}>{lbl}</Text>
    </Cmp>
  );
}

function QuickAction({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.qa} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.qaIcon}><Ionicons name={icon} size={24} color={T.accent} /></View>
      <Text style={styles.qaLabel} numberOfLines={2}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.bg },
  scroll: { padding: 16, paddingBottom: 8 },
  header: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 16 },
  escudo: { width: 26, height: 30 },
  brand: { color: T.text, fontSize: 17, fontWeight: "800", flex: 1 },
  headMeta: { flexDirection: "row", alignItems: "center", gap: 6 },
  metaTxt: { color: T.textDim, fontSize: 12 },
  dotOk: { width: 8, height: 8, borderRadius: 4, backgroundColor: T.ok, marginLeft: 4 },

  stats: { flexDirection: "row", flexWrap: "wrap", gap: UI.gap },
  stat: { flexGrow: 1, flexBasis: "21%", minWidth: 68, backgroundColor: T.surfaceAlt, borderRadius: UI.radius, paddingVertical: 9, paddingHorizontal: 9, borderWidth: 1, borderColor: T.borderSoft, overflow: "hidden" },
  glowAzul: { position: "absolute", left: -18, top: -18, width: 56, height: 56, borderRadius: 30, backgroundColor: "#2563EB", opacity: 0.16 },
  glowRojo: { position: "absolute", right: -18, bottom: -18, width: 56, height: 56, borderRadius: 30, backgroundColor: "#EF4444", opacity: 0.16 },
  statNum: { color: T.accent, fontSize: 21, fontWeight: "900", letterSpacing: -0.5 },
  statLbl: { color: T.textDim, fontSize: 10, marginTop: 2, lineHeight: 12 },
  aviso: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: T.warnBg, borderRadius: UI.radiusSm, padding: 10, marginTop: UI.gap, borderWidth: 1, borderColor: T.warn },
  avisoTxt: { color: T.warn, fontSize: 12, flex: 1, fontWeight: "600" },
  ultimo: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: T.surface, borderRadius: UI.radiusSm, padding: 12, marginTop: UI.gap, borderWidth: 1, borderColor: T.border },
  ultimoTxt: { color: T.textDim, fontSize: 13, flex: 1 },
  ultimoStrong: { color: T.text, fontWeight: "700" },

  seccion: { color: T.textDim, fontSize: 13, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, marginTop: 22, marginBottom: 10 },

  quick: { flexDirection: "row", flexWrap: "wrap", gap: UI.gap, rowGap: 14 },
  qa: { width: "22%", alignItems: "center", gap: 8 },
  qaIcon: { width: 58, height: 58, borderRadius: UI.radius, backgroundColor: T.surfaceAlt, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: T.border },
  qaLabel: { color: T.textDim, fontSize: 10, lineHeight: 12, fontWeight: "600", textAlign: "center" },

  card: { backgroundColor: T.surface, borderRadius: UI.radius, borderWidth: 1, borderColor: T.border, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, minHeight: UI.touch },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: T.border },
  rowLabel: { color: T.text, fontSize: 16, fontWeight: "700" },
  rowSub: { color: T.textMute, fontSize: 12, marginTop: 1 },

  panicoWrap: { marginTop: 24, borderRadius: UI.radius, shadowColor: T.danger, shadowOpacity: 0.5, shadowRadius: 16, shadowOffset: { width: 0, height: 10 }, elevation: 8 },
  panico: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, borderRadius: UI.radius, height: 58 },
  panicoTxt: { color: T.white, fontSize: 16, fontWeight: "900", letterSpacing: 0.8 },

  bodycam: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, height: 52, marginTop: 12, borderRadius: UI.radius, borderWidth: 1.5, borderColor: T.accentDim, backgroundColor: T.surfaceAlt },
  bodycamOn: { backgroundColor: "#8a1220", borderColor: "#8a1220" },
  bodycamTxt: { color: T.accent, fontSize: 15, fontWeight: "800", letterSpacing: 0.5 },
  recDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: "#fff" },
});
