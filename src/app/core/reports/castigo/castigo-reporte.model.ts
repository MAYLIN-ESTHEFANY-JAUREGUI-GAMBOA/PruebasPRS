import { fechaHoraIso } from '../../../shared/reports/report-format';
import { FiltroReporte, ReporteTabla } from '../../../shared/reports/report.model';

/** Contiene PII (DNI): solo roles con permiso de exportar (PermissionConstants.REPORTS_EXPORT). */
export interface SancionadoReporteFila { dni: string; nombre: string; nivel: number; motivo: string; acceso: string; }

export interface AuditoriaReporteFila {
  fecha?: string | null;
  ciudadano: string;
  dni: string;
  accion: string;
  nivelAnterior: number;
  nivelNuevo: number;
  motivo?: string | null;
}

/** Fuente: GET /api/auth/admin/users + penalties (vg-ms-auth). */
export function reporteSancionados(filas: SancionadoReporteFila[], filtros: FiltroReporte[]): ReporteTabla {
  return {
    titulo: 'Reporte de Ciudadanos Sancionados', documento: 'Reporte_Ciudadanos_Sancionados', hoja: 'Sancionados', filtros,
    columnas: [{ titulo: 'DNI', ancho: 22 }, { titulo: 'Nombre completo', ancho: 50 }, { titulo: 'Nivel', ancho: 16 },
      { titulo: 'Último motivo' }, { titulo: 'Acceso', ancho: 22, estado: true }],
    filas: filas.map(f => [f.dni, f.nombre, f.nivel, f.motivo, f.acceso])
  };
}

/** Fuente: GET /api/auth/admin/penalties/history (vg-ms-auth). */
export function reporteAuditoria(filas: AuditoriaReporteFila[], filtros: FiltroReporte[]): ReporteTabla {
  return {
    titulo: 'Registro de Auditoría de Moderación', documento: 'Reporte_Auditoria_Moderacion', hoja: 'Auditoría', filtros,
    orientacion: 'landscape',
    columnas: [{ titulo: 'Fecha', ancho: 32 }, { titulo: 'Ciudadano', ancho: 50 }, { titulo: 'DNI', ancho: 22 },
      { titulo: 'Acción', ancho: 26, estado: true }, { titulo: 'Nivel anterior', ancho: 24 }, { titulo: 'Nivel nuevo', ancho: 24 }, { titulo: 'Motivo' }],
    filas: filas.map(f => [fechaHoraIso(f.fecha), f.ciudadano, f.dni, f.accion, f.nivelAnterior, f.nivelNuevo, f.motivo])
  };
}
