import { Injectable, inject } from '@angular/core';

import { IncidentWithEntities } from '../../models/incident';
import { ReportExcelService } from '../../../shared/reports/report-excel.service';
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
export class IncidentExcelService {
  private readonly excel = inject(ReportExcelService);

  /**
   * Generates a multi-sheet Excel workbook for a single incident (Detalle + Bitácora + Resumen).
   */
  generateIncidentExcel(incident: IncidentWithEntities, entityMap?: Map<string, string>): Promise<void> {
    const mid = (incident as any)?.municipalityId || (incident as any).municipalidadId;
    return this.excel.libro(
      INCIDENT_REPORT.TITLE_DETAIL,
      getIncidentFilters(incident),
      [
        {
          nombre: 'Detalle',
          columnas: INCIDENT_REPORT.DETAIL_COLUMNS.map(c => c.titulo),
          filas: buildIncidentDetailRows(incident, entityMap),
          anchos: [28, 70]
        },
        {
          nombre: 'Bitácora',
          columnas: INCIDENT_REPORT.BINNACLE_COLUMNS.map(c => c.titulo),
          filas: buildIncidentBinnacleRows(incident),
          anchos: [18, 26, 14, 80]
        }
      ],
      INCIDENT_REPORT.DOCUMENT_DETAIL,
      getIncidentCode(incident),
      undefined,
      mid
    );
  }

  /**
   * Generates an Excel workbook for the filtered list of incidents.
   */
  generateIncidentListExcel(
    incidents: IncidentWithEntities[],
    filters: IncidentListFilterOptions = {},
    entityMap?: Map<string, string>
  ): Promise<void> {
    const mid = (incidents[0] as any)?.municipalityId || (incidents[0] as any)?.municipalidadId;
    const reportData = buildIncidentListReport(incidents, filters, entityMap);
    (reportData as any).municipalityId = mid;
    return this.excel.generar(reportData);
  }

  // Alias retrocompatible
  generarExcel(incident: IncidentWithEntities, entityMap?: Map<string, string>): Promise<void> {
    return this.generateIncidentExcel(incident, entityMap);
  }
}