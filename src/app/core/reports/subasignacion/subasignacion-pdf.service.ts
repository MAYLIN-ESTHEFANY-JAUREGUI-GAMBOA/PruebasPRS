import { Injectable, inject } from '@angular/core';

import { ReportPdfService } from '../../../shared/reports/report-pdf.service';
import { reporteSubasignaciones } from './subasignacion-reporte.model';

@Injectable({ providedIn: 'root' })
export class SubasignacionPdfService {
  private readonly pdf = inject(ReportPdfService);

  generarPdf(...args: Parameters<typeof reporteSubasignaciones>): Promise<void> {
    return this.pdf.generar(reporteSubasignaciones(...args));
  }
}
