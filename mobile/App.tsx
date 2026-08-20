import "react-native-url-polyfill/auto";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, View, Image, Animated, StyleSheet } from "react-native";
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
import type { RootStackParamList, TabParamList } from "./src/types";
import { T } from "./src/theme";
import LoginScreen from "./src/screens/LoginScreen";
import InicioScreen from "./src/screens/InicioScreen";
import BuscarScreen from "./src/screens/BuscarScreen";
import NuevoScreen from "./src/screens/NuevoScreen";
import NuevoMenuScreen from "./src/screens/NuevoMenuScreen";
import AbordamientoScreen from "./src/screens/AbordamientoScreen";
import AccidenteScreen from "./src/screens/AccidenteScreen";
import CasosTabScreen from "./src/screens/CasosTabScreen";
import PerfilScreen from "./src/screens/PerfilScreen";
import ExpedienteScreen from "./src/screens/ExpedienteScreen";
import EvidenciaScreen from "./src/screens/EvidenciaScreen";
import UbicacionScreen from "./src/screens/UbicacionScreen";
import AlertasScreen from "./src/screens/AlertasScreen";
import DespachosScreen from "./src/screens/DespachosScreen";
import DespachoDetalleScreen from "./src/screens/DespachoDetalleScreen";
import InformeScreen from "./src/screens/InformeScreen";
import MisAlertasScreen from "./src/screens/MisAlertasScreen";
import MisIncidentesScreen from "./src/screens/MisIncidentesScreen";
import TransmisionScreen from "./src/screens/TransmisionScreen";
import TareasScreen from "./src/screens/TareasScreen";
import ChatScreen from "./src/screens/ChatScreen";
import ChatCanalScreen from "./src/screens/ChatCanalScreen";

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();
export const navigationRef = createNavigationContainerRef<RootStackParamList>();

// Al tocar una notificación push, abre la pantalla adecuada según su tipo.
function abrirDesdeNotificacion(data: any) {
  if (!navigationRef.isReady() || !data) return;
  if (data.tipo === "despacho") navigationRef.navigate("Despachos");
  else if (data.tipo === "tarea") navigationRef.navigate("Tareas");
  else if (data.tipo === "incidente") navigationRef.navigate("MisIncidentes");
  else if (data.tipo === "chat" && data.canal_id) navigationRef.navigate("ChatCanal", { canalId: data.canal_id, nombre: data.nombre ?? "Chat" });
}

const ICONO: Record<keyof TabParamList, { on: keyof typeof Ionicons.glyphMap; off: keyof typeof Ionicons.glyphMap }> = {
  Inicio: { on: "home", off: "home-outline" },
  Buscar: { on: "search", off: "search-outline" },
  Nuevo: { on: "add-circle", off: "add-circle-outline" },
  Casos: { on: "clipboard", off: "clipboard-outline" },
  Chat: { on: "chatbubbles", off: "chatbubbles-outline" },
  Perfil: { on: "person", off: "person-outline" },
};

function Tabs() {
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
      <Tab.Screen name="Inicio" component={InicioScreen} />
      <Tab.Screen name="Buscar" component={BuscarScreen} />
      <Tab.Screen name="Nuevo" component={NuevoMenuScreen} />
      <Tab.Screen name="Casos" component={CasosTabScreen} />
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
          <Stack.Screen name="Login" component={LoginScreen} options={{ title: "Sistema Central Policial" }} />
        ) : (
          <>
            <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
            <Stack.Screen name="Despachos" component={DespachosScreen} options={{ title: "Mis despachos" }} />
            <Stack.Screen name="DespachoDetalle" component={DespachoDetalleScreen} options={{ title: "Despacho" }} />
            <Stack.Screen name="NuevoIncidente" component={NuevoScreen} options={{ title: "Nuevo incidente" }} />
            <Stack.Screen name="Abordamiento" component={AbordamientoScreen} options={{ title: "Nuevo abordamiento" }} />
            <Stack.Screen name="Accidente" component={AccidenteScreen} options={{ title: "Informe de accidente" }} />
            <Stack.Screen name="Informe" component={InformeScreen} options={{ title: "Informe de incidente" }} />
            <Stack.Screen name="Expediente" component={ExpedienteScreen} options={{ title: "Expediente" }} />
            <Stack.Screen name="Evidencia" component={EvidenciaScreen} options={{ title: "Nueva evidencia" }} />
            <Stack.Screen name="Ubicacion" component={UbicacionScreen} options={{ title: "Incidentes abiertos" }} />
            <Stack.Screen name="Alertas" component={AlertasScreen} options={{ title: "Alertas" }} />
            <Stack.Screen name="MisAlertas" component={MisAlertasScreen} options={{ title: "Mis alertas" }} />
            <Stack.Screen name="MisIncidentes" component={MisIncidentesScreen} options={{ title: "Mis incidentes" }} />
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
            <Image source={require("./assets/intro.png")} style={styles.introImg} resizeMode="contain" />
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
