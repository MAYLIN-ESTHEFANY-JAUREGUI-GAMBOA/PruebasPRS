/**
 * Tipos de emergencia que el backend acepta como `TipoEmergencia`.
 * Mantener sincronizado con `vg-ms-emergencias/.../model/TipoEmergencia.java`.
 */
import type { SistemaCastigos } from './usuario.model';

export type { SistemaCastigos };

export type EmergencyType =
  | 'ACCIDENTE_TRANSITO'
  | 'INCENDIO'
  | 'SALUD'
  | 'ROBO'
  | 'VIOLENCIA'
  | 'SEGURIDAD'
  | 'DESASTRE_NATURAL'
  | 'EMERGENCIA_MEDICA'
  | 'EXPLOSION'
  | 'OTRO';

/** Alias retrocompatible */
export type TipoEmergencia = EmergencyType;

/** Estados que el backend acepta como `EstadoIncidente`. */
export type IncidentStatus =
  | 'VERIFICACION_PENDIENTE'
  | 'NUEVO'
  | 'EN_ATENCION'
  | 'ELIMINADO'
  | 'RESUELTO'
  | 'CERRADO';

/** Alias retrocompatible */
export type EstadoIncidente = IncidentStatus;

/** Prioridad del incidente. */
export type IncidentSeverity = 'ALTA' | 'MEDIA' | 'BAJA';

/** Alias retrocompatible */
export type PrioridadAlerta = IncidentSeverity;

export interface LocationCoordinates {
  lat?: number | null;
  lng?: number | null;
  address?: string | null;
  reference?: string | null;
  [key: string]: unknown;
}

/** Alias retrocompatible */
export type Ubicacion = LocationCoordinates;

/** Datos de una entidad responsable según el endpoint enriquecido. */
export interface EntityDetail {
  id: string;
  ruc?: string | null;
  businessName?: string | null;
  entityType: string;
  handledEmergencyTypes?: string[] | null;
  status?: string | null;
  baseLocation?: { lat?: number; lng?: number; [key: string]: unknown } | null;
  operadoresActivos?: number | null;
  distanciaKm?: number | null;
  tiempoEstimadoMin?: number | null;
}

/** Alias retrocompatible */
export type EntidadDetalle = EntityDetail;

/**
 * Modelo principal consumido por la vista de Emergencias/Incidentes.
 * Viene del endpoint `GET /api/incidents/enriched` (JSON en inglés)
 */
export interface IncidentWithEntities {
  id: string;
  trackingCode: string;
  emergencyType: EmergencyType;
  location?: LocationCoordinates | null;
  severity: IncidentSeverity;
  currentStatus: IncidentStatus;
  createdAt: string;
  alertIds?: string[] | null;
  responsibleEntities: EntityDetail[];
  responsibleEntityIds?: string[] | null;
  assignedUnits?: DispatchedUnit[] | null;
  consolidatedEvidence?: Evidence[];
  logEvents?: LogEvent[];
  assignedOperator?: AssignedOperator | null;
  parentIncidentId?: string | null;
  finalResolution?: string | null;
  commandEntityId?: string | null;
  municipalityId?: string | null;
}

/** Alias retrocompatible */
export type IncidenteConEntidades = IncidentWithEntities;

// SUB-MODELOS DE INCIDENTE
export interface Evidence {
  content: string;
  type: string; // Ej: 'IMAGEN', 'VIDEO', 'AUDIO'
  description: string;
  sourceAlertId: string;
  createdAt: string;
}

/** Alias retrocompatible */
export type Evidencia = Evidence;

export interface AssignedOperator {
  id?: string;
  _id?: string;
  fullName?: string;
}

/** Alias retrocompatible */
export type OperadorAsignado = AssignedOperator;

export interface LogEvent {
  timestamp?: string;         // ISO String (backend DDD)
  date?: string;              // ISO String (alias retrocompatible)
  action: string;             // Ej: "DESPACHO_UNIDAD", "NOTA_OPERATIVA", "CAMBIO_GRAVEDAD"
  detail: string;             // Descripción de la acción (backend DDD)
  detalle?: string;           // alias retrocompatible
  origin?: 'SISTEMA' | 'HUMANO' | string; // backend DDD
  source?: 'SISTEMA' | 'HUMANO' | string; // alias retrocompatible
  origen?: 'SISTEMA' | 'HUMANO' | string; // alias retrocompatible
  operatorId?: string | null; // backend DDD
  operadorId?: string | null; // alias retrocompatible
  userUid?: string | null;
  metadata?: Record<string, any> | null;
}

/** Alias retrocompatible */
export type EventoBitacora = LogEvent;

export type TacticalStatus = 'DESPACHADO' | 'EN_RUTA' | 'EN_ESCENA' | 'TRASLADO' | 'DISPONIBLE';

/** Alias retrocompatible */
export type EstadoTactico = TacticalStatus;

export interface StatusChange {
  status: TacticalStatus;
  timestamp: string;
  userId?: string | null;
}

/** Alias retrocompatible */
export type CambioEstado = StatusChange;

