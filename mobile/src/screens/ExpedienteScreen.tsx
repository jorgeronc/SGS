import { useEffect, useState } from "react";
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { supabase } from "../lib/supabase";
import { registrarConsulta } from "../lib/bitacora";
import Foto from "../components/Foto";
import { T, UI } from "../theme";
import type { RootStackParamList, TipoConsulta } from "../types";

type Props = NativeStackScreenProps<RootStackParamList, "Expediente">;

const CONFIG: Record<string, { tabla: string; select: string; campos: [string, string][]; conFotos?: boolean }> = {
  persona: {
    tabla: "personas",
    select: "nombre, apellido_paterno, apellido_materno, curp, fecha_nacimiento, sexo, estatus, fotografias",
    campos: [["curp", "CURP"], ["fecha_nacimiento", "Nacimiento"], ["sexo", "Sexo"], ["estatus", "Estatus"]],
    conFotos: true,
  },
  vehiculo: {
    tabla: "vehiculos",
    select: "placas, vin, marca, modelo, anio, color, tipo, estatus, fotografias",
    campos: [["placas", "Placas"], ["vin", "VIN"], ["marca", "Marca"], ["modelo", "Modelo"], ["anio", "Año"], ["color", "Color"], ["tipo", "Tipo"], ["estatus", "Estatus"]],
    conFotos: true,
  },
  orden: {
    tabla: "ordenes",
    select: "folio, tipo, autoridad_emisora, asunto, fecha_emision, fecha_limite, estado, estatus",
    campos: [["folio", "Folio"], ["tipo", "Tipo"], ["autoridad_emisora", "Autoridad"], ["asunto", "Asunto"], ["fecha_emision", "Emisión"], ["fecha_limite", "Límite"], ["estado", "Estado"], ["estatus", "Estatus"]],
  },
  caso: {
    tabla: "casos",
    select: "folio, titulo, tipo, delito, prioridad, estado_investigacion, fecha_hecho, direccion, estatus",
    campos: [["folio", "Folio"], ["tipo", "Tipo"], ["delito", "Delito"], ["prioridad", "Prioridad"], ["estado_investigacion", "Investigación"], ["fecha_hecho", "Fecha del hecho"], ["direccion", "Dirección"], ["estatus", "Estatus"]],
  },
};

// Cómo mostrar cada entidad del historial (vínculos + detenciones).
const HIST: Record<string, { tabla: string; sel: string; icon: keyof typeof Ionicons.glyphMap; label: (r: any) => string }> = {
  incidente: { tabla: "incidentes", sel: "folio, tipo, delito, fecha_incidente", icon: "document-text", label: (r) => `${r.delito ?? r.tipo ?? "Incidente"}${r.fecha_incidente ? ` · ${new Date(r.fecha_incidente).toLocaleDateString()}` : ""}` },
  cad: { tabla: "llamadas_cad", sel: "folio, tipo, direccion, fecha_recepcion", icon: "call", label: (r) => `${r.tipo ?? "Reporte"}${r.direccion ? ` · ${r.direccion}` : ""}` },
  caso: { tabla: "casos", sel: "folio, titulo, delito", icon: "folder", label: (r) => r.titulo ?? r.delito ?? "Caso" },
  orden: { tabla: "ordenes", sel: "folio, tipo, asunto", icon: "clipboard", label: (r) => r.asunto ?? r.tipo ?? "Orden" },
  evidencia: { tabla: "evidencias", sel: "folio, tipo, descripcion", icon: "cube", label: (r) => r.descripcion ?? r.tipo ?? "Evidencia" },
  barandilla: { tabla: "barandilla", sel: "folio, motivo, fecha_ingreso", icon: "lock-closed", label: (r) => `${r.motivo ?? "Detención"}${r.fecha_ingreso ? ` · ${new Date(r.fecha_ingreso).toLocaleDateString()}` : ""}` },
  persona: { tabla: "personas", sel: "nombre, apellido_paterno", icon: "person", label: (r) => `${r.nombre ?? ""} ${r.apellido_paterno ?? ""}`.trim() },
  vehiculo: { tabla: "vehiculos", sel: "placas, marca, modelo", icon: "car", label: (r) => `${r.placas ?? "s/placas"} · ${r.marca ?? ""}`.trim() },
  ubicacion: { tabla: "ubicaciones", sel: "calle, colonia", icon: "location", label: (r) => `${r.calle ?? ""} ${r.colonia ?? ""}`.trim() },
};

