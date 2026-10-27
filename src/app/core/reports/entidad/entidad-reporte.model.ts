import { fechaHoraIso } from '../../../shared/reports/report-format';
import { ReporteTabla } from '../../../shared/reports/report.model';

/**
 * Fila de reporte de entidades.
 * Representa la información de las entidades operativas registradas en el sistema.
 * 
 * Incluye información básica, contacto, ubicación y estado operativo.
 */
export interface EntidadReporteFila {
  // Identificación
  ruc: string;
  razonSocial: string;
  tipoEntidad: string;
  
  // Estado
  estado: string;
  
  // Contacto
  telefono?: string | null;
  email?: string | null;
  direccion?: string | null;
  
  // Ubicación administrativa
  distrito?: string | null;
  provincia?: string | null;
  departamento?: string | null;
  
  // Municipalidad
  municipalidad?: string | null;
  
  // Auditoría
  fechaRegistro?: string | null;
}

/**
 * Filtros aplicados al reporte.
 */
export interface EntidadReporteFiltros { 
  estado: string;
  tipoEntidad: string;
}

/**
 * Genera la configuración del reporte de entidades.
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
 * - Nombre: Reporte_Entidades_{YYYY-MM-DD}.pdf
 * 
 * XLSX:
 * - Motor: exceljs (actualmente usa SheetJS, pendiente migración)
 * - Hoja 1 "Entidades": fila 1 negrita, texto blanco sobre REPORT_HEADER_COLOR, fija con autofiltro
 * - Hoja 2 "Resumen": institución, título, fecha, autor, total, filtros
 * - Fechas: YYYY-MM-DD HH:mm
 * - Vacíos: celda vacía
 * - Nombre: Reporte_Entidades_{YYYY-MM-DD}.xlsx
 * 
 * @param filas - Array de entidades con datos ya resueltos
 * @param filtros - Filtros aplicados (estado, tipoEntidad)
 * @returns Configuración del reporte
 * 
 * Fuente: GET /api/entities (vg-ms-entidad)
 */
export function reporteEntidades(filas: EntidadReporteFila[], filtros: EntidadReporteFiltros): ReporteTabla {
  return {
    titulo: 'Reporte de Entidades Operativas',
    documento: 'Reporte_Entidades',
    orientacion: 'landscape',
    hoja: 'Entidades',
    filtros: [
      { etiqueta: 'Estado', valor: filtros.estado || '—' },
      { etiqueta: 'Tipo de Entidad', valor: filtros.tipoEntidad || '—' }
    ],
    columnas: [
      { titulo: 'N°', ancho: 9 },
      { titulo: 'RUC', ancho: 22 },
      { titulo: 'Razón Social', ancho: 40 },
      { titulo: 'Tipo', ancho: 25 },
      { titulo: 'Estado', ancho: 18, estado: true },
      { titulo: 'Teléfono', ancho: 22 },
      { titulo: 'Email', ancho: 35 },
      { titulo: 'Dirección', ancho: 45 },
      { titulo: 'Distrito', ancho: 28 },
      { titulo: 'Municipalidad', ancho: 35 },
      { titulo: 'Fecha Registro', ancho: 28 }
    ],
    filas: filas.map((f, i) => [
      i + 1,
      f.ruc || '—',
      f.razonSocial || '—',
      f.tipoEntidad || '—',
      f.estado || '—',
      f.telefono || '—',
      f.email || '—',
      f.direccion || '—',
      f.distrito || '—',
      f.municipalidad || '—',
      fechaHoraIso(f.fechaRegistro)
    ])
  };
}
