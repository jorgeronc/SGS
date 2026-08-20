import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { supabase } from "../lib/supabase";
import { getMiUnidad, type MiUnidad } from "../lib/unidad";
import type { Despacho, RootStackParamList } from "../types";

type Props = NativeStackScreenProps<RootStackParamList, "Despachos">;

const COLOR_ESTADO: Record<string, string> = {
  asignada: "#b06a00",
  enterado: "#0b6ea8",
  en_ruta: "#7a5cbf",
  en_lugar: "#0a7c2f",
  cerrado: "#555",
};

export default function DespachosScreen({ navigation }: Props) {
  const [despachos, setDespachos] = useState<Despacho[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [verCerrados, setVerCerrados] = useState(false);
  const [miUnidad, setMiUnidad] = useState<MiUnidad | null>(null);
  const [soloMiUnidad, setSoloMiUnidad] = useState(true);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    const unidad = await getMiUnidad();
    setMiUnidad(unidad);
    let q = supabase
      .from("despachos")
      .select(
        "id, estado, patrulla_id, llamada:llamadas_cad(id, folio, tipo, prioridad, direccion, latitud, longitud)"
      )
      .eq("estatus", "activo");
    // Si el elemento eligió su unidad, muestra solo los despachos de esa patrulla.
    if (unidad && soloMiUnidad) q = q.eq("patrulla_id", unidad.patrullaId);
    const { data, error } = await q.order("fecha_asignacion", { ascending: false });
    if (error) setError(error.message);
    else setDespachos((data as any) ?? []);
    setCargando(false);
  }, [soloMiUnidad]);

  useEffect(() => {
    const unsub = navigation.addListener("focus", cargar);
    return unsub;
  }, [navigation, cargar]);

  // Por defecto oculta los despachos ya cerrados.
  const visibles = verCerrados ? despachos : despachos.filter((d) => d.estado !== "cerrado");
  const cerrados = despachos.filter((d) => d.estado === "cerrado").length;

  return (
    <View style={styles.contenedor}>
      <View style={styles.barraSup}>
        <Text style={styles.ayuda}>Toca un despacho para atenderlo.</Text>
        <TouchableOpacity onPress={() => supabase.auth.signOut()}>
          <Text style={styles.salir}>Salir</Text>
        </TouchableOpacity>
      </View>

      {miUnidad ? (
        <TouchableOpacity style={styles.unidadBar} onPress={() => setSoloMiUnidad((v) => !v)}>
          <Text style={styles.unidadTxt}>
            {soloMiUnidad ? "🚓 Mi CRP: " : "Todas las CRP · "}
            <Text style={{ fontWeight: "800" }}>{soloMiUnidad ? miUnidad.etiqueta : "toca para filtrar a mi CRP"}</Text>
          </Text>
          <Text style={styles.unidadLink}>{soloMiUnidad ? "Ver todas" : "Ver mi CRP"}</Text>
        </TouchableOpacity>
      ) : (
        <Text style={styles.sinUnidad}>Elige tu CRP en Perfil para ver solo tus despachos.</Text>
      )}

      <TouchableOpacity style={styles.toggleCerr} onPress={() => setVerCerrados((v) => !v)}>
        <Text style={styles.toggleCerrTxt}>
          {verCerrados ? "▾ Ocultar cerrados" : `▸ Ver cerrados${cerrados ? ` (${cerrados})` : ""}`}
        </Text>
      </TouchableOpacity>

      {error && <Text style={styles.error}>{error}</Text>}

      <FlatList
        data={visibles}
        keyExtractor={(d) => d.id}
        refreshControl={<RefreshControl refreshing={cargando} onRefresh={cargar} />}
        ListEmptyComponent={
          !cargando ? <Text style={styles.vacio}>{verCerrados ? "Sin despachos." : "No tienes despachos activos."}</Text> : null
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.tarjeta}
            onPress={() => navigation.navigate("DespachoDetalle", { despacho: item })}
          >
            <View style={styles.filaTop}>
              <Text style={styles.folio}>{item.llamada?.folio ?? "s/folio"}</Text>
              <Text style={[styles.estado, { color: COLOR_ESTADO[item.estado] ?? "#555" }]}>
                {item.estado}
              </Text>
            </View>
            <Text style={styles.tipo}>
              {item.llamada?.tipo ?? "—"}
              {item.llamada?.prioridad ? ` · prioridad ${item.llamada.prioridad}` : ""}
            </Text>
            <Text style={styles.dir}>{item.llamada?.direccion ?? "Sin dirección"}</Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: { flex: 1, backgroundColor: "#f4f6f8" },
  barraSup: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 12,
  },
  ayuda: { color: "#555", fontSize: 13 },
  salir: { color: "#b00020", fontWeight: "700" },
  unidadBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginHorizontal: 12, marginBottom: 8, padding: 10, backgroundColor: "#e8f0f7", borderRadius: 8, borderLeftWidth: 4, borderLeftColor: "#0b3d66" },
  unidadTxt: { color: "#0b3d66", fontSize: 13, flex: 1, marginRight: 8 },
  unidadLink: { color: "#0b6ea8", fontWeight: "800", fontSize: 12 },
  sinUnidad: { color: "#8a6d00", fontSize: 12, marginHorizontal: 12, marginBottom: 8 },
  toggleCerr: { paddingHorizontal: 14, paddingBottom: 8 },
  toggleCerrTxt: { color: "#0b3d66", fontWeight: "700", fontSize: 13 },
  error: { color: "#b00020", padding: 12 },
  vacio: { textAlign: "center", color: "#555", marginTop: 40 },
  tarjeta: {
    backgroundColor: "#fff",
    marginHorizontal: 12,
    marginBottom: 10,
    padding: 14,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: "#0b3d66",
  },
  filaTop: { flexDirection: "row", justifyContent: "space-between" },
  folio: { fontWeight: "800", color: "#0b3d66" },
  estado: { fontWeight: "700", textTransform: "uppercase", fontSize: 12 },
  tipo: { marginTop: 4, fontWeight: "600" },
  dir: { color: "#555", marginTop: 2 },
});
