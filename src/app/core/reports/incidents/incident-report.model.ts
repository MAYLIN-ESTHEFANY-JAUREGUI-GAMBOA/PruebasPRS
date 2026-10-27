import { IncidentWithEntities } from '../../models/incident';
import { CeldaReporte, ColumnaReporte, FiltroReporte, ReporteTabla } from '../../../shared/reports/report.model';
import { fechaHoraIso } from '../../../shared/reports/report-format';

export const INCIDENT_REPORT = {
  TITLE_DETAIL: 'Reporte de Atención de Incidente',
  DOCUMENT_DETAIL: 'Reporte_Incidente',
  TITLE_LIST: 'Reporte de Gestión de Emergencias',
  DOCUMENT_LIST: 'Reporte_Gestion_Emergencias',
  SHEET_LIST: 'Emergencias',

  DETAIL_COLUMNS: [
    { titulo: 'Campo', ancho: 40 },
    { titulo: 'Detalle Registrado', ancho: 140 }
  ] as ColumnaReporte[],

  BINNACLE_COLUMNS: [
    { titulo: 'Fecha y Hora', ancho: 38 },
    { titulo: 'Acción Táctica', ancho: 45 },
    { titulo: 'Origen', ancho: 30 },
    { titulo: 'Detalle Operativo', ancho: 75 }
  ] as ColumnaReporte[],

  LIST_COLUMNS: [
    { titulo: 'Código', ancho: 28 },
    { titulo: 'Fecha Registro', ancho: 35 },
    { titulo: 'Tipo', ancho: 28 },
    { titulo: 'Gravedad', ancho: 20, estado: true },
    { titulo: 'Estado', ancho: 24, estado: true },
    { titulo: 'Operador', ancho: 32 },
    { titulo: 'Entidades Responsables', ancho: 40 }
  ] as ColumnaReporte[]
} as const;

export interface IncidentListFilterOptions {
  status?: string;
  severity?: string;
  emergencyType?: string;
  search?: string;
}

export function getIncidentCode(incident: IncidentWithEntities): string {
  return incident.trackingCode || incident.id || 'SIN_CODIGO';
}

export function getIncidentFilters(incident: IncidentWithEntities): FiltroReporte[] {
  return [{ etiqueta: 'Código', valor: getIncidentCode(incident) }];
}

export function formatResponsibleEntities(incident: IncidentWithEntities, entityMap?: Map<string, string>): string {
  const list = incident.responsibleEntities ?? [];
  const names: string[] = [];

  for (const e of list) {
    const rawName = e?.businessName || (e as any)?.razonSocial || (e as any)?.name;
    if (rawName && typeof rawName === 'string' && rawName.trim().length > 0) {
      names.push(rawName.trim());
    } else if (e?.id && entityMap?.has(e.id)) {
      names.push(entityMap.get(e.id)!);
    }
  }

  // Si no se extrajeron nombres pero hay IDs de entidades responsables
  if (!names.length && incident.responsibleEntityIds?.length) {
    for (const id of incident.responsibleEntityIds) {
      if (entityMap?.has(id)) {
        names.push(entityMap.get(id)!);
      }
    }
  }

  const validNames = names.filter(n => typeof n === 'string' && n.trim().length > 0);
  return validNames.length > 0 ? validNames.join(', ') : 'Ninguna';
}

export function buildIncidentDetailRows(incident: IncidentWithEntities, entityMap?: Map<string, string>): CeldaReporte[][] {
  const operatorName = incident.assignedOperator?.fullName || 'No asignado';
  const entities = formatResponsibleEntities(incident, entityMap);
  const alerts = (incident.alertIds?.filter(Boolean) || []).join(', ') || 'Ninguna';
  const units = (incident.assignedUnits?.map(u => u.resourceId).filter(Boolean) || []).join(', ') || 'Ninguno';

  return [
    ['Código de seguimiento', incident.trackingCode || '—'],
    ['Estado actual', (incident.currentStatus || '—').replace(/_/g, ' ')],
    ['Tipo de emergencia', (incident.emergencyType || '—').replace(/_/g, ' ')],
    ['Nivel de gravedad', incident.severity || '—'],
    ['Fecha de creación', fechaHoraIso(incident.createdAt)],
    ['Operador asignado', operatorName],
    ['Entidades responsables', entities],
    ['Alertas vinculadas', alerts],
    ['Recursos asignados', units]
  ];
}

/**
 * Transforms the incident event binnacle into table rows.
 * If empty, provides an explicit placeholder row so the section is never blank.
 */
export function buildIncidentBinnacleRows(incident: IncidentWithEntities): CeldaReporte[][] {
  const events = incident.logEvents ?? (incident as any).eventLog ?? [];
  if (!events.length) {
    return [['—', 'Sin eventos registrados', '—', '—']];
  }
  return events.map((event: any) => [
    fechaHoraIso(event.date || event.timestamp),
    (event.action || '').replace(/_/g, ' '),
    event.source || event.origin || 'SISTEMA',
    event.detail || event.detalle || ''
  ]);
}

/**
 * Builds the tabular report structure for a list of incidents respecting screen filters.
 */
export function buildIncidentListReport(
  incidents: IncidentWithEntities[],
  filters: IncidentListFilterOptions = {},
  entityMap?: Map<string, string>
): ReporteTabla {
  const reportFilters: FiltroReporte[] = [];

  if (filters.search && filters.search.trim()) {
    reportFilters.push({ etiqueta: 'Búsqueda', valor: filters.search.trim() });
  }
  if (filters.status && filters.status !== 'TODOS') {
    reportFilters.push({ etiqueta: 'Estado', valor: filters.status.replace(/_/g, ' ') });
  }
  if (filters.severity && filters.severity !== 'TODOS') {
    reportFilters.push({ etiqueta: 'Gravedad', valor: filters.severity });
  }
  if (filters.emergencyType && filters.emergencyType !== 'TODOS') {
    reportFilters.push({ etiqueta: 'Tipo de Emergencia', valor: filters.emergencyType.replace(/_/g, ' ') });
  }

  const rows: CeldaReporte[][] = incidents.map(item => [
    item.trackingCode || item.id,
    fechaHoraIso(item.createdAt),
    (item.emergencyType || '—').replace(/_/g, ' '),
    item.severity || '—',
    (item.currentStatus || '—').replace(/_/g, ' '),
    item.assignedOperator?.fullName || 'No asignado',
    formatResponsibleEntities(item, entityMap)
  ]);

  return {
    titulo: INCIDENT_REPORT.TITLE_LIST,
    documento: INCIDENT_REPORT.DOCUMENT_LIST,
    hoja: INCIDENT_REPORT.SHEET_LIST,
    filtros: reportFilters,
    columnas: [...INCIDENT_REPORT.LIST_COLUMNS],
    filas: rows,
    orientacion: 'landscape'
  };
}