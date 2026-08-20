export type Estatus = "activo" | "cerrado" | "cancelado";

export interface Persona {
  id: string;
  nombre: string;
  apellido_paterno: string | null;
  apellido_materno: string | null;
  fecha_nacimiento: string | null;
  sexo: string | null;
  curp: string | null;
  fotografias?: string[] | null;
  datos_adicionales?: Record<string, any> | null;
  estatus: Estatus;
  cancelado_en: string | null;
  motivo_cancelacion: string | null;
  creado_en: string;
}

export interface Vehiculo {
  id: string;
  placas: string | null;
  vin: string | null;
  marca: string | null;
  modelo: string | null;
  anio: number | null;
  color: string | null;
  tipo: string | null;
  es_flota_agencia: boolean;
  fotografias?: string[] | null;
  estatus: Estatus;
  cancelado_en: string | null;
  motivo_cancelacion: string | null;
  creado_en: string;
}

export interface Ubicacion {
  id: string;
  calle: string | null;
  numero_exterior: string | null;
  numero_interior: string | null;
  colonia: string | null;
  municipio: string | null;
  estado: string | null;
  codigo_postal: string | null;
  referencias: string | null;
  latitud: number | null;
  longitud: number | null;
  estatus: Estatus;
  cancelado_en: string | null;
  motivo_cancelacion: string | null;
  creado_en: string;
}

export type Prioridad = "baja" | "media" | "alta";
export type EstadoInvestigacion = "abierto" | "en_investigacion" | "cerrado" | "archivado";

export interface Caso {
  id: string;
  folio: string | null;
  tipo: string | null;
  titulo: string;
  narrativa: string | null;
  fecha_hecho: string | null;
  prioridad: Prioridad;
  estado_investigacion: EstadoInvestigacion;
  // Generales (SCP360)
  fecha_apertura: string | null;
  direccion: string | null;
  latitud: number | null;
  longitud: number | null;
  distrito: string | null;
  delito: string | null;
  oficial_personal_id: string | null;
  tipo_hechos: string | null;
  // Narrativa
  resumen: string | null;
  // Lugar / interior / zona
  descripcion_lugar: string | null;
  descripcion_interior: string | null;
  descripcion_zona: string | null;
  // Quebranto
  producto_robo: string | null;
  // Hipótesis
  desarrollo_delito: string | null;
  reconstruccion: string | null;
  fotografias?: string[] | null;
  estatus: Estatus;
  cancelado_en: string | null;
  motivo_cancelacion: string | null;
  creado_en: string;
}

export type EstadoLaboral = "activo" | "licencia" | "suspendido" | "baja";

export interface Personal {
  id: string;
  persona_id: string;
  numero_placa: string | null;
  rango: string | null;
  adscripcion: string | null;
  fecha_ingreso: string | null;
  estado_laboral: EstadoLaboral;
  estatus: Estatus;
  cancelado_en: string | null;
  motivo_cancelacion: string | null;
  creado_en: string;
  // Persona embebida cuando la consulta la incluye (join a personas).
  persona?: Pick<Persona, "nombre" | "apellido_paterno" | "apellido_materno"> | null;
}

export type TipoOrden =
  | "citatorio"
  | "orden_aprehension"
  | "orden_cateo"
  | "orden_comparecencia"
  | "orden_presentacion"
  | "orden_proteccion";
export type EstadoOrden = "emitida" | "notificada" | "cumplida" | "vencida";

export interface Orden {
  id: string;
  folio: string | null;
  tipo: TipoOrden;
  autoridad_emisora: string | null;
  autorizada_por: string | null;
  asunto: string | null;
  fecha_emision: string | null;
  fecha_limite: string | null;
  estado: EstadoOrden;
  estatus: Estatus;
  cancelado_en: string | null;
  motivo_cancelacion: string | null;
  creado_en: string;
  // Órdenes de protección: vigencia, lugar e indicaciones para la unidad.
  vigencia_desde: string | null;
  vigencia_hasta: string | null;
  direccion: string | null;
  latitud: number | null;
  longitud: number | null;
  instrucciones: string | null;
  persona_id: string | null;
}

export type EstadoEvidencia =
  | "recolectada"
  | "en_almacen"
  | "en_analisis"
  | "entregada"
  | "devuelta"
  | "destruida";

export interface Evidencia {
  id: string;
  folio: string | null;
  tipo: string | null;
  descripcion: string | null;
  cantidad: string | null;
  ubicacion_almacen: string | null;
  estado_evidencia: EstadoEvidencia;
  fecha_recoleccion: string | null;
  fotografias?: string[] | null;
  estatus: Estatus;
  cancelado_en: string | null;
  motivo_cancelacion: string | null;
  creado_en: string;
}

