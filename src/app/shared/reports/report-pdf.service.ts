import { Injectable, inject } from '@angular/core';
import type { jsPDF } from 'jspdf';
import type { CellHookData, UserOptions } from 'jspdf-autotable';

import { ReportBrandingService } from './report-branding.service';
import { ReportConstants } from './report.constants';
import { codigoReporte, fechaHoraIso, nombreArchivoReporte } from './report-format';
import { Tono, distribucion, tonoEstado } from './report-estilo';
import { MIME, descargar } from './download.util';
import { FiltroReporte, Membrete, ReporteTabla } from './report.model';

export const MARGEN_MM = 14;
const ALTO_CABECERA_CONTINUA_MM = 14;
type AutoTable = (doc: jsPDF, opciones: UserOptions) => void;
type Rgb = [number, number, number];

/** Documento abierto con membrete: `y` es donde empieza el cuerpo. */
export interface DocumentoPdf {
  doc: jsPDF; autoTable: AutoTable; y: number;
  titulo: string; institucion: string; codigo: string; emitido: string;
  /** Contador para numerar las secciones (1. Resumen, 2. Detalle...). */
  secciones: number;
}

/** Tarjeta de indicador (total, conteo por estado...). `nota` = texto pequeño bajo la etiqueta. */
export interface TarjetaPdf { etiqueta: string; valor: string | number; color: Rgb; nota?: string; }

/**
 * Único adaptador PDF del proyecto (jsPDF + autotable, lazy import). Formato de documento oficial igual
 * en todos los módulos: membrete institucional, código de reporte, ficha de emisión, secciones numeradas y pie.
 */
@Injectable({ providedIn: 'root' })
export class ReportPdfService {
  private readonly branding = inject(ReportBrandingService);

  /** Reporte tabular estándar: 1. Resumen (tarjetas) y 2. Detalle (tabla numerada). */
  async generar(reporte: ReporteTabla): Promise<void> {
    const pdf = await this.abrir(reporte.titulo, reporte.filtros ?? [], reporte.orientacion, (reporte as any).municipalityId);
    const total = reporte.filas.length;
    const tarjetas: TarjetaPdf[] = [{ etiqueta: 'Total de registros', valor: total, color: ReportConstants.HEADER_RGB, nota: 'Según los criterios de consulta' }];
    const colEstado = reporte.columnas.findIndex(c => c.estado);
    if (colEstado >= 0) {
      distribucion(reporte.filas, colEstado).slice(0, 3).forEach(([valor, n]) => tarjetas.push({
        etiqueta: valor, valor: n, color: tonoEstado(valor).texto, nota: `${Math.round((n / total) * 100)} % del total`
      }));
    }
    this.seccion(pdf, 'Resumen');
    this.tarjetas(pdf, tarjetas);
    this.seccion(pdf, 'Detalle de registros');
    this.tabla(pdf, {
      columnas: [{ titulo: 'N.°', ancho: 11 }, ...reporte.columnas],
      filas: reporte.filas.map((f, i) => [i + 1, ...f])
    });
    this.cierre(pdf, `Fin del reporte · ${total} ${total === 1 ? 'registro' : 'registros'}`);
    await this.cerrar(pdf, reporte.documento, reporte.placeholder);
  }

  /** Para reportes de varias secciones (p. ej. detalle de un incidente): membrete + cuerpo libre. */
  async abrir(titulo: string, filtros: FiltroReporte[] = [], orientacion: 'portrait' | 'landscape' = 'portrait', municipalidadId?: string | null): Promise<DocumentoPdf> {
    const membreteListo = this.branding.membrete(municipalidadId);
    const { jsPDF } = await import('jspdf');
    const autoTable = (await import('jspdf-autotable')).default as unknown as AutoTable;
    const doc = new jsPDF({ orientation: orientacion, unit: 'mm', format: 'a4' });
    const membrete = await membreteListo;
    const ahora = new Date();
    const pdf: DocumentoPdf = {
      doc, autoTable, titulo, institucion: membrete.institucion, codigo: codigoReporte(ahora), emitido: fechaHoraIso(ahora),
      secciones: 0, y: 0
    };
    doc.setProperties({ title: titulo, subject: pdf.codigo, author: membrete.generadoPor, creator: ReportConstants.PLATAFORMA });
    pdf.y = dibujarMembrete(doc, membrete, titulo, filtros, pdf.codigo, pdf.emitido);
    return pdf;
  }

