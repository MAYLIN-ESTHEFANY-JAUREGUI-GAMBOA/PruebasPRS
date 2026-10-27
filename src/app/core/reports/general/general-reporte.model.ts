import { ReporteTabla } from '../../../shared/reports/report.model';

/** Un indicador del consolidado: módulo, qué se cuenta y cuántos hay. */
export interface IndicadorGeneral { modulo: string; indicador: string; total: number; }

/** Código guardado a texto legible: `PENDIENTE_APROBACION` -> `Pendiente aprobacion`. */
function legible(codigo: string): string {
  const t = codigo.replace(/_/g, ' ').toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Cuenta los valores de un campo (estado, acción...) en filas `Indicador: valor`. */
export function conteoPor<T>(modulo: string, items: T[], campo: (i: T) => string | null | undefined): IndicadorGeneral[] {
  const conteo = new Map<string, number>();
  items.forEach(i => { const k = campo(i) ? legible(campo(i)!) : 'Sin dato'; conteo.set(k, (conteo.get(k) ?? 0) + 1); });
  return [...conteo].sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ modulo, indicador: `Estado: ${k}`, total: n }));
}

/** Reporte general de PRS: totales de todos los módulos. `alcance` = todo PRS (SUPER_ADMIN) o una municipalidad. */
export function reporteGeneral(indicadores: IndicadorGeneral[], alcance: string): ReporteTabla {
  return {
    titulo: 'Reporte General de PRS',
    documento: 'Reporte_General_PRS',
    hoja: 'Consolidado',
    orientacion: 'portrait',
    filtros: [{ etiqueta: 'Alcance', valor: alcance }],
    columnas: [{ titulo: 'Módulo', ancho: 40 }, { titulo: 'Indicador' }, { titulo: 'Cantidad', ancho: 26 }],
    filas: indicadores.map(i => [i.modulo, i.indicador, i.total])
  };
}
