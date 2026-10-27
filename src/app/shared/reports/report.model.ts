/** Encabezado institucional resuelto para quien genera el reporte. */
export interface Membrete {
  institucion: string;
  /** PNG/JPEG en data-URI, listo para jsPDF. */
  logoDataUrl: string;
  generadoPor: string;
}

export interface FiltroReporte { etiqueta: string; valor: string; }

export interface ColumnaReporte {
  titulo: string;
  /** Ancho en mm (PDF); en Excel se usa como caracteres aproximados. */
  ancho?: number;
  /** Columna de estado: se pinta como etiqueta de color y se resume en tarjetas (PDF) y en el Resumen (Excel). */
  estado?: boolean;
}

export type CeldaReporte = string | number | null | undefined;

/** Reporte tabular: lo que se ve en pantalla (filtros incluidos) es lo que se exporta. */
export interface ReporteTabla {
  titulo: string;
  /** Prefijo del nombre de archivo, p. ej. 'Reporte_Recursos_Operativos'. */
  documento: string;
  /** Placeholder del nombre (§6.4): fecha ISO por defecto, o un código. */
  placeholder?: string;
  filtros?: FiltroReporte[];
  columnas: ColumnaReporte[];
  filas: CeldaReporte[][];
  orientacion?: 'portrait' | 'landscape';
  /** Nombre de la hoja de detalle en Excel. */
  hoja?: string;
}
