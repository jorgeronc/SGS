import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import MapaPicker from "./MapaPicker";
import { reverseGeocodeDetallado } from "../lib/geo";
import { T, UI } from "../theme";

export interface UbicacionValor {
  lat: number | null;
  lng: number | null;
  direccion: string;
  colonia: string;
  municipio: string;
  estado: string;
}

// Bloque de captura de ubicación reutilizable: permite tomar la ubicación actual
// (GPS) o elegir un punto en el mapa; en ambos casos trae lat/long y la dirección
// desglosada (calle/número, colonia, municipio, estado) del reverse-geocode.
// Es controlado: el padre mantiene el valor y recibe onChange.
export default function UbicacionPicker({
  valor, onChange, editable = true,
}: {
  valor: UbicacionValor;
  onChange: (v: UbicacionValor) => void;
  editable?: boolean;
}) {
  const [mapa, setMapa] = useState(false);
  const [cargando, setCargando] = useState(false);

  async function resolver(la: number, lo: number) {
    setCargando(true);
    const d = await reverseGeocodeDetallado(la, lo);
    setCargando(false);
    onChange({
      lat: la, lng: lo,
      direccion: d?.direccion || valor.direccion,
      colonia: d?.colonia || "",
      municipio: d?.municipio || "",
      estado: d?.estado || "",
    });
  }

  async function usarActual() {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") { Alert.alert("Ubicación", "Se requiere permiso de ubicación."); return; }
    setCargando(true);
    try {
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      await resolver(Number(pos.coords.latitude.toFixed(6)), Number(pos.coords.longitude.toFixed(6)));
    } catch {
      setCargando(false);
      Alert.alert("Ubicación", "No se pudo obtener la ubicación actual.");
    }
  }

  const set = (k: keyof UbicacionValor, v: string) => onChange({ ...valor, [k]: v });

  return (
    <View style={styles.wrap}>
      <View style={styles.botones}>
        <TouchableOpacity style={styles.btn} onPress={usarActual} disabled={!editable || cargando}>
          <Ionicons name="locate" size={16} color={T.accent} />
          <Text style={styles.btnTxt}>Usar mi ubicación</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.btn} onPress={() => setMapa(true)} disabled={!editable}>
          <Ionicons name="map" size={16} color={T.accent} />
          <Text style={styles.btnTxt}>Elegir en el mapa</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.coords}>
        {cargando ? "Obteniendo dirección…" : valor.lat != null && valor.lng != null ? `📍 ${valor.lat}, ${valor.lng}` : "Sin coordenadas"}
        {cargando && <ActivityIndicator color={T.accent} style={{ marginLeft: 8 }} />}
      </Text>

      <TextInput style={styles.input} placeholder="Dirección (calle y número)" placeholderTextColor={T.textMute}
        value={valor.direccion} editable={editable} onChangeText={(v) => set("direccion", v)} />
      <View style={styles.fila}>
        <TextInput style={[styles.input, styles.medio]} placeholder="Colonia" placeholderTextColor={T.textMute}
          value={valor.colonia} editable={editable} onChangeText={(v) => set("colonia", v)} />
        <TextInput style={[styles.input, styles.medio]} placeholder="Municipio" placeholderTextColor={T.textMute}
          value={valor.municipio} editable={editable} onChangeText={(v) => set("municipio", v)} />
      </View>
      <TextInput style={styles.input} placeholder="Estado" placeholderTextColor={T.textMute}
        value={valor.estado} editable={editable} onChangeText={(v) => set("estado", v)} />

      <MapaPicker visible={mapa} lat={valor.lat} lng={valor.lng} onClose={() => setMapa(false)}
        onPick={(la, lo) => { setMapa(false); resolver(la, lo); }} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  botones: { flexDirection: "row", gap: 8 },
  btn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1, borderColor: T.accentDim, borderRadius: UI.radiusSm, paddingVertical: 10, backgroundColor: T.accentBg },
  btnTxt: { color: T.accent, fontWeight: "800", fontSize: 13 },
  coords: { color: T.textDim, fontSize: 13, marginVertical: 2 },
  input: { backgroundColor: T.surfaceAlt, borderWidth: 1, borderColor: T.border, borderRadius: UI.radiusSm, color: T.text, paddingHorizontal: 12, height: 46, fontSize: 15 },
  fila: { flexDirection: "row", gap: 8 },
  medio: { flex: 1 },
});
