import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, FlatList, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../lib/supabase";
import { T, UI } from "../theme";

function nombre(p: any) {
  const x = p?.persona;
  return x ? `${x.nombre ?? ""} ${x.apellido_paterno ?? ""} ${x.apellido_materno ?? ""}`.trim() : "—";
}
const conNovedad = (n: string | null) => !!n && n.trim() !== "" && n.trim().toLowerCase() !== "sin novedad";
const fmtFecha = (d: Date) => d.toISOString().slice(0, 10);

interface Paso { id: string; fecha_hora: string; novedad: string | null; punto: string; sitio: string }

// Supervisión de rondín (móvil, solo mandos): elige un guardia y una fecha para
// ver el historial de su recorrido (puntos de control, hora y novedades).
export default function SupervisionScreen() {
  const [guardias, setGuardias] = useState<any[]>([]);
  const [guardiaId, setGuardiaId] = useState("");
  const [fecha, setFecha] = useState<Date>(new Date());
  const [pasos, setPasos] = useState<Paso[]>([]);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    supabase.from("personal").select("id, categoria, persona:personas(nombre, apellido_paterno, apellido_materno)")
      .eq("estatus", "activo").eq("estado_laboral", "activo")
      .then(({ data }) => setGuardias((data as any[]) ?? []));
  }, []);

  useEffect(() => {
    if (!guardiaId) { setPasos([]); return; }
    (async () => {
      setCargando(true);
      const f = fmtFecha(fecha);
      const { data } = await supabase.from("rondines")
        .select("id, fecha_hora, novedad, punto:puntos_control(nombre, sitio:sitios(nombre))")
        .eq("personal_id", guardiaId).eq("estatus", "activo")
        .gte("fecha_hora", `${f}T00:00:00`).lte("fecha_hora", `${f}T23:59:59.999`)
        .order("fecha_hora", { ascending: true });
      setPasos(((data as any[]) ?? []).map((r) => ({
        id: r.id, fecha_hora: r.fecha_hora, novedad: r.novedad,
        punto: r.punto?.nombre ?? "Punto", sitio: r.punto?.sitio?.nombre ?? "",
      })));
      setCargando(false);
    })();
  }, [guardiaId, fecha]);

  function moverDia(delta: number) {
    setFecha((d) => { const n = new Date(d); n.setDate(n.getDate() + delta); return n; });
  }
  const novedades = pasos.filter((p) => conNovedad(p.novedad)).length;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Text style={styles.titulo}>Supervisión de rondín</Text>

      {/* Selector de guardia */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {guardias.map((g) => (
          <TouchableOpacity key={g.id} style={[styles.chip, guardiaId === g.id && styles.chipOn]} onPress={() => setGuardiaId(g.id)}>
            <Text style={[styles.chipTxt, guardiaId === g.id && styles.chipTxtOn]} numberOfLines={1}>{nombre(g)}</Text>
          </TouchableOpacity>
        ))}
        {guardias.length === 0 && <Text style={styles.sub}>Sin guardias activos.</Text>}
      </ScrollView>

      {/* Selector de fecha */}
      <View style={styles.fechaRow}>
        <TouchableOpacity onPress={() => moverDia(-1)} style={styles.fBtn}><Ionicons name="chevron-back" size={20} color={T.text} /></TouchableOpacity>
        <Text style={styles.fechaTxt}>{fecha.toLocaleDateString()}</Text>
        <TouchableOpacity onPress={() => moverDia(1)} style={styles.fBtn}><Ionicons name="chevron-forward" size={20} color={T.text} /></TouchableOpacity>
        <TouchableOpacity onPress={() => setFecha(new Date())} style={styles.hoyBtn}><Text style={styles.hoyTxt}>Hoy</Text></TouchableOpacity>
      </View>

      {!guardiaId ? (
        <View style={styles.vacio}><Ionicons name="person-outline" size={40} color={T.textMute} /><Text style={styles.sub}>Elige un guardia para ver su recorrido.</Text></View>
      ) : cargando ? (
        <View style={styles.vacio}><ActivityIndicator color={T.accent} /></View>
      ) : (
        <>
          <View style={styles.resumen}>
            <Text style={styles.resTxt}>{pasos.length} lectura{pasos.length === 1 ? "" : "s"}</Text>
            <Text style={[styles.resTxt, novedades ? { color: T.danger } : undefined]}>{novedades} con novedad</Text>
          </View>
          <FlatList
            data={pasos}
            keyExtractor={(p) => p.id}
            contentContainerStyle={{ padding: 16 }}
            ListEmptyComponent={<Text style={styles.sub}>Sin lecturas de rondín en esta fecha.</Text>}
            renderItem={({ item, index }) => (
              <View style={styles.tlItem}>
                <View style={[styles.dot, conNovedad(item.novedad) && { backgroundColor: T.danger }]} />
                <View style={styles.tlBody}>
                  <Text style={styles.tlPunto}>{index + 1}. {item.punto}{item.sitio ? ` · ${item.sitio}` : ""}</Text>
                  <Text style={styles.tlMeta}>
                    {new Date(item.fecha_hora).toLocaleString()}
                    {conNovedad(item.novedad) ? ` · ⚠ ${item.novedad}` : " · Sin novedad"}
                  </Text>
                </View>
              </View>
            )}
          />
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.bg },
  titulo: { color: T.text, fontSize: 22, fontWeight: "800", paddingHorizontal: 16, paddingTop: 8, paddingBottom: 6 },
  sub: { color: T.textDim, fontSize: 13.5, marginTop: 8 },
  chips: { paddingHorizontal: 12, gap: 8, paddingVertical: 4 },
  chip: { borderWidth: 1, borderColor: T.border, borderRadius: 20, paddingVertical: 7, paddingHorizontal: 12, backgroundColor: T.surface, maxWidth: 190 },
  chipOn: { backgroundColor: T.accent, borderColor: T.accent },
  chipTxt: { color: T.textDim, fontWeight: "700", fontSize: 12.5 },
  chipTxtOn: { color: T.white },
  fechaRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 10 },
  fBtn: { padding: 6, backgroundColor: T.surface, borderRadius: 8, borderWidth: 1, borderColor: T.border },
  fechaTxt: { color: T.text, fontSize: 15, fontWeight: "700", minWidth: 130, textAlign: "center" },
  hoyBtn: { marginLeft: "auto", paddingHorizontal: 12, paddingVertical: 7, backgroundColor: T.surfaceAlt, borderRadius: 8 },
  hoyTxt: { color: T.accent, fontWeight: "700", fontSize: 13 },
  resumen: { flexDirection: "row", gap: 16, paddingHorizontal: 16, paddingBottom: 4 },
  resTxt: { color: T.textDim, fontSize: 13, fontWeight: "700" },
  vacio: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, padding: 24 },
  tlItem: { flexDirection: "row", gap: 12, paddingBottom: 14 },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: T.accent, marginTop: 4, borderWidth: 2, borderColor: T.bg },
  tlBody: { flex: 1, borderLeftWidth: 0 },
  tlPunto: { color: T.text, fontSize: 15, fontWeight: "700" },
  tlMeta: { color: T.textDim, fontSize: 12.5, marginTop: 2 },
});
