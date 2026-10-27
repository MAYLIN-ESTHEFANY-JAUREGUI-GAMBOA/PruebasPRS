import { Injectable, inject } from '@angular/core';
import type { Borders, Cell, Fill, Font, Workbook, Worksheet } from 'exceljs';

import { ReportBrandingService } from './report-branding.service';
import { ReportConstants } from './report.constants';
import { MIME, descargar } from './download.util';
import { codigoReporte, fechaHoraIso, nombreArchivoReporte } from './report-format';
import { distribucion, rgbAArgb, tonoEstado } from './report-estilo';
import { CeldaReporte, FiltroReporte, Membrete, ReporteTabla } from './report.model';

/** Hoja de datos: primera fila = encabezados. */
export interface HojaReporte {
  nombre: string; columnas: string[]; filas: CeldaReporte[][]; anchos?: number[];
  /** Índices de columnas de estado: celda con color semántico; la primera se resume en `Resumen`. */
  estados?: number[];
}

const ARGB_CABECERA = 'FF' + ReportConstants.HEADER_HEX.slice(1);

/**
 * Único adaptador XLSX del proyecto (exceljs, lazy import). Todo libro tiene la misma forma:
 * hojas de datos (cabecera en negrita sobre el color institucional, autofiltro, fila fija) y `Resumen`
 * (membrete, filtros y total). exceljs en vez de SheetJS Community: este último no escribe estilos (§7).
 */
@Injectable({ providedIn: 'root' })
export class ReportExcelService {
  private readonly branding = inject(ReportBrandingService);

  /** Reporte tabular estándar: una hoja de detalle + Resumen. */
  async generar(reporte: ReporteTabla, extras: HojaReporte[] = []): Promise<void> {
    const detalle: HojaReporte = {
      nombre: reporte.hoja ?? 'Detalle',
      columnas: reporte.columnas.map(c => c.titulo),
      filas: reporte.filas,
      anchos: reporte.columnas.map(c => Math.max(12, Math.round((c.ancho ?? 30) * 0.9))),
      estados: reporte.columnas.flatMap((c, i) => (c.estado ? [i] : []))
    };
    await this.libro(reporte.titulo, reporte.filtros ?? [], [detalle, ...extras], reporte.documento, reporte.placeholder,
      reporte.filas.length, (reporte as any).municipalityId);
  }

  async libro(titulo: string, filtros: FiltroReporte[], hojas: HojaReporte[], documento: string, placeholder?: string,
              totalRegistros?: number, municipalidadId?: string | null): Promise<void> {
    const wb = await this.construir(titulo, filtros, hojas, await this.branding.membrete(municipalidadId), totalRegistros);
    await descargar(await wb.xlsx.writeBuffer(), nombreArchivoReporte(documento, 'xlsx', placeholder), MIME.XLSX);
  }

