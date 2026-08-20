import { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Linking,
  Alert,
} from "react-native";
import { WebView } from "react-native-webview";
import * as Location from "expo-location";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { supabase } from "../lib/supabase";
import { registrarConsulta } from "../lib/bitacora";
import { tileUrl } from "../lib/geo";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import type { RootStackParamList } from "../types";
import BodycamBoton from "../components/BodycamBoton";

type Props = NativeStackScreenProps<RootStackParamList, "DespachoDetalle">;

const ESTADOS = ["enterado", "en_ruta", "en_lugar", "cerrado"];
const ETIQUETA: Record<string, string> = {
  enterado: "Enterado",
  en_ruta: "En Ruta",
  en_lugar: "En el Lugar",
  cerrado: "Cerrado",
};

// Sólo el despacho usa TomTom (ruta con tráfico + ETA). El dashboard y los demás
// módulos siguen con OpenStreetMap. Si no hay API key, cae a OSM + OSRM.
const TOMTOM_KEY = process.env.EXPO_PUBLIC_TOMTOM_API_KEY ?? "";

interface ResumenRuta { km: number; min: number; trafico: number; llegada?: string; }

interface Punto {
  latitude: number;
  longitude: number;
}

const ARRIBO_KM = 0.06; // ~60 m: se considera que la unidad llegó al lugar

function distKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

