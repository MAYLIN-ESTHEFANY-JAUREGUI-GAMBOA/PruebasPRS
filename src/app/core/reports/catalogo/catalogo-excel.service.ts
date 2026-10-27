import { Injectable, inject } from '@angular/core';

import { ReportExcelService } from '../../../shared/reports/report-excel.service';
import { reporteCatalogos } from './catalogo-reporte.model';

@Injectable({ providedIn: 'root' })
export class CatalogoExcelService {
  private readonly excel = inject(ReportExcelService);

  generarExcel(...args: Parameters<typeof reporteCatalogos>): Promise<void> {
    return this.excel.generar(reporteCatalogos(...args));
  }
}
