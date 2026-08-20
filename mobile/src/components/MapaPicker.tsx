import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Modal } from "react-native";
import { WebView } from "react-native-webview";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { tileUrl } from "../lib/geo";
import { T, UI } from "../theme";

// Selector de un punto en el mapa (Leaflet + LocationIQ/OSM dentro de un WebView).
// El usuario toca el mapa para colocar el marcador; "Usar este punto" devuelve
// las coordenadas al padre, que luego obtiene el domicilio (reverse geocode).
const HTML = `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<style>html,body,#map{margin:0;height:100%;width:100%;}</style>
</head><body>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
  var lat=__LAT__, lng=__LNG__;
  var map=L.map('map').setView([lat,lng],16);
  L.tileLayer('__TILE__',{maxZoom:19,subdomains:'abc'}).addTo(map);
  var marker=L.marker([lat,lng],{draggable:true}).addTo(map);
  function post(){var p=marker.getLatLng();window.ReactNativeWebView.postMessage(JSON.stringify({lat:p.lat,lng:p.lng}));}
  map.on('click',function(e){marker.setLatLng(e.latlng);post();});
  marker.on('dragend',post);
  post();
  true;
</script></body></html>`;

export default function MapaPicker({
  visible, lat, lng, onClose, onPick,
}: {
  visible: boolean;
  lat: number | null;
  lng: number | null;
  onClose: () => void;
  onPick: (lat: number, lng: number) => void;
}) {
  const [sel, setSel] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (visible) setSel(lat != null && lng != null ? { lat, lng } : null);
  }, [visible, lat, lng]);

  const iLat = lat ?? 25.6866;   // Monterrey, Nuevo León por defecto
  const iLng = lng ?? -100.3161;
  const html = HTML.replace("__LAT__", String(iLat)).replace("__LNG__", String(iLng)).replace("__TILE__", tileUrl());

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <View style={styles.head}>
          <Text style={styles.titulo}>Toca el mapa para ubicar el lugar</Text>
        </View>
        <View style={styles.mapa}>
          <WebView
            originWhitelist={["*"]}
            source={{ html }}
            style={{ flex: 1 }}
            onMessage={(e) => {
              try { const m = JSON.parse(e.nativeEvent.data); setSel({ lat: Number(m.lat.toFixed(6)), lng: Number(m.lng.toFixed(6)) }); } catch { /* ignore */ }
            }}
          />
        </View>
        <Text style={styles.coords}>{sel ? `📍 ${sel.lat}, ${sel.lng}` : "Sin punto seleccionado"}</Text>
        <View style={styles.bar}>
          <TouchableOpacity style={styles.btn} onPress={onClose}>
            <Ionicons name="close" size={18} color={T.text} /><Text style={styles.btnTxt}>Cancelar</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btn, styles.btnPrim, !sel && { opacity: 0.5 }]} disabled={!sel} onPress={() => sel && onPick(sel.lat, sel.lng)}>
            <Ionicons name="checkmark" size={18} color={T.white} /><Text style={[styles.btnTxt, { color: T.white }]}>Usar este punto</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.bg },
  head: { padding: 14 },
  titulo: { color: T.text, fontSize: 16, fontWeight: "800" },
  mapa: { flex: 1, margin: 10, borderRadius: UI.radiusSm, overflow: "hidden", borderWidth: 1, borderColor: T.border },
  coords: { color: T.textDim, fontSize: 13, textAlign: "center", marginBottom: 6 },
  bar: { flexDirection: "row", gap: 10, padding: 12 },
  btn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1, borderColor: T.accentDim, borderRadius: UI.radiusSm, height: 50 },
  btnPrim: { backgroundColor: T.accent, borderColor: T.accent },
  btnTxt: { color: T.text, fontWeight: "800", fontSize: 15 },
});
