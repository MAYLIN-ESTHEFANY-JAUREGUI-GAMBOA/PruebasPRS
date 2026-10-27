import { Injectable, inject } from '@angular/core';

import { ReportExcelService } from '../../../shared/reports/report-excel.service';
import { reporteUsuarios } from './usuario-reporte.model';

@Injectable({ providedIn: 'root' })
export class UsuarioExcelService {
  private readonly excel = inject(ReportExcelService);

  generarExcel(...args: Parameters<typeof reporteUsuarios>): Promise<void> {
    return this.excel.generar(reporteUsuarios(...args));
  }
}
