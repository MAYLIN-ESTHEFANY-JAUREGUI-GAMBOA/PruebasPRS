/**
 * Modelo de Recurso Operativo - Actualizado según API vg-ms-recursos
 * Estructura HÍBRIDA: catálogo (maestros) + operativos (transaccionales)
 * Alineado con backend Java Spring Boot
 */

export interface Location {
  zone?: string | null;
  code?: string | null;
  district?: string | null;
}

export interface RecursoOperativo {
  // Identificadores principales
  id?: string;
  entityId?: string;
  municipalityId?: string;

  // Campos maestros (catálogo)
  key?: string;
  name?: string;
  type?: string;
  category?: string;
  icon?: string | null;

  // Campos transaccionales (operativos)
  internalCode?: string;
  responsible?: string | null;
  location?: Location | null;
  availability?: string | null;
  statusDetail?: string | null;

  // Estado y auditoría
  active?: boolean | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  createdBy?: string | null;
  updatedBy?: string | null;

  // ══════════════════════════════════════════════════════════════════════
  // COMPATIBILIDAD CON MODELO ANTERIOR (campos legacy del frontend)
  // ══════════════════════════════════════════════════════════════════════
  
  // Mapeo para compatibilidad con componentes existentes
  entidadId?: string;           // → entityId
  catalogoId?: string;          // → resuelto desde key con catálogo
  identificador?: string;       // → internalCode
  encargadoNombre?: string | null;  // → responsible
  zonaOperativa?: Location | null;  // → location
  estadoDisponibilidad?: string | null;  // → availability
  subestadoOperativo?: string | null;    // → statusDetail
  estado?: string | null;       // → derivado de active (ACTIVO/INACTIVO)
  creadoEn?: string | null;     // → createdAt
  actualizadoEn?: string | null; // → updatedAt

  // Campos legacy que ya no se usan pero se mantienen por compatibilidad
  entidad_id?: string | null;
  catalogo_id?: string | null;
  zona_operativa?: Location | null;
  encargado_nombre?: string | null;
  estado_disponibilidad?: string | null;
  subestado_operativo?: string | null;
  creado_en?: string | null;
  actualizado_en?: string | null;
  entidadPropietariaId?: string;
  prestamoActivoId?: string | null;
  ubicacionActual?: UbicacionGPS | null;
  ultimaActualizacionGps?: string | null;
}

/**
 * DTO simplificado para listados
 */
export interface RecursoOperativoDTO {
  id: string;
  identificador: string;
  estadoDisponibilidad: string;
  entidadActualId: string;
  zonaOperativaId?: string;
  ubicacionActual?: UbicacionGPS;
}

/**
 * Ubicación GPS (para tracking en tiempo real)
 * Diferente de Location que es zona operativa asignada
 */
export interface UbicacionGPS {
  lat?: number | null;
  lng?: number | null;
  direccion?: string | null;
  referencia?: string | null;
  [key: string]: unknown;
}

/**
 * Alias para compatibilidad con código existente
 */
export interface ZonaOperativaEmbebida extends Location {}
export interface Ubicacion extends UbicacionGPS {}