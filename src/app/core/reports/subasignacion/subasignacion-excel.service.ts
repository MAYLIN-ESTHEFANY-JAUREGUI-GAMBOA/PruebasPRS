import { Injectable, inject } from '@angular/core';

import { ReportExcelService } from '../../../shared/reports/report-excel.service';
import { reporteSubasignaciones } from './subasignacion-reporte.model';

@Injectable({ providedIn: 'root' })
export class SubasignacionExcelService {
  private readonly excel = inject(ReportExcelService);

  generarExcel(...args: Parameters<typeof reporteSubasignaciones>): Promise<void> {
    return this.excel.generar(reporteSubasignaciones(...args));
  }
}
