import { IncidentWithEntities } from '../../models/incident';
import { CommunicationMessage } from '../../models/communication-message';
import { ChatRoomType } from '../../services/communications';
import { fechaHoraIso } from '../../../shared/reports/report-format';
import { CeldaReporte, ColumnaReporte, FiltroReporte } from '../../../shared/reports/report.model';

/**
 * Report constants and configurations for the Crisis Room (Sala de Crisis).
 * Conforms to AS241S6 standards.
 */
export const CRISIS_ROOM_REPORT = {
  TITLE: 'Reporte de Sala de Crisis — Transcripción Operativa',
  DOCUMENT: 'Reporte_SalaCrisis',
  SHEET_MESSAGES: 'Comunicaciones',
  SHEET_SUMMARY: 'Resumen',
  INCIDENT_COLUMNS: [
    { titulo: 'Parámetro', ancho: 45 },
    { titulo: 'Valor' }
  ] as ColumnaReporte[],
  MESSAGE_COLUMNS: [
    { titulo: 'Hora', ancho: 22 },
    { titulo: 'Rol / Entidad', ancho: 32 },
    { titulo: 'Remitente', ancho: 38 },
    { titulo: 'Tipo', ancho: 20, estado: true },
    { titulo: 'Mensaje / Contenido' }
  ] as ColumnaReporte[]
} as const;

export function getCrisisRoomLabel(roomType: ChatRoomType): string {
  return roomType === 'TACTICAL' ? 'Canal Táctico (Privado)' : 'Canal General';
}

export function getCrisisRoomSlug(roomType: ChatRoomType): string {
  return roomType === 'TACTICAL' ? 'Tactico' : 'General';
}

export function buildCrisisRoomFilters(
  incident: IncidentWithEntities,
  roomType: ChatRoomType
): FiltroReporte[] {
  return [
    { etiqueta: 'Incidente', valor: incident.trackingCode || incident.id },
    { etiqueta: 'Sala', valor: getCrisisRoomLabel(roomType) },
    { etiqueta: 'Tipo de Emergencia', valor: (incident.emergencyType || '—').replace(/_/g, ' ') },
    { etiqueta: 'Gravedad', valor: incident.severity || '—' }
  ];
}

export function buildCrisisRoomIncidentRows(
  incident: IncidentWithEntities,
  roomType: ChatRoomType
): CeldaReporte[][] {
  const operatorName = incident.assignedOperator?.fullName || 'No asignado';
  const entities = incident.responsibleEntities?.map(e => e.businessName).join(', ') || 'Ninguna';

  return [
    ['Código de seguimiento', incident.trackingCode || incident.id],
    ['Sala de crisis', getCrisisRoomLabel(roomType)],
    ['Tipo de emergencia', (incident.emergencyType || '—').replace(/_/g, ' ')],
    ['Nivel de gravedad', incident.severity || '—'],
    ['Estado del incidente', (incident.currentStatus || '—').replace(/_/g, ' ')],
    ['Operador a cargo', operatorName],
    ['Entidades involucradas', entities],
    ['Fecha del incidente', fechaHoraIso(incident.createdAt)]
  ];
}

export function buildCrisisRoomMessageRows(messages: CommunicationMessage[]): CeldaReporte[][] {
  if (!messages.length) {
    return [['—', '—', '—', '—', 'Sin comunicaciones registradas en esta sala']];
  }

  return messages.map(msg => {
    const formattedRole = msg.senderRole === 'OPERADOR_ENTIDAD' ? 'Operador de Entidad' : 'Ciudadano';
    return [
      fechaHoraIso(msg.sentAt),
      formattedRole,
      msg.senderName || 'Desconocido',
      msg.messageType || 'TEXTO',
      msg.content || ''
    ];
  });
}

export function getCrisisRoomParticipantsCount(messages: CommunicationMessage[]): number {
  const uniqueSenders = new Set(messages.map(m => m.senderId || m.senderName).filter(Boolean));
  return uniqueSenders.size;
}

export function getCrisisRoomTimeSpan(messages: CommunicationMessage[]): string {
  if (!messages.length) return '—';
  const first = fechaHoraIso(messages[0].sentAt);
  const last = fechaHoraIso(messages[messages.length - 1].sentAt);
  return first === last ? first : `${first} → ${last}`;
}