const NAVEGABLES: TipoConsulta[] = ["persona", "vehiculo", "orden", "caso"];

interface ItemHist {
  key: string;
  tipo: string;
  folio: string | null;
  label: string;
  relacion: string | null;
  entidadId: string;
}

export default function ExpedienteScreen({ route }: Props) {
  const nav = useNavigation<any>();
  const { tipo, id, titulo } = route.params;
  const cfg = CONFIG[tipo];
  const [row, setRow] = useState<any>(null);
  const [fotos, setFotos] = useState<string[]>([]);
  const [historial, setHistorial] = useState<ItemHist[]>([]);
  const [cargandoHist, setCargandoHist] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    registrarConsulta(cfg.tabla, id);   // auditoría: se abrió un expediente
    (async () => {
      const { data, error } = await supabase.from(cfg.tabla).select(cfg.select).eq("id", id).maybeSingle();
      if (error) { setError(error.message); return; }
      setRow(data);
      const ff = (data as any)?.fotografias;
      setFotos(Array.isArray(ff) ? ff.filter(Boolean) : []);
      await cargarHistorial();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg, id]);

  // Historial: vínculos (incidentes, CAD, casos, órdenes, evidencias…) en ambos
  // sentidos + detenciones (barandilla) cuando es una persona.
  async function cargarHistorial() {
    setCargandoHist(true);
    const items: ItemHist[] = [];

    const { data: vin } = await supabase
      .from("vinculos")
      .select("id, entidad_origen_tipo, entidad_origen_id, entidad_destino_tipo, entidad_destino_id, tipo_relacion")
      .or(`and(entidad_origen_tipo.eq.${tipo},entidad_origen_id.eq.${id}),and(entidad_destino_tipo.eq.${tipo},entidad_destino_id.eq.${id})`)
      .eq("estatus", "activo")
      .limit(200);

    const refs = ((vin as any[]) ?? []).map((v) => {
      const esOrigen = v.entidad_origen_tipo === tipo && v.entidad_origen_id === id;
      return {
        vinId: v.id as string,
        otroTipo: (esOrigen ? v.entidad_destino_tipo : v.entidad_origen_tipo) as string,
        otroId: (esOrigen ? v.entidad_destino_id : v.entidad_origen_id) as string,
        relacion: v.tipo_relacion as string,
      };
    });

    await Promise.all(refs.map(async (r) => {
      const h = HIST[r.otroTipo];
      if (!h) return;
      const { data: e } = await supabase.from(h.tabla).select(`id, ${h.sel}`).eq("id", r.otroId).maybeSingle();
      if (!e) return;
      items.push({ key: r.vinId, tipo: r.otroTipo, folio: (e as any).folio ?? null, label: h.label(e), relacion: r.relacion, entidadId: r.otroId });
    }));

    // Detenciones directas (barandilla) cuando la consulta es de una persona.
    if (tipo === "persona") {
      const { data: bar } = await supabase.from("barandilla").select("id, folio, motivo, fecha_ingreso").eq("persona_id", id).eq("estatus", "activo").limit(50);
      ((bar as any[]) ?? []).forEach((b) => {
        if (items.some((it) => it.tipo === "barandilla" && it.entidadId === b.id)) return;
        items.push({ key: `bar-${b.id}`, tipo: "barandilla", folio: b.folio ?? null, label: HIST.barandilla.label(b), relacion: "detención", entidadId: b.id });
      });
    }

    setHistorial(items);
    setCargandoHist(false);
  }

  if (error) return <View style={styles.center}><Text style={styles.err}>{error}</Text></View>;
  if (!row) return <View style={styles.center}><ActivityIndicator color={T.accent} /></View>;

  const detenciones = historial.filter((h) => h.tipo === "barandilla").length;

  return (
    <ScrollView style={styles.safe} contentContainerStyle={{ padding: 16 }}>
      <Text style={styles.tipo}>{tipo.toUpperCase()}</Text>
      <Text style={styles.titulo}>{titulo}</Text>

      {/* Fotografías (personas y vehículos) */}
      {cfg.conFotos && (
        fotos.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.fotosRow} contentContainerStyle={{ gap: 10 }}>
            {fotos.map((p) => <Foto key={p} path={p} size={240} style={styles.foto} />)}
          </ScrollView>
        ) : (
          <View style={styles.sinFoto}>
            <Ionicons name={tipo === "persona" ? "person" : "car"} size={30} color={T.textMute} />
            <Text style={styles.sinFotoTxt}>Sin fotografías en el registro</Text>
          </View>
        )
      )}

      <View style={styles.card}>
        {cfg.campos.map(([k, l], i) => (
          <View key={k} style={[styles.row, i < cfg.campos.length - 1 && styles.rowBorder]}>
            <Text style={styles.l}>{l}</Text>
            <Text style={styles.v}>{row[k] != null && row[k] !== "" ? String(row[k]) : "—"}</Text>
          </View>
        ))}
      </View>

      {/* Historial encontrado */}
      <View style={styles.histHead}>
        <Text style={styles.histTitulo}>Historial encontrado</Text>
        {detenciones > 0 && <View style={styles.detBadge}><Text style={styles.detBadgeTxt}>🔴 {detenciones} detención{detenciones > 1 ? "es" : ""}</Text></View>}
      </View>

      {cargandoHist ? (
        <ActivityIndicator color={T.accent} style={{ marginTop: 10 }} />
      ) : historial.length === 0 ? (
        <Text style={styles.vacio}>Sin antecedentes ni vínculos registrados.</Text>
      ) : (
        historial.map((h) => {
          const navegable = NAVEGABLES.includes(h.tipo as TipoConsulta);
          const Cmp: any = navegable ? TouchableOpacity : View;
          return (
            <Cmp
              key={h.key}
              style={[styles.histItem, h.tipo === "barandilla" && styles.histDet]}
              onPress={navegable ? () => nav.push("Expediente", { tipo: h.tipo as TipoConsulta, id: h.entidadId, titulo: h.label }) : undefined}
            >
              <Ionicons name={HIST[h.tipo]?.icon ?? "ellipse"} size={20} color={h.tipo === "barandilla" ? T.danger : T.accent} style={{ width: 26 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.histLabel} numberOfLines={1}>{h.label || "(sin datos)"}</Text>
                <Text style={styles.histSub}>{h.tipo}{h.folio ? ` · ${h.folio}` : ""}{h.relacion ? ` · ${h.relacion}` : ""}</Text>
              </View>
              {navegable && <Ionicons name="chevron-forward" size={16} color={T.textMute} />}
            </Cmp>
          );
        })
      )}

      <Text style={styles.nota}>Expediente de sólo lectura desde el dispositivo en campo.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.bg },
  center: { flex: 1, backgroundColor: T.bg, alignItems: "center", justifyContent: "center" },
  err: { color: T.danger, padding: 20, textAlign: "center" },
  tipo: { color: T.accent, fontSize: 12, fontWeight: "800", letterSpacing: 1 },
  titulo: { color: T.text, fontSize: 24, fontWeight: "900", marginTop: 4, marginBottom: 14 },
  fotosRow: { marginBottom: 14 },
  foto: { width: 120, height: 120, borderRadius: UI.radiusSm, backgroundColor: T.surfaceHi },
  sinFoto: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: UI.radiusSm, padding: 14, marginBottom: 14 },
  sinFotoTxt: { color: T.textMute, fontSize: 13 },
  card: { backgroundColor: T.surface, borderRadius: UI.radius, borderWidth: 1, borderColor: T.border, paddingHorizontal: 16 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12, minHeight: 50 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: T.border },
  l: { color: T.textDim, fontSize: 14 },
  v: { color: T.text, fontSize: 15, fontWeight: "700", flex: 1, textAlign: "right" },
  histHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 22, marginBottom: 8 },
  histTitulo: { color: T.text, fontSize: 16, fontWeight: "800" },
  detBadge: { backgroundColor: "#3a1414", borderRadius: 12, paddingVertical: 3, paddingHorizontal: 10 },
  detBadgeTxt: { color: "#ff6b6b", fontSize: 12, fontWeight: "700" },
  vacio: { color: T.textMute, fontSize: 13, marginTop: 4 },
  histItem: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: UI.radiusSm, padding: 12, marginBottom: 8 },
  histDet: { borderColor: T.danger, borderLeftWidth: 3 },
  histLabel: { color: T.text, fontSize: 15, fontWeight: "700" },
  histSub: { color: T.textMute, fontSize: 12, marginTop: 2, textTransform: "uppercase" },
  nota: { color: T.textMute, fontSize: 12, textAlign: "center", marginTop: 18 },
});