export type TipoEventoCustodia =
  | "recoleccion"
  | "traslado"
  | "resguardo"
  | "analisis"
  | "entrega"
  | "devolucion"
  | "destruccion";

export interface CadenaCustodia {
  id: number;
  evidencia_id: string;
  tipo_evento: TipoEventoCustodia;
  responsable: string | null;
  ubicacion: string | null;
  notas: string | null;
  fecha_evento: string;
  creado_en: string;
}

export type Confidencialidad = "reservado" | "confidencial" | "restringido";
export type EstadoAsuntoInterno = "abierto" | "en_investigacion" | "resuelto" | "cerrado";

export interface AsuntoInterno {
  id: string;
  folio: string | null;
  tipo: string | null;
  asunto: string | null;
  narrativa: string | null;
  personal_id: string | null;
  confidencialidad: Confidencialidad;
  estado: EstadoAsuntoInterno;
  resolucion: string | null;
  estatus: Estatus;
  cancelado_en: string | null;
  motivo_cancelacion: string | null;
  creado_en: string;
  // Personal (oficial investigado) embebido cuando la consulta lo incluye.
  personal?: {
    numero_placa: string | null;
    rango: string | null;
    persona?: Pick<Persona, "nombre" | "apellido_paterno"> | null;
  } | null;
}

export type PrioridadCad = "alta" | "media" | "baja";
export type EstadoDespachoLlamada = "recibida" | "despachada" | "en_atencion" | "resuelta";

export interface LlamadaCad {
  id: string;
  folio: string | null;
  tipo: string | null;
  prioridad: PrioridadCad;
  reportante: string | null;
  telefono: string | null;
  descripcion: string | null;
  direccion: string | null;
  latitud: number | null;
  longitud: number | null;
  estado_despacho: EstadoDespachoLlamada;
  fecha_recepcion: string;
  fecha_cierre: string | null;
  conclusion: string | null;
  motivo_cierre: string | null;
  estatus: Estatus;
  cancelado_en: string | null;
  motivo_cancelacion: string | null;
  creado_en: string;
}

export type EstadoDespacho = "asignada" | "enterado" | "en_ruta" | "en_lugar" | "cerrado";

export interface Despacho {
  id: string;
  llamada_id: string;
  personal_id: string | null;
  vehiculo_id: string | null;
  estado: EstadoDespacho;
  notas: string | null;
  fecha_asignacion: string;
  estatus: Estatus;
  // Datos embebidos cuando la consulta los incluye.
  personal?: {
    numero_placa: string | null;
    rango: string | null;
    persona?: Pick<Persona, "nombre" | "apellido_paterno"> | null;
  } | null;
  vehiculo?: Pick<Vehiculo, "placas" | "marca" | "modelo"> | null;
}

export type EstadoIncidente = "abierto" | "en_proceso" | "cerrado" | "cancelado";

// Estados del informe de incidente con su etiqueta y color (píldora .est-*).
export const ESTADOS_INCIDENTE: EstadoIncidente[] = ["abierto", "en_proceso", "cerrado", "cancelado"];
export function estadoIncidenteLabel(e: string | null | undefined): string {
  return (
    { abierto: "Abierto", en_proceso: "En Proceso", cerrado: "Cerrado", cancelado: "Cancelado" } as Record<string, string>
  )[e ?? ""] ?? (e ?? "—");
}

export interface Incidente {
  id: string;
  folio: string | null;
  llamada_cad_id: string | null;
  tipo: string | null;
  narrativa: string | null;
  oficial_personal_id: string | null;
  direccion: string | null;
  latitud: number | null;
  longitud: number | null;
  estado: EstadoIncidente;
  fecha_incidente: string;
  fecha_elaboracion: string | null;
  fotografias?: string[] | null;
  // Primer respondiente
  unidad: string | null;
  bodycam: string | null;
  // Conocimiento de los hechos
  via_conocimiento: string | null;
  fecha_conocimiento: string | null;
  fecha_arribo: string | null;
  delito: string | null;
  acciones: string | null;
  // Lugar de los hechos
  tipo_lugar: string | null;
  negocio_operando: boolean | null;
  tipo_negocio: string | null;
  nombre_lugar: string | null;
  habitada: boolean | null;
  // Canalización / traslado
  a_donde_traslada: string | null;
  a_donde_canaliza: string | null;
  // Inspecciones
  objetos_encontrados: boolean | null;
  objetos_faltantes: boolean | null;
  tipo_objeto: string | null;
  detalle_objetos: string | null;
  // Solicitud de apoyo
  solicito_apoyo: boolean | null;
  dependencias_apoyo: string | null;
  estatus: Estatus;
  cancelado_en: string | null;
  motivo_cancelacion: string | null;
  creado_en: string;
}

