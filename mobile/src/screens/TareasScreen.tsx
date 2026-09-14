import { useCallback, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, FlatList, RefreshControl, ActivityIndicator, Image, Alert, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";
import { urlFoto, primeraFoto } from "../lib/fotos";
import { getMiOficialValido } from "../lib/oficial";
import { getSitiosSupervisados } from "../lib/unidad";
import { tomarFotoEvidenciaTarea, evidenciasMiniPorTarea, type EvidenciaMini } from "../lib/tareaEvidencia";
import BodycamBoton from "../components/BodycamBoton";
import { T, UI } from "../theme";

interface Asignacion {
  id: string;
  respuesta: string;
  respondido_en: string | null;
  tarea: {
    id: string; folio: string | null; tipo: string | null; motivo: string | null; asunto: string | null;
    instrucciones: string | null; direccion: string | null; latitud: number | null; longitud: number | null;
    vigencia_hasta: string | null; prioridad: string | null; fotografias: unknown;
  } | null;
}

const RESPUESTAS: { k: string; label: string; color: string; icon: any }[] = [
  { k: "enterado", label: "Enterado", color: T.accent, icon: "checkmark-circle-outline" },
  { k: "atendiendo", label: "Atendiendo", color: T.warn, icon: "walk-outline" },
  { k: "completada", label: "Completada", color: T.ok, icon: "flag-outline" },
];
const ESTADO_LBL: Record<string, string> = { abierta: "Abierta", en_proceso: "En proceso", completada: "Completada", vencida: "Vencida" };
const ESTADO_COLOR: Record<string, string> = { abierta: T.textMute, en_proceso: T.warn, completada: T.ok, vencida: T.danger };

function colorPrioridad(p: string | null): string {
  if (p === "alta") return T.danger;
  if (p === "baja") return T.accent;
  return T.warn;
}
function vence(t: { vigencia_hasta: string | null } | null): { txt: string; vencida: boolean } {
  if (!t?.vigencia_hasta) return { txt: "Sin vencimiento", vencida: false };
  const f = new Date(t.vigencia_hasta);
  const vencida = f < new Date();
  return { txt: `${vencida ? "Venció" : "Vence"} ${f.toLocaleString()}`, vencida };
}
const nombrePersonal = (p: any) => {
  const x = p?.persona;
  return x ? `${x.nombre ?? ""} ${x.apellido_paterno ?? ""} ${x.apellido_materno ?? ""}`.trim() : "—";
};

export default function TareasScreen() {
  const [modo, setModo] = useState<"mias" | "guardias">("mias");
  const [esSuper, setEsSuper] = useState(false);
  const [items, setItems] = useState<Asignacion[]>([]);        // Mis tareas (asignadas a mí)
  const [guardiasItems, setGuardiasItems] = useState<any[]>([]); // Tareas de mis guardias (sitios que superviso)
  const [nombres, setNombres] = useState<Record<string, string>>({}); // personal.id -> nombre
  const [evMini, setEvMini] = useState<Record<string, EvidenciaMini>>({});
  const [cargando, setCargando] = useState(false);
  const [sinOficial, setSinOficial] = useState(false);
  const [guardando, setGuardando] = useState<string | null>(null);
  const [tomando, setTomando] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    const oficial = await getMiOficialValido();
    setSinOficial(!oficial);
    if (!oficial) { setItems([]); setGuardiasItems([]); setEsSuper(false); setCargando(false); return; }

    // Mis tareas (asignadas a mí).
    const { data: asig } = await supabase
      .from("tarea_asignaciones")
      .select("id, respuesta, respondido_en, tarea:tareas_vigentes!inner(id, folio, tipo, motivo, asunto, instrucciones, direccion, latitud, longitud, vigencia_hasta, prioridad, fotografias)")
      .eq("personal_id", oficial.personalId).eq("estatus", "activo")
      .order("creado_en", { ascending: false }).limit(100);
    const mias = ((asig as any[]) ?? []) as Asignacion[];
    setItems(mias);

    // ¿Superviso sitios en el turno activo? → tareas de mis guardias (todos los estatus).
    const sitios = await getSitiosSupervisados(oficial.personalId);
    setEsSuper(sitios.length > 0);
    let gItems: any[] = [];
    if (sitios.length) {
      const { data } = await supabase.from("tareas")
        .select("id, folio, tipo, asunto, estado, prioridad, vigencia_hasta, sitio_id, fotografias, completada_por, atendida_por, sitio:sitios(nombre)")
        .in("sitio_id", sitios).eq("estatus", "activo").eq("es_plantilla", false)
        .order("creado_en", { ascending: false }).limit(150);
      gItems = (data as any[]) ?? [];
      setGuardiasItems(gItems);
      // Nombres de quien atiende/completó.
      const pids = Array.from(new Set(gItems.flatMap((g) => [g.completada_por, g.atendida_por]).filter(Boolean)));
      if (pids.length) {
        const { data: ps } = await supabase.from("personal").select("id, persona:personas(nombre, apellido_paterno, apellido_materno)").in("id", pids);
        const m: Record<string, string> = {};
        ((ps as any[]) ?? []).forEach((p) => { m[p.id] = nombrePersonal(p); });
        setNombres(m);
      }
    } else {
      setGuardiasItems([]);
      if (modo === "guardias") setModo("mias");
    }

    // Evidencia (mini) de todas las tareas visibles.
    const ids = Array.from(new Set([...mias.map((a) => a.tarea?.id).filter(Boolean) as string[], ...gItems.map((g) => g.id)]));
    setEvMini(await evidenciasMiniPorTarea(ids));
    setCargando(false);
  }, [modo]);

  useFocusEffect(useCallback(() => { cargar(); }, [cargar]));

  async function responder(a: Asignacion, k: string) {
    setGuardando(a.id);
    const { error } = await supabase.from("tarea_asignaciones").update({ respuesta: k }).eq("id", a.id);
    setGuardando(null);
    if (error) { Alert.alert("No se pudo cambiar", error.message); return; }
    setItems((prev) => prev.map((x) => (x.id === a.id ? { ...x, respuesta: k, respondido_en: new Date().toISOString() } : x)));
  }
  async function fotoEvidencia(tareaId: string, folio: string | null) {
    try {
      setTomando(tareaId);
      const ok = await tomarFotoEvidenciaTarea(tareaId, folio);
      if (ok) { const ev = await evidenciasMiniPorTarea([tareaId]); setEvMini((p) => ({ ...p, ...ev })); Alert.alert("Evidencia", "Foto guardada como evidencia de la tarea."); }
    } catch (e: any) { Alert.alert("Error", e?.message ?? String(e)); }
    finally { setTomando(null); }
  }
  function comoLlegar(t: { latitud: number | null; longitud: number | null } | null) {
    if (!t?.latitud || !t?.longitud) { Alert.alert("Sin ubicación", "Esta tarea no tiene coordenadas."); return; }
    Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${t.latitud},${t.longitud}&travelmode=driving`);
  }
  // Miniatura: 1ª evidencia (foto) o, en su defecto, la foto de instrucción.
  const miniUri = (tareaId: string, fotografias: unknown) => urlFoto(evMini[tareaId]?.foto ?? primeraFoto(fotografias));

  const renderMia = ({ item }: { item: Asignacion }) => {
    const t = item.tarea; if (!t) return null;
    const v = vence(t);
    const foto = miniUri(t.id, t.fotografias);
    const ev = evMini[t.id];
    return (
      <View style={[styles.card, v.vencida && styles.cardVencida]}>
        <View style={[styles.stripe, { backgroundColor: colorPrioridad(t.prioridad) }]} />
        <View style={styles.head}>
          <View style={[styles.icon, { backgroundColor: t.prioridad === "alta" ? T.warnBg : T.accentBg }]}>
            <Ionicons name="clipboard" size={18} color={t.prioridad === "alta" ? T.warn : T.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.titulo} numberOfLines={2}>{t.folio ? `${t.folio} · ` : ""}{t.tipo ?? "Tarea"}</Text>
            {!!t.motivo && <Text style={styles.motivo}>Motivo: {t.motivo}</Text>}
          </View>
          {t.prioridad === "alta" && <View style={styles.prio}><Text style={styles.prioTxt}>ALTA</Text></View>}
        </View>
        {!!t.asunto && <Text style={styles.asunto}>{t.asunto}</Text>}
        {!!foto && <Image source={{ uri: foto }} style={styles.foto} resizeMode="cover" />}
        {ev?.video && <Text style={styles.evTag}>🎥 Con video de evidencia</Text>}
        {!!t.instrucciones && <Text style={styles.instr}>{t.instrucciones}</Text>}
        {!!t.direccion && (
          <TouchableOpacity style={styles.lugar} onPress={() => comoLlegar(t)} activeOpacity={0.7}>
            <Ionicons name="location" size={15} color={T.accent} />
            <Text style={styles.lugarTxt} numberOfLines={2}>{t.direccion}</Text>
            <Ionicons name="navigate" size={15} color={T.accent} />
          </TouchableOpacity>
        )}
        <Text style={[styles.vence, v.vencida && { color: T.danger }]}>{v.txt}{v.vencida ? " · se oculta 24 h después" : ""}</Text>
        <View style={styles.btns}>
          {RESPUESTAS.map((r) => {
            const on = item.respuesta === r.k;
            return (
              <TouchableOpacity key={r.k} style={[styles.btn, { borderColor: r.color }, on && { backgroundColor: r.color }]}
                disabled={guardando === item.id} onPress={() => responder(item, r.k)}>
                <Ionicons name={r.icon} size={15} color={on ? T.white : r.color} />
                <Text style={[styles.btnTxt, { color: on ? T.white : r.color }]}>{r.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {!!item.respondido_en && <Text style={styles.dim}>Respondiste el {new Date(item.respondido_en).toLocaleString()}</Text>}
        <View style={styles.bodycamRow}>
          <BodycamBoton variant="chip" origen={{ tipo: "tarea", id: t.id, folio: t.folio }} />
          <TouchableOpacity style={styles.fotoBtn} disabled={tomando === t.id} onPress={() => fotoEvidencia(t.id, t.folio)}>
            <Ionicons name="camera" size={15} color={T.accent} />
            <Text style={styles.fotoBtnTxt}>{tomando === t.id ? "Subiendo…" : "Foto evidencia"}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderGuardia = ({ item: t }: { item: any }) => {
    const v = vence(t);
    const foto = miniUri(t.id, t.fotografias);
    const ev = evMini[t.id];
    const est = t.estado ?? "abierta";
    const quien = t.completada_por ? nombres[t.completada_por] : t.atendida_por ? nombres[t.atendida_por] : null;
    return (
      <View style={[styles.card, v.vencida && styles.cardVencida]}>
        <View style={[styles.stripe, { backgroundColor: colorPrioridad(t.prioridad) }]} />
        <View style={styles.head}>
          <View style={[styles.icon, { backgroundColor: T.accentBg }]}><Ionicons name="clipboard" size={18} color={T.accent} /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.titulo} numberOfLines={2}>{t.folio ? `${t.folio} · ` : ""}{t.tipo ?? "Tarea"}</Text>
            <Text style={styles.motivo}>{t.sitio?.nombre ?? "Sitio"}</Text>
          </View>
          <View style={[styles.estBadge, { backgroundColor: ESTADO_COLOR[est] ?? T.textMute }]}>
            <Text style={styles.estBadgeTxt}>{ESTADO_LBL[est] ?? est}</Text>
          </View>
        </View>
        {!!t.asunto && <Text style={styles.asunto}>{t.asunto}</Text>}
        {!!foto && <Image source={{ uri: foto }} style={styles.foto} resizeMode="cover" />}
        {ev?.video && <Text style={styles.evTag}>🎥 Con video de evidencia</Text>}
        {!!quien && <Text style={styles.quien}>{t.completada_por ? "Completada por " : "Atendiendo: "}{quien}</Text>}
        <Text style={[styles.vence, v.vencida && { color: T.danger }]}>{v.txt}</Text>
      </View>
    );
  };

  const esGuardias = modo === "guardias" && esSuper;
  const data = esGuardias ? guardiasItems : items;

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      {esSuper && (
        <View style={styles.tabs}>
          <TouchableOpacity style={[styles.tab, modo === "mias" && styles.tabOn]} onPress={() => setModo("mias")}>
            <Text style={[styles.tabTxt, modo === "mias" && styles.tabTxtOn]}>Mis tareas</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.tab, modo === "guardias" && styles.tabOn]} onPress={() => setModo("guardias")}>
            <Text style={[styles.tabTxt, modo === "guardias" && styles.tabTxtOn]}>De mis guardias</Text>
          </TouchableOpacity>
        </View>
      )}
      <FlatList
        data={data as any[]}
        keyExtractor={(i: any) => i.id}
        contentContainerStyle={{ padding: 16 }}
        refreshControl={<RefreshControl refreshing={cargando} onRefresh={cargar} tintColor={T.accent} />}
        ListHeaderComponent={<Text style={styles.seccion}>{esGuardias ? `Tareas de mis guardias (${guardiasItems.length})` : `Tareas asignadas (${items.length})`}</Text>}
        ListEmptyComponent={
          !cargando ? (
            <Text style={styles.dim}>
              {sinOficial ? "Selecciona tu elemento en Perfil para ver tus tareas."
                : esGuardias ? "Sin tareas en los sitios que supervisas." : "No tienes tareas asignadas vigentes."}
            </Text>
          ) : <ActivityIndicator color={T.accent} style={{ marginTop: 24 }} />
        }
        renderItem={esGuardias ? renderGuardia : renderMia}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.bg },
  tabs: { flexDirection: "row", gap: 8, padding: 12, paddingBottom: 0 },
  tab: { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: UI.radiusSm, backgroundColor: T.surface, borderWidth: 1, borderColor: T.border },
  tabOn: { backgroundColor: T.accent, borderColor: T.accent },
  tabTxt: { color: T.textDim, fontWeight: "700" },
  tabTxtOn: { color: T.white },
  seccion: { color: T.textDim, fontSize: 13, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 },
  dim: { color: T.textMute, fontSize: 12, marginTop: 6 },
  card: { backgroundColor: T.surface, borderWidth: 1, borderColor: T.borderSoft, borderRadius: UI.radius, padding: 14, paddingLeft: 18, marginBottom: 12, overflow: "hidden" },
  cardVencida: { opacity: 0.62 },
  bodycamRow: { flexDirection: "row", marginTop: 10, gap: 8, alignItems: "center" },
  fotoBtn: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1.5, borderColor: T.accent, borderRadius: UI.radiusSm, paddingHorizontal: 10, height: 34 },
  fotoBtnTxt: { color: T.accent, fontWeight: "800", fontSize: 12 },
  stripe: { position: "absolute", left: 0, top: 0, bottom: 0, width: 5 },
  head: { flexDirection: "row", alignItems: "center", gap: 10 },
  icon: { width: 38, height: 38, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  titulo: { color: T.text, fontSize: 15, fontWeight: "800" },
  motivo: { color: T.textDim, fontSize: 12, marginTop: 1 },
  prio: { backgroundColor: T.danger, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  prioTxt: { color: T.white, fontSize: 10, fontWeight: "900" },
  estBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  estBadgeTxt: { color: T.white, fontWeight: "800", fontSize: 11 },
  quien: { color: T.textDim, fontSize: 12.5, marginTop: 8, fontWeight: "700" },
  asunto: { color: T.text, fontSize: 14, marginTop: 10 },
  foto: { width: "100%", height: 160, borderRadius: UI.radiusSm, marginTop: 10, backgroundColor: T.bg },
  evTag: { color: T.textDim, fontSize: 12, marginTop: 4 },
  instr: { color: T.textDim, fontSize: 13, marginTop: 8, lineHeight: 18 },
  lugar: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: T.bg, borderRadius: UI.radiusSm, padding: 10, marginTop: 10 },
  lugarTxt: { color: T.text, fontSize: 13, flex: 1 },
  vence: { color: T.textDim, fontSize: 12, marginTop: 8, fontWeight: "600" },
  btns: { flexDirection: "row", gap: 8, marginTop: 12 },
  btn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, borderWidth: 1.5, borderRadius: UI.radiusSm, height: 42, paddingHorizontal: 4 },
  btnTxt: { fontSize: 12, fontWeight: "800" },
});