// Mapa con OpenStreetMap usando Leaflet dentro de un WebView: sin proveedor
// nativo ni API key (funciona igual en iOS y Android). Muestra el lugar del
// incidente, la ubicación de la patrulla y la ruta entre ambos.
function mapaHtml(destino: Punto, patrulla: Punto | null, ruta: Punto[], tomtomKey: string, secciones: number[][]): string {
  const d = JSON.stringify([destino.latitude, destino.longitude]);
  const p = patrulla ? JSON.stringify([patrulla.latitude, patrulla.longitude]) : "null";
  const r = JSON.stringify(ruta.map((pt) => [pt.latitude, pt.longitude]));
  const sec = JSON.stringify(secciones);
  const tiles = tomtomKey
    ? `L.tileLayer('https://{s}.api.tomtom.com/map/1/tile/basic/main/{z}/{x}/{y}.png?key=${tomtomKey}', { subdomains:['a','b','c','d'], maxZoom: 22, attribution: '© TomTom' }).addTo(map);`
    : `L.tileLayer('${tileUrl()}', { maxZoom: 19, subdomains: 'abc', attribution: '© LocationIQ · © OpenStreetMap' }).addTo(map);`;
  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>html,body,#map{height:100%;margin:0;padding:0}</style>
</head>
<body>
<div id="map"></div>
<script>
  var destino = ${d};
  var patrulla = ${p};
  var ruta = ${r};
  var secciones = ${sec};
  var map = L.map('map');
  ${tiles}
  L.marker(destino).addTo(map).bindPopup('Lugar del incidente');
  var puntos = [destino];
  if (patrulla) { L.marker(patrulla).addTo(map).bindPopup('Mi unidad'); puntos.push(patrulla); }
  if (ruta && ruta.length > 1) {
    L.polyline(ruta, { color: '#0b3d66', weight: 5 }).addTo(map);
    // Tramos con tráfico (magnitud 1..4): amarillo/naranja/rojo.
    secciones.forEach(function(s){
      var seg = ruta.slice(s[0], s[1] + 1);
      if (seg.length > 1) {
        var col = s[2] >= 3 ? '#e0091f' : (s[2] === 2 ? '#ff8c00' : '#ffd400');
        L.polyline(seg, { color: col, weight: 8, opacity: 0.9 }).addTo(map);
      }
    });
    puntos = ruta;
  }
  if (puntos.length > 1) { map.fitBounds(puntos, { padding: [30, 30] }); }
  else { map.setView(destino, 15); }
</script>
</body>
</html>`;
}

export default function DespachoDetalleScreen({ route, navigation }: Props) {
  const { despacho } = route.params;
  const llamada = despacho.llamada;
  const destino: Punto | null =
    llamada?.latitud != null && llamada?.longitud != null
      ? { latitude: llamada.latitud, longitude: llamada.longitud }
      : null;

  const [estado, setEstado] = useState(despacho.estado);
  const [reaperturaOk, setReaperturaOk] = useState<boolean>(!!(despacho as any).reapertura_autorizada);
  const [miUbicacion, setMiUbicacion] = useState<Punto | null>(null);
  const [ruta, setRuta] = useState<Punto[]>([]);
  const [resumen, setResumen] = useState<ResumenRuta | null>(null);
  const [secciones, setSecciones] = useState<number[][]>([]);
  const [guardando, setGuardando] = useState(false);
  const arribando = useRef(false);
  // Reruteo/arribo automático: mientras NO haya llegado ni cerrado.
  const enCamino = estado !== "en_lugar" && estado !== "cerrado";
  // Tráfico (tramos coloreados): sólo en Enterado o En Ruta.
  const mostrarTrafico = estado === "enterado" || estado === "en_ruta";
  const [narrativas, setNarrativas] = useState<any[]>([]);
  const [nuevaNarrativa, setNuevaNarrativa] = useState("");
  const [registrando, setRegistrando] = useState(false);

  // Auditoría: se abrió el detalle de un despacho.
  useEffect(() => { registrarConsulta("despacho", despacho.id); }, [despacho.id]);

  // Ubicación del dispositivo (GPS)
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      const pos = await Location.getCurrentPositionAsync({});
      setMiUbicacion({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
    })();
  }, []);

  // Estado y autorización de reapertura frescos (por si el CAD web autorizó reabrir).
  useEffect(() => {
    const refrescar = async () => {
      const { data } = await supabase.from("despachos").select("estado, reapertura_autorizada").eq("id", despacho.id).maybeSingle();
      if (data) { setEstado((data as any).estado); setReaperturaOk(!!(data as any).reapertura_autorizada); }
    };
    refrescar();
    const unsub = navigation.addListener("focus", refrescar);
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ruta patrulla -> incidente. Con TomTom: ruta con tráfico + tiempo estimado +
  // hora de llegada. Sin API key: OSRM público (si falla, línea recta).
  useEffect(() => {
    if (!miUbicacion || !destino) return;
    // Ya en el lugar o cerrado: no recalcular ruta/ETA ni tráfico (queda congelado).
    if (!enCamino) { setResumen(null); setSecciones([]); return; }
    (async () => {
      if (TOMTOM_KEY) {
        try {
          // El tráfico (tramos coloreados) sólo se pide en Enterado/En Ruta.
          const secc = mostrarTrafico ? "&sectionType=traffic" : "";
          const url = `https://api.tomtom.com/routing/1/calculateRoute/${miUbicacion.latitude},${miUbicacion.longitude}:${destino.latitude},${destino.longitude}/json?key=${TOMTOM_KEY}&traffic=true&travelMode=car&routeType=fastest&computeTravelTimeFor=all${secc}`;
          const r = await fetch(url);
          const j = await r.json();
          const route = j?.routes?.[0];
          if (route) {
            const pts: Punto[] = (route.legs ?? []).flatMap((l: any) =>
              (l.points ?? []).map((p: any) => ({ latitude: p.latitude, longitude: p.longitude }))
            );
            setRuta(pts.length > 1 ? pts : [miUbicacion, destino]);
            const s = route.summary ?? {};
            setResumen({
              km: (s.lengthInMeters ?? 0) / 1000,
              min: Math.round((s.travelTimeInSeconds ?? 0) / 60),
              trafico: Math.round((s.trafficDelayInSeconds ?? 0) / 60),
              llegada: s.arrivalTime,
            });
            setSecciones(
              mostrarTrafico
                ? (route.sections ?? [])
                    .filter((x: any) => x.sectionType === "TRAFFIC" && (x.magnitudeOfDelay ?? 0) > 0)
                    .map((x: any) => [x.startPointIndex, x.endPointIndex, x.magnitudeOfDelay])
                : []
            );
            return;
          }
        } catch {
          // cae a OSRM/recta
        }
      }
      setSecciones([]);
      try {
        const url = `https://router.project-osrm.org/route/v1/driving/${miUbicacion.longitude},${miUbicacion.latitude};${destino.longitude},${destino.latitude}?overview=full&geometries=geojson`;
        const r = await fetch(url);
        const j = await r.json();
        const route = j?.routes?.[0];
        if (route?.geometry?.coordinates) {
          setRuta(route.geometry.coordinates.map(([lng, lat]: number[]) => ({ latitude: lat, longitude: lng })));
          setResumen({ km: (route.distance ?? 0) / 1000, min: Math.round((route.duration ?? 0) / 60), trafico: 0 });
          return;
        }
      } catch {
        // cae a línea recta
      }
      setRuta([miUbicacion, destino]);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [miUbicacion, destino, enCamino, mostrarTrafico]);

  const html = useMemo(
    () => (destino ? mapaHtml(destino, miUbicacion, ruta, TOMTOM_KEY, secciones) : ""),
    [destino, miUbicacion, ruta, secciones]
  );

  async function cambiarEstado(nuevo: string) {
    if (nuevo === estado) return;
    const idxA = ESTADOS.indexOf(estado);
    const idxT = ESTADOS.indexOf(nuevo);
    // Bloqueado tras Cerrado, salvo autorización del sistema central (web).
    if (estado === "cerrado" && !reaperturaOk) {
      Alert.alert("Despacho cerrado", "Para cambiar el estatus se requiere autorización del sistema central (CAD web).");
      return;
    }
    // Secuencial: no retroceder (salvo reapertura autorizada).
    if (!reaperturaOk && idxT < idxA) {
      Alert.alert("Estatus secuencial", "El estatus del despacho avanza en orden; no puede retroceder.");
      return;
    }
    // Cerrar exige al menos una narrativa.
    if (nuevo === "cerrado" && narrativas.length === 0) {
      Alert.alert("Falta narrativa", "Registra al menos una narrativa antes de cerrar el despacho.");
      return;
    }
    setGuardando(true);
    // Avanza de forma secuencial: si se saltan estados (p. ej. En el Lugar sin
    // Enterado/En Ruta), el RPC los registra con la misma fecha/hora.
    const { error } = await supabase.rpc("rpc_despacho_avanzar", { p_despacho: despacho.id, p_estado: nuevo });
    setGuardando(false);
    if (error) {
      Alert.alert("Error", error.message);
      return;
    }
    setEstado(nuevo);
  }

  // Reruteo automático + arribo automático: mientras la unidad va En camino
  // (Enterado/En Ruta), sigue el GPS, recalcula la ruta y, al llegar al lugar,
  // cambia el estatus a "En el Lugar" automáticamente.
  useEffect(() => {
    if (!destino || !enCamino) return;
    arribando.current = false; // reinicia la detección de llegada al (re)activarse
    let sub: Location.LocationSubscription | null = null;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 25, timeInterval: 8000 },
        (pos) => {
          const p = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
          // El reruteo/ETA NO se recalcula aquí: en Enterado se estima una sola vez
          // y en En Ruta lo recalcula el intervalo de 30 s. Aquí solo se detecta la llegada.
          if (!arribando.current && distKm(p.latitude, p.longitude, destino.latitude, destino.longitude) <= ARRIBO_KM) {
            arribando.current = true;
            Alert.alert("Llegada detectada", "El GPS indica que llegaste al lugar. Se marca 'En el Lugar'.");
            cambiarEstado("en_lugar");
          }
        }
      );
    })();
    return () => { if (sub) sub.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enCamino, destino?.latitude, destino?.longitude]);

  // ETA: en "En Ruta" se recalcula cada 30 s (en "Enterado" se estimó una sola vez;
  // en "En el Lugar"/"Cerrado" no se recalcula).
  useEffect(() => {
    if (estado !== "en_ruta") return;
    let activo = true;
    const tick = async () => {
      try {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        if (activo) setMiUbicacion({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
      } catch { /* ignore */ }
    };
    tick();
    const id = setInterval(tick, 30000);
    return () => { activo = false; clearInterval(id); };
  }, [estado]);

  function abrirEnMaps() {
    if (!destino) return;
    // Navegación turn-by-turn en Google Maps (la ruta/ETA/tráfico en la app usan TomTom).
    const url = `https://www.google.com/maps/dir/?api=1&destination=${destino.latitude},${destino.longitude}&travelmode=driving`;
    Linking.openURL(url);
  }

  async function cargarNarrativas() {
    if (!llamada) return;
    const { data } = await supabase
      .from("narrativas_cad")
      .select("id, texto, usuario_email, creado_en")
      .eq("llamada_id", llamada.id)
      .order("creado_en", { ascending: false });
    setNarrativas((data as any[]) ?? []);
  }
  useEffect(() => { cargarNarrativas(); /* eslint-disable-next-line */ }, []);

  async function registrarNarrativa() {
    if (!llamada || !nuevaNarrativa.trim()) return;
    setRegistrando(true);
    const { error } = await supabase.rpc("rpc_registrar_narrativa_cad", { p_llamada: llamada.id, p_texto: nuevaNarrativa.trim() });
    setRegistrando(false);
    if (error) { Alert.alert("Error", error.message); return; }
    setNuevaNarrativa("");
    cargarNarrativas();
  }

  return (
    <KeyboardAwareScrollView style={[styles.contenedor, { backgroundColor: "#f4f6f8" }]} keyboardShouldPersistTaps="handled" bottomOffset={24}>
      <View style={styles.cabecera}>
        <Text style={styles.folio}>{llamada?.folio ?? "s/folio"}</Text>
        <Text style={styles.tipo}>
          {llamada?.tipo ?? "—"}
          {llamada?.prioridad ? ` · prioridad ${llamada.prioridad}` : ""}
        </Text>
        <Text style={styles.dir}>{llamada?.direccion ?? "Sin dirección"}</Text>
        <Text style={styles.estadoActual}>Estado: {ETIQUETA[estado] ?? estado}</Text>
        {llamada?.id && (estado === "en_ruta" || estado === "en_lugar") ? (
          <BodycamBoton origen={{ tipo: "cad", id: llamada.id, folio: llamada.folio ?? null }} style={{ marginTop: 12 }} />
        ) : (
          <Text style={{ color: "#777", fontSize: 12, marginTop: 10 }}>La bodycam se activa cuando el estatus es «En Ruta» o «En el Lugar».</Text>
        )}
      </View>

      {destino ? (
        <View style={styles.mapaWrap}>
          <WebView
            originWhitelist={["*"]}
            source={{ html }}
            style={styles.mapa}
            javaScriptEnabled
            domStorageEnabled
          />
        </View>
      ) : (
        <Text style={styles.sinMapa}>El reporte no tiene coordenadas para mostrar el mapa.</Text>
      )}

      {destino && resumen && (
        <View style={styles.eta}>
          <Text style={styles.etaMin}>{resumen.min} min</Text>
          <Text style={styles.etaSub}>
            {resumen.km.toFixed(1)} km
            {resumen.trafico > 0 ? ` · +${resumen.trafico} min tráfico` : ""}
            {resumen.llegada ? ` · llega ${new Date(resumen.llegada).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}
          </Text>
          <Text style={styles.etaFuente}>{TOMTOM_KEY ? "TomTom · con tráfico en tiempo real" : "Ruta estimada (OSRM)"}</Text>
        </View>
      )}

      {destino && (
        <TouchableOpacity style={styles.botonSec} onPress={abrirEnMaps}>
          <Text style={styles.botonSecTexto}>🧭 Abrir navegación en Google Maps</Text>
        </TouchableOpacity>
      )}

      <Text style={styles.seccion}>Cambiar estatus del despacho</Text>
      <View style={styles.estados}>
        {ESTADOS.map((e) => (
          <TouchableOpacity
            key={e}
            style={[styles.chip, estado === e && styles.chipActivo, (estado === "cerrado" && !reaperturaOk) && { opacity: 0.5 }]}
            disabled={guardando || (estado === "cerrado" && !reaperturaOk)}
            onPress={() => cambiarEstado(e)}
          >
            <Text style={[styles.chipTexto, estado === e && styles.chipTextoActivo]}>
              {ETIQUETA[e]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {estado === "cerrado" && !reaperturaOk && (
        <Text style={{ color: "#777", fontSize: 12, paddingHorizontal: 16, marginTop: 4 }}>
          Despacho cerrado. Para reabrir/cambiar el estatus, el sistema central (CAD) debe autorizarlo.
        </Text>
      )}

      <Text style={styles.seccion}>Narrativas</Text>
      <View style={{ paddingHorizontal: 16 }}>
        <Text style={styles.ayudaNarr}>Registra lo que reportas al atender el incidente. Cada narrativa guarda fecha, hora y usuario.</Text>
        <TextInput
          style={styles.narrInput}
          placeholder="Escribe la narrativa…"
          value={nuevaNarrativa}
          onChangeText={setNuevaNarrativa}
          multiline
        />
        <TouchableOpacity style={styles.botonNarr} onPress={registrarNarrativa} disabled={registrando || !nuevaNarrativa.trim()}>
          <Text style={styles.botonTexto}>{registrando ? "Registrando…" : "Registrar"}</Text>
        </TouchableOpacity>

        {narrativas.map((n) => {
          const d = new Date(n.creado_en);
          return (
            <View key={n.id} style={styles.narrItem}>
              <Text style={styles.narrTexto}>{n.texto}</Text>
              <Text style={styles.narrMeta}>{d.toLocaleDateString()} · {d.toLocaleTimeString()} · {n.usuario_email ?? "—"}</Text>
            </View>
          );
        })}
        {narrativas.length === 0 && <Text style={styles.ayudaNarr}>Aún no hay narrativas.</Text>}
      </View>

      <TouchableOpacity
        style={styles.boton}
        onPress={() => llamada && navigation.navigate("Informe", { llamada })}
      >
        <Text style={styles.botonTexto}>📝 Levantar informe de incidente</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.boton, { marginTop: 0 }]}
        onPress={() => llamada && navigation.navigate("Accidente", { llamada })}
      >
        <Text style={styles.botonTexto}>🚗 Levantar informe de accidente</Text>
      </TouchableOpacity>
    </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  contenedor: { flex: 1, backgroundColor: "#f4f6f8" },
  cabecera: { padding: 16, backgroundColor: "#fff" },
  folio: { fontWeight: "800", color: "#0b3d66", fontSize: 16 },
  tipo: { marginTop: 4, fontWeight: "600" },
  dir: { color: "#555", marginTop: 2 },
  estadoActual: { marginTop: 8, fontWeight: "700", color: "#0b3d66" },
  mapaWrap: { width: "100%", height: 300 },
  mapa: { flex: 1 },
  sinMapa: { padding: 16, color: "#555" },
  seccion: { fontWeight: "700", padding: 16, paddingBottom: 8 },
  estados: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 12 },
  chip: {
    borderWidth: 1,
    borderColor: "#0b3d66",
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
    margin: 4,
  },
  chipActivo: { backgroundColor: "#0b3d66" },
  chipTexto: { color: "#0b3d66", fontWeight: "700" },
  chipTextoActivo: { color: "#fff" },
  boton: {
    backgroundColor: "#0b3d66",
    margin: 16,
    padding: 14,
    borderRadius: 8,
    alignItems: "center",
  },
  botonTexto: { color: "#fff", fontWeight: "700", fontSize: 16 },
  botonSec: {
    borderWidth: 1,
    borderColor: "#0b3d66",
    marginHorizontal: 16,
    marginTop: 12,
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  botonSecTexto: { color: "#0b3d66", fontWeight: "700" },
  eta: { backgroundColor: "#fff", marginHorizontal: 16, marginTop: 12, padding: 14, borderRadius: 8, borderLeftWidth: 4, borderLeftColor: "#e0091f" },
  etaMin: { fontSize: 24, fontWeight: "900", color: "#0b3d66" },
  etaSub: { color: "#333", marginTop: 2, fontWeight: "600" },
  etaFuente: { color: "#888", fontSize: 11, marginTop: 4 },
  ayudaNarr: { color: "#777", fontSize: 12, marginBottom: 8 },
  narrInput: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, minHeight: 64, textAlignVertical: "top" },
  botonNarr: { backgroundColor: "#0b3d66", padding: 12, borderRadius: 8, alignItems: "center", marginTop: 8 },
  narrItem: { backgroundColor: "#fff", borderRadius: 8, padding: 12, marginTop: 10, borderLeftWidth: 3, borderLeftColor: "#0b3d66" },
  narrTexto: { color: "#222" },
  narrMeta: { color: "#888", fontSize: 11, marginTop: 6 },
});