  /** Fila de hasta 4 tarjetas sobrias: filete de color arriba, cifra, etiqueta y nota. */
  tarjetas(pdf: DocumentoPdf, items: TarjetaPdf[]): void {
    const { doc } = pdf;
    const gap = 4, alto = 20;
    const ancho = (doc.internal.pageSize.getWidth() - 2 * MARGEN_MM - gap * 3) / 4;
    items.slice(0, 4).forEach((t, i) => {
      const x = MARGEN_MM + i * (ancho + gap);
      doc.setFillColor(255, 255, 255).setDrawColor(...ReportConstants.BORDE_RGB).setLineWidth(0.25).rect(x, pdf.y, ancho, alto, 'FD');
      doc.setFillColor(...t.color).rect(x, pdf.y, ancho, 0.9, 'F');
      doc.setFont('helvetica', 'normal').setFontSize(6.8).setTextColor(...ReportConstants.TEXTO_SUAVE_RGB)
        .text(recortar(doc, t.etiqueta.replace(/_/g, ' ').toUpperCase(), ancho - 8), x + 4, pdf.y + 5.8);
      doc.setFont('helvetica', 'bold').setFontSize(typeof t.valor === 'number' ? 16 : 11).setTextColor(...ReportConstants.TEXTO_RGB)
        .text(recortar(doc, String(t.valor).replace(/_/g, ' '), ancho - 8), x + 4, pdf.y + 13);
      if (t.nota) {
        doc.setFont('helvetica', 'normal').setFontSize(6.5).setTextColor(...t.color).text(recortar(doc, t.nota, ancho - 8), x + 4, pdf.y + 17.3);
      }
    });
    pdf.y += alto + 9;
  }

  /** Título de sección numerado con filete; salta de página si no cabe con unas filas debajo. */
  seccion(pdf: DocumentoPdf, texto: string): void {
    const { doc } = pdf;
    if (pdf.y > doc.internal.pageSize.getHeight() - 45) {
      doc.addPage();
      pdf.y = ALTO_CABECERA_CONTINUA_MM + 10;
    }
    pdf.secciones++;
    const ancho = doc.internal.pageSize.getWidth();
    doc.setFont('helvetica', 'bold').setFontSize(10.5).setTextColor(...ReportConstants.HEADER_RGB)
      .text(`${pdf.secciones}.`, MARGEN_MM, pdf.y);
    doc.setTextColor(...ReportConstants.TEXTO_RGB).text(texto.toUpperCase(), MARGEN_MM + 6, pdf.y);
    doc.setDrawColor(...ReportConstants.BORDE_RGB).setLineWidth(0.3).line(MARGEN_MM, pdf.y + 2.2, ancho - MARGEN_MM, pdf.y + 2.2);
    doc.setFont('helvetica', 'normal');
    pdf.y += 7;
  }

