import { ReporteTabla } from '../../../shared/reports/report.model';

export interface FlotaReporteFila {
  orderCode: string;
  resourcePlate: string;
  maintenanceType: string;
  priority: string;
  orderStatus: string;
  failureReason: string;
  reportedMileage: number | string;
  workshopName: string;
  mechanicInCharge: string;
  estimatedCost: number | string;
  finalCost: number | string;
  createdAt: string;
}

export interface FlotaReporteFiltros {
  estado: string;
  prioridad: string;
  busqueda: string;
}

export function reporteFlota(filas: FlotaReporteFila[], filtros: FlotaReporteFiltros): ReporteTabla {
  return {
    titulo: 'Reporte de Mantenimiento de Flota Vehicular',
    documento: 'Reporte_Mantenimiento_Flota',
    orientacion: 'landscape',
    hoja: 'Órdenes de Mantenimiento',
    filtros: [
      { etiqueta: 'Estado', valor: filtros.estado },
      { etiqueta: 'Prioridad', valor: filtros.prioridad },
      { etiqueta: 'Búsqueda', valor: filtros.busqueda || '—' }
    ],
    columnas: [
      { titulo: 'Código Orden', ancho: 26 },
      { titulo: 'Placa', ancho: 20 },
      { titulo: 'Tipo', ancho: 22 },
      { titulo: 'Prioridad', ancho: 18 },
      { titulo: 'Estado', ancho: 24, estado: true },
      { titulo: 'Motivo / Avería', ancho: 45 },
      { titulo: 'Km Inicial', ancho: 18 },
      { titulo: 'Taller Asignado', ancho: 32 },
      { titulo: 'Mecánico Responsable', ancho: 28 },
      { titulo: 'Costo Final', ancho: 20 },
      { titulo: 'Fecha Registro', ancho: 25 }
    ],
    filas: filas.map(f => [
      f.orderCode || '—',
      f.resourcePlate || '—',
      f.maintenanceType || '—',
      f.priority || '—',
      f.orderStatus || '—',
      f.failureReason || '—',
      f.reportedMileage !== null && f.reportedMileage !== undefined ? String(f.reportedMileage) : '—',
      f.workshopName || '—',
      f.mechanicInCharge || '—',
      f.finalCost ? `S/. ${f.finalCost}` : (f.estimatedCost ? `Est. S/. ${f.estimatedCost}` : '—'),
      f.createdAt || '—'
    ])
  };
}