export interface DispatchedUnit {
  resourceId: string;
  currentStatus: TacticalStatus;
  statusHistory?: StatusChange[];
}

/** Alias retrocompatible */
export type UnidadDespachada = DispatchedUnit;

// MODELO BASE DE INCIDENTE
/**
 * Modelo de la colección 'incidentes' en MongoDB.
 */
export interface Incident {
  id: string;
  trackingCode: string;
  emergencyType: EmergencyType;
  location: LocationCoordinates;
  consolidatedEvidence?: Evidence[];
  alertIds: string[];
  assignedUnits: DispatchedUnit[];
  responsibleEntityIds: string[];
  severity: IncidentSeverity;
  currentStatus: IncidentStatus;
  parentIncidentId?: string | null;
  assignedOperator?: AssignedOperator | null;
  logEvents?: LogEvent[];
  finalResolution?: string | null;
  createdAt: string;
}

/** Alias retrocompatible */
export type Incidente = Incident;

export interface CitizenProfile {
  id: string;
  dni: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  penaltySystem?: SistemaCastigos | null;
  // Aliases retrocompatibles
  nombres?: string;
  apellidos?: string;
  telefono?: string;
  sistema_castigos?: any;
  estado?: string;
}

/** Alias retrocompatible */
export type CiudadanoPerfil = CitizenProfile;

export interface LinkedAlertDTO {
  alertId: string;
  alertCode: string;
  emergencyType: string;
  createdAt: string;
  description: string;
  reporter: CitizenProfile | null;
  // Aliases retrocompatibles
  alertaId?: string;
  codigoAlerta?: string;
  tipoEmergencia?: string;
  fechaCreacion?: string;
  descripcion?: string;
  alertante?: CitizenProfile | null;
  _fechaFormateada?: string;
  _horaFormateada?: string;
}

/**
 * Agrupación de alertantes por usuario único dentro de un incidente.
 * Un ciudadano puede emitir múltiples alertas que se consolidan en el mismo incidente.
 */
export interface GroupedReporter {
  id: string;
  reporter: CitizenProfile;
  alerts: LinkedAlertDTO[];
  totalAlerts: number;
  alertCodes: string[];
  // Alias de compatibilidad
  alertas?: LinkedAlertDTO[];
  totalAlertas?: number;
  codigosAlertas?: string[];
}

/** Alias retrocompatible */
export type AlertanteAgrupado = GroupedReporter;

/** Alias retrocompatible */
export type AlertaVinculadaDTO = LinkedAlertDTO;

export function normalizarAlertaVinculada(raw: any): LinkedAlertDTO {
  if (!raw) return raw;
  const alertId = raw.alertId || raw.alertaId || raw.id || '';
  const alertCode = raw.alertCode || raw.codigoAlerta || raw.codigo || ('ALR-' + (alertId ? alertId.substring(Math.max(0, alertId.length - 5)).toUpperCase() : 'S/C'));
  const emergencyType = raw.emergencyType || raw.tipoEmergencia || '';
  const createdAt = raw.createdAt || raw.fechaCreacion || raw.creadoEn || '';
  const description = raw.description || raw.descripcion || '';
  
  const rawReporter = raw.reporter || raw.alertante || null;
  let reporter: CitizenProfile | null = null;
  const hasReporterData = rawReporter && (
    (rawReporter.id && String(rawReporter.id).trim() !== '') ||
    (rawReporter._id && String(rawReporter._id).trim() !== '') ||
    (rawReporter.dni && String(rawReporter.dni).trim() !== '' && rawReporter.dni !== 'Sin DNI') ||
    (rawReporter.firstName && String(rawReporter.firstName).trim() !== '') ||
    (rawReporter.nombres && String(rawReporter.nombres).trim() !== '') ||
    (rawReporter.email && String(rawReporter.email).trim() !== '' && rawReporter.email !== 'Sin correo')
  );

  if (hasReporterData) {
    const fn = rawReporter.firstName || rawReporter.nombres || '';
    const ln = rawReporter.lastName || rawReporter.apellidos || '';
    const phone = rawReporter.phone || rawReporter.telefono || 'Sin teléfono';
    const email = rawReporter.email || 'Sin correo';
    const dni = rawReporter.dni || 'Sin DNI';
    const id = rawReporter.id || rawReporter._id || '';
    const penaltySystem = rawReporter.penaltySystem || rawReporter.sistema_castigos || rawReporter.sistemaCastigos || null;

    reporter = {
      id,
      dni,
      firstName: fn,
      lastName: ln,
      phone,
      email,
      penaltySystem,
      nombres: fn,
      apellidos: ln,
      telefono: phone,
      estado: rawReporter.estado || 'ACTIVO'
    };
  }

  return {
    alertId,
    alertCode,
    emergencyType,
    createdAt,
    description,
    reporter,
    alertaId: alertId,
    codigoAlerta: alertCode,
    tipoEmergencia: emergencyType,
    fechaCreacion: createdAt,
    descripcion: description,
    alertante: reporter
  };
}

export interface ReopenIncidentRequest {
  reason: string;
}

/** Alias retrocompatible */
export type ReaperturarIncidenteRequest = ReopenIncidentRequest;
