import "react-native-url-polyfill/auto";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, View, Image, Animated, StyleSheet, Alert, AppState } from "react-native";
import { StatusBar } from "expo-status-bar";
import { NavigationContainer, DefaultTheme, createNavigationContainerRef } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import * as Notifications from "expo-notifications";
import { KeyboardProvider } from "react-native-keyboard-controller";
import type { Session } from "@supabase/supabase-js";

import { supabase } from "./src/lib/supabase";
import { registrarPush } from "./src/lib/push";
import { iniciarRastreo, detenerRastreo, pasarAPrimerPlano, pasarASegundoPlano } from "./src/lib/ubicacionVivo";
import { iniciarGeocercas, detenerGeocercas } from "./src/lib/geocercas";
import { getRolActual, esMando } from "./src/lib/rol";
import { estadoSesion } from "./src/lib/sesion";
import { sincronizarInspecciones } from "./src/lib/colaInspecciones";
import { alCambiarRed } from "./src/lib/conectividad";
import { sincronizarMiElemento } from "./src/lib/oficial";
import type { RootStackParamList, TabParamList } from "./src/types";
import { T } from "./src/theme";
import LoginScreen from "./src/screens/LoginScreen";
import InicioSgsScreen from "./src/screens/InicioSgsScreen";
import BuscarScreen from "./src/screens/BuscarScreen";
import RondinScreen from "./src/screens/RondinScreen";
import PerfilScreen from "./src/screens/PerfilScreen";
import ExpedienteScreen from "./src/screens/ExpedienteScreen";
import EvidenciaScreen from "./src/screens/EvidenciaScreen";
import IncidenteScreen from "./src/screens/IncidenteScreen";
import MisIncidentesScreen from "./src/screens/MisIncidentesScreen";
import IncidenteDetalleScreen from "./src/screens/IncidenteDetalleScreen";
import AccesoCasetaScreen from "./src/screens/AccesoCasetaScreen";
import InspeccionScreen from "./src/screens/InspeccionScreen";
import BodycamScreen from "./src/screens/BodycamScreen";
import TransmisionScreen from "./src/screens/TransmisionScreen";
import TareasScreen from "./src/screens/TareasScreen";
import SupervisionScreen from "./src/screens/SupervisionScreen";
import ChatScreen from "./src/screens/ChatScreen";
import ChatCanalScreen from "./src/screens/ChatCanalScreen";

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();
export const navigationRef = createNavigationContainerRef<RootStackParamList>();

// Al tocar una notificación push, abre la pantalla adecuada según su tipo.
function abrirDesdeNotificacion(data: any) {
  if (!navigationRef.isReady() || !data) return;
  if (data.tipo === "tarea") navigationRef.navigate("Tareas");
  else if (data.tipo === "chat" && data.canal_id) navigationRef.navigate("ChatCanal", { canalId: data.canal_id, nombre: data.nombre ?? "Chat" });
}

const ICONO: Record<keyof TabParamList, { on: keyof typeof Ionicons.glyphMap; off: keyof typeof Ionicons.glyphMap }> = {
  Inicio: { on: "home", off: "home-outline" },
  Buscar: { on: "search", off: "search-outline" },
  Supervision: { on: "eye", off: "eye-outline" },
  Rondin: { on: "qr-code", off: "qr-code-outline" },
  Chat: { on: "chatbubbles", off: "chatbubbles-outline" },
  Perfil: { on: "person", off: "person-outline" },
};

