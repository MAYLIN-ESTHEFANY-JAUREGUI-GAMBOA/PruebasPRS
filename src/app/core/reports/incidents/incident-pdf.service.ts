import { Injectable, inject } from '@angular/core';

import { IncidentWithEntities } from '../../models/incident';
import { ReportPdfService } from '../../../shared/reports/report-pdf.service';
import { ReportConstants } from '../../../shared/reports/report.constants';
import { tonoEstado } from '../../../shared/reports/report-estilo';
import {
  INCIDENT_REPORT,
  IncidentListFilterOptions,
  buildIncidentBinnacleRows,
  buildIncidentDetailRows,
  buildIncidentListReport,
  getIncidentCode,
  getIncidentFilters
} from './incident-report.model';

@Injectable({ providedIn: 'root' })
export class IncidentPdfService {
  private readonly pdf = inject(ReportPdfService);

  /**
   * Generates a detailed PDF report for a single incident (A4 portrait).
   */
  async generateIncidentPdf(incident: IncidentWithEntities, entityMap?: Map<string, string>): Promise<void> {
    const mid = (incident as any)?.municipalityId || (incident as any).municipalidadId;
    const doc = await this.pdf.abrir(INCIDENT_REPORT.TITLE_DETAIL, getIncidentFilters(incident), 'portrait', mid);

    this.pdf.seccion(doc, 'Resumen');
    this.pdf.tarjetas(doc, [
      { etiqueta: 'Estado actual', valor: (incident.currentStatus || '—').replace(/_/g, ' '), color: tonoEstado(incident.currentStatus).texto },
      { etiqueta: 'Gravedad', valor: incident.severity || '—', color: tonoEstado(incident.severity).texto },
      { etiqueta: 'Tipo de emergencia', valor: (incident.emergencyType || '—').replace(/_/g, ' '), color: ReportConstants.HEADER_RGB },
      { etiqueta: 'Eventos en bitácora', valor: incident.logEvents?.length ?? 0, color: ReportConstants.HEADER_RGB }
    ]);

    this.pdf.seccion(doc, 'Detalles generales');
    this.pdf.tabla(doc, { columnas: INCIDENT_REPORT.DETAIL_COLUMNS, filas: buildIncidentDetailRows(incident, entityMap) });

    this.pdf.seccion(doc, 'Historial de bitácora');
    this.pdf.tabla(doc, { columnas: INCIDENT_REPORT.BINNACLE_COLUMNS, filas: buildIncidentBinnacleRows(incident) });

    this.pdf.cierre(doc, 'Fin del reporte de incidente');
    await this.pdf.cerrar(doc, INCIDENT_REPORT.DOCUMENT_DETAIL, getIncidentCode(incident));
  }

  /**
   * Generates a landscape PDF list for multiple filtered incidents.
   */
  async generateIncidentListPdf(
    incidents: IncidentWithEntities[],
    filters: IncidentListFilterOptions = {},
    entityMap?: Map<string, string>
  ): Promise<void> {
    const mid = (incidents[0] as any)?.municipalityId || (incidents[0] as any)?.municipalidadId;
    const reportData = buildIncidentListReport(incidents, filters, entityMap);
    (reportData as any).municipalityId = mid;
    await this.pdf.generar(reportData);
  }

  // Alias retrocompatible
  generarPdf(incident: IncidentWithEntities, entityMap?: Map<string, string>): Promise<void> {
    return this.generateIncidentPdf(incident, entityMap);
  }
}