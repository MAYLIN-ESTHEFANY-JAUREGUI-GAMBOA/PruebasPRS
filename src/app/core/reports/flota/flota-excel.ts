import { Injectable, inject } from '@angular/core';

import { ReportExcelService } from '../../../shared/reports/report-excel.service';
import { reporteFlota } from './flota-reporte';

@Injectable({ providedIn: 'root' })
export class FlotaExcelService {
  private readonly excel = inject(ReportExcelService);

  generarExcel(...args: Parameters<typeof reporteFlota>): Promise<void> {
    return this.excel.generar(reporteFlota(...args));
  }
}
