import { Injectable, inject } from '@angular/core';

import { ReportPdfService } from '../../../shared/reports/report-pdf.service';
import { reporteEntidades } from './entidad-reporte.model';

@Injectable({ providedIn: 'root' })
export class EntidadPdfService {
  private readonly pdf = inject(ReportPdfService);

  generarPdf(...args: Parameters<typeof reporteEntidades>): Promise<void> {
    return this.pdf.generar(reporteEntidades(...args));
  }
}
