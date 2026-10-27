/** Fecha local en ISO-8601 (YYYY-MM-DD), placeholder {YYYY-MM-DD}. */
export function hoyIso(fecha = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${fecha.getFullYear()}-${p(fecha.getMonth() + 1)}-${p(fecha.getDate())}`;
}

/**
 * Patrón único de archivos del proyecto (§6.4): `Nombre_Documento_{Placeholder}.ext`.
 * Ej.: `Reporte_Recursos_Operativos_2026-10-21.pdf`, `Reporte_Incidente_INC-2026-AB12C.xlsx`.
 */
export function nombreArchivoReporte(documento: string, ext: 'pdf' | 'xlsx' | 'csv', placeholder = hoyIso()): string {
  const limpio = (t: string) => t.trim().replace(/[^\p{L}\p{N}-]+/gu, '_').replace(/^_+|_+$/g, '');
  return `${limpio(documento)}_${limpio(placeholder) || hoyIso()}.${ext}`;
}

/** Fecha y hora local en ISO-8601 sin segundos (YYYY-MM-DD HH:mm); '—' si no hay fecha válida. */
export function fechaHoraIso(valor: string | number | Date | null | undefined): string {
  if (valor === null || valor === undefined || valor === '') return '—';
  const d = new Date(valor);
  if (isNaN(d.getTime())) return '—';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${hoyIso(d)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Código único del documento emitido: `REP-YYYYMMDD-HHmmss` (hora local). */
export function codigoReporte(fecha = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `REP-${hoyIso(fecha).replace(/-/g, '')}-${p(fecha.getHours())}${p(fecha.getMinutes())}${p(fecha.getSeconds())}`;
}
