import { Injectable, inject } from '@angular/core';

import { ReportPdfService } from '../../../shared/reports/report-pdf.service';
import { reporteRecursos } from './recurso-reporte.model';

@Injectable({ providedIn: 'root' })
export class RecursoPdfService {
  private readonly pdf = inject(ReportPdfService);

  generarPdf(...args: Parameters<typeof reporteRecursos>): Promise<void> {
    return this.pdf.generar(reporteRecursos(...args));
  }
}