export interface Novedad {
  id: number;
  incidente_id: string;
  texto: string;
  reportado_por: string | null;
  fecha: string;
  creado_en: string;
}

export type EstadoBarandilla = "ingresado" | "en_custodia" | "liberado" | "trasladado";

export interface Barandilla {
  id: string;
  folio: string | null;
  persona_id: string;
  motivo: string | null;
  autoridad_remitente: string | null;
  celda: string | null;
  pertenencias: string | null;
  fecha_ingreso: string;
  fecha_egreso: string | null;
  estado: EstadoBarandilla;
  // Datos de la detención (formato SCP360)
  fecha_detencion: string | null;
  lugar_detencion: string | null;
  latitud: number | null;
  longitud: number | null;
  puesta_disposicion: string | null;
  delito: string | null;
  folio_informe: string | null;
  // Media filiación del detenido
  alias: string | null;
  fecha_nacimiento: string | null;
  sexo: string | null;
  complexion: string | null;
  estatura: number | null;
  peso: number | null;
  color_piel: string | null;
  antecedentes: string | null;
  tatuajes: boolean;
  descripcion_tatuajes: string | null;
  cicatrices: boolean;
  descripcion_cicatrices: string | null;
  mano_izquierda: string | null;
  mano_derecha: string | null;
  // Familiar de contacto
  proporciona_familiar: boolean;
  nombre_familiar: string | null;
  telefono_familiar: string | null;
  fotografias?: string[] | null;
  estatus: Estatus;
  cancelado_en: string | null;
  motivo_cancelacion: string | null;
  creado_en: string;
  persona?: Pick<Persona, "nombre" | "apellido_paterno" | "apellido_materno"> | null;
}

export type EstadoEquipo = "operativo" | "asignado" | "en_reparacion" | "baja";

export interface Equipo {
  id: string;
  folio: string | null;
  tipo: string | null;
  marca: string | null;
  modelo: string | null;
  numero_serie: string | null;
  asignado_personal_id: string | null;
  estado_equipo: EstadoEquipo;
  fecha_alta: string | null;
  fotografias?: string[] | null;
  estatus: Estatus;
  cancelado_en: string | null;
  motivo_cancelacion: string | null;
  creado_en: string;
  personal?: {
    numero_placa: string | null;
    rango: string | null;
    persona?: Pick<Persona, "nombre" | "apellido_paterno"> | null;
  } | null;
}

export type Rol = "oficial" | "supervisor" | "investigador" | "administrador" | "asuntos_internos";

export interface UsuarioAdmin {
  id: string;
  email: string | null;
  nombre: string | null;
  rol: Rol;
  activo: boolean;
  creado_en: string;
}

export interface Foliador {
  modulo: string;
  nombre: string;
  iniciales: string;
  activo: boolean;
}

export interface FolioConsecutivo {
  modulo: string;
  anio: number;
  ultimo: number;
}

export interface BitacoraEntry {
  id: number;
  usuario_id: string | null;
  computadora_id: string | null;
  ip_address: string | null;
  tipo_accion: string;
  entidad_tipo: string;
  entidad_id: string | null;
  valores_anteriores: unknown | null;
  valores_nuevos: unknown | null;
  modulo: string | null;
  creado_en: string;
}

export interface Presunto {
  id: string;
  caso_id: string;
  persona_id: string | null;
  nombre: string | null;
  apellido_paterno: string | null;
  apellido_materno: string | null;
  alias: string | null;
  sexo: string | null;
  complexion: string | null;
  estatura: number | null;
  color_piel: string | null;
  vestimenta: string | null;
  tatuajes: string | null;
  senas_particulares: string | null;
  producto_robo: string | null;
  veh_marca: string | null;
  veh_modelo: string | null;
  veh_anio: number | null;
  veh_color: string | null;
  veh_placas: string | null;
  notas: string | null;
  fotografias?: string[] | null;
  estatus: Estatus;
  creado_en: string;
}

export interface Vinculo {
  id: string;
  entidad_origen_tipo: string;
  entidad_origen_id: string;
  entidad_destino_tipo: string;
  entidad_destino_id: string;
  tipo_relacion: string;
  estatus: Estatus;
}
