// Datos mínimos que la app móvil pasa entre pantallas.
export interface LlamadaCad {
  id: string;
  folio: string | null;
  tipo: string | null;
  prioridad: string | null;
  direccion: string | null;
  latitud: number | null;
  longitud: number | null;
}

export interface Despacho {
  id: string;
  estado: string;
  llamada: LlamadaCad | null;
}

export type TipoConsulta = "persona" | "vehiculo" | "orden" | "caso" | "incidente";

// Rutas del stack raíz (encima de las pestañas).
export type RootStackParamList = {
  Login: undefined;
  Tabs: undefined;
  Despachos: undefined;
  DespachoDetalle: { despacho: Despacho };
  // Informe abre por llamada (desde un despacho) o por incidente existente
  // (continuar editando desde Casos o tras crear uno nuevo).
  Informe: { llamada?: LlamadaCad; incidenteId?: string };
  NuevoIncidente: undefined;   // alta de incidente (desde el selector "+")
  Abordamiento: undefined;     // alta de abordamiento (desde el selector "+")
  Accidente: { llamada?: LlamadaCad } | undefined;  // parte de accidente vial (directo o desde reporte)
  Expediente: { tipo: TipoConsulta; id: string; titulo: string };
  // Evidencia puede abrirse suelta o ligada a un incidente (desde el informe).
  Evidencia: { incidenteId?: string } | undefined;
  Ubicacion: undefined;
  Alertas: undefined;
  MisAlertas: undefined;
  MisIncidentes: undefined;
  Tareas: undefined;
  // Conversación de un canal de chat.
  ChatCanal: { canalId: string; nombre: string };
  // Transmisión en vivo (bodycam) disparada por Enviar Alerta.
  Transmision: {
    despachoId?: string | null;
    llamadaId?: string | null;
    personalId?: string | null;
    patrullaId?: string | null;
    bodycamId?: string | null;
    bodycamFolio?: string | null;
    folio?: string | null;
  };
};

// Rutas de las pestañas inferiores.
export type TabParamList = {
  Inicio: undefined;
  Buscar: undefined;
  Nuevo: undefined;
  Casos: undefined;
  Chat: undefined;
  Perfil: undefined;
};
