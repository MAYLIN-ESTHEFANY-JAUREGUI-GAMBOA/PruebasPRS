import { Injectable, inject } from '@angular/core';

import { ReportExcelService } from '../../../shared/reports/report-excel.service';
import { reporteAuditoria, reporteSancionados } from './castigo-reporte.model';

@Injectable({ providedIn: 'root' })
export class CastigoExcelService {
  private readonly excel = inject(ReportExcelService);

  generarSancionados(...args: Parameters<typeof reporteSancionados>): Promise<void> {
    return this.excel.generar(reporteSancionados(...args));
  }

  generarAuditoria(...args: Parameters<typeof reporteAuditoria>): Promise<void> {
    return this.excel.generar(reporteAuditoria(...args));
  }
}
