import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { supabase } from "../lib/supabase";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function entrar() {
    setError(null);
    setCargando(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setCargando(false);
    if (error) setError(error.message);
    // Al haber sesión, App.tsx detecta el cambio y navega solo.
  }

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.contenedor}>
      <Text style={styles.titulo}>Sistema Central Policial</Text>
      <Text style={styles.subtitulo}>Acceso del elemento en campo</Text>

      <TextInput
        style={styles.input}
        placeholder="Correo"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Contraseña"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      {error && <Text style={styles.error}>{error}</Text>}

      <TouchableOpacity style={styles.boton} onPress={entrar} disabled={cargando}>
        <Text style={styles.botonTexto}>{cargando ? "Entrando..." : "Entrar"}</Text>
      </TouchableOpacity>

      <Text style={styles.nota}>
        El acceso usa el token de sesión de Supabase (JWT), guardado de forma segura en el
        dispositivo.
      </Text>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  contenedor: { flex: 1, justifyContent: "center", padding: 24, backgroundColor: "#f4f6f8" },
  titulo: { fontSize: 22, fontWeight: "800", color: "#0b3d66", textAlign: "center" },
  subtitulo: { fontSize: 14, color: "#555", textAlign: "center", marginBottom: 24 },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    fontSize: 16,
  },
  boton: { backgroundColor: "#0b3d66", padding: 14, borderRadius: 8, alignItems: "center" },
  botonTexto: { color: "#fff", fontWeight: "700", fontSize: 16 },
  error: { color: "#b00020", marginBottom: 8 },
  nota: { fontSize: 12, color: "#888", textAlign: "center", marginTop: 16 },
});
