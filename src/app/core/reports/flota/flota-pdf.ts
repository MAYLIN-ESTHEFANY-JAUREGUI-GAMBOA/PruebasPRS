import { Injectable, inject } from '@angular/core';

import { ReportPdfService } from '../../../shared/reports/report-pdf.service';
import { reporteFlota } from './flota-reporte';

@Injectable({ providedIn: 'root' })
export class FlotaPdfService {
  private readonly pdf = inject(ReportPdfService);

  generarPdf(...args: Parameters<typeof reporteFlota>): Promise<void> {
    return this.pdf.generar(reporteFlota(...args));
  }
}
