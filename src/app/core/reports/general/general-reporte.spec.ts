import { conteoPor, reporteGeneral } from './general-reporte.model';

describe('general-reporte', () => {
  it('conteoPor: agrupa por valor, mayor primero, vacío como Sin dato', () => {
    const filas = conteoPor('Usuarios', [{ e: 'PENDIENTE_APROBACION' }, { e: 'PENDIENTE_APROBACION' }, { e: '' }], x => x.e);
    expect(filas).toEqual([
      { modulo: 'Usuarios', indicador: 'Estado: Pendiente aprobacion', total: 2 },
      { modulo: 'Usuarios', indicador: 'Estado: Sin dato', total: 1 }
    ]);
  });

  it('reporteGeneral: una fila por indicador con nombre de archivo estándar', () => {
    const r = reporteGeneral([{ modulo: 'Castigos', indicador: 'Movimientos registrados', total: 4 }], 'Municipalidad de Imperial');
    expect(r.documento).toBe('Reporte_General_PRS');
    expect(r.filtros).toEqual([{ etiqueta: 'Alcance', valor: 'Municipalidad de Imperial' }]);
    expect(r.filas).toEqual([['Castigos', 'Movimientos registrados', 4]]);
  });
});