  /** Arma el libro sin descargarlo (lo usan las pruebas de estructura). */
  async construir(titulo: string, filtros: FiltroReporte[], hojas: HojaReporte[], membrete: Membrete,
                  totalRegistros?: number): Promise<Workbook> {
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    wb.creator = membrete.generadoPor;
    wb.created = new Date();
    // Resumen primero: es lo que se ve al abrir el libro.
    const resumen = wb.addWorksheet('Resumen', { views: [{ showGridLines: false }] });
    for (const h of hojas) hojaDatos(wb.addWorksheet(h.nombre.slice(0, 31)), h);

    resumen.columns = [{ width: 28 }, { width: 50 }, { width: 14 }];
    const banda = (texto: string, font: Partial<Font>, fondo: string, alto: number) => {
      const fila = resumen.addRow([texto]);
      resumen.mergeCells(fila.number, 1, fila.number, 3);
      fila.height = alto;
      fila.font = font;
      fila.alignment = { vertical: 'middle', indent: 1 };
      fila.getCell(1).fill = relleno(fondo);
    };
    banda(membrete.institucion, { bold: true, size: 15, color: { argb: 'FFFFFFFF' } }, ARGB_CABECERA, 30);
    banda(titulo, { bold: true, size: 12, color: { argb: ARGB_TEXTO } }, ARGB_ALTERNA, 22);
    resumen.addRow([]);
    const datos: [string, CeldaReporte][] = [
      ['Reporte N.°', codigoReporte()],
      ['Fecha de emisión', fechaHoraIso(new Date())],
      ['Emitido por', membrete.generadoPor],
      ...(totalRegistros !== undefined ? [['Total de registros', totalRegistros] as [string, CeldaReporte]] : []),
      ...filtros.filter(f => f.valor).map(f => [f.etiqueta, f.valor] as [string, CeldaReporte])
    ];
    for (const [etiqueta, valor] of datos) {
      const fila = resumen.addRow([etiqueta, valor ?? '']);
      resumen.mergeCells(fila.number, 2, fila.number, 3);
      fila.height = 18;
      fila.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true, indent: 1 };
      fila.getCell(1).font = { bold: true, color: { argb: ARGB_TEXTO } };
      fila.getCell(1).fill = relleno(ARGB_ALTERNA);
      fila.eachCell((c: any) => { c.border = BORDES; });
    }
    const conEstado = hojas.find(h => h.estados?.length && h.filas.length);
    if (conEstado) {
      const col = conEstado.estados![0];
      resumen.addRow([]);
      const cab = resumen.addRow([`Distribución por ${conEstado.columnas[col].toLowerCase()}`, 'Registros', '%']);
      cab.height = 20;
      cab.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cab.eachCell((c: any) => { c.fill = relleno(ARGB_CABECERA); c.border = BORDES; c.alignment = { vertical: 'middle', indent: 1 }; });
      for (const [valor, n] of distribucion(conEstado.filas, col)) {
        const fila = resumen.addRow([valor, n, n / conEstado.filas.length]);
        fila.height = 18;
        fila.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
        fila.getCell(3).numFmt = '0.0%';
        fila.eachCell((c: any) => { c.border = BORDES; });
        pintarEstado(fila.getCell(1), valor);
      }
    }
    resumen.addRow([]);
    resumen.addRow([`${ReportConstants.PLATAFORMA} · ${ReportConstants.PLATAFORMA_SUBTITULO}`]).font = { italic: true, size: 9, color: { argb: ARGB_SUAVE } };
    resumen.addRow(['Documento de uso interno — información confidencial. Refleja lo registrado en el sistema a la fecha de emisión.']).font = { italic: true, size: 8, color: { argb: ARGB_SUAVE } };
    return wb;
  }
}

function hojaDatos(ws: Worksheet, h: HojaReporte): void {
  ws.columns = h.columnas.map((titulo, i) => ({ header: titulo, width: h.anchos?.[i] ?? Math.max(12, titulo.length + 2) }));
  h.filas.forEach(f => ws.addRow(f.map(c => c ?? '')));
  const cabecera = ws.getRow(1);
  cabecera.height = 24;
  cabecera.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  cabecera.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  cabecera.eachCell((celda: any) => { celda.fill = relleno(ARGB_CABECERA); celda.border = BORDES; });
  ws.eachRow((fila: any, n: any) => {
    if (n === 1) return;
    fila.alignment = { vertical: 'top', wrapText: true };
    fila.font = { color: { argb: ARGB_TEXTO } };
    for (let c = 1; c <= h.columnas.length; c++) {
      const celda = fila.getCell(c);
      celda.border = BORDES;
      if (n % 2 === 1) celda.fill = relleno(ARGB_ALTERNA);
    }
    h.estados?.forEach(i => { if (fila.getCell(i + 1).value) pintarEstado(fila.getCell(i + 1), fila.getCell(i + 1).value); });
  });
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.pageSetup = { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '1:1' };
  if (h.filas.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: h.columnas.length } };
}

const argb = rgbAArgb;
const ARGB_ALTERNA = argb(ReportConstants.FILA_ALTERNA_RGB);
const ARGB_TEXTO = argb(ReportConstants.TEXTO_RGB);
const ARGB_SUAVE = argb(ReportConstants.TEXTO_SUAVE_RGB);
const BORDE = { style: 'thin' as const, color: { argb: argb(ReportConstants.BORDE_RGB) } };
const BORDES: Partial<Borders> = { top: BORDE, left: BORDE, bottom: BORDE, right: BORDE };

/** Celda de estado: fondo y texto del tono semántico, en negrita y centrada. */
function pintarEstado(celda: Cell, valor: unknown): void {
  const tono = tonoEstado(String(valor));
  celda.fill = relleno(argb(tono.fondo));
  celda.font = { bold: true, color: { argb: argb(tono.texto) } };
  celda.alignment = { vertical: 'middle', horizontal: 'center' };
}

function relleno(color: string): Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
}
