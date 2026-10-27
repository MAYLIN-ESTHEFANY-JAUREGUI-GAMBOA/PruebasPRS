import { FlotaReporteFila, FlotaReporteFiltros, reporteFlota } from './flota-reporte';

const MOCK_FILAS: FlotaReporteFila[] = [
  {
    orderCode: 'ORD-2026-001',
    resourcePlate: 'EUA-402',
    maintenanceType: 'Correctivo Urgente',
    priority: 'ALTA',
    orderStatus: 'EN_TALLER',
    failureReason: 'Falla en el sistema de frenos ABS',
    reportedMileage: 85200,
    workshopName: 'Taller Central San Vicente',
    mechanicInCharge: 'Ing. Carlos Mendoza',
    estimatedCost: 1500,
    finalCost: '',
    createdAt: '2026-10-25 14:00'
  },
  {
    orderCode: 'ORD-2026-002',
    resourcePlate: 'POL-105',
    maintenanceType: 'Preventivo Programado',
    priority: 'MEDIA',
    orderStatus: 'FINALIZADA',
    failureReason: 'Mantenimiento de 50,000 km',
    reportedMileage: 50120,
    workshopName: 'Taller Municipal',
    mechanicInCharge: 'Téc. Luis Ramos',
    estimatedCost: 800,
    finalCost: 750,
    createdAt: '2026-10-24 09:30'
  }
];

const MOCK_FILTROS: FlotaReporteFiltros = {
  estado: 'TODOS',
  prioridad: 'TODAS',
  busqueda: ''
};

describe('flota-reporte model', () => {
  it('genera la estructura correcta de ReporteTabla', () => {
    const reporte = reporteFlota(MOCK_FILAS, MOCK_FILTROS);
    expect(reporte.titulo).toBe('Reporte de Mantenimiento de Flota Vehicular');
    expect(reporte.documento).toBe('Reporte_Mantenimiento_Flota');
    expect(reporte.orientacion).toBe('landscape');
    expect(reporte.hoja).toBe('Órdenes de Mantenimiento');
  });

  it('incluye los filtros configurados', () => {
    const reporte = reporteFlota(MOCK_FILAS, { estado: 'EN_TALLER', prioridad: 'ALTA', busqueda: 'EUA-402' });
    expect(reporte.filtros?.length).toBe(3);
    expect(reporte.filtros?.find(f => f.etiqueta === 'Estado')?.valor).toBe('EN_TALLER');
    expect(reporte.filtros?.find(f => f.etiqueta === 'Prioridad')?.valor).toBe('ALTA');
    expect(reporte.filtros?.find(f => f.etiqueta === 'Búsqueda')?.valor).toBe('EUA-402');
  });

  it('define las columnas requeridas con columna estado habilitada', () => {
    const reporte = reporteFlota(MOCK_FILAS, MOCK_FILTROS);
    expect(reporte.columnas.length).toBe(11);
    const colEstado = reporte.columnas.find(c => c.titulo === 'Estado');
    expect(colEstado?.estado).toBeTrue();
  });

  it('mapea correctamente las filas formateando costos y campos vacíos', () => {
    const reporte = reporteFlota(MOCK_FILAS, MOCK_FILTROS);
    expect(reporte.filas.length).toBe(2);

    // Fila 1: Costo estimado
    const fila1 = reporte.filas[0];
    expect(fila1[0]).toBe('ORD-2026-001');
    expect(fila1[1]).toBe('EUA-402');
    expect(fila1[4]).toBe('EN_TALLER');
    expect(fila1[9]).toBe('Est. S/. 1500');

    // Fila 2: Costo final facturado
    const fila2 = reporte.filas[1];
    expect(fila2[0]).toBe('ORD-2026-002');
    expect(fila2[9]).toBe('S/. 750');
  });

  it('maneja filas con valores nulos o vacíos usando guiones', () => {
    const filaVacia: FlotaReporteFila = {
      orderCode: '',
      resourcePlate: '',
      maintenanceType: '',
      priority: '',
      orderStatus: '',
      failureReason: '',
      reportedMileage: '',
      workshopName: '',
      mechanicInCharge: '',
      estimatedCost: '',
      finalCost: '',
      createdAt: ''
    };
    const reporte = reporteFlota([filaVacia], MOCK_FILTROS);
    expect(reporte.filas[0][0]).toBe('—');
    expect(reporte.filas[0][1]).toBe('—');
    expect(reporte.filas[0][9]).toBe('—');
  });
});
