import { IncidentWithEntities } from '../../models/incident';
import {
  INCIDENT_REPORT,
  buildIncidentBinnacleRows,
  buildIncidentDetailRows,
  buildIncidentListReport,
  getIncidentCode
} from './incident-report.model';

const MOCK_INCIDENT: IncidentWithEntities = {
  id: 'inc-001',
  trackingCode: 'INC-2026-001',
  emergencyType: 'INCENDIO',
  severity: 'ALTA',
  currentStatus: 'EN_ATENCION',
  createdAt: '2026-10-25T14:30:00.000Z',
  assignedOperator: {
    fullName: 'Juan Pérez'
  },
  responsibleEntities: [
    { id: 'ent-1', businessName: 'Compañía de Bomberos Cañete', entityType: 'BOMBEROS' }
  ],
  alertIds: ['ALR-101'],
  assignedUnits: [{ resourceId: 'UNIDAD-B1' } as any],
  logEvents: [
    {
      timestamp: '2026-10-25T14:35:00.000Z',
      action: 'DESPACHO_UNIDAD',
      origin: 'OPERADOR',
      detail: 'Se despachó la unidad B1 a la zona'
    }
  ]
};

describe('incident-report model', () => {
  it('extracts incident code correctly', () => {
    expect(getIncidentCode(MOCK_INCIDENT)).toBe('INC-2026-001');
    expect(getIncidentCode({ ...MOCK_INCIDENT, trackingCode: '' })).toBe('inc-001');
  });

  it('builds detail rows with clean labels and formatted values', () => {
    const rows = buildIncidentDetailRows(MOCK_INCIDENT);
    expect(rows.length).toBe(9);
    expect(rows.find(r => r[0] === 'Código de seguimiento')?.[1]).toBe('INC-2026-001');
    expect(rows.find(r => r[0] === 'Estado actual')?.[1]).toBe('EN ATENCION');
    expect(rows.find(r => r[0] === 'Operador asignado')?.[1]).toBe('Juan Pérez');
    expect(rows.find(r => r[0] === 'Entidades responsables')?.[1]).toBe('Compañía de Bomberos Cañete');
  });

  it('builds binnacle rows formatting action and origin', () => {
    const rows = buildIncidentBinnacleRows(MOCK_INCIDENT);
    expect(rows.length).toBe(1);
    expect(rows[0][1]).toBe('DESPACHO UNIDAD');
    expect(rows[0][2]).toBe('OPERADOR');
    expect(rows[0][3]).toBe('Se despachó la unidad B1 a la zona');
  });

  it('handles empty binnacle gracefully with placeholder row', () => {
    const emptyIncident = { ...MOCK_INCIDENT, logEvents: [] };
    const rows = buildIncidentBinnacleRows(emptyIncident);
    expect(rows.length).toBe(1);
    expect(rows[0][1]).toBe('Sin eventos registrados');
  });

  it('builds tabular list report respecting active filters', () => {
    const report = buildIncidentListReport([MOCK_INCIDENT], {
      status: 'EN_ATENCION',
      severity: 'ALTA',
      search: 'Bomberos'
    });

    expect(report.titulo).toBe(INCIDENT_REPORT.TITLE_LIST);
    expect(report.documento).toBe(INCIDENT_REPORT.DOCUMENT_LIST);
    expect(report.orientacion).toBe('landscape');
    expect(report.filas.length).toBe(1);
    expect(report.filas[0][0]).toBe('INC-2026-001');
    expect(report.filas[0][3]).toBe('ALTA');

    // Filters check
    expect(report.filtros?.length).toBe(3);
    expect(report.filtros?.find(f => f.etiqueta === 'Búsqueda')?.valor).toBe('Bomberos');
    expect(report.filtros?.find(f => f.etiqueta === 'Estado')?.valor).toBe('EN ATENCION');
  });

  it('formats responsible entities without orphan commas when businessName is null', () => {
    const incidentWithNullEntities: IncidentWithEntities = {
      ...MOCK_INCIDENT,
      responsibleEntities: [
        { id: 'ent-1', businessName: null as any, entityType: 'SALUD' },
        { id: 'ent-2', businessName: null as any, entityType: 'BOMBEROS' }
      ]
    };

    const rowsWithoutMap = buildIncidentDetailRows(incidentWithNullEntities);
    const entitiesTextWithoutMap = rowsWithoutMap.find(r => r[0] === 'Entidades responsables')?.[1];
    expect(entitiesTextWithoutMap).toBe('Ninguna');
    expect(entitiesTextWithoutMap).not.toBe(', ');

    const map = new Map<string, string>([
      ['ent-1', 'Hospital Rezola'],
      ['ent-2', 'Bomberos B49']
    ]);
    const rowsWithMap = buildIncidentDetailRows(incidentWithNullEntities, map);
    const entitiesTextWithMap = rowsWithMap.find(r => r[0] === 'Entidades responsables')?.[1];
    expect(entitiesTextWithMap).toBe('Hospital Rezola, Bomberos B49');
  });
});
