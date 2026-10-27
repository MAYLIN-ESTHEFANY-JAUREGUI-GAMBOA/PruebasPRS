import { Injectable, inject } from '@angular/core';

import { ReportPdfService } from '../../../shared/reports/report-pdf.service';
import { IndicadorGeneral, reporteGeneral } from './general-reporte.model';

@Injectable({ providedIn: 'root' })
export class GeneralPdfService {
  private readonly pdf = inject(ReportPdfService);

  generar(indicadores: IndicadorGeneral[], alcance: string): Promise<void> {
    return this.pdf.generar(reporteGeneral(indicadores, alcance));
  }
}
