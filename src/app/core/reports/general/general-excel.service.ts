import { Injectable, inject } from '@angular/core';

import { ReportExcelService } from '../../../shared/reports/report-excel.service';
import { IndicadorGeneral, reporteGeneral } from './general-reporte.model';

@Injectable({ providedIn: 'root' })
export class GeneralExcelService {
  private readonly excel = inject(ReportExcelService);

  generar(indicadores: IndicadorGeneral[], alcance: string): Promise<void> {
    return this.excel.generar(reporteGeneral(indicadores, alcance));
  }
}
