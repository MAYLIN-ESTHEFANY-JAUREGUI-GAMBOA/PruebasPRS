import { Injectable, inject } from '@angular/core';

import { ReportExcelService } from '../../../shared/reports/report-excel.service';
import {
  EntidadReporteFila, MunicipalidadReporteFila, MunicipalidadReporteFiltros,
  hojaEntidades, reporteFichaMunicipalidad, reportePadronMunicipalidades
} from './municipalidad-reporte.model';

@Injectable({ providedIn: 'root' })
export class MunicipalidadExcelService {
  private readonly excel = inject(ReportExcelService);

  generarPadron(filas: MunicipalidadReporteFila[], filtros: MunicipalidadReporteFiltros, entidades: EntidadReporteFila[]): Promise<void> {
    return this.excel.generar(reportePadronMunicipalidades(filas, filtros), [hojaEntidades(entidades)]);
  }

  generarFicha(m: MunicipalidadReporteFila, entidades: EntidadReporteFila[]): Promise<void> {
    return this.excel.generar(reporteFichaMunicipalidad(m, entidades));
  }
}
