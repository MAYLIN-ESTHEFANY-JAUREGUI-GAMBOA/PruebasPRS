import { Injectable, inject } from '@angular/core';

import { ReportPdfService } from '../../../shared/reports/report-pdf.service';
import { reporteAuditoria, reporteSancionados } from './castigo-reporte.model';

@Injectable({ providedIn: 'root' })
export class CastigoPdfService {
  private readonly pdf = inject(ReportPdfService);

  generarSancionados(...args: Parameters<typeof reporteSancionados>): Promise<void> {
    return this.pdf.generar(reporteSancionados(...args));
  }

  generarAuditoria(...args: Parameters<typeof reporteAuditoria>): Promise<void> {
    return this.pdf.generar(reporteAuditoria(...args));
  }
}