function Tabs() {
  // La consulta/búsqueda solo la ven mandos (supervisor/administrador).
  const [mando, setMando] = useState(false);
  useEffect(() => { getRolActual().then((r) => setMando(esMando(r))); }, []);
  return (
    <Tab.Navigator
      id={"tabs" as never}
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: T.accent,
        tabBarInactiveTintColor: T.textMute,
        tabBarStyle: { backgroundColor: T.surface, borderTopColor: T.border, height: 62, paddingBottom: 8, paddingTop: 6 },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "700" },
        tabBarIcon: ({ focused, color, size }) => (
          <Ionicons name={focused ? ICONO[route.name].on : ICONO[route.name].off} size={size} color={color} />
        ),
      })}
    >
      <Tab.Screen name="Inicio" component={InicioSgsScreen} />
      {mando && <Tab.Screen name="Buscar" component={BuscarScreen} />}
      {mando && <Tab.Screen name="Supervision" component={SupervisionScreen} options={{ tabBarLabel: "Superv." }} />}
      <Tab.Screen name="Rondin" component={RondinScreen} options={{ tabBarLabel: "Rondín" }} />
      <Tab.Screen name="Chat" component={ChatScreen} />
      <Tab.Screen name="Perfil" component={PerfilScreen} />
    </Tab.Navigator>
  );
}

