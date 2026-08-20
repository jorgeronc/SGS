import { useEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Image, Alert, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { decode } from "base64-arraybuffer";
import { supabase, BUCKET_FOTOS } from "../lib/supabase";
import Foto from "./Foto";
import { T, UI } from "../theme";

type TipoInv = "persona" | "vehiculo" | "ubicacion";
const TIPOS: { k: TipoInv; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { k: "persona", label: "Persona", icon: "person" },
  { k: "vehiculo", label: "Vehículo", icon: "car" },
  { k: "ubicacion", label: "Lugar", icon: "location" },
];
const TABLA: Record<TipoInv, string> = { persona: "personas", vehiculo: "vehiculos", ubicacion: "ubicaciones" };
const CAT: Record<TipoInv, string> = { persona: "participacion_persona", vehiculo: "participacion_vehiculo", ubicacion: "participacion_lugar" };

interface Foto { base64: string; mime: string; uri: string; }
interface Item { vinculoId: string; tipo: TipoInv; etiqueta: string; participacion: string; fotoUrl: string | null; }

function etiqueta(tipo: TipoInv, r: any): string {
  if (tipo === "vehiculo") return `${r.placas ?? "s/placas"} · ${r.marca ?? ""} ${r.modelo ?? ""}`.trim();
  if (tipo === "ubicacion") return `${r.calle ?? ""} ${r.numero_exterior ?? ""}, ${r.colonia ?? ""}`.trim();
  return `${r.nombre ?? ""} ${r.apellido_paterno ?? ""} ${r.apellido_materno ?? ""}`.trim();
}

// Involucrados del incidente en la app móvil: personas, vehículos y ubicaciones
// con su participación. Cada uno se guarda en su catálogo maestro (con foto) y
// se vincula al incidente.
export default function Involucrados({ incidenteId }: { incidenteId: string }) {
  const [lista, setLista] = useState<Item[]>([]);
  const [cargando, setCargando] = useState(true);
  const [abierto, setAbierto] = useState(false);
  const [tipo, setTipo] = useState<TipoInv>("persona");
  const [opciones, setOpciones] = useState<string[]>([]);
  const [participacion, setParticipacion] = useState("");
  const [foto, setFoto] = useState<Foto | null>(null);
  const [guardando, setGuardando] = useState(false);

  const [pNombre, setPNombre] = useState(""); const [pPat, setPPat] = useState(""); const [pMat, setPMat] = useState(""); const [pCurp, setPCurp] = useState("");
  const [vPlacas, setVPlacas] = useState(""); const [vMarca, setVMarca] = useState(""); const [vModelo, setVModelo] = useState(""); const [vColor, setVColor] = useState("");
  const [uCalle, setUCalle] = useState(""); const [uNumero, setUNumero] = useState(""); const [uColonia, setUColonia] = useState("");

  function urlFoto(path: string) { return supabase.storage.from(BUCKET_FOTOS).getPublicUrl(path).data.publicUrl; }

  async function cargar() {
    setCargando(true);
    const { data } = await supabase
      .from("vinculos")
      .select("id, entidad_destino_tipo, entidad_destino_id, tipo_relacion")
      .eq("entidad_origen_tipo", "incidente").eq("entidad_origen_id", incidenteId).eq("estatus", "activo")
      .in("entidad_destino_tipo", ["persona", "vehiculo", "ubicacion"]);
    const filas = (data as any[]) ?? [];
    const res = await Promise.all(filas.map(async (v) => {
      const t = v.entidad_destino_tipo as TipoInv;
      const cols = t === "persona" ? "nombre, apellido_paterno, apellido_materno, fotografias"
        : t === "vehiculo" ? "placas, marca, modelo, fotografias" : "calle, numero_exterior, colonia, fotografias";
      const { data: e } = await supabase.from(TABLA[t]).select(cols).eq("id", v.entidad_destino_id).maybeSingle();
      const fotos = (e as any)?.fotografias;
      return {
        vinculoId: v.id as string, tipo: t,
        etiqueta: e ? etiqueta(t, e) : v.entidad_destino_id,
        participacion: v.tipo_relacion as string,
        fotoUrl: Array.isArray(fotos) && fotos.length ? urlFoto(fotos[0]) : null,
      } as Item;
    }));
    setLista(res);
    setCargando(false);
  }

  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, [incidenteId]);
  useEffect(() => {
    supabase.from("cat_opciones").select("valor").eq("categoria", CAT[tipo]).eq("activo", true).order("orden")
      .then(({ data }) => setOpciones(((data as any[]) ?? []).map((o) => o.valor)));
    setParticipacion("");
  }, [tipo]);

  async function elegirFoto(desde: "camara" | "galeria") {
    const perm = desde === "camara" ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert("Permiso", `Se requiere permiso de ${desde === "camara" ? "cámara" : "galería"}.`); return; }
    const res = desde === "camara"
      ? await ImagePicker.launchCameraAsync({ quality: 0.6, base64: true })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.6, base64: true, mediaTypes: ["images"] });
    if (res.canceled) return;
    const a = res.assets[0];
    if (a.base64) setFoto({ base64: a.base64, mime: a.mimeType ?? "image/jpeg", uri: a.uri });
  }

  function limpiar() {
    setPNombre(""); setPPat(""); setPMat(""); setPCurp("");
    setVPlacas(""); setVMarca(""); setVModelo(""); setVColor("");
    setUCalle(""); setUNumero(""); setUColonia("");
    setFoto(null); setParticipacion("");
  }

  async function agregar() {
    if (!participacion) { Alert.alert("Falta", "Indica la participación."); return; }
    setGuardando(true);
    try {
      let payload: any = {};
      if (tipo === "persona") {
        if (!pNombre.trim()) { Alert.alert("Falta", "Nombre requerido."); setGuardando(false); return; }
        payload = { nombre: pNombre.trim(), apellido_paterno: pPat.trim() || null, apellido_materno: pMat.trim() || null, curp: pCurp.trim() || null };
      } else if (tipo === "vehiculo") {
        if (!vPlacas.trim() && !vMarca.trim()) { Alert.alert("Falta", "Indica placas o marca."); setGuardando(false); return; }
        payload = { placas: vPlacas.trim() || null, marca: vMarca.trim() || null, modelo: vModelo.trim() || null, color: vColor.trim() || null };
      } else {
        if (!uCalle.trim()) { Alert.alert("Falta", "Indica la calle."); setGuardando(false); return; }
        payload = { calle: uCalle.trim(), numero_exterior: uNumero.trim() || null, colonia: uColonia.trim() || null };
      }
      const { data: ent, error: eIns } = await supabase.from(TABLA[tipo]).insert(payload).select("id").single();
      if (eIns || !ent) throw eIns ?? new Error("No se pudo crear el registro.");

      if (foto) {
        const ext = foto.mime.includes("png") ? "png" : "jpg";
        const path = `${TABLA[tipo]}/${ent.id}/${Date.now()}.${ext}`;
        const { error: eUp } = await supabase.storage.from(BUCKET_FOTOS).upload(path, decode(foto.base64), { contentType: foto.mime });
        if (!eUp) await supabase.from(TABLA[tipo]).update({ fotografias: [path], actualizado_en: new Date().toISOString() }).eq("id", ent.id);
      }

      const { error: eVin } = await supabase.from("vinculos").insert({
        entidad_origen_tipo: "incidente", entidad_origen_id: incidenteId,
        entidad_destino_tipo: tipo, entidad_destino_id: ent.id, tipo_relacion: participacion,
      });
      if (eVin) throw eVin;
      limpiar();
      setAbierto(false);
      await cargar();
    } catch (e: any) {
      Alert.alert("Error", e.message ?? String(e));
    } finally {
      setGuardando(false);
    }
  }

  async function quitar(vinculoId: string) {
    Alert.alert("Quitar involucrado", "¿Quitarlo del incidente? (no borra el registro maestro)", [
      { text: "Cancelar", style: "cancel" },
      { text: "Quitar", style: "destructive", onPress: async () => {
        const { error } = await supabase.rpc("rpc_cancelar_registro", { p_tabla: "vinculos", p_id: vinculoId, p_motivo: "Retirado de involucrados del incidente" });
        if (error) Alert.alert("Error", error.message); else cargar();
      } },
    ]);
  }

  return (
    <View>
      {cargando ? <ActivityIndicator color={T.accent} /> : lista.length === 0 ? (
        <Text style={styles.vacio}>Sin involucrados todavía.</Text>
      ) : lista.map((i) => (
        <View key={i.vinculoId} style={styles.card}>
          {i.fotoUrl ? <Foto uri={i.fotoUrl} style={styles.foto} /> : <View style={[styles.foto, styles.noimg]}><Ionicons name={TIPOS.find((t) => t.k === i.tipo)!.icon} size={22} color={T.textMute} /></View>}
          <View style={{ flex: 1 }}>
            <Text style={styles.part}>{i.tipo.toUpperCase()} · {i.participacion}</Text>
            <Text style={styles.nombre} numberOfLines={1}>{i.etiqueta || "(sin datos)"}</Text>
          </View>
          <TouchableOpacity onPress={() => quitar(i.vinculoId)}><Ionicons name="close-circle" size={22} color={T.danger} /></TouchableOpacity>
        </View>
      ))}

      {!abierto ? (
        <TouchableOpacity style={styles.addBtn} onPress={() => setAbierto(true)}>
          <Ionicons name="add" size={18} color={T.white} /><Text style={styles.addTxt}>Agregar involucrado</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.form}>
          <View style={styles.tipoRow}>
            {TIPOS.map((t) => (
              <TouchableOpacity key={t.k} style={[styles.tipoBtn, tipo === t.k && styles.tipoBtnOn]} onPress={() => setTipo(t.k)}>
                <Ionicons name={t.icon} size={16} color={tipo === t.k ? T.white : T.textDim} />
                <Text style={[styles.tipoTxt, tipo === t.k && styles.tipoTxtOn]}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {tipo === "persona" && (<>
            <TextInput style={styles.input} placeholder="Nombre(s)" placeholderTextColor={T.textMute} value={pNombre} onChangeText={setPNombre} />
            <TextInput style={styles.input} placeholder="Apellido paterno" placeholderTextColor={T.textMute} value={pPat} onChangeText={setPPat} />
            <TextInput style={styles.input} placeholder="Apellido materno" placeholderTextColor={T.textMute} value={pMat} onChangeText={setPMat} />
            <TextInput style={styles.input} placeholder="CURP (opcional)" placeholderTextColor={T.textMute} autoCapitalize="characters" value={pCurp} onChangeText={setPCurp} />
          </>)}
          {tipo === "vehiculo" && (<>
            <TextInput style={styles.input} placeholder="Placas" placeholderTextColor={T.textMute} autoCapitalize="characters" value={vPlacas} onChangeText={setVPlacas} />
            <TextInput style={styles.input} placeholder="Marca" placeholderTextColor={T.textMute} value={vMarca} onChangeText={setVMarca} />
            <TextInput style={styles.input} placeholder="Modelo" placeholderTextColor={T.textMute} value={vModelo} onChangeText={setVModelo} />
            <TextInput style={styles.input} placeholder="Color" placeholderTextColor={T.textMute} value={vColor} onChangeText={setVColor} />
          </>)}
          {tipo === "ubicacion" && (<>
            <TextInput style={styles.input} placeholder="Calle" placeholderTextColor={T.textMute} value={uCalle} onChangeText={setUCalle} />
            <TextInput style={styles.input} placeholder="Número exterior" placeholderTextColor={T.textMute} value={uNumero} onChangeText={setUNumero} />
            <TextInput style={styles.input} placeholder="Colonia" placeholderTextColor={T.textMute} value={uColonia} onChangeText={setUColonia} />
          </>)}

          <Text style={styles.lbl}>Participación</Text>
          <View style={styles.chips}>
            {opciones.map((o) => (
              <TouchableOpacity key={o} style={[styles.chip, participacion === o && styles.chipOn]} onPress={() => setParticipacion(o)}>
                <Text style={[styles.chipTxt, participacion === o && styles.chipTxtOn]}>{o}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.fotoRow}>
            <TouchableOpacity style={styles.fotoBtn} onPress={() => elegirFoto("camara")}><Ionicons name="camera" size={16} color={T.accent} /><Text style={styles.fotoBtnTxt}>Cámara</Text></TouchableOpacity>
            <TouchableOpacity style={styles.fotoBtn} onPress={() => elegirFoto("galeria")}><Ionicons name="images" size={16} color={T.accent} /><Text style={styles.fotoBtnTxt}>Galería</Text></TouchableOpacity>
            {foto && <Image source={{ uri: foto.uri }} style={styles.thumb} />}
          </View>

          <View style={styles.acciones}>
            <TouchableOpacity style={styles.cancelar} onPress={() => { limpiar(); setAbierto(false); }}><Text style={styles.cancelarTxt}>Cancelar</Text></TouchableOpacity>
            <TouchableOpacity style={styles.guardar} onPress={agregar} disabled={guardando}>
              {guardando ? <ActivityIndicator color={T.white} /> : <Text style={styles.guardarTxt}>Agregar</Text>}
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  vacio: { color: T.textMute, fontSize: 13, marginBottom: 8 },
  card: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: UI.radiusSm, padding: 8, marginBottom: 8 },
  foto: { width: 46, height: 46, borderRadius: 8, backgroundColor: T.surfaceHi },
  noimg: { alignItems: "center", justifyContent: "center" },
  part: { color: T.textMute, fontSize: 11, fontWeight: "700" },
  nombre: { color: T.text, fontSize: 15, fontWeight: "700" },
  addBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1, borderColor: T.accentDim, borderRadius: UI.radiusSm, height: 48, marginTop: 4, backgroundColor: T.accent },
  addTxt: { color: T.white, fontWeight: "800", fontSize: 15 },
  form: { borderWidth: 1, borderColor: T.border, borderRadius: UI.radiusSm, padding: 12, marginTop: 4, gap: 8, backgroundColor: T.surface },
  tipoRow: { flexDirection: "row", gap: 8 },
  tipoBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, borderWidth: 1, borderColor: T.border, borderRadius: UI.radiusSm, height: 42 },
  tipoBtnOn: { backgroundColor: T.accent, borderColor: T.accent },
  tipoTxt: { color: T.textDim, fontWeight: "700", fontSize: 13 },
  tipoTxtOn: { color: T.white },
  input: { backgroundColor: T.bg, borderWidth: 1, borderColor: T.border, borderRadius: UI.radiusSm, paddingHorizontal: 12, minHeight: 46, color: T.text, fontSize: 15 },
  lbl: { color: T.textDim, fontSize: 12, fontWeight: "700", textTransform: "uppercase", marginTop: 4 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { borderWidth: 1, borderColor: T.border, borderRadius: 16, paddingVertical: 6, paddingHorizontal: 12, backgroundColor: T.bg },
  chipOn: { backgroundColor: T.accent, borderColor: T.accent },
  chipTxt: { color: T.textDim, fontWeight: "600", fontSize: 12 },
  chipTxtOn: { color: T.white },
  fotoRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  fotoBtn: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: T.accentDim, borderRadius: UI.radiusSm, paddingVertical: 10, paddingHorizontal: 14 },
  fotoBtnTxt: { color: T.text, fontWeight: "700", fontSize: 14 },
  thumb: { width: 46, height: 46, borderRadius: 8, backgroundColor: T.surfaceHi },
  acciones: { flexDirection: "row", gap: 10, marginTop: 4 },
  cancelar: { flex: 1, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: T.border, borderRadius: UI.radiusSm, height: 48 },
  cancelarTxt: { color: T.textDim, fontWeight: "700", fontSize: 15 },
  guardar: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: T.accent, borderRadius: UI.radiusSm, height: 48 },
  guardarTxt: { color: T.white, fontWeight: "800", fontSize: 15 },
});
