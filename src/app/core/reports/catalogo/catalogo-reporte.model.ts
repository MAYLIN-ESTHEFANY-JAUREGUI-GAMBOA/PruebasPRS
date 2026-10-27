import { Catalogo } from '../../models/catalogo.model';
import { fechaHoraIso } from '../../../shared/reports/report-format';
import { ReporteTabla } from '../../../shared/reports/report.model';

export interface CatalogoReporteFiltros { categoria: string; estado: string; busqueda: string; }

/** Fuente: GET /api/catalogs (vg-ms-catalogo). Un reporte por categoría (tab activa). */
export function reporteCatalogos(catalogos: Catalogo[], filtros: CatalogoReporteFiltros): ReporteTabla {
  return {
    titulo: `Reporte de Catálogos — ${filtros.categoria}`,
    documento: `Reporte_Catalogos_${filtros.categoria}`,
    hoja: 'Catálogos',
    filtros: [
      { etiqueta: 'Categoría', valor: filtros.categoria }, { etiqueta: 'Estado', valor: filtros.estado },
      { etiqueta: 'Búsqueda', valor: filtros.busqueda }
    ],
    columnas: [
      { titulo: 'Grupo', ancho: 30 }, { titulo: 'Clave', ancho: 34 }, { titulo: 'Etiqueta', ancho: 46 },
      { titulo: 'Tipo de recurso', ancho: 30 }, { titulo: 'Estado', ancho: 20, estado: true }, { titulo: 'Creado' }
    ],
    filas: catalogos.map(c => [c.group, c.key, c.displayLabel, c.resourceType, c.status, fechaHoraIso(c.createdAt)])
  };
}
