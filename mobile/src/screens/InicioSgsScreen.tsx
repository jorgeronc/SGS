import { useCallback, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Image, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { T } from "../theme";
import { supabase } from "../lib/supabase";
import { getMiOficial, getMiOficialValido, type MiOficial } from "../lib/oficial";
import { getMiUnidad } from "../lib/unidad";
import { getMiBodycam } from "../lib/bodycam";
import { ubicacionActual, panicoNuevoDespacho } from "../lib/panico";
import { getEstatusServicio, setEstatusServicio, type EstatusServicio } from "../lib/ubicacionVivo";

// Turno actual según la hora (diurno 06:00–18:00, nocturno 18:00–06:00).
function turnoActual(): string {
  const h = new Date().getHours();
  return h >= 6 && h < 18 ? "Diurno" : "Nocturno";
}

// Inicio del guardia (SGS): encabezado con logo + estado, y accesos rápidos.
export default function InicioSgsScreen() {
  const nav = useNavigation<any>();
  const [mio, setMio] = useState<MiOficial | null>(null);
  const [alertando, setAlertando] = useState(false);
  const [estatus, setEstatus] = useState<EstatusServicio>("en_servicio");
  const [motivoPausa, setMotivoPausa] = useState<string | null>(null);
  useFocusEffect(useCallback(() => {
    getMiOficial().then(setMio);
    getEstatusServicio().then((e) => { setEstatus(e.estatus); setMotivoPausa(e.motivo); });
  }, []));

  function cambiarEstatus(e: EstatusServicio, motivo?: string | null) {
    setEstatus(e); setMotivoPausa(motivo ?? null);
    setEstatusServicio(e, motivo ?? null);
  }

  // Enviar alerta (pánico): crea un despacho de emergencia con la ubicación del
  // guardia y arranca la transmisión de video en vivo hacia la central.
  async function enviarAlerta() {
    if (alertando) return;
    if (!mio) { Alert.alert("Sin elemento", "Selecciona tu elemento en Perfil para poder enviar alertas."); return; }
    Alert.alert(
      "🚨 Enviar alerta",
      "Se generará un despacho de emergencia con tu ubicación y se transmitirá video en vivo a la central.",
      [
        { text: "Cancelar", style: "cancel" },
        { text: "Enviar alerta", style: "destructive", onPress: ejecutarAlerta },
      ]
    );
  }

  async function ejecutarAlerta() {
    setAlertando(true);
    try {
      const g = await ubicacionActual();
      const { data: u } = await supabase.auth.getUser();
      const correo = u.user?.email ?? null;
      const [guardia, unidad, bodycam] = await Promise.all([getMiOficialValido(), getMiUnidad(), getMiBodycam()]);
      const r = await panicoNuevoDespacho(g, correo, {
        personalId: guardia?.personalId ?? null,
        patrullaId: unidad?.patrullaId ?? null,
        oficialEtq: guardia?.etiqueta ?? null,
        unidadEtq: unidad?.etiqueta ?? null,
        bodycamFolio: bodycam?.folio ?? null,
        bodycamId: bodycam?.bodycamId ?? null,
      });
      nav.navigate("Transmision", {
        despachoId: r.despachoId,
        llamadaId: r.llamadaId,
        personalId: guardia?.personalId ?? null,
        patrullaId: unidad?.patrullaId ?? null,
        bodycamId: bodycam?.bodycamId ?? null,
        bodycamFolio: bodycam?.folio ?? null,
        folio: r.folio,
      });
    } catch (e: any) {
      Alert.alert("Error al enviar la alerta", e.message ?? String(e));
    } finally {
      setAlertando(false);
    }
  }

  const accesos: { label: string; icon: keyof typeof Ionicons.glyphMap; to: string }[] = [
    { label: "Registrar rondín", icon: "qr-code", to: "Rondin" },
    { label: "Levantar incidente", icon: "alert-circle", to: "Incidente" },
    { label: "Mis incidentes", icon: "list", to: "MisIncidentes" },
    { label: "Control de acceso", icon: "id-card", to: "AccesoCaseta" },
    { label: "Nueva evidencia", icon: "camera", to: "Evidencia" },
    { label: "Mis tareas", icon: "checkbox", to: "Tareas" },
    { label: "Descargar bodycam", icon: "cloud-upload", to: "Perfil" },
    { label: "Crear un recordatorio", icon: "alarm", to: "Perfil" },
  ];

  const enLinea = !!mio;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      {/* Encabezado: logo pequeño · "SGS Móvil" · turno · estado en línea */}
      <View style={styles.header}>
        <Image source={require("../../assets/escudo.png")} style={styles.logo} resizeMode="contain" />
        <Text style={styles.marca}>SGS Móvil</Text>
        <View style={styles.headerRight}>
          <View style={styles.pill}>
            <Ionicons name="time-outline" size={13} color={T.textDim} />
            <Text style={styles.pillTxt}>{turnoActual()}</Text>
          </View>
          <View style={[styles.pill, enLinea ? styles.pillOn : styles.pillOff]}>
            <View style={[styles.dot, { backgroundColor: enLinea ? "#22c55e" : T.textMute }]} />
            <Text style={[styles.pillTxt, enLinea && { color: "#22c55e" }]}>
              {enLinea ? "En línea" : "Sin elemento"}
            </Text>
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Text style={styles.hola}>{mio?.etiqueta ? `Hola, ${mio.etiqueta}` : "Sistema de Gestión de Seguridad"}</Text>
        <Text style={styles.sub}>
          {mio?.etiqueta ? "Turno en curso · registra tus rondines" : "Selecciona tu elemento en Perfil para operar como guardia."}
        </Text>

        {enLinea && (
          <View style={styles.estadoBox}>
            <Text style={styles.estadoLbl}>Mi estado</Text>
            <View style={styles.estadoRow}>
              {([["en_servicio", "En posición", "checkmark-circle"], ["en_rondin", "En rondín", "sync-circle"], ["en_pausa", "En pausa", "pause-circle"]] as const).map(([k, lbl, ic]) => (
                <TouchableOpacity key={k} style={[styles.estChip, estatus === k && styles.estChipOn]} onPress={() => cambiarEstatus(k as EstatusServicio, k === "en_pausa" ? motivoPausa : null)}>
                  <Ionicons name={ic as any} size={16} color={estatus === k ? T.white : T.textDim} />
                  <Text style={[styles.estChipTxt, estatus === k && { color: T.white }]}>{lbl}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {estatus === "en_pausa" && (
              <View style={styles.motivoRow}>
                {["Alimentos", "Baño", "Descanso", "Otro"].map((m) => (
                  <TouchableOpacity key={m} style={[styles.motChip, motivoPausa === m && styles.motChipOn]} onPress={() => cambiarEstatus("en_pausa", m)}>
                    <Text style={[styles.motChipTxt, motivoPausa === m && { color: T.accent, fontWeight: "800" }]}>{m}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        )}

        <View style={styles.grid}>
          {accesos.map((a) => (
            <TouchableOpacity key={a.label} style={styles.card} onPress={() => nav.navigate(a.to)}>
              <View style={styles.icoBox}><Ionicons name={a.icon} size={26} color={T.accent} /></View>
              <Text style={styles.cardTxt}>{a.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Enviar alerta (pánico) → despacho de emergencia + transmisión en vivo */}
        <TouchableOpacity activeOpacity={0.85} onPress={enviarAlerta} disabled={alertando} style={styles.alertaWrap}>
          <LinearGradient colors={[T.danger, T.danger2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.alerta}>
            <Ionicons name="warning" size={26} color="#fff" />
            <Text style={styles.alertaTxt}>{alertando ? "ENVIANDO…" : "ENVIAR ALERTA"}</Text>
          </LinearGradient>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.bg },
  header: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 16, paddingTop: 6, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: T.borderSoft,
  },
  logo: { width: 40, height: 40, backgroundColor: "#fff", borderRadius: 9, padding: 4 },
  marca: { color: T.text, fontSize: 17, fontWeight: "800" },
  headerRight: { flex: 1, flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: 8 },
  pill: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: T.surface, borderColor: T.border, borderWidth: 1,
    borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5,
  },
  pillOn: { borderColor: "rgba(34,197,94,0.4)", backgroundColor: "rgba(34,197,94,0.10)" },
  pillOff: {},
  pillTxt: { color: T.textDim, fontSize: 12, fontWeight: "700" },
  dot: { width: 8, height: 8, borderRadius: 4 },
  hola: { color: T.text, fontSize: 22, fontWeight: "800" },
  sub: { color: T.textDim, fontSize: 13.5, marginTop: 4, marginBottom: 14 },
  estadoBox: { backgroundColor: T.surface, borderColor: T.border, borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 16 },
  estadoLbl: { color: T.textMute, fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 8 },
  estadoRow: { flexDirection: "row", gap: 8 },
  estChip: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: T.border, backgroundColor: T.surfaceAlt },
  estChipOn: { backgroundColor: T.accent, borderColor: T.accent },
  estChipTxt: { color: T.textDim, fontWeight: "700", fontSize: 12.5 },
  motivoRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  motChip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: T.border, backgroundColor: T.surfaceAlt },
  motChipOn: { borderColor: T.accent, backgroundColor: T.accentBg },
  motChipTxt: { color: T.textDim, fontWeight: "700", fontSize: 12.5 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  card: { width: "47%", backgroundColor: T.surface, borderColor: T.border, borderWidth: 1, borderRadius: 16, padding: 16, gap: 10 },
  icoBox: { width: 46, height: 46, borderRadius: 12, backgroundColor: T.accentBg, alignItems: "center", justifyContent: "center" },
  cardTxt: { color: T.text, fontSize: 15, fontWeight: "700" },
  alertaWrap: { marginTop: 22, borderRadius: 16, overflow: "hidden" },
  alerta: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 18 },
  alertaTxt: { color: "#fff", fontSize: 18, fontWeight: "900", letterSpacing: 0.5 },
});
