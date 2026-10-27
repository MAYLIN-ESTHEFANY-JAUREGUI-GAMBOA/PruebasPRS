import { Injectable, inject } from '@angular/core';

import { ReportExcelService } from '../../../shared/reports/report-excel.service';
import { reporteRecursos } from './recurso-reporte.model';

@Injectable({ providedIn: 'root' })
export class RecursoExcelService {
  private readonly excel = inject(ReportExcelService);

  generarExcel(...args: Parameters<typeof reporteRecursos>): Promise<void> {
    return this.excel.generar(reporteRecursos(...args));
  }
}