  tabla(pdf: DocumentoPdf, reporte: Pick<ReporteTabla, 'columnas' | 'filas'>): void {
    const estados = new Set(reporte.columnas.flatMap((c, i) => (c.estado ? [i] : [])));
    // Columnas de estado: ancho mínimo para que la píldora quepa en una línea (no se parte ni entre páginas).
    pdf.doc.setFont('helvetica', 'bold').setFontSize(7);
    const anchoPildora = (i: number) => Math.max(reporte.columnas[i].ancho ?? 0,
      ...reporte.filas.map(f => pdf.doc.getTextWidth(String(f[i] ?? '')) + 12));
    const pildoras = new Map([...estados].map(i => [i, anchoPildora(i)]));
    // Si las píldoras empujan la tabla fuera de la página, se encogen en proporción las demás columnas fijas.
    const fijas = reporte.columnas.reduce((t, c, i) => t + (estados.has(i) ? 0 : c.ancho ?? 0), 0);
    const libre = pdf.doc.internal.pageSize.getWidth() - 2 * MARGEN_MM - [...pildoras.values()].reduce((a, b) => a + b, 0);
    const escala = fijas > libre ? libre / fijas : 1;
    const anchos = Object.fromEntries(reporte.columnas.map((c, i) => [i, estados.has(i)
      ? { cellWidth: pildoras.get(i)!, halign: 'center' as const }
      : c.ancho ? { cellWidth: c.ancho * escala } : {}]));
    const numerada = reporte.columnas[0]?.titulo === 'N.°';
    if (numerada) Object.assign(anchos[0], { halign: 'center', textColor: ReportConstants.TEXTO_SUAVE_RGB });
    const filas = reporte.filas.length
      ? reporte.filas.map(f => f.map(celda => (celda === null || celda === undefined || celda === '' ? '—' : String(celda))))
      : [[{ content: 'Sin registros para los criterios de consulta', colSpan: reporte.columnas.length,
            styles: { halign: 'center' as const, fontStyle: 'italic' as const, textColor: ReportConstants.TEXTO_SUAVE_RGB } }]];
    pdf.autoTable(pdf.doc, {
      startY: pdf.y,
      head: [reporte.columnas.map(c => c.titulo.toUpperCase())],
      body: filas,
      theme: 'plain',
      styles: {
        font: 'helvetica', fontSize: 7.8, cellPadding: { top: 2.4, bottom: 2.4, left: 2.6, right: 2.6 }, overflow: 'linebreak',
        valign: 'middle', textColor: ReportConstants.TEXTO_RGB
      },
      headStyles: { fillColor: ReportConstants.HEADER_RGB, textColor: 255, fontStyle: 'bold', fontSize: 7, cellPadding: 2.8 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: anchos,
      // Páginas siguientes: debajo de la cabecera continua (la cabecera de la tabla se repite) y sobre el pie.
      margin: { left: MARGEN_MM, right: MARGEN_MM, top: ALTO_CABECERA_CONTINUA_MM + 6, bottom: 20 },
      didParseCell: d => {
        if (d.section === 'body' && estados.has(d.column.index) && d.cell.raw !== '—') d.cell.styles.fontStyle = 'bold';
      },
      didDrawCell: d => {
        if (d.section === 'body') {
          // Separador fino entre filas en vez de rejilla completa.
          d.doc.setDrawColor(...ReportConstants.BORDE_RGB).setLineWidth(0.15)
            .line(d.cell.x, d.cell.y + d.cell.height, d.cell.x + d.cell.width, d.cell.y + d.cell.height);
          if (estados.has(d.column.index)) etiquetaEstado(d);
        }
      }
    });
    // Filete de cierre de la tabla en el color institucional.
    const fin = finalY(pdf.doc);
    pdf.doc.setDrawColor(...ReportConstants.HEADER_RGB).setLineWidth(0.5)
      .line(MARGEN_MM, fin, pdf.doc.internal.pageSize.getWidth() - MARGEN_MM, fin);
    pdf.y = fin + 9;
  }

  /** Nota centrada de fin de documento, con la leyenda de validez. */
  cierre(pdf: DocumentoPdf, texto: string): void {
    const { doc } = pdf;
    if (pdf.y > doc.internal.pageSize.getHeight() - 32) {
      doc.addPage();
      pdf.y = ALTO_CABECERA_CONTINUA_MM + 10;
    }
    const centro = doc.internal.pageSize.getWidth() / 2;
    doc.setFont('helvetica', 'bold').setFontSize(7.5).setTextColor(...ReportConstants.TEXTO_SUAVE_RGB)
      .text(`— ${texto} —`, centro, pdf.y, { align: 'center' });
    doc.setFont('helvetica', 'normal').setFontSize(6.8)
      .text('Documento generado automáticamente. Refleja la información registrada en el sistema a la fecha de emisión.',
        centro, pdf.y + 4.5, { align: 'center' });
    pdf.y += 10;
  }

  /** Cabecera continua (páginas 2+), pie con código y paginación, y descarga con el nombre estándar. */
  cerrar(pdf: DocumentoPdf, documento: string, placeholder?: string): Promise<void> {
    const { doc } = pdf;
    const total = doc.getNumberOfPages();
    const ancho = doc.internal.pageSize.getWidth(), alto = doc.internal.pageSize.getHeight();
    for (let p = 1; p <= total; p++) {
      doc.setPage(p);
      doc.setFillColor(...ReportConstants.HEADER_RGB).rect(0, 0, ancho, 2.5, 'F');
      if (p > 1) {
        doc.setFont('helvetica', 'bold').setFontSize(7.5).setTextColor(...ReportConstants.TEXTO_RGB)
          .text(recortar(doc, pdf.institucion, ancho / 2 - MARGEN_MM), MARGEN_MM, 9);
        doc.setFont('helvetica', 'normal').setTextColor(...ReportConstants.TEXTO_SUAVE_RGB)
          .text(recortar(doc, `${pdf.titulo} · ${pdf.codigo}`, ancho / 2 - MARGEN_MM), ancho - MARGEN_MM, 9, { align: 'right' });
        doc.setDrawColor(...ReportConstants.BORDE_RGB).setLineWidth(0.3).line(MARGEN_MM, 11.5, ancho - MARGEN_MM, 11.5);
      }
      doc.setDrawColor(...ReportConstants.HEADER_RGB).setLineWidth(0.4).line(MARGEN_MM, alto - 13, ancho - MARGEN_MM, alto - 13);
      doc.setFont('helvetica', 'normal').setFontSize(6.8).setTextColor(...ReportConstants.TEXTO_SUAVE_RGB);
      doc.text(`${ReportConstants.PLATAFORMA} · ${ReportConstants.PLATAFORMA_SUBTITULO}`, MARGEN_MM, alto - 9);
      doc.text(`${pdf.codigo} · Emitido ${pdf.emitido}`, MARGEN_MM, alto - 5.8);
      // Bajo el número de página: centrado se pisaba con la plataforma en hojas verticales.
      doc.text('Documento de uso interno — información confidencial', ancho - MARGEN_MM, alto - 5.8, { align: 'right' });
      doc.setFont('helvetica', 'bold').setFontSize(7.5).setTextColor(...ReportConstants.TEXTO_RGB)
        .text(ReportConstants.PIE.replace('{X}', String(p)).replace('{Y}', String(total)), ancho - MARGEN_MM, alto - 9, { align: 'right' });
    }
    return descargar(doc.output('blob'), nombreArchivoReporte(documento, 'pdf', placeholder), MIME.PDF);
  }
}

/**
 * Membrete de documento oficial: logo e institución, código del reporte, filete doble, título y
 * ficha de emisión (fecha, emisor y criterios de consulta). Devuelve dónde empieza el cuerpo.
 */
export function dibujarMembrete(doc: jsPDF, m: Membrete, titulo: string, filtros: FiltroReporte[],
                                codigo = codigoReporte(), emitido = fechaHoraIso(new Date())): number {
  const ancho = doc.internal.pageSize.getWidth();
  doc.setFillColor(...ReportConstants.HEADER_RGB).rect(0, 0, ancho, 2.5, 'F');
  if (m.logoDataUrl) {
    try {
      doc.addImage(m.logoDataUrl, 'PNG', MARGEN_MM, 8, 18, 18);
    } catch {
      try {
        doc.addImage(m.logoDataUrl, MARGEN_MM, 8, 18, 18);
      } catch (err) {
        console.warn('[dibujarMembrete] Error dibujando logo:', err);
      }
    }
  }

  const xTexto = MARGEN_MM + 23, anchoTexto = ancho - xTexto - MARGEN_MM - 50;
  doc.setFont('helvetica', 'bold').setFontSize(12.5).setTextColor(...ReportConstants.TEXTO_RGB)
    .text(recortar(doc, m.institucion, anchoTexto), xTexto, 15.5);
  doc.setFont('helvetica', 'normal').setFontSize(7.8).setTextColor(...ReportConstants.TEXTO_SUAVE_RGB)
    .text(recortar(doc, `${ReportConstants.PLATAFORMA} · ${ReportConstants.PLATAFORMA_SUBTITULO}`, anchoTexto), xTexto, 20.5);

  doc.setFont('helvetica', 'bold').setFontSize(6.5).setTextColor(...ReportConstants.HEADER_RGB)
    .text('REPORTE N.°', ancho - MARGEN_MM, 14, { align: 'right' });
  doc.setFontSize(9).setTextColor(...ReportConstants.TEXTO_RGB).text(codigo, ancho - MARGEN_MM, 19, { align: 'right' });

  // Filete doble: grueso institucional + fino gris.
  doc.setDrawColor(...ReportConstants.HEADER_RGB).setLineWidth(0.8).line(MARGEN_MM, 30, ancho - MARGEN_MM, 30);
  doc.setDrawColor(...ReportConstants.BORDE_RGB).setLineWidth(0.3).line(MARGEN_MM, 31.4, ancho - MARGEN_MM, 31.4);

  doc.setFont('helvetica', 'bold').setFontSize(16).setTextColor(...ReportConstants.TEXTO_RGB)
    .text(recortar(doc, titulo, ancho - 2 * MARGEN_MM), MARGEN_MM, 42);

  // Ficha de emisión: tres celdas con etiqueta y valor; la de criterios se extiende y parte en líneas.
  const y = 47, anchoUtil = ancho - 2 * MARGEN_MM;
  const criterios = filtros.filter(f => f.valor).map(f => `${f.etiqueta}: ${f.valor}`).join('  ·  ') || 'Sin filtros (todos los registros)';
  const celdas: [string, string, number][] = [
    ['FECHA DE EMISIÓN', emitido, 0.2], ['EMITIDO POR', m.generadoPor, 0.28], ['CRITERIOS DE CONSULTA', criterios, 0.52]
  ];
  doc.setFontSize(8.3);
  const lineasCriterios: string[] = doc.splitTextToSize(criterios, anchoUtil * 0.52 - 8);
  const alto = 9 + lineasCriterios.length * 3.8;
  doc.setFillColor(...ReportConstants.FILA_ALTERNA_RGB).setDrawColor(...ReportConstants.BORDE_RGB).setLineWidth(0.25)
    .rect(MARGEN_MM, y, anchoUtil, alto, 'FD');
  let x = MARGEN_MM;
  celdas.forEach(([etiqueta, valor, fraccion], i) => {
    const w = anchoUtil * fraccion;
    if (i > 0) doc.setDrawColor(...ReportConstants.BORDE_RGB).line(x, y + 2, x, y + alto - 2);
    doc.setFont('helvetica', 'bold').setFontSize(6.3).setTextColor(...ReportConstants.TEXTO_SUAVE_RGB).text(etiqueta, x + 4, y + 4.6);
    doc.setFont('helvetica', i === 2 ? 'normal' : 'bold').setFontSize(8.3).setTextColor(...ReportConstants.TEXTO_RGB)
      .text(i === 2 ? lineasCriterios : recortar(doc, valor, w - 8), x + 4, y + 8.8);
    x += w;
  });
  doc.setTextColor(...ReportConstants.TEXTO_RGB);
  return y + alto + 10;
}

/** Píldora de color sobre la celda ya dibujada (una línea; si el texto ocupa más, queda solo el texto en negrita). */
function etiquetaEstado(d: CellHookData): void {
  const texto = d.cell.text.join(' ').trim();
  if (!texto || texto === '—' || d.cell.text.length > 1) return;
  const tono: Tono = tonoEstado(texto);
  const doc = d.doc as jsPDF;
  doc.setFont('helvetica', 'bold').setFontSize(6.8);
  const etiqueta = texto.replace(/_/g, ' ');
  const w = Math.min(doc.getTextWidth(etiqueta) + 5, d.cell.width - 2), h = 4.4;
  const cx = d.cell.x + d.cell.width / 2, cy = d.cell.y + d.cell.height / 2;
  const fondoFila = Array.isArray(d.cell.styles.fillColor) ? d.cell.styles.fillColor as Rgb : [255, 255, 255] as Rgb;
  doc.setFillColor(...fondoFila).rect(d.cell.x + 0.3, d.cell.y + 0.3, d.cell.width - 0.6, d.cell.height - 0.6, 'F');
  doc.setFillColor(...tono.fondo).roundedRect(cx - w / 2, cy - h / 2, w, h, 1.2, 1.2, 'F');
  doc.setTextColor(...tono.texto).text(etiqueta, cx, cy, { align: 'center', baseline: 'middle' });
}

/** Una línea: si no cabe, corta con "...". */
function recortar(doc: jsPDF, texto: string, anchoMm: number): string {
  if (doc.getTextWidth(texto) <= anchoMm) return texto;
  let t = texto;
  while (t.length > 1 && doc.getTextWidth(t + '...') > anchoMm) t = t.slice(0, -1);
  return t.trimEnd() + '...';
}

function finalY(doc: jsPDF): number {
  return (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 40;
}
