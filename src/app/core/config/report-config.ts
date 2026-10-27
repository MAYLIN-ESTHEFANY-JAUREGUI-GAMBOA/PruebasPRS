/**
 * Variables de reporte (estándar AS241S6 §14). Se inyectan al compilar con `ng build --define`
 * (ver Dockerfile y .env.example); sin definir, se usan los valores de marca de Cañete Seguro.
 */
declare const NG_APP_REPORT_LOGO_URL: string | undefined;
declare const NG_APP_REPORT_HEADER_COLOR: string | undefined;
declare const NG_APP_REPORT_PDF_FOOTER: string | undefined;

const definida = (v: string | undefined): string => (typeof v === 'string' ? v.trim() : '');

export const REPORT_ENV = {
  /** Logo de la plataforma (SUPER_ADMIN o tenant sin logo). Vacío = escudo SVG embebido. */
  logoUrl: definida(typeof NG_APP_REPORT_LOGO_URL !== 'undefined' ? NG_APP_REPORT_LOGO_URL : undefined),
  headerColor: definida(typeof NG_APP_REPORT_HEADER_COLOR !== 'undefined' ? NG_APP_REPORT_HEADER_COLOR : undefined) || '#1E5BA1',
  pdfFooter: definida(typeof NG_APP_REPORT_PDF_FOOTER !== 'undefined' ? NG_APP_REPORT_PDF_FOOTER : undefined) || 'Página {X} de {Y}'
} as const;

/** '#1E5BA1' → [30, 91, 161]; color inválido = azul de marca. */
export function hexARgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [30, 91, 161];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
