import { TestBed } from '@angular/core/testing';

import { ReportBrandingService } from './report-branding.service';
import { fechaHoraIso, hoyIso, nombreArchivoReporte } from './report-format';
import { ReportPdfService } from './report-pdf.service';
import { ReportExcelService } from './report-excel.service';
import { ReportConstants } from './report.constants';
import { rgbAArgb, tonoEstado } from './report-estilo';
import { hexARgb } from '../../core/config/report-config';
import { reporteRecursos } from '../../core/reports/recurso/recurso-reporte.model';
import { reporteUsuarios } from '../../core/reports/usuario/usuario-reporte.model';

// PNG 1x1 transparente.
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

describe('Nombres de archivo (§6.4)', () => {
  it('Nombre_Documento_{YYYY-MM-DD}.ext con la fecha local', () => {
    expect(hoyIso(new Date(2026, 9, 5))).toBe('2026-10-05');
    expect(nombreArchivoReporte('Reporte_Recursos_Operativos', 'pdf', '2026-10-21')).toBe('Reporte_Recursos_Operativos_2026-10-21.pdf');
  });

  it('{Codigo}: limpia espacios y símbolos sin romper guiones', () => {
    expect(nombreArchivoReporte('Reporte_Incidente', 'xlsx', 'INC-2026-AB12C')).toBe('Reporte_Incidente_INC-2026-AB12C.xlsx');
    expect(nombreArchivoReporte('Reporte Catálogos SALUD', 'pdf', 'a/b c')).toBe('Reporte_Catálogos_SALUD_a_b_c.pdf');
  });

  it('fechaHoraIso: ISO sin segundos y — si no hay fecha', () => {
    expect(fechaHoraIso(new Date(2026, 0, 2, 3, 4))).toBe('2026-01-02 03:04');
    expect(fechaHoraIso(null)).toBe('—');
    expect(fechaHoraIso('no-fecha')).toBe('—');
  });
});

describe('ReportPdfService (estructura)', () => {
  let service: ReportPdfService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [{ provide: ReportBrandingService, useValue: {
        membrete: () => Promise.resolve({ institucion: 'Municipalidad Provincial de Cañete', logoDataUrl: PNG, generadoPor: 'Analista' })
      } }]
    });
    service = TestBed.inject(ReportPdfService);
  });

  it('membrete del tenant, filtros, tabla y paginación', async () => {
    const pdf = await service.abrir('Reporte de Prueba', [{ etiqueta: 'Estado', valor: 'ACTIVO' }]);
    service.tabla(pdf, {
      columnas: [{ titulo: 'Código' }, { titulo: 'Estado' }],
      filas: Array.from({ length: 120 }, (_, i) => [`C-${i}`, null])
    });
    const contenido = pdf.doc.output();

    expect(contenido).toContain('Municipalidad Provincial de Ca');
    expect(contenido).toContain('Reporte de Prueba');
    expect(contenido).toContain('Estado: ACTIVO');
    expect(contenido).toMatch(/REP-\d{8}-\d{6}/);
    expect(contenido).toContain('C-119');
    expect(pdf.doc.getNumberOfPages()).toBeGreaterThan(1);
  });
});

