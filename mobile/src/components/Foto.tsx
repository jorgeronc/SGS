import { useState } from "react";
import type { StyleProp, ImageStyle } from "react-native";
import { Modal, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { urlFoto, urlFotoMini } from "../lib/fotos";

// Imagen optimizada para el móvil: usa expo-image (caché en memoria/disco +
// decodificado a menor tamaño) y pide una miniatura transformada por Supabase;
// si la transformación no está disponible, cae al original automáticamente.
// Al hacer tap se abre un visor a pantalla completa (ampliable, por defecto en
// todas las pantallas). Pasa `ampliable={false}` para desactivarlo.
export default function Foto({
  path, uri: uriProp, size = 160, style, mini = true, ampliable = true,
}: {
  path?: string | null;
  uri?: string | null;
  size?: number;
  style?: StyleProp<ImageStyle>;
  mini?: boolean;
  ampliable?: boolean;
}) {
  const [fallback, setFallback] = useState(false);
  const [abierto, setAbierto] = useState(false);
  if (!path && !uriProp) return null;
  const uri = uriProp ?? (fallback || !mini ? urlFoto(path!) : urlFotoMini(path!, size));
  const full = uriProp ?? urlFoto(path!);

  const img = (
    <Image
      source={uri ? { uri } : undefined}
      style={style ?? { width: size, height: size }}
      contentFit="cover"
      transition={150}
      cachePolicy="memory-disk"
      onError={() => { if (!fallback) setFallback(true); }}
    />
  );

  if (!ampliable) return img;

  return (
    <>
      <Pressable onPress={() => setAbierto(true)}>{img}</Pressable>
      <Modal visible={abierto} transparent animationType="fade" onRequestClose={() => setAbierto(false)} statusBarTranslucent>
        <Pressable style={styles.backdrop} onPress={() => setAbierto(false)}>
          <Image
            source={full ? { uri: full } : undefined}
            style={styles.full}
            contentFit="contain"
            transition={150}
            cachePolicy="memory-disk"
          />
          <Pressable style={styles.cerrar} onPress={() => setAbierto(false)} hitSlop={16}>
            <Ionicons name="close" size={30} color="#fff" />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.93)", alignItems: "center", justifyContent: "center" },
  full: { width: "100%", height: "82%" },
  cerrar: { position: "absolute", top: 44, right: 20, padding: 4 },
});
