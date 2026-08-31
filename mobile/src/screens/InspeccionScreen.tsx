import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Image, Alert, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useIsFocused, useNavigation, useRoute } from "@react-navigation/native";
import { SafeAreaView } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { supabase } from "../lib/supabase";
import { getMiOficialValido } from "../lib/oficial";
import { leerNfc, nfcDisponible } from "../lib/nfc";
import { guardarInspeccion, fotoABase64, type ItemInspeccion } from "../lib/colaInspecciones";
import { T, UI } from "../theme";

// Checklist por defecto según el tipo de inspección. En campo el guardia marca
// cada ítem OK / No OK / N/A y agrega notas. (Fase 2: plantillas administrables.)
const CHECKLIST: Record<string, { codigo: string; desc: string; req?: boolean }[]> = {
  "Pre-salida": [
    { codigo: "DOC", desc: "Documentación de la carga completa", req: true },
    { codigo: "SELLO", desc: "Sello colocado y legible", req: true },
    { codigo: "PUERTAS", desc: "Puertas y candados en buen estado" },
    { codigo: "LLANTAS", desc: "Llantas y estado físico de la unidad" },
    { codigo: "GPS", desc: "GPS encendido y reportando", req: true },
    { codigo: "OPERADOR", desc: "Operador identificado y autorizado", req: true },
  ],
  Entrada: [
    { codigo: "SELLO", desc: "Sello coincide y sin alteración", req: true },
    { codigo: "PLACA", desc: "Placas coinciden con la cita/manifiesto", req: true },
    { codigo: "DANOS", desc: "Sin daños visibles en la unidad" },
    { codigo: "DOC", desc: "Documentación de entrada validada" },
  ],
  Salida: [
    { codigo: "SELLO", desc: "Sello colocado y registrado", req: true },
    { codigo: "CARGA", desc: "Carga coincide con la orden" },
    { codigo: "DOC", desc: "Documentación de salida completa", req: true },
    { codigo: "GPS", desc: "GPS activo para el trayecto" },
  ],
  Patio: [
    { codigo: "UBIC", desc: "Unidad en el cajón/posición asignada" },
    { codigo: "SELLO", desc: "Sello íntegro" },
    { codigo: "CONEXION", desc: "Conexión de refrigeración (si aplica)" },
    { codigo: "PERIM", desc: "Sin personas ajenas alrededor" },
  ],
  Sello: [
    { codigo: "CODIGO", desc: "Código del sello coincide con el sistema", req: true },
    { codigo: "INTEGRIDAD", desc: "Sello sin cortes ni manipulación", req: true },
    { codigo: "POS", desc: "Sello en la posición correcta" },
  ],
  Perimetro: [
    { codigo: "BARDA", desc: "Barda/malla sin daños" },
    { codigo: "ACCESOS", desc: "Accesos controlados y cerrados" },
    { codigo: "ILUM", desc: "Iluminación funcionando" },
    { codigo: "CCTV", desc: "Cámaras operando" },
  ],
};

function checklistDe(tipo: string): { codigo: string; desc: string; req?: boolean }[] {
  return CHECKLIST[tipo] ?? [
    { codigo: "GEN1", desc: "Condición general correcta" },
    { codigo: "GEN2", desc: "Sin novedades de seguridad" },
  ];
}

type Resultado = "OK" | "NO_OK" | "NO_APLICA";
const SELLO_RES = [
  { k: "VALIDO", lbl: "Válido" },
  { k: "ALTERADO", lbl: "Alterado" },
  { k: "NO_COINCIDE", lbl: "No coincide" },
  { k: "NO_ENCONTRADO", lbl: "No hallado" },
] as const;

