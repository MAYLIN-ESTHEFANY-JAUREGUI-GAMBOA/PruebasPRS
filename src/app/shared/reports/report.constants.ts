import { ROLES } from '../../core/auth/auth.service';
import { REPORT_ENV, hexARgb } from '../../core/config/report-config';

const HEADER_RGB = hexARgb(REPORT_ENV.headerColor);
const HEADER_HEX = '#' + HEADER_RGB.map(c => c.toString(16).padStart(2, '0')).join('').toUpperCase();

/** Plantilla única de todos los reportes del proyecto (estándar AS241S6 §14, §16 patrón B). */
export const ReportConstants = {
  PLATAFORMA: 'Cañete Seguro',
  PLATAFORMA_SUBTITULO: 'Sistema de Gestión de Seguridad Ciudadana',
  /** REPORT_HEADER_COLOR (por defecto el azul de marca, --sb-primary del layout). */
  HEADER_RGB,
  HEADER_HEX,
  FILA_ALTERNA_RGB: [238, 243, 250] as [number, number, number],
  TEXTO_SUAVE_RGB: [100, 116, 139] as [number, number, number],
  TEXTO_RGB: [30, 41, 59] as [number, number, number],
  BORDE_RGB: [214, 222, 233] as [number, number, number],
  /** REPORT_PDF_FOOTER, con {X} = página actual y {Y} = total. */
  PIE: REPORT_ENV.pdfFooter,
  LOCALE: 'es-PE',
  /** REPORT_LOGO_URL: logo de la plataforma; vacío = escudo del sidebar sobre el color de cabecera. */
  LOGO_PLATAFORMA_URL: REPORT_ENV.logoUrl,
  LOGO_PLATAFORMA_SVG:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" rx="8" fill="${HEADER_HEX}"/>` +
    '<path transform="translate(12 12)" fill="#fff" d="M12 2L4 5v6.09c0 5.05 3.41 9.76 8 10.91 4.59-1.15 8-5.86 8-10.91V5l-8-3z"/></svg>'
} as const;

/** Ver listados lo puede todo el personal; exportar (PDF/XLSX/impresión) solo estos roles (§13 reports:export). */
export const PermissionConstants = {
  REPORTS_EXPORT: [ROLES.SUPER_ADMIN, ROLES.MUNICIPALIDAD_ADMIN, ROLES.ENTIDAD_ADMIN, ROLES.OPERADOR_ENTIDAD, ROLES.ANALISTA] as string[]
} as const;
