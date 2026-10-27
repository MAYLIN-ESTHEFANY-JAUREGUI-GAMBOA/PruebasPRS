import { ReporteTabla } from '../../../shared/reports/report.model';

/**
 * Fila de reporte de recursos operativos.
 * Representa la información ya resuelta (nombres de catálogo, entidad, zona)
 * tal como se ve en la pantalla de recursos operativos.
 * 
 * Incluye campos del modelo híbrido (catálogo + operativo).
 */
export interface RecursoReporteFila {
  // Identificación
  identificador: string;
  
  // Responsable
  encargado: string;
  
  // Datos del catálogo
  recurso: string;
  categoria: string;
  tipo: string;
  
  // Entidad propietaria
  entidad: string;
  
  // Ubicación operativa
  zona?: string | null;
  codigoZona?: string | null;
  distrito?: string | null;
  
  // Estados
  estado: string;
  subestado: string;
}

/**
 * Filtros aplicados al reporte.
 */
export interface RecursoReporteFiltros { 
  estado: string; 
  busqueda: string; 
}

/**
 * Genera la configuración del reporte de recursos operativos.
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
 * - Nombre: Reporte_Recursos_Operativos_{YYYY-MM-DD}.pdf
 * 
 * XLSX:
 * - Motor: exceljs (actualmente usa SheetJS, pendiente migración)
 * - Hoja 1 "Recursos Operativos": fila 1 negrita, texto blanco sobre REPORT_HEADER_COLOR, fija con autofiltro
 * - Hoja 2 "Resumen": institución, título, fecha, autor, total, filtros
 * - Fechas: YYYY-MM-DD HH:mm
 * - Vacíos: celda vacía
 * - Nombre: Reporte_Recursos_Operativos_{YYYY-MM-DD}.xlsx
 * 
 * @param filas - Array de recursos con datos ya resueltos
 * @param filtros - Filtros aplicados (estado y búsqueda)
 * @returns Configuración del reporte
 * 
 * Fuente: GET /api/v1/resources (vg-ms-recursos, alcance por tenant)
 */
export function reporteRecursos(filas: RecursoReporteFila[], filtros: RecursoReporteFiltros): ReporteTabla {
  return {
    titulo: 'Reporte de Recursos Operativos',
    documento: 'Reporte_Recursos_Operativos',
    orientacion: 'landscape',
    hoja: 'Recursos Operativos',
    filtros: [
      { etiqueta: 'Estado', valor: filtros.estado }, 
      { etiqueta: 'Búsqueda', valor: filtros.busqueda || '—' }
    ],
    columnas: [
      { titulo: 'Identificador', ancho: 24 },
      { titulo: 'Encargado', ancho: 32 },
      { titulo: 'Recurso', ancho: 30 },
      { titulo: 'Categoría', ancho: 22 },
      { titulo: 'Tipo', ancho: 22 },
      { titulo: 'Entidad', ancho: 34 },
      { titulo: 'Zona', ancho: 26 },
      { titulo: 'Código Zona', ancho: 20 },
      { titulo: 'Distrito', ancho: 24 },
      { titulo: 'Estado', ancho: 22, estado: true },
      { titulo: 'Subestado', ancho: 28 }
    ],
    filas: filas.map(f => [
      f.identificador || '—',
      f.encargado || '—',
      f.recurso || '—',
      f.categoria || '—',
      f.tipo || '—',
      f.entidad || '—',
      f.zona ?? '—',
      f.codigoZona ?? '—',
      f.distrito ?? '—',
      f.estado || '—',
      f.subestado || '—'
    ])
  };
}
