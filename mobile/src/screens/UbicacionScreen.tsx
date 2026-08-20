import { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Share,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import * as Location from "expo-location";
import { supabase } from "../lib/supabase";
import { tileUrl } from "../lib/geo";
import { T, UI } from "../theme";

interface Evento {
  lat: number;
  lng: number;
  titulo: string;
  tipo: string;
  origen: "cad" | "incidente";
  dist: number;
}
interface Punto {
  lat: number;
  lng: number;
  acc: number | null;
}

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

function mapaHtml(mi: Punto, eventos: Evento[]): string {
  const m = JSON.stringify([mi.lat, mi.lng]);
  const ev = JSON.stringify(eventos.map((e) => [e.lat, e.lng, e.titulo]));
  return `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>html,body,#map{height:100%;margin:0;padding:0;background:#000}</style>
</head><body><div id="map"></div><script>
var mi = ${m}; var eventos = ${ev};
var map = L.map('map', { zoomControl: true });
L.tileLayer('${tileUrl()}', { maxZoom: 19, subdomains: 'abc', attribution: '© LocationIQ · © OpenStreetMap' }).addTo(map);
var yo = L.circleMarker(mi, { radius: 9, color: '#2f81f7', fillColor: '#2f81f7', fillOpacity: 1, weight: 3 }).addTo(map).bindPopup('Mi ubicación');
var pts = [mi];
eventos.forEach(function(e){ L.marker([e[0], e[1]]).addTo(map).bindPopup(e[2]); pts.push([e[0], e[1]]); });
if (pts.length > 1) { map.fitBounds(pts, { padding: [40, 40], maxZoom: 16 }); } else { map.setView(mi, 15); }
</script></body></html>`;
}

export default function UbicacionScreen() {
  const [mi, setMi] = useState<Punto | null>(null);
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [cargando, setCargando] = useState(true);

  async function localizar() {
    setCargando(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setCargando(false);
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const p: Punto = {
        lat: Number(pos.coords.latitude.toFixed(6)),
        lng: Number(pos.coords.longitude.toFixed(6)),
        acc: pos.coords.accuracy ?? null,
      };
      setMi(p);
      await cargarEventos(p);
    } catch {
      /* sin ubicación */
    } finally {
      setCargando(false);
    }
  }

  async function cargarEventos(p: Punto) {
    // Sólo eventos que AÚN SE ESTÁN ATENDIENDO: llamadas despachadas/en atención
    // (no resueltas) e incidentes abiertos/en proceso (no cerrados).
    const [cad, inc] = await Promise.all([
      supabase.from("llamadas_cad").select("folio, tipo, direccion, latitud, longitud").eq("estatus", "activo").in("estado_despacho", ["despachada", "en_atencion"]).not("latitud", "is", null).limit(200),
      supabase.from("incidentes").select("folio, tipo, delito, latitud, longitud").eq("estatus", "activo").neq("estado", "cerrado").not("latitud", "is", null).limit(200),
    ]);
    const lista: Evento[] = [];
    for (const c of ((cad.data as any[]) ?? [])) {
      lista.push({ lat: c.latitud, lng: c.longitud, titulo: `${c.folio ?? "CAD"} · ${c.tipo ?? "reporte"}`, tipo: c.tipo ?? "reporte", origen: "cad", dist: haversineKm(p.lat, p.lng, c.latitud, c.longitud) });
    }
    for (const i of ((inc.data as any[]) ?? [])) {
      lista.push({ lat: i.latitud, lng: i.longitud, titulo: `${i.folio ?? "INC"} · ${i.delito ?? i.tipo ?? "incidente"}`, tipo: i.delito ?? i.tipo ?? "incidente", origen: "incidente", dist: haversineKm(p.lat, p.lng, i.latitud, i.longitud) });
    }
    lista.sort((a, b) => a.dist - b.dist);
    setEventos(lista.slice(0, 25));
  }

  useEffect(() => {
    localizar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const html = useMemo(() => (mi ? mapaHtml(mi, eventos) : ""), [mi, eventos]);

  function comoLlegar(e: Evento) {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${e.lat},${e.lng}&travelmode=driving`;
    Share.share({ message: url }).catch(() => {});
  }

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      {mi ? (
        <View style={styles.mapaWrap}>
          <WebView originWhitelist={["*"]} source={{ html }} style={styles.mapa} javaScriptEnabled domStorageEnabled />
        </View>
      ) : (
        <View style={styles.sinMapa}>
          {cargando ? <ActivityIndicator color={T.accent} /> : <Text style={styles.dim}>Sin acceso a la ubicación.</Text>}
        </View>
      )}

      <View style={styles.barra}>
        <View style={{ flex: 1 }}>
          <Text style={styles.coord}>Cerca de ti</Text>
          <Text style={styles.dim}>{mi ? `${mi.lat}, ${mi.lng}` : "Ubicación GPS"}</Text>
        </View>
        <TouchableOpacity style={styles.iconBtn} onPress={localizar} disabled={cargando}>
          <Ionicons name="refresh" size={20} color={T.text} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 12 }}>
        <Text style={styles.seccion}>En atención cerca de ti ({eventos.length})</Text>
        {eventos.length === 0 && !cargando && <Text style={styles.dim}>Sin eventos en atención cerca.</Text>}
        {eventos.map((e, i) => (
          <TouchableOpacity key={i} style={styles.evento} onPress={() => comoLlegar(e)} activeOpacity={0.7}>
            <View style={[styles.evIcon, { backgroundColor: e.origen === "cad" ? T.warnBg : T.accentBg }]}>
              <Ionicons name={e.origen === "cad" ? "call" : "document-text"} size={18} color={e.origen === "cad" ? T.warn : T.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.evTitulo} numberOfLines={1}>{e.titulo}</Text>
              <Text style={styles.dim}>{e.origen === "cad" ? "Reporte CAD" : "Incidente"}</Text>
            </View>
            <Text style={styles.dist}>{e.dist < 1 ? `${Math.round(e.dist * 1000)} m` : `${e.dist.toFixed(1)} km`}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.bg },
  mapaWrap: { height: 300, backgroundColor: T.surface },
  mapa: { flex: 1, backgroundColor: T.bg },
  sinMapa: { height: 120, alignItems: "center", justifyContent: "center" },

  barra: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: T.border },
  coord: { color: T.text, fontSize: 16, fontWeight: "800" },
  dim: { color: T.textMute, fontSize: 12 },
  iconBtn: { width: 44, height: 44, borderRadius: UI.radiusSm, backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, alignItems: "center", justifyContent: "center" },

  acciones: { flexDirection: "row", gap: 10, padding: 16, paddingBottom: 8 },
  btnPrim: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: T.accent, borderRadius: UI.radiusSm, height: 52 },
  btnPrimTxt: { color: T.white, fontWeight: "800", fontSize: 15 },
  btnSec: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1, borderColor: T.border, borderRadius: UI.radiusSm, height: 52, paddingHorizontal: 18 },
  btnSecTxt: { color: T.text, fontWeight: "700" },

  seccion: { color: T.textDim, fontSize: 13, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, marginTop: 8, marginBottom: 10 },
  evento: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: UI.radiusSm, padding: 12, marginBottom: 8 },
  evIcon: { width: 40, height: 40, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  evTitulo: { color: T.text, fontSize: 15, fontWeight: "700" },
  dist: { color: T.accent, fontSize: 14, fontWeight: "800" },
});
