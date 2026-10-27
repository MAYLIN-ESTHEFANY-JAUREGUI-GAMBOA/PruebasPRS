import { Injectable, inject } from '@angular/core';

import { ReportPdfService } from '../../../shared/reports/report-pdf.service';
import { reporteUsuarios } from './usuario-reporte.model';

@Injectable({ providedIn: 'root' })
export class UsuarioPdfService {
  private readonly pdf = inject(ReportPdfService);

  generarPdf(...args: Parameters<typeof reporteUsuarios>): Promise<void> {
    return this.pdf.generar(reporteUsuarios(...args));
  }
}
