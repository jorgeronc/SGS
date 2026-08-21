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
  Expediente: { tipo: TipoConsulta; id: string; titulo: string };
  // Evidencia puede abrirse suelta o ligada a un registro.
  Evidencia: { incidenteId?: string } | undefined;
  Tareas: undefined;
  // Conversación de un canal de chat.
  ChatCanal: { canalId: string; nombre: string };
  // Transmisión en vivo (bodycam).
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
  Rondin: undefined;
  Chat: undefined;
  Perfil: undefined;
};
