import { Injectable, inject } from '@angular/core';

import { ReportExcelService } from '../../../shared/reports/report-excel.service';
import { reporteEntidades } from './entidad-reporte.model';

@Injectable({ providedIn: 'root' })
export class EntidadExcelService {
  private readonly excel = inject(ReportExcelService);

  generarExcel(...args: Parameters<typeof reporteEntidades>): Promise<void> {
    return this.excel.generar(reporteEntidades(...args));
  }
}
