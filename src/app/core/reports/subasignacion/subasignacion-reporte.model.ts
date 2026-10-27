import { fechaHoraIso } from '../../../shared/reports/report-format';
import { ReporteTabla } from '../../../shared/reports/report.model';

/**
 * Fila de reporte de subasignaciones (asignaciones de patrullaje).
 * Representa la información ya resuelta (nombres de recurso, entidad)
 * tal como se ve en la pantalla de asignaciones de patrullaje.
 * 
 * Incluye información de recursos y entidades destino.
 */
export interface SubasignacionReporteFila {
  // Identificador del recurso
  recurso: string;
  
  // Entidad destino de la asignación
  entidadDestino: string;
  
  // Turno asignado
  turno: string;
  
  // Estado de la asignación
  estado: string;
  
  // Fechas de vigencia
  inicio?: string | null;
  fin?: string | null;
  
  // Auditoría
  asignadoPor?: string | null;
  
  // Información adicional
  observaciones?: string | null;
}

/**
 * Filtros aplicados al reporte.
 */
export interface SubasignacionReporteFiltros { 
  estado: string; 
}

/**
 * Genera la configuración del reporte de asignaciones de patrullaje.
 * 
 * Según estándar oficial (estandar-reports/02-formatos/formatos-reporte.md):
 * 
 * PDF:
 * - Orientación landscape A4
 * - Encabezado: Banda REPORT_HEADER_COLOR con logo, institución, título, fecha ISO
 * - Cuerpo: autoTable tema striped, cabecera REPORT_HEADER_COLOR
 * - Pie: "Cañete Seguro · Sistema de Gestión de Seguridad Ciudadana" + REPORT_PDF_FOOTER
 * - Fechas: YYYY-MM-DD HH:mm
 * - Vacíos: "—"
 * - Nombre: Reporte_Asignaciones_Patrullaje_{YYYY-MM-DD}.pdf
 * 
 * XLSX:
 * - Motor: exceljs (actualmente usa SheetJS, pendiente migración)
 * - Hoja 1 "Asignaciones de Patrullaje": fila 1 negrita, texto blanco sobre REPORT_HEADER_COLOR, fija con autofiltro
 * - Hoja 2 "Resumen": institución, título, fecha, autor, total, filtros
 * - Fechas: YYYY-MM-DD HH:mm
 * - Vacíos: celda vacía
 * - Nombre: Reporte_Asignaciones_Patrullaje_{YYYY-MM-DD}.xlsx
 * 
 * @param filas - Array de subasignaciones con datos ya resueltos
 * @param filtros - Filtros aplicados (estado)
 * @returns Configuración del reporte
 * 
 * Fuente: GET /api/v1/subassignments (vg-ms-subasignacion)
 */
export function reporteSubasignaciones(filas: SubasignacionReporteFila[], filtros: SubasignacionReporteFiltros): ReporteTabla {
  return {
    titulo: 'Reporte de Asignaciones de Patrullaje',
    documento: 'Reporte_Asignaciones_Patrullaje',
    orientacion: 'landscape',
    hoja: 'Asignaciones de Patrullaje',
    filtros: [
      { etiqueta: 'Estado', valor: filtros.estado || '—' }
    ],
    columnas: [
      { titulo: 'N°', ancho: 9 },
      { titulo: 'Recurso', ancho: 28 },
      { titulo: 'Entidad Destino', ancho: 40 },
      { titulo: 'Turno', ancho: 20 },
      { titulo: 'Estado', ancho: 20, estado: true },
      { titulo: 'Fecha Inicio', ancho: 28 },
      { titulo: 'Fecha Fin', ancho: 28 },
      { titulo: 'Asignado Por', ancho: 30 },
      { titulo: 'Observaciones', ancho: 40 }
    ],
    filas: filas.map((f, i) => [
      i + 1,
      f.recurso || '—',
      f.entidadDestino || '—',
      f.turno || '—',
      f.estado || '—',
      fechaHoraIso(f.inicio),
      fechaHoraIso(f.fin),
      f.asignadoPor || '—',
      f.observaciones || '—'
    ])
  };
}
