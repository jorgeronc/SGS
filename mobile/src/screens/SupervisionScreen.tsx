import { useEffect, useMemo, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, FlatList, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../lib/supabase";
import { tileUrl } from "../lib/geo";
import { T, UI } from "../theme";

function nombre(p: any) {
  const x = p?.persona;
  return x ? `${x.nombre ?? ""} ${x.apellido_paterno ?? ""} ${x.apellido_materno ?? ""}`.trim() : "—";
}
const conNovedad = (n: string | null) => !!n && n.trim() !== "" && n.trim().toLowerCase() !== "sin novedad";
const fmtFecha = (d: Date) => d.toISOString().slice(0, 10);

const EST_LABEL: Record<string, string> = { en_servicio: "En posición", en_rondin: "En rondín", en_pausa: "En pausa" };
const EST_COLOR: Record<string, string> = { en_servicio: "#22c55e", en_rondin: "#2f6bff", en_pausa: "#b06a00" };

interface Paso { id: string; fecha_hora: string; novedad: string | null; punto: string; sitio: string }
interface Gps { latitud: number | null; longitud: number | null; en_linea: boolean; estatus_servicio: string | null; motivo_pausa: string | null; actualizado_en: string | null }
interface Sitio { nombre: string; latitud: number | null; longitud: number | null }
interface PuntoGuardia { lat: number; lng: number; label: string }

// HTML de un mapa de solo lectura (Leaflet en WebView): marca uno o varios guardias
// (rojo) y, si se da, el sitio/puesto (azul).
function mapaHTML(guardias: PuntoGuardia[], sitio: Sitio | null): string {
  const gs = guardias.filter((g) => g.lat != null && g.lng != null);
  const s = sitio && sitio.latitud != null && sitio.longitud != null ? { lat: sitio.latitud, lng: sitio.longitud } : null;
  const centro = gs[0] ?? s ?? { lat: 25.6866, lng: -100.3161 };
  const capas: string[] = [];
  if (s) capas.push(`L.circleMarker([${s.lat},${s.lng}],{radius:9,color:'#2f6bff',weight:2,fillColor:'#2f6bff',fillOpacity:.85}).addTo(map).bindTooltip(${JSON.stringify(sitio?.nombre || "Sitio")});`);
  gs.forEach((g) => capas.push(`L.circleMarker([${g.lat},${g.lng}],{radius:8,color:'#e11d48',weight:2,fillColor:'#e11d48',fillOpacity:.9}).addTo(map).bindTooltip(${JSON.stringify(g.label)});`));
  const pts = [...gs.map((g) => [g.lat, g.lng]), ...(s ? [[s.lat, s.lng]] : [])];
  const fit = pts.length > 1 ? `map.fitBounds(${JSON.stringify(pts)},{padding:[30,30],maxZoom:16});` : "";
  return `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<style>html,body,#map{margin:0;height:100%;width:100%;background:#e8ecef;}</style>
</head><body>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
  var map=L.map('map',{zoomControl:false,attributionControl:false}).setView([${centro.lat},${centro.lng}],15);
  L.tileLayer('${tileUrl()}',{maxZoom:19,subdomains:'abc'}).addTo(map);
  ${capas.join("\n")}
  ${fit}
  true;
</script></body></html>`;
}

// Supervisión (móvil, solo mandos): por GUARDIA (su GPS, sitio asignado, estatus y
// rondines) o por SITIO (los guardias asignados a ese sitio y su GPS en el mapa).
export default function SupervisionScreen() {
  const [modo, setModo] = useState<"guardia" | "sitio">("guardia");
  const [guardias, setGuardias] = useState<any[]>([]);
  const [estadoPorGuardia, setEstadoPorGuardia] = useState<Record<string, Gps>>({});
  const [sitiosLista, setSitiosLista] = useState<any[]>([]);

  // Modo guardia
  const [guardiaId, setGuardiaId] = useState("");
  const [gps, setGps] = useState<Gps | null>(null);
  const [sitio, setSitio] = useState<Sitio | null>(null);
  const [fecha, setFecha] = useState<Date>(new Date());
  const [pasos, setPasos] = useState<Paso[]>([]);
  const [cargando, setCargando] = useState(false);

  // Modo sitio
  const [sitioSelId, setSitioSelId] = useState("");
  const [sitioSel, setSitioSel] = useState<Sitio | null>(null);
  const [guardiasSitio, setGuardiasSitio] = useState<{ personalId: string; nombre: string; gps: Gps | null }[]>([]);

  useEffect(() => {
    supabase.from("personal").select("id, categoria, persona:personas(nombre, apellido_paterno, apellido_materno)")
      .eq("estatus", "activo").eq("estado_laboral", "activo")
      .then(({ data }) => setGuardias((data as any[]) ?? []));
    supabase.from("ubicaciones_guardias").select("personal_id, latitud, longitud, en_linea, estatus_servicio, motivo_pausa, actualizado_en")
      .then(({ data }) => {
        const map: Record<string, Gps> = {};
        ((data as any[]) ?? []).forEach((r) => { map[r.personal_id] = r; });
        setEstadoPorGuardia(map);
      });
    // Sitios con turno activo hoy (para supervisar por sitio).
    (async () => {
      const hoy = fmtFecha(new Date());
      const { data } = await supabase.from("turno_guardias")
        .select("sitio:sitios(id, nombre, latitud, longitud), turno:turnos(estado, fecha)")
        .eq("estatus", "activo");
      const arr = ((data as any[]) ?? []).filter((r) => r.turno?.estado === "activo" && r.turno?.fecha === hoy && r.sitio);
      const uniq = Array.from(new Map(arr.map((r) => [r.sitio.id, r.sitio])).values());
      setSitiosLista(uniq);
    })();
  }, []);

  // Modo guardia: GPS/estatus + sitio asignado del guardia.
  useEffect(() => {
    if (!guardiaId) { setGps(null); setSitio(null); return; }
    setGps(estadoPorGuardia[guardiaId] ?? null);
    (async () => {
      const hoy = fmtFecha(new Date());
      const { data } = await supabase.from("turno_guardias")
        .select("sitio:sitios(nombre, latitud, longitud), turno:turnos(estado, fecha)")
        .eq("personal_id", guardiaId).eq("estatus", "activo");
      const fila = ((data as any[]) ?? []).find((r) => r.turno?.estado === "activo" && r.turno?.fecha === hoy);
      setSitio(fila?.sitio ?? null);
    })();
  }, [guardiaId, estadoPorGuardia]);

  // Modo sitio: guardias asignados a ese sitio hoy (con su GPS).
  useEffect(() => {
    if (!sitioSelId) { setSitioSel(null); setGuardiasSitio([]); return; }
    (async () => {
      const hoy = fmtFecha(new Date());
      const { data } = await supabase.from("turno_guardias")
        .select("personal_id, personal:personal(persona:personas(nombre, apellido_paterno, apellido_materno)), sitio:sitios(nombre, latitud, longitud), turno:turnos(estado, fecha)")
        .eq("sitio_id", sitioSelId).eq("estatus", "activo");
      const arr = ((data as any[]) ?? []).filter((r) => r.turno?.estado === "activo" && r.turno?.fecha === hoy);
      setSitioSel(arr[0]?.sitio ?? sitiosLista.find((s) => s.id === sitioSelId) ?? null);
      const uniq = Array.from(new Map(arr.map((r) => [r.personal_id, r])).values());
      setGuardiasSitio(uniq.map((r: any) => ({
        personalId: r.personal_id,
        nombre: nombre({ persona: r.personal?.persona }),
        gps: estadoPorGuardia[r.personal_id] ?? null,
      })));
    })();
  }, [sitioSelId, estadoPorGuardia, sitiosLista]);

  // Rondines del guardia en la fecha elegida (cronológico) — modo guardia.
  useEffect(() => {
    if (modo !== "guardia" || !guardiaId) { setPasos([]); return; }
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
  }, [modo, guardiaId, fecha]);

  function moverDia(delta: number) {
    setFecha((d) => { const n = new Date(d); n.setDate(n.getDate() + delta); return n; });
  }

  // Datos para el mapa según el modo.
  const hayGps = modo === "guardia"
    ? !!gps && gps.latitud != null && gps.longitud != null && gps.en_linea
    : guardiasSitio.some((g) => g.gps?.en_linea && g.gps.latitud != null);
  const estKey = gps?.estatus_servicio ?? null;
  const estLabel = estKey ? (EST_LABEL[estKey] ?? estKey) : "Sin datos del sistema";
  const estColor = estKey ? (EST_COLOR[estKey] ?? T.textMute) : T.textMute;

  const html = useMemo(() => {
    if (modo === "guardia") {
      const g = gps && gps.latitud != null && gps.longitud != null && gps.en_linea ? [{ lat: gps.latitud, lng: gps.longitud, label: "Guardia" }] : [];
      return mapaHTML(g, sitio);
    }
    const pts = guardiasSitio
      .filter((g) => g.gps?.en_linea && g.gps.latitud != null && g.gps.longitud != null)
      .map((g) => ({ lat: g.gps!.latitud as number, lng: g.gps!.longitud as number, label: g.nombre }));
    return mapaHTML(pts, sitioSel);
  }, [modo, gps, sitio, guardiasSitio, sitioSel]);

  const novedades = pasos.filter((p) => conNovedad(p.novedad)).length;
  const enLineaSitio = guardiasSitio.filter((g) => g.gps?.en_linea).length;
  const seleccionado = modo === "guardia" ? !!guardiaId : !!sitioSelId;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Text style={styles.titulo}>Supervisión</Text>

      {/* Toggle Guardia / Sitio */}
      <View style={styles.seg}>
        {(["guardia", "sitio"] as const).map((m) => (
          <TouchableOpacity key={m} style={[styles.segBtn, modo === m && styles.segOn]} onPress={() => setModo(m)}>
            <Ionicons name={m === "guardia" ? "person" : "business"} size={15} color={modo === m ? T.white : T.textDim} />
            <Text style={[styles.segTxt, modo === m && styles.segTxtOn]}>{m === "guardia" ? "Por guardia" : "Por sitio"}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Selector horizontal (guardias o sitios) en cards de dos renglones */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={styles.chipsWrap}>
        {modo === "guardia" ? (
          guardias.length ? guardias.map((g) => {
            const on = guardiaId === g.id;
            const est = estadoPorGuardia[g.id];
            const dot = est?.en_linea ? (EST_COLOR[est.estatus_servicio ?? "en_servicio"] ?? "#22c55e") : T.textMute;
            return (
              <TouchableOpacity key={g.id} style={[styles.gCard, on && styles.gCardOn]} onPress={() => setGuardiaId(g.id)}>
                <View style={styles.gTop}><View style={[styles.gDot, { backgroundColor: dot }]} /><Ionicons name="person" size={14} color={on ? T.white : T.textDim} /></View>
                <Text style={[styles.gTxt, on && { color: T.white }]} numberOfLines={2}>{nombre(g)}</Text>
              </TouchableOpacity>
            );
          }) : <Text style={styles.sub}>Sin guardias activos.</Text>
        ) : (
          sitiosLista.length ? sitiosLista.map((s) => {
            const on = sitioSelId === s.id;
            return (
              <TouchableOpacity key={s.id} style={[styles.gCard, on && styles.gCardOn]} onPress={() => setSitioSelId(s.id)}>
                <View style={styles.gTop}><Ionicons name="business" size={14} color={on ? T.white : T.textDim} /></View>
                <Text style={[styles.gTxt, on && { color: T.white }]} numberOfLines={2}>{s.nombre}</Text>
              </TouchableOpacity>
            );
          }) : <Text style={styles.sub}>Sin sitios con turno activo hoy.</Text>
        )}
      </ScrollView>

      {!seleccionado ? (
        <View style={styles.vacio}><Ionicons name={modo === "guardia" ? "person-outline" : "business-outline"} size={40} color={T.textMute} /><Text style={styles.sub}>{modo === "guardia" ? "Elige un guardia para supervisar." : "Elige un sitio para ver sus guardias."}</Text></View>
      ) : (
        <>
          {/* Mapa con GPS */}
          <View style={styles.mapaBox}>
            <WebView originWhitelist={["*"]} source={{ html }} style={{ flex: 1, backgroundColor: "#e8ecef" }} />
            {!hayGps && (
              <View style={styles.gpsOverlay}>
                <Ionicons name="location-outline" size={18} color="#fff" />
                <Text style={styles.gpsTxt}>GPS sin señal</Text>
              </View>
            )}
          </View>

          {modo === "guardia" ? (
            <>
              <View style={styles.estRow}>
                <View style={[styles.estPill, { borderColor: estColor }]}>
                  <View style={[styles.gDot, { backgroundColor: estColor }]} />
                  <Text style={[styles.estTxt, { color: estColor }]}>{estLabel}{estKey === "en_pausa" && gps?.motivo_pausa ? ` · ${gps.motivo_pausa}` : ""}</Text>
                </View>
                {sitio && <Text style={styles.sitioTxt} numberOfLines={1}><Ionicons name="business-outline" size={12} color={T.textDim} /> {sitio.nombre}</Text>}
              </View>

              <View style={styles.fechaRow}>
                <TouchableOpacity onPress={() => moverDia(-1)} style={styles.fBtn}><Ionicons name="chevron-back" size={20} color={T.text} /></TouchableOpacity>
                <Text style={styles.fechaTxt}>{fecha.toLocaleDateString()}</Text>
                <TouchableOpacity onPress={() => moverDia(1)} style={styles.fBtn}><Ionicons name="chevron-forward" size={20} color={T.text} /></TouchableOpacity>
                <TouchableOpacity onPress={() => setFecha(new Date())} style={styles.hoyBtn}><Text style={styles.hoyTxt}>Hoy</Text></TouchableOpacity>
                <Text style={styles.resTxt}>{pasos.length} rondín{pasos.length === 1 ? "" : "es"}{novedades ? ` · ${novedades}⚠` : ""}</Text>
              </View>

              {cargando ? (
                <View style={styles.vacio}><ActivityIndicator color={T.accent} /></View>
              ) : (
                <FlatList
                  data={pasos}
                  keyExtractor={(p) => p.id}
                  contentContainerStyle={{ padding: 16, paddingTop: 6 }}
                  ListEmptyComponent={<Text style={styles.sub}>Sin rondines en esta fecha.</Text>}
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
              )}
            </>
          ) : (
            <>
              <View style={styles.estRow}>
                {sitioSel && <Text style={styles.sitioTxt} numberOfLines={1}><Ionicons name="business-outline" size={12} color={T.textDim} /> {sitioSel.nombre}</Text>}
                <Text style={styles.resTxt}>{guardiasSitio.length} guardia{guardiasSitio.length === 1 ? "" : "s"} · {enLineaSitio} en línea</Text>
              </View>
              <FlatList
                data={guardiasSitio}
                keyExtractor={(g) => g.personalId}
                contentContainerStyle={{ padding: 16, paddingTop: 6 }}
                ListEmptyComponent={<Text style={styles.sub}>Este sitio no tiene guardias asignados hoy.</Text>}
                renderItem={({ item }) => {
                  const est = item.gps?.estatus_servicio ?? null;
                  const color = item.gps?.en_linea ? (EST_COLOR[est ?? "en_servicio"] ?? "#22c55e") : T.textMute;
                  return (
                    <TouchableOpacity style={styles.tlItem} onPress={() => { setModo("guardia"); setGuardiaId(item.personalId); }}>
                      <View style={[styles.dot, { backgroundColor: color }]} />
                      <View style={styles.tlBody}>
                        <Text style={styles.tlPunto}>{item.nombre}</Text>
                        <Text style={styles.tlMeta}>
                          {item.gps?.en_linea ? (EST_LABEL[est ?? "en_servicio"] ?? "En línea") : "GPS sin señal"}
                          {est === "en_pausa" && item.gps?.motivo_pausa ? ` · ${item.gps.motivo_pausa}` : ""}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={T.textMute} />
                    </TouchableOpacity>
                  );
                }}
              />
            </>
          )}
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.bg },
  titulo: { color: T.text, fontSize: 22, fontWeight: "800", paddingHorizontal: 16, paddingTop: 8, paddingBottom: 6 },
  sub: { color: T.textDim, fontSize: 13.5, marginTop: 8, textAlign: "center" },
  seg: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingBottom: 4 },
  segBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: T.border, backgroundColor: T.surface },
  segOn: { backgroundColor: T.accent, borderColor: T.accent },
  segTxt: { color: T.textDim, fontWeight: "800", fontSize: 13 },
  segTxtOn: { color: T.white },
  chipsWrap: { maxHeight: 76, flexGrow: 0 },
  chips: { paddingHorizontal: 12, gap: 8, paddingVertical: 4, alignItems: "stretch" },
  gCard: { width: 128, height: 66, borderWidth: 1, borderColor: T.border, borderRadius: 12, backgroundColor: T.surface, paddingHorizontal: 10, paddingVertical: 8, justifyContent: "space-between" },
  gCardOn: { backgroundColor: T.accent, borderColor: T.accent },
  gTop: { flexDirection: "row", alignItems: "center", gap: 6 },
  gDot: { width: 9, height: 9, borderRadius: 5 },
  gTxt: { color: T.text, fontWeight: "700", fontSize: 12.5, lineHeight: 15 },
  mapaBox: { height: 190, marginHorizontal: 16, marginTop: 6, borderRadius: UI.radiusSm, overflow: "hidden", borderWidth: 1, borderColor: T.border, backgroundColor: "#e8ecef" },
  gpsOverlay: { position: "absolute", top: 8, left: 8, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(138,18,32,0.92)", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  gpsTxt: { color: "#fff", fontWeight: "800", fontSize: 12 },
  estRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingTop: 8 },
  estPill: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  estTxt: { fontWeight: "800", fontSize: 12.5 },
  sitioTxt: { color: T.textDim, fontSize: 12.5, flex: 1 },
  fechaRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
  fBtn: { padding: 6, backgroundColor: T.surface, borderRadius: 8, borderWidth: 1, borderColor: T.border },
  fechaTxt: { color: T.text, fontSize: 14, fontWeight: "700", minWidth: 96, textAlign: "center" },
  hoyBtn: { paddingHorizontal: 10, paddingVertical: 7, backgroundColor: T.surfaceAlt, borderRadius: 8 },
  hoyTxt: { color: T.accent, fontWeight: "700", fontSize: 13 },
  resTxt: { marginLeft: "auto", color: T.textDim, fontSize: 12.5, fontWeight: "700" },
  vacio: { alignItems: "center", justifyContent: "center", gap: 10, padding: 24 },
  tlItem: { flexDirection: "row", alignItems: "center", gap: 12, paddingBottom: 14 },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: T.accent, marginTop: 4, borderWidth: 2, borderColor: T.bg },
  tlBody: { flex: 1 },
  tlPunto: { color: T.text, fontSize: 15, fontWeight: "700" },
  tlMeta: { color: T.textDim, fontSize: 12.5, marginTop: 2 },
});