describe('ReportExcelService (estructura)', () => {
  it('detalle con cabecera en negrita sobre el color institucional, autofiltro y Resumen con membrete', async () => {
    TestBed.configureTestingModule({});
    const service = TestBed.inject(ReportExcelService);
    const membrete = { institucion: 'Municipalidad Provincial de Cañete', logoDataUrl: PNG, generadoPor: 'Analista' };
    const wb = await service.construir('Reporte de Prueba', [{ etiqueta: 'Estado', valor: 'ACTIVO' }],
      [{ nombre: 'Detalle', columnas: ['Código', 'Estado'], filas: [['C-1', 'ACTIVO'], ['C-2', null]] }], membrete, 2);

    // Ida y vuelta por el binario: lo que se descarga es lo que se verifica.
    const ExcelJS = (await import('exceljs')).default;
    const leido = new ExcelJS.Workbook();
    await leido.xlsx.load(await wb.xlsx.writeBuffer());

    const detalle = leido.getWorksheet('Detalle')!;
    expect(detalle.rowCount).toBe(3);
    expect(detalle.getCell('A1').value).toBe('Código');
    expect(detalle.getCell('A1').font?.bold).toBeTrue();
    expect((detalle.getCell('B1').fill as { fgColor?: { argb?: string } }).fgColor?.argb).toBe('FF' + ReportConstants.HEADER_HEX.slice(1));
    expect(detalle.getCell('B3').value).toBe('');

    const resumen = leido.getWorksheet('Resumen')!;
    expect(resumen.getCell('A1').value).toBe('Municipalidad Provincial de Cañete');
    // Etiqueta (A) y valor (B; B:C combinadas).
    const filas = resumen.getSheetValues().map(f => (Array.isArray(f) ? f.slice(1, 3).join('|') : ''));
    expect(filas).toContain('Total de registros|2');
    expect(filas).toContain('Estado|ACTIVO');
  });

  it('columnas de estado: celda con tono semántico y distribución en Resumen', async () => {
    TestBed.configureTestingModule({});
    const membrete = { institucion: 'Muni', logoDataUrl: PNG, generadoPor: 'Analista' };
    const wb = await TestBed.inject(ReportExcelService).construir('R', [],
      [{ nombre: 'Detalle', columnas: ['Código', 'Estado'], filas: [['C-1', 'Inactivo'], ['C-2', 'Activo'], ['C-3', 'Activo']], estados: [1] }], membrete, 3);
    expect((wb.getWorksheet('Detalle')!.getCell('B2').fill as { fgColor?: { argb?: string } }).fgColor?.argb).toBe(rgbAArgb(tonoEstado('Inactivo').fondo));
    const filas = wb.getWorksheet('Resumen')!.getSheetValues().map(f => (Array.isArray(f) ? f.slice(1, 3).join('|') : ''));
    expect(filas).toContain('Activo|2');
    expect(filas).toContain('Inactivo|1');
  });
});

describe('tonoEstado', () => {
  it('palabra clave sin tildes; desbloqueo e inactivo antes que bloqueo y activo', () => {
    expect(tonoEstado('Desbloqueado')).toEqual(tonoEstado('Disponible'));
    expect(tonoEstado('INACTIVO')).toEqual(tonoEstado('Bloqueado'));
    expect(tonoEstado('En atención')).toEqual(tonoEstado('Pendiente'));
    expect(tonoEstado('Activo')).not.toEqual(tonoEstado('Inactivo'));
    expect(tonoEstado(null)).toEqual(tonoEstado('xyz'));
  });
});

describe('Contrato de datos', () => {
  it('reporteRecursos: mismas filas y filtros que la pantalla, columnas fijas', () => {
    const r = reporteRecursos([
      { identificador: 'R-1', encargado: 'Ana', recurso: 'Moto', categoria: 'SEGURIDAD', tipo: 'VEHICULO', entidad: 'Serenazgo',
        zona: null, distrito: 'San Vicente', estado: 'Disponible', subestado: 'En base' }
    ], { estado: 'Disponible', busqueda: 'moto' });
    expect(r.filas.length).toBe(1);
    expect(r.filas[0].length).toBe(r.columnas.length);
    expect(r.filtros).toEqual([{ etiqueta: 'Estado', valor: 'Disponible' }, { etiqueta: 'Búsqueda', valor: 'moto' }]);
  });

  it('reporteUsuarios: rol y entidad solo para personal; ciudadanos sin rol', () => {
    const fila = { nombre: 'Ana Peña', dni: '01111111', rol: 'Operador', estado: 'ACTIVO' };
    const ciud = reporteUsuarios('ciudadanos', [fila], { estado: 'Todos', busqueda: '' });
    expect(ciud.columnas.map(c => c.titulo)).not.toContain('Rol');
    expect(ciud.filas[0].length).toBe(ciud.columnas.length);
    const ent = reporteUsuarios('entidad', [fila], { estado: 'Activos', busqueda: '' }, 'Serenazgo Cañete');
    expect(ent.filas[0][2]).toBe('Operador');
    expect(ent.filas[0].length).toBe(ent.columnas.length);
    expect(ent.filtros![0]).toEqual({ etiqueta: 'Entidad', valor: 'Serenazgo Cañete' });
    expect(reporteUsuarios('municipal', [fila], { estado: 'Todos', busqueda: '' }).titulo).toBe('Reporte de Personal Municipal');
  });

  it('REPORT_HEADER_COLOR: hex a RGB, inválido = azul de marca', () => {
    expect(hexARgb('#2980B9')).toEqual([41, 128, 185]);
    expect(hexARgb('rojo')).toEqual([30, 91, 161]);
  });
});
