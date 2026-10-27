import { Injectable, inject } from '@angular/core';

import { ReportPdfService } from '../../../shared/reports/report-pdf.service';
import { reporteCatalogos } from './catalogo-reporte.model';

@Injectable({ providedIn: 'root' })
export class CatalogoPdfService {
  private readonly pdf = inject(ReportPdfService);

  generarPdf(...args: Parameters<typeof reporteCatalogos>): Promise<void> {
    return this.pdf.generar(reporteCatalogos(...args));
  }
}
