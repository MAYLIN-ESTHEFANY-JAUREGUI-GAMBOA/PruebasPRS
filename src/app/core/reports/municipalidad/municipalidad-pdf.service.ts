import { Injectable, inject } from '@angular/core';

import { ReportPdfService } from '../../../shared/reports/report-pdf.service';
import { EntidadReporteFila, MunicipalidadReporteFila, MunicipalidadReporteFiltros, reporteFichaMunicipalidad, reportePadronMunicipalidades } from './municipalidad-reporte.model';

@Injectable({ providedIn: 'root' })
export class MunicipalidadPdfService {
  private readonly pdf = inject(ReportPdfService);

  generarPadron(filas: MunicipalidadReporteFila[], filtros: MunicipalidadReporteFiltros): Promise<void> {
    return this.pdf.generar(reportePadronMunicipalidades(filas, filtros));
  }

  generarFicha(m: MunicipalidadReporteFila, entidades: EntidadReporteFila[]): Promise<void> {
    return this.pdf.generar(reporteFichaMunicipalidad(m, entidades));
  }
}
