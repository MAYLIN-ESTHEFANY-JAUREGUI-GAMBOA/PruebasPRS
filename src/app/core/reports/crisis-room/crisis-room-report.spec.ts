import { IncidentWithEntities } from '../../models/incident';
import { CommunicationMessage } from '../../models/communication-message';
import {
  CRISIS_ROOM_REPORT,
  buildCrisisRoomFilters,
  buildCrisisRoomIncidentRows,
  buildCrisisRoomMessageRows,
  getCrisisRoomLabel,
  getCrisisRoomParticipantsCount,
  getCrisisRoomSlug,
  getCrisisRoomTimeSpan
} from './crisis-room-report.model';

const MOCK_INCIDENT: IncidentWithEntities = {
  id: 'inc-99',
  trackingCode: 'INC-2026-099',
  emergencyType: 'SALUD',
  severity: 'ALTA',
  currentStatus: 'EN_ATENCION',
  createdAt: '2026-10-25T10:00:00.000Z',
  assignedOperator: { fullName: 'Operador Central' },
  responsibleEntities: [{ id: 'ent-1', businessName: 'SAMU Cañete', entityType: 'HOSPITAL' }]
};

const MOCK_MESSAGES: CommunicationMessage[] = [
  {
    id: 'm-1',
    incidentId: 'inc-99',
    senderId: 'op-1',
    senderName: 'Dr. Morales (SAMU)',
    senderRole: 'OPERADOR_ENTIDAD',
    messageType: 'TEXTO',
    content: 'Unidad de ambulancia Alfa-1 en camino al punto.',
    sentAt: '2026-10-25T10:02:00.000Z'
  },
  {
    id: 'm-2',
    incidentId: 'inc-99',
    senderId: 'cit-1',
    senderName: 'Carlos Ciudadano',
    senderRole: 'CIUDADANO',
    messageType: 'TEXTO',
    content: 'Por favor apresúrense, hay un herido grave.',
    sentAt: '2026-10-25T10:04:00.000Z'
  }
];

describe('crisis-room-report model', () => {
  it('resolves room labels and slugs properly', () => {
    expect(getCrisisRoomLabel('GENERAL')).toBe('Canal General');
    expect(getCrisisRoomLabel('TACTICAL')).toBe('Canal Táctico (Privado)');
    expect(getCrisisRoomSlug('GENERAL')).toBe('General');
    expect(getCrisisRoomSlug('TACTICAL')).toBe('Tactico');
  });

  it('builds crisis room filters', () => {
    const filters = buildCrisisRoomFilters(MOCK_INCIDENT, 'TACTICAL');
    expect(filters.find(f => f.etiqueta === 'Incidente')?.valor).toBe('INC-2026-099');
    expect(filters.find(f => f.etiqueta === 'Sala')?.valor).toBe('Canal Táctico (Privado)');
    expect(filters.find(f => f.etiqueta === 'Tipo de Emergencia')?.valor).toBe('SALUD');
  });

  it('builds incident context rows', () => {
    const rows = buildCrisisRoomIncidentRows(MOCK_INCIDENT, 'GENERAL');
    expect(rows.length).toBe(8);
    expect(rows.find(r => r[0] === 'Código de seguimiento')?.[1]).toBe('INC-2026-099');
    expect(rows.find(r => r[0] === 'Sala de crisis')?.[1]).toBe('Canal General');
    expect(rows.find(r => r[0] === 'Operador a cargo')?.[1]).toBe('Operador Central');
  });

  it('formats message transcription rows correctly', () => {
    const rows = buildCrisisRoomMessageRows(MOCK_MESSAGES);
    expect(rows.length).toBe(2);
    expect(rows[0][1]).toBe('Operador de Entidad');
    expect(rows[0][2]).toBe('Dr. Morales (SAMU)');
    expect(rows[0][4]).toBe('Unidad de ambulancia Alfa-1 en camino al punto.');

    expect(rows[1][1]).toBe('Ciudadano');
    expect(rows[1][2]).toBe('Carlos Ciudadano');
  });

  it('handles empty messages gracefully with placeholder message row', () => {
    const rows = buildCrisisRoomMessageRows([]);
    expect(rows.length).toBe(1);
    expect(rows[0][4]).toBe('Sin comunicaciones registradas en esta sala');
  });

  it('calculates participant counts and time spans accurately', () => {
    expect(getCrisisRoomParticipantsCount(MOCK_MESSAGES)).toBe(2);
    expect(getCrisisRoomParticipantsCount([])).toBe(0);

    const span = getCrisisRoomTimeSpan(MOCK_MESSAGES);
    expect(span).toContain('→');
  });
});