const navTheme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: T.bg, card: T.surface, text: T.text, border: T.border, primary: T.accent },
};

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [cargando, setCargando] = useState(true);

  // Intro / splash de ~2 s al abrir la app (se muestra encima mientras carga).
  const [intro, setIntro] = useState(true);
  const introOpacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const t = setTimeout(() => {
      Animated.timing(introOpacity, { toValue: 0, duration: 350, useNativeDriver: true }).start(() => setIntro(false));
    }, 1800);
    return () => clearTimeout(t);
  }, [introOpacity]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setCargando(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_evento, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  // Push: registra el dispositivo al haber sesión y abre la pantalla al tocar
  // una notificación (recibida en primer plano o desde estado cerrado).
  useEffect(() => {
    if (!session) return;
    registrarPush();
    const respSub = Notifications.addNotificationResponseReceivedListener((r) =>
      abrirDesdeNotificacion(r.notification.request.content.data)
    );
    Notifications.getLastNotificationResponseAsync().then((r) => {
      if (r) abrirDesdeNotificacion(r.notification.request.content.data);
    });
    return () => respSub.remove();
  }, [session]);

  // Rastreo GPS: arranca al haber sesión (si hay "Mi elemento" y gps_activo);
  // se detiene al cerrar sesión. iniciarRastreo es idempotente y no rastrea si
  // no hay elemento seleccionado (Perfil lo dispara al elegirlo).
  const logueado = !!session;
  useEffect(() => {
    if (logueado) {
      // Auto-resuelve "Mi elemento" desde la cuenta (usuario↔guardia) y luego rastrea.
      sincronizarMiElemento().finally(() => { iniciarRastreo(); iniciarGeocercas(); });
    } else { detenerRastreo(); detenerGeocercas(); }
  }, [logueado]);

  // Cola offline de inspecciones: reintenta subir las pendientes al haber sesión,
  // al volver a primer plano y EN CUANTO SE DETECTA RED (WiFi o datos). Así el
  // envío ocurre aunque el teléfono no tenga datos móviles (solo WiFi) y aunque
  // la app siga abierta al conectarse a la red.
  useEffect(() => {
    if (!logueado) return;
    sincronizarInspecciones();
    const sub = AppState.addEventListener("change", (s) => { if (s === "active") sincronizarInspecciones(); });
    const netUnsub = alCambiarRed((e) => { if (e.conectado) sincronizarInspecciones(); });
    return () => { sub.remove(); netUnsub(); };
  }, [logueado]);

  // La notificación de "Ubicación activa" solo debe verse en segundo plano: en
  // primer plano se rastrea con watcher (sin servicio/notificación) y al pasar a
  // segundo plano se arranca el foreground-service (que muestra la notificación).
  useEffect(() => {
    if (!logueado) return;
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") pasarAPrimerPlano();
      else if (s === "background" || s === "inactive") pasarASegundoPlano();
    });
    return () => sub.remove();
  }, [logueado]);

  // Sesión por rol de servicio: guardia/supervisor solo mientras un turno activo
  // cubra la hora. Se valida al iniciar sesión, al volver a primer plano y cada
  // minuto; si el turno terminó (y no hay turno siguiente vigente) se cierra.
  const avisando = useRef(false);
  useEffect(() => {
    if (!session) { avisando.current = false; return; }
    let cancelado = false;
    const chequear = async () => {
      if (cancelado || avisando.current) return;
      const e = await estadoSesion();
      if (!e.vigente && e.gateada && !e.turnoDesconocido) {
        avisando.current = true;
        Alert.alert(
          "Turno terminado",
          "Tu turno ha terminado, la sesión se cerrará. Reporta con tu supervisor cualquier aspecto de tu jornada laboral.",
          [{ text: "OK", onPress: () => supabase.auth.signOut() }],
          { cancelable: false }
        );
      }
    };
    chequear();
    const iv = setInterval(chequear, 60000);
    const subApp = AppState.addEventListener("change", (s) => { if (s === "active") chequear(); });
    return () => { cancelado = true; clearInterval(iv); subApp.remove(); };
  }, [session]);

  const contenido = cargando ? (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: T.bg }}>
      <ActivityIndicator size="large" color={T.accent} />
    </View>
  ) : (
    <NavigationContainer theme={navTheme} ref={navigationRef}>
      <StatusBar style="light" />
      <Stack.Navigator
        id={"root" as never}
        screenOptions={{
          headerStyle: { backgroundColor: T.surface },
          headerTintColor: T.text,
          headerTitleStyle: { fontWeight: "700" },
          contentStyle: { backgroundColor: T.bg },
        }}
      >
        {!session ? (
          <Stack.Screen name="Login" component={LoginScreen} options={{ title: "Sistema de Gestión de Seguridad" }} />
        ) : (
          <>
            <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
            <Stack.Screen name="Expediente" component={ExpedienteScreen} options={{ title: "Expediente" }} />
            <Stack.Screen name="Evidencia" component={EvidenciaScreen} options={{ title: "Nueva evidencia" }} />
            <Stack.Screen name="Incidente" component={IncidenteScreen} options={{ title: "Levantar incidente" }} />
            <Stack.Screen name="AccesoCaseta" component={AccesoCasetaScreen} options={{ title: "Control de acceso" }} />
            <Stack.Screen name="Inspeccion" component={InspeccionScreen} options={{ title: "Inspección" }} />
            <Stack.Screen name="Bodycam" component={BodycamScreen} options={{ headerShown: false, presentation: "fullScreenModal", animation: "fade" }} />
            <Stack.Screen name="MisIncidentes" component={MisIncidentesScreen} options={{ title: "Incidentes" }} />
            <Stack.Screen name="IncidenteDetalle" component={IncidenteDetalleScreen} options={{ title: "Incidente" }} />
            <Stack.Screen name="Transmision" component={TransmisionScreen} options={{ headerShown: false, presentation: "fullScreenModal", animation: "fade" }} />
            <Stack.Screen name="Tareas" component={TareasScreen} options={{ title: "Mis tareas" }} />
            <Stack.Screen name="ChatCanal" component={ChatCanalScreen} options={{ title: "Chat" }} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );

  return (
    <KeyboardProvider>
      <View style={{ flex: 1 }}>
        {contenido}
        {intro && (
          <Animated.View style={[styles.intro, { opacity: introOpacity }]} pointerEvents="none">
            <Image source={require("./assets/intro.jpg")} style={styles.introImg} resizeMode="cover" />
          </Animated.View>
        )}
      </View>
    </KeyboardProvider>
  );
}

const styles = StyleSheet.create({
  intro: { ...StyleSheet.absoluteFillObject, backgroundColor: T.bg, alignItems: "center", justifyContent: "center", zIndex: 999 },
  introImg: { width: "100%", height: "100%" },
});