export default function InspeccionScreen() {
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const enfocada = useIsFocused();
  const [permiso, pedirPermiso] = useCameraPermissions();

  const movParam: string | undefined = route.params?.movimientoId;
  const movFolioParam: string | undefined = route.params?.movimientoFolio;

  const [tipos, setTipos] = useState<string[]>([]);
  const [tipo, setTipo] = useState<string>("");
  const [movimientoId, setMovimientoId] = useState<string | null>(movParam ?? null);
  const [movFolio, setMovFolio] = useState<string | null>(movFolioParam ?? null);
  const [movimientos, setMovimientos] = useState<any[]>([]);
  const [unidades, setUnidades] = useState<any[]>([]);
  const [unidadId, setUnidadId] = useState<string | null>(null);
  const [sitioId, setSitioId] = useState<string | null>(null);
  const [sitioNombre, setSitioNombre] = useState<string | null>(null);
  const [personalId, setPersonalId] = useState<string | null>(null);

  const [items, setItems] = useState<ItemInspeccion[]>([]);
  const [foto, setFoto] = useState<{ uri: string; mime: string } | null>(null);
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);

  // Validación de sello (opcional)
  const [validarSello, setValidarSello] = useState(false);
  const [selloId, setSelloId] = useState<string | null>(null);
  const [codigoSello, setCodigoSello] = useState("");
  const [selloResultado, setSelloResultado] = useState<(typeof SELLO_RES)[number]["k"]>("VALIDO");
  const [escaneando, setEscaneando] = useState(false);

  const [enviando, setEnviando] = useState(false);

  // Catálogos + ubicación + turno (sitio).
  useEffect(() => {
    supabase.from("cat_opciones").select("valor").eq("categoria", "tipo_inspeccion").eq("activo", true).order("orden")
      .then(({ data }) => {
        const v = ((data as any[]) ?? []).map((r) => r.valor).filter(Boolean);
        setTipos(v.length ? v : ["Pre-salida", "Entrada", "Salida", "Patio", "Sello"]);
        setTipo((t) => t || (v[0] ?? "Pre-salida"));
      });
    obtenerUbicacion();
    resolverContexto();
    supabase.from("movimientos").select("id, folio, tipo_movimiento, estado")
      .eq("estatus", "activo").not("estado", "in", "(FINALIZADO,CANCELADO)")
      .order("creado_en", { ascending: false }).limit(100)
      .then(({ data }) => setMovimientos((data as any[]) ?? []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Al cambiar el tipo, arma el checklist por defecto (conservando marcas por código).
  useEffect(() => {
    if (!tipo) return;
    setItems((prev) => {
      const previos = new Map(prev.map((p) => [p.codigo_item, p]));
      return checklistDe(tipo).map((c) => {
        const ya = previos.get(c.codigo);
        return ya ?? { codigo_item: c.codigo, descripcion: c.desc, resultado: "PENDIENTE" as const, requerido: !!c.req, notas: null };
      });
    });
    if (tipo.toLowerCase().includes("sello")) setValidarSello(true);
  }, [tipo]);

  // Unidades de carga: del movimiento si hay, si no las activas.
  useEffect(() => {
    if (movimientoId) {
      supabase.from("movimiento_unidades")
        .select("unidad:unidades_carga(id, folio, identificador, tipo_unidad), sello_id")
        .eq("movimiento_id", movimientoId).eq("estatus", "activo").order("secuencia")
        .then(({ data }) => setUnidades(((data as any[]) ?? []).map((r) => ({ ...r.unidad, sello_id: r.sello_id })).filter((u) => u?.id)));
    } else {
      supabase.from("unidades_carga").select("id, folio, identificador, tipo_unidad")
        .eq("estatus", "activo").order("creado_en", { ascending: false }).limit(100)
        .then(({ data }) => setUnidades((data as any[]) ?? []));
    }
  }, [movimientoId]);

  async function resolverContexto() {
    const g = await getMiOficialValido();
    setPersonalId(g?.personalId ?? null);
    if (!g) return;
    const hoy = new Date().toISOString().slice(0, 10);
    const { data: tg } = await supabase.from("turno_guardias")
      .select("sitio_id, sitios(nombre), turnos!inner(fecha, estado, estatus)")
      .eq("personal_id", g.personalId)
      .eq("turnos.fecha", hoy).eq("turnos.estado", "activo").eq("turnos.estatus", "activo").limit(1);
    const row = ((tg as any[]) ?? [])[0];
    if (row?.sitio_id) { setSitioId(row.sitio_id); setSitioNombre(row.sitios?.nombre ?? null); }
  }

  async function obtenerUbicacion() {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      const p = await Location.getCurrentPositionAsync({});
      setLat(Number(p.coords.latitude.toFixed(6)));
      setLng(Number(p.coords.longitude.toFixed(6)));
    } catch { /* sin ubicación */ }
  }

  function marcar(i: number, r: Resultado) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, resultado: it.resultado === r ? "PENDIENTE" : r } : it)));
  }
  function nota(i: number, txt: string) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, notas: txt || null } : it)));
  }

  // Sellos disponibles/asignados para elegir (cuando se valida el sello).
  const [opcSello, setOpcSello] = useState<any[]>([]);
  useEffect(() => {
    if (!validarSello) return;
    supabase.from("sellos").select("id, codigo_sello, estado").eq("estatus", "activo")
      .order("creado_en", { ascending: false }).limit(200).then(({ data }) => setOpcSello((data as any[]) ?? []));
  }, [validarSello]);

  const resultadoSugerido = useMemo(() => {
    const marcados = items.filter((i) => i.resultado !== "PENDIENTE");
    if (!marcados.length) return "OK";
    const fallaReq = items.some((i) => i.requerido && i.resultado === "NO_OK");
    const hayFalla = items.some((i) => i.resultado === "NO_OK");
    if (fallaReq) return "rechazada";
    if (hayFalla) return "con novedad";
    return "OK";
  }, [items]);
  const [resultado, setResultado] = useState<string>("OK");
  useEffect(() => setResultado(resultadoSugerido), [resultadoSugerido]);

  const tomarFoto = useCallback(async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return Alert.alert("Permiso", "Se requiere la cámara.");
    const res = await ImagePicker.launchCameraAsync({ quality: 0.6 });
    if (res.canceled) return;
    const a = res.assets[0];
    setFoto({ uri: a.uri, mime: a.mimeType ?? "image/jpeg" });
  }, []);

  function alEscanearQR(data: string) {
    if (!escaneando) return;
    setEscaneando(false);
    resolverCodigoSello(data);
  }
  async function escanearNfc() {
    if (!(await nfcDisponible())) { Alert.alert("NFC", "Este dispositivo no tiene NFC disponible."); return; }
    const r = await leerNfc();
    if (r.ok && r.codigo) resolverCodigoSello(r.codigo);
    else if (r.error) Alert.alert("NFC", r.error);
  }
  function resolverCodigoSello(code: string) {
    const t = code.trim().toUpperCase();
    if (!t) return;
    setCodigoSello(t);
    const enSistema = opcSello.find((s) => (s.codigo_sello ?? "").toUpperCase() === t);
    if (enSistema) { setSelloId(enSistema.id); setSelloResultado("VALIDO"); }
    else { setSelloId(null); setSelloResultado("NO_COINCIDE"); Alert.alert("Sello", "El código leído no coincide con ningún sello en el sistema."); }
  }

  function validar(): string | null {
    if (!tipo) return "Elige el tipo de inspección.";
    const reqPend = items.some((i) => i.requerido && i.resultado === "PENDIENTE");
    if (reqPend) return "Marca todos los ítems obligatorios (marcados con *).";
    if (validarSello && !selloId && !codigoSello.trim()) return "Escanea/captura el sello o desactiva la validación de sello.";
    return null;
  }

  async function registrar() {
    const err = validar();
    if (err) return Alert.alert("Falta información", err);
    setEnviando(true);
    try {
      const g = await getMiOficialValido();
      const fotoB64 = foto ? { base64: await fotoABase64(foto.uri), mime: foto.mime } : null;
      const clientId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const { subida, offline, error } = await guardarInspeccion({
        clientId,
        tipo_inspeccion: tipo,
        movimiento_id: movimientoId,
        unidad_carga_id: unidadId,
        transporte_activo_id: null,
        sitio_id: sitioId,
        realizada_por: g?.personalId ?? personalId,
        resultado,
        latitud: lat, longitud: lng,
        items,
        sello: validarSello
          ? { sello_id: selloId, codigo_sello: codigoSello.trim() || null, unidad_carga_id: unidadId, resultado: selloResultado, notas: null }
          : null,
        foto: fotoB64,
        creado_en: new Date().toISOString(),
      });
      setEnviando(false);
      const titulo = subida ? "Inspección registrada" : offline ? "Guardada sin conexión" : "No se pudo registrar ahora";
      const cuerpo = subida
        ? "La inspección quedó registrada correctamente."
        : offline
          ? "No hubo conexión; la inspección se guardó en el teléfono y se enviará automáticamente al recuperar señal."
          : `El servidor rechazó el registro (posible permiso): ${error ?? "error"}. Quedó guardada y se reintentará.`;
      Alert.alert(titulo, cuerpo, [{ text: "OK", onPress: () => nav.goBack() }]);
    } catch (e: any) {
      setEnviando(false);
      Alert.alert("Error", e.message ?? String(e));
    }
  }

  const chips = (arr: string[], val: string, set: (v: string) => void) => (
    <View style={styles.chips}>
      {arr.map((x) => (
        <TouchableOpacity key={x} style={[styles.chip, val === x && styles.chipOn]} onPress={() => set(x)}>
          <Text style={[styles.chipTxt, val === x && styles.chipTxtOn]}>{x}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <KeyboardAwareScrollView contentContainerStyle={{ padding: 16, paddingBottom: 44 }} keyboardShouldPersistTaps="handled" bottomOffset={24}>
        <Text style={styles.sub}>Sitio: {sitioNombre ?? "sin sitio (revisa tu turno)"}{lat != null ? "  ·  📍 GPS ok" : "  ·  sin GPS"}</Text>

        <Text style={styles.label}>Tipo de inspección</Text>
        {chips(tipos, tipo, setTipo)}

        <Text style={styles.label}>Movimiento (opcional)</Text>
        {movFolio && movimientoId ? (
          <View style={styles.movFijo}>
            <Ionicons name="cube" size={16} color={T.accent} />
            <Text style={styles.movFijoTxt}>{movFolio}</Text>
            {!movParam && (
              <TouchableOpacity onPress={() => { setMovimientoId(null); setMovFolio(null); }} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color={T.textMute} />
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={styles.chips}>
            {movimientos.map((m) => (
              <TouchableOpacity key={m.id} style={[styles.chip, movimientoId === m.id && styles.chipOn]} onPress={() => { setMovimientoId(movimientoId === m.id ? null : m.id); setMovFolio(m.folio ?? null); setUnidadId(null); }}>
                <Text style={[styles.chipTxt, movimientoId === m.id && styles.chipTxtOn]}>{m.folio ?? m.tipo_movimiento ?? "mov"}</Text>
              </TouchableOpacity>
            ))}
            {movimientos.length === 0 && <Text style={styles.vacio}>Sin movimientos activos.</Text>}
          </View>
        )}

        {unidades.length > 0 && (
          <>
            <Text style={styles.label}>Unidad de carga (opcional)</Text>
            <View style={styles.chips}>
              {unidades.map((u) => (
                <TouchableOpacity key={u.id} style={[styles.chip, unidadId === u.id && styles.chipOn]} onPress={() => setUnidadId(unidadId === u.id ? null : u.id)}>
                  <Text style={[styles.chipTxt, unidadId === u.id && styles.chipTxtOn]}>{u.identificador ?? u.folio ?? u.tipo_unidad ?? "unidad"}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {/* Checklist */}
        <Text style={styles.label}>Checklist</Text>
        {items.map((it, i) => (
          <View key={it.codigo_item ?? i} style={styles.item}>
            <Text style={styles.itemDesc}>{it.descripcion}{it.requerido ? <Text style={styles.req}> *</Text> : null}</Text>
            <View style={styles.itemBtns}>
              {(["OK", "NO_OK", "NO_APLICA"] as const).map((r) => (
                <TouchableOpacity
                  key={r}
                  style={[styles.rBtn, it.resultado === r && (r === "OK" ? styles.rOk : r === "NO_OK" ? styles.rBad : styles.rNa)]}
                  onPress={() => marcar(i, r)}
                >
                  <Text style={[styles.rTxt, it.resultado === r && styles.rTxtOn]}>{r === "OK" ? "OK" : r === "NO_OK" ? "No OK" : "N/A"}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {it.resultado === "NO_OK" && (
              <TextInput style={styles.itemNota} placeholder="Novedad / detalle" placeholderTextColor={T.textMute} value={it.notas ?? ""} onChangeText={(t) => nota(i, t)} />
            )}
          </View>
        ))}

        {/* Validación de sello */}
        <View style={styles.selloHead}>
          <Text style={[styles.label, { marginTop: 0 }]}>Validar sello</Text>
          <TouchableOpacity onPress={() => setValidarSello((v) => !v)} style={[styles.toggle, validarSello && styles.toggleOn]}>
            <View style={[styles.knob, validarSello && styles.knobOn]} />
          </TouchableOpacity>
        </View>
        {validarSello && (
          <View>
            {escaneando && enfocada && permiso?.granted ? (
              <View style={styles.cam}>
                <CameraView style={{ flex: 1 }} facing="back" barcodeScannerSettings={{ barcodeTypes: ["qr", "code128", "code39", "ean13"] }} onBarcodeScanned={({ data }) => alEscanearQR(data)} />
                <TouchableOpacity style={styles.camCancel} onPress={() => setEscaneando(false)}><Text style={styles.camCancelTxt}>Cancelar</Text></TouchableOpacity>
              </View>
            ) : (
              <View style={styles.grid}>
                <TouchableOpacity style={styles.cap} onPress={async () => { if (!permiso?.granted) { const r = await pedirPermiso(); if (!r.granted) return; } setEscaneando(true); }}><Ionicons name="qr-code" size={22} color={T.accent} /><Text style={styles.capTxt}>Escanear</Text></TouchableOpacity>
                <TouchableOpacity style={styles.cap} onPress={escanearNfc}><Ionicons name="radio" size={22} color={T.accent} /><Text style={styles.capTxt}>NFC</Text></TouchableOpacity>
              </View>
            )}
            <TextInput style={styles.input} placeholder="Código del sello" placeholderTextColor={T.textMute} value={codigoSello} onChangeText={setCodigoSello} onEndEditing={() => resolverCodigoSello(codigoSello)} autoCapitalize="characters" />
            {selloId ? <Text style={styles.ok}>✓ Sello reconocido en el sistema</Text> : codigoSello ? <Text style={styles.warn}>⚠ Código no reconocido</Text> : null}
            <View style={[styles.chips, { marginTop: 10 }]}>
              {SELLO_RES.map((s) => (
                <TouchableOpacity key={s.k} style={[styles.chip, selloResultado === s.k && (s.k === "VALIDO" ? styles.chipOn : styles.chipBad)]} onPress={() => setSelloResultado(s.k)}>
                  <Text style={[styles.chipTxt, selloResultado === s.k && styles.chipTxtOn]}>{s.lbl}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Foto */}
        <Text style={styles.label}>Foto (opcional)</Text>
        <View style={styles.grid}>
          <TouchableOpacity style={styles.cap} onPress={tomarFoto}><Ionicons name="camera" size={22} color={T.accent} /><Text style={styles.capTxt}>Tomar foto</Text></TouchableOpacity>
          {foto && <Image source={{ uri: foto.uri }} style={styles.thumb} />}
        </View>

        {/* Resultado */}
        <Text style={styles.label}>Resultado</Text>
        <View style={styles.seg}>
          {(["OK", "con novedad", "rechazada"] as const).map((r) => (
            <TouchableOpacity key={r} style={[styles.segBtn, resultado === r && (r === "rechazada" ? styles.segBad : r === "con novedad" ? styles.segWarn : styles.segOn)]} onPress={() => setResultado(r)}>
              <Text style={[styles.segTxt, resultado === r && styles.segTxtOn]}>{r === "OK" ? "OK" : r === "con novedad" ? "Con novedad" : "Rechazada"}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity style={styles.btnPrim} onPress={registrar} disabled={enviando}>
          {enviando ? <ActivityIndicator color={T.white} /> : (<><Ionicons name="clipboard" size={18} color={T.white} /><Text style={styles.btnPrimTxt}>Registrar inspección</Text></>)}
        </TouchableOpacity>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.bg },
  sub: { color: T.textDim, fontSize: 13.5, fontWeight: "700" },
  label: { color: T.textDim, fontSize: 13, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4, marginTop: 20, marginBottom: 8 },
  input: { backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: UI.radiusSm, paddingHorizontal: 14, minHeight: 50, color: T.text, fontSize: 16, marginTop: 8 },
  ok: { color: "#0a7c2f", fontWeight: "700", marginTop: 8 },
  warn: { color: "#b8860b", fontWeight: "700", marginTop: 8 },
  vacio: { color: T.textMute, fontSize: 13 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1, borderColor: T.border, borderRadius: 20, paddingVertical: 8, paddingHorizontal: 14, backgroundColor: T.surface },
  chipOn: { backgroundColor: T.accent, borderColor: T.accent },
  chipBad: { backgroundColor: T.danger, borderColor: T.danger },
  chipTxt: { color: T.textDim, fontWeight: "700", fontSize: 13 },
  chipTxtOn: { color: T.white },
  movFijo: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: T.surface, borderWidth: 1, borderColor: T.accentDim, borderRadius: UI.radiusSm, paddingHorizontal: 12, height: 46 },
  movFijoTxt: { flex: 1, color: T.text, fontWeight: "700", fontSize: 14 },
  item: { backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: UI.radiusSm, padding: 12, marginBottom: 8 },
  itemDesc: { color: T.text, fontSize: 14.5, fontWeight: "600", marginBottom: 10 },
  req: { color: T.danger, fontWeight: "900" },
  itemBtns: { flexDirection: "row", gap: 8 },
  rBtn: { flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: 9, borderWidth: 1, borderColor: T.border, backgroundColor: T.surfaceAlt },
  rOk: { backgroundColor: "#0a7c2f", borderColor: "#0a7c2f" },
  rBad: { backgroundColor: T.danger, borderColor: T.danger },
  rNa: { backgroundColor: T.textMute, borderColor: T.textMute },
  rTxt: { color: T.textDim, fontWeight: "800", fontSize: 13 },
  rTxtOn: { color: T.white },
  itemNota: { backgroundColor: T.surfaceAlt, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, minHeight: 44, color: T.text, fontSize: 15, marginTop: 8 },
  selloHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 20 },
  toggle: { width: 46, height: 28, borderRadius: 999, backgroundColor: T.surfaceAlt, borderWidth: 1, borderColor: T.border, padding: 3, justifyContent: "center" },
  toggleOn: { backgroundColor: T.accent, borderColor: T.accent },
  knob: { width: 20, height: 20, borderRadius: 10, backgroundColor: T.textMute },
  knobOn: { backgroundColor: T.white, alignSelf: "flex-end" },
  grid: { flexDirection: "row", gap: 10, alignItems: "center" },
  cap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: T.surface, borderWidth: 1, borderColor: T.accentDim, borderRadius: UI.radiusSm, paddingVertical: 15 },
  capTxt: { color: T.text, fontWeight: "700", fontSize: 14 },
  thumb: { width: 60, height: 60, borderRadius: 8, backgroundColor: T.surfaceHi },
  cam: { height: 240, borderRadius: UI.radiusSm, overflow: "hidden", marginTop: 8, position: "relative" },
  camCancel: { position: "absolute", bottom: 10, alignSelf: "center", backgroundColor: "rgba(0,0,0,.6)", paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  camCancelTxt: { color: "#fff", fontWeight: "700" },
  seg: { flexDirection: "row", gap: 8, marginTop: 8 },
  segBtn: { flex: 1, alignItems: "center", paddingVertical: 12, borderRadius: UI.radiusSm, backgroundColor: T.surface, borderWidth: 1, borderColor: T.border },
  segOn: { backgroundColor: "#0a7c2f", borderColor: "#0a7c2f" },
  segWarn: { backgroundColor: "#b8860b", borderColor: "#b8860b" },
  segBad: { backgroundColor: T.danger, borderColor: T.danger },
  segTxt: { color: T.textDim, fontWeight: "800", fontSize: 13.5 },
  segTxtOn: { color: T.white },
  btnPrim: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: T.accent, borderRadius: UI.radiusSm, height: 54, marginTop: 26 },
  btnPrimTxt: { color: T.white, fontWeight: "800", fontSize: 16 },
});
