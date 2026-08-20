import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Alert,
  Share,
  ActivityIndicator,
  Keyboard,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";
import { primeraFoto } from "../lib/fotos";
import Foto from "../components/Foto";
import { T, UI } from "../theme";
import type { TipoConsulta } from "../types";

type IconName = keyof typeof Ionicons.glyphMap;

const TIPOS: { k: TipoConsulta; label: string; icon: IconName }[] = [
  { k: "persona", label: "Persona", icon: "person-outline" },
  { k: "vehiculo", label: "Vehículo", icon: "car-outline" },
  { k: "incidente", label: "Incidente", icon: "document-text-outline" },
  { k: "orden", label: "Orden", icon: "shield-outline" },
  { k: "caso", label: "Caso", icon: "clipboard-outline" },
];

interface Resultado {
  id: string;
  titulo: string;
  img?: string | null;
  badge?: { txt: string; tono: "danger" | "warn" | "ok" };
  campos: { l: string; v: string }[];
}

function edad(fn: string | null): string {
  if (!fn) return "—";
  const d = new Date(fn);
  const a = Math.floor((Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000));
  return isFinite(a) ? `${a} años` : "—";
}

export default function BuscarScreen() {
  const nav = useNavigation<any>();
  const [tipo, setTipo] = useState<TipoConsulta>("persona");
  const [q, setQ] = useState("");
  const [cargando, setCargando] = useState(false);
  const [buscado, setBuscado] = useState(false);
  const [resultados, setResultados] = useState<Resultado[]>([]);

  async function buscar() {
    const term = q.trim();
    if (!term) return;
    Keyboard.dismiss();
    setCargando(true);
    setBuscado(true);
    let res: Resultado[] = [];

    if (tipo === "persona") {
      const { data } = await supabase
        .from("personas")
        .select("id, nombre, apellido_paterno, apellido_materno, curp, fecha_nacimiento, estatus, fotografias")
        .or(`nombre.ilike.%${term}%,apellido_paterno.ilike.%${term}%,apellido_materno.ilike.%${term}%,curp.ilike.%${term}%`)
        .limit(20);
      res = ((data as any[]) ?? []).map((p) => ({
        id: p.id,
        titulo: `${p.nombre ?? ""} ${p.apellido_paterno ?? ""} ${p.apellido_materno ?? ""}`.trim(),
        img: primeraFoto(p.fotografias),
        badge: p.estatus === "activo" ? { txt: "VIGENTE", tono: "ok" } : { txt: "CANCELADO", tono: "danger" },
        campos: [
          { l: "CURP", v: p.curp ?? "—" },
          { l: "Edad", v: edad(p.fecha_nacimiento) },
        ],
      }));
    } else if (tipo === "vehiculo") {
      const { data } = await supabase
        .from("vehiculos")
        .select("id, placas, vin, marca, modelo, anio, color, estatus, fotografias")
        .or(`placas.ilike.%${term}%,vin.ilike.%${term}%,marca.ilike.%${term}%,modelo.ilike.%${term}%`)
        .limit(20);
      res = ((data as any[]) ?? []).map((v) => ({
        id: v.id,
        titulo: `${v.marca ?? ""} ${v.modelo ?? ""} ${v.anio ?? ""}`.trim() || "Vehículo",
        img: primeraFoto(v.fotografias),
        badge: v.estatus === "activo" ? { txt: "VIGENTE", tono: "ok" } : { txt: "CANCELADO", tono: "danger" },
        campos: [
          { l: "Placas", v: v.placas ?? "—" },
          { l: "VIN", v: v.vin ?? "—" },
          { l: "Color", v: v.color ?? "—" },
        ],
      }));
    } else if (tipo === "orden") {
      const { data } = await supabase
        .from("ordenes")
        .select("id, folio, tipo, autoridad_emisora, estado, estatus")
        .or(`folio.ilike.%${term}%,asunto.ilike.%${term}%,autoridad_emisora.ilike.%${term}%`)
        .limit(20);
      res = ((data as any[]) ?? []).map((o) => ({
        id: o.id,
        titulo: o.folio ?? "Orden",
        badge: o.estado === "vigente" ? { txt: "VIGENTE", tono: "danger" } : { txt: String(o.estado ?? "").toUpperCase(), tono: "warn" },
        campos: [
          { l: "Tipo", v: o.tipo ?? "—" },
          { l: "Autoridad", v: o.autoridad_emisora ?? "—" },
        ],
      }));
    } else if (tipo === "incidente") {
      const { data } = await supabase
        .from("incidentes")
        .select("id, folio, tipo, delito, estado, direccion, fecha_incidente, fotografias, estatus")
        .or(`folio.ilike.%${term}%,tipo.ilike.%${term}%,delito.ilike.%${term}%,direccion.ilike.%${term}%,narrativa.ilike.%${term}%`)
        .order("fecha_incidente", { ascending: false })
        .limit(20);
      res = ((data as any[]) ?? []).map((i) => ({
        id: i.id,
        titulo: i.delito || i.tipo || i.folio || "Incidente",
        img: primeraFoto(i.fotografias),
        badge:
          i.estado === "cancelado"
            ? { txt: "CANCELADO", tono: "danger" }
            : i.estado === "cerrado"
            ? { txt: "CERRADO", tono: "ok" }
            : { txt: "ABIERTO", tono: "warn" },
        campos: [
          { l: "Folio", v: i.folio ?? "—" },
          { l: "Tipo", v: i.tipo ?? "—" },
          { l: "Lugar", v: i.direccion ?? "—" },
        ],
      }));
    } else {
      const { data } = await supabase
        .from("casos")
        .select("id, folio, titulo, delito, prioridad, estado_investigacion, estatus")
        .or(`folio.ilike.%${term}%,titulo.ilike.%${term}%,delito.ilike.%${term}%`)
        .limit(20);
      res = ((data as any[]) ?? []).map((c) => ({
        id: c.id,
        titulo: c.titulo || c.folio || "Caso",
        badge: c.prioridad === "alta" ? { txt: "ALTA PRIORIDAD", tono: "danger" } : undefined,
        campos: [
          { l: "Folio", v: c.folio ?? "—" },
          { l: "Delito", v: c.delito ?? "—" },
          { l: "Estado", v: c.estado_investigacion ?? "—" },
        ],
      }));
    }

    setResultados(res);
    setCargando(false);
  }

  async function compartir(r: Resultado) {
    const cuerpo = `${r.titulo}\n${r.campos.map((c) => `${c.l}: ${c.v}`).join("\n")}`;
    try {
      await Share.share({ message: `SCP — ${cuerpo}` });
    } catch {
      /* cancelado */
    }
  }

  const tono = (t: "danger" | "warn" | "ok") =>
    t === "danger" ? { bg: T.dangerBg, fg: T.danger } : t === "warn" ? { bg: T.warnBg, fg: T.warn } : { bg: T.okBg, fg: T.ok };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.head}>
        <Text style={styles.titulo}>Consulta rápida</Text>
      </View>

      {/* Buscador + escáner */}
      <View style={styles.buscador}>
        <View style={styles.inputWrap}>
          <Ionicons name="search" size={20} color={T.textMute} />
          <TextInput
            style={styles.input}
            placeholder="Nombre, CURP, placa o VIN"
            placeholderTextColor={T.textMute}
            value={q}
            onChangeText={setQ}
            autoCapitalize="none"
            returnKeyType="search"
            onSubmitEditing={buscar}
          />
        </View>
        <TouchableOpacity
          style={styles.scan}
          onPress={() => Alert.alert("Escáner", "Lectura de código/OCR disponible en la siguiente fase.")}
        >
          <Ionicons name="scan-outline" size={22} color={T.text} />
        </TouchableOpacity>
      </View>

      {/* Chips de tipo */}
      <View style={styles.chips}>
        {TIPOS.map((t) => {
          const on = tipo === t.k;
          return (
            <TouchableOpacity key={t.k} style={[styles.chip, on && styles.chipOn]} onPress={() => setTipo(t.k)}>
              <Ionicons name={t.icon} size={16} color={on ? T.white : T.accent} />
              <Text style={[styles.chipTxt, on && styles.chipTxtOn]}>{t.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {cargando ? (
        <ActivityIndicator color={T.accent} style={{ marginTop: 30 }} />
      ) : (
        <FlatList
          data={resultados}
          keyExtractor={(r) => r.id}
          contentContainerStyle={{ padding: 16, paddingTop: 6 }}
          ListHeaderComponent={
            resultados.length ? <Text style={styles.seccion}>Resultados ({resultados.length})</Text> : null
          }
          ListEmptyComponent={
            buscado ? <Text style={styles.vacio}>Sin coincidencias.</Text> : <Text style={styles.vacio}>Escribe y toca buscar.</Text>
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardTop}>
                {item.img ? (
                  <Foto path={item.img} size={54} style={styles.cardFoto} />
                ) : (tipo === "persona" || tipo === "vehiculo") ? (
                  <View style={[styles.cardFoto, styles.cardFotoVacia]}>
                    <Ionicons name={tipo === "persona" ? "person" : "car"} size={22} color={T.textMute} />
                  </View>
                ) : null}
                <Text style={styles.cardTitulo} numberOfLines={2}>{item.titulo}</Text>
                {item.badge && (
                  <View style={[styles.tag, { backgroundColor: tono(item.badge.tono).bg }]}>
                    <Text style={[styles.tagTxt, { color: tono(item.badge.tono).fg }]}>{item.badge.txt}</Text>
                  </View>
                )}
              </View>
              <View style={styles.kvGrid}>
                {item.campos.map((c) => (
                  <View key={c.l} style={styles.kv}>
                    <Text style={styles.kvL}>{c.l}</Text>
                    <Text style={styles.kvV} numberOfLines={1}>{c.v}</Text>
                  </View>
                ))}
              </View>
              <View style={styles.acciones}>
                <TouchableOpacity
                  style={styles.btnPrim}
                  onPress={() =>
                    tipo === "incidente"
                      ? nav.navigate("Informe", { incidenteId: item.id })
                      : nav.navigate("Expediente", { tipo, id: item.id, titulo: item.titulo })
                  }
                >
                  <Ionicons name="document-text-outline" size={16} color={T.white} />
                  <Text style={styles.btnPrimTxt}>{tipo === "incidente" ? "Abrir informe" : "Ver expediente"}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.btnSec} onPress={() => compartir(item)}>
                  <Ionicons name="share-outline" size={16} color={T.text} />
                  <Text style={styles.btnSecTxt}>Compartir</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.bg },
  head: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  titulo: { color: T.text, fontSize: 24, fontWeight: "900" },

  buscador: { flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingTop: 10 },
  inputWrap: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: T.surface, borderRadius: UI.radiusSm, paddingHorizontal: 12, borderWidth: 1, borderColor: T.border, height: 52 },
  input: { flex: 1, color: T.text, fontSize: 16 },
  scan: { width: 52, height: 52, borderRadius: UI.radiusSm, backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, alignItems: "center", justifyContent: "center" },

  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 16, paddingTop: 12 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: T.accentDim, borderRadius: 20, paddingVertical: 9, paddingHorizontal: 14, backgroundColor: T.accentBg },
  chipOn: { backgroundColor: T.accent, borderColor: T.accent },
  chipTxt: { color: T.accent, fontWeight: "700", fontSize: 14 },
  chipTxtOn: { color: T.white },

  seccion: { color: T.textDim, fontSize: 13, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 },
  vacio: { color: T.textMute, textAlign: "center", marginTop: 40 },

  card: { backgroundColor: T.surface, borderRadius: UI.radius, borderWidth: 1, borderColor: T.border, padding: 16, marginBottom: 12 },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  cardFoto: { width: 54, height: 54, borderRadius: 10, backgroundColor: T.surfaceHi },
  cardFotoVacia: { alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: T.border },
  cardTitulo: { color: T.text, fontSize: 18, fontWeight: "800", flex: 1 },
  tag: { borderRadius: 20, paddingVertical: 4, paddingHorizontal: 10 },
  tagTxt: { fontSize: 11, fontWeight: "800", letterSpacing: 0.4 },

  kvGrid: { flexDirection: "row", flexWrap: "wrap", marginTop: 14, rowGap: 12 },
  kv: { width: "50%" },
  kvL: { color: T.textMute, fontSize: 12 },
  kvV: { color: T.text, fontSize: 15, fontWeight: "700", marginTop: 2 },

  acciones: { flexDirection: "row", gap: 10, marginTop: 16 },
  btnPrim: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: T.accent, borderRadius: UI.radiusSm, height: 46 },
  btnPrimTxt: { color: T.white, fontWeight: "800" },
  btnSec: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1, borderColor: T.border, borderRadius: UI.radiusSm, height: 46, paddingHorizontal: 16 },
  btnSecTxt: { color: T.text, fontWeight: "700" },
});
