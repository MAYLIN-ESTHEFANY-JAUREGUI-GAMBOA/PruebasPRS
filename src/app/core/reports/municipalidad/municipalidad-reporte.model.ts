import { HojaReporte } from '../../../shared/reports/report-excel.service';
import { ReporteTabla } from '../../../shared/reports/report.model';

/** Municipalidad ya formateada por la página (jurisdicción en nombres, no códigos UBIGEO). */
export interface MunicipalidadReporteFila {
  nombre: string;
  ruc: string;
  tipo: string;
  jurisdiccion: string;
  telefono?: string | null;
  email?: string | null;
  direccion?: string | null;
  entidades: number;
  estado: string;
}

export interface EntidadReporteFila {
  municipalidad: string;
  nombre: string;
  ruc: string;
  tipo: string;
  distrito: string;
  estado: string;
}

export interface MunicipalidadReporteFiltros { estado: string; busqueda: string; }

const COLUMNAS_ENTIDAD = ['Entidad', 'RUC', 'Tipo', 'Distrito', 'Estado'];

/** Padrón: lo que se ve en la lista (filtro y búsqueda incluidos). Solo SUPER_ADMIN. */
export function reportePadronMunicipalidades(filas: MunicipalidadReporteFila[], filtros: MunicipalidadReporteFiltros): ReporteTabla {
  return {
    titulo: 'Padrón de Municipalidades',
    documento: 'Reporte_Municipalidades',
    hoja: 'Municipalidades',
    orientacion: 'landscape',
    filtros: [{ etiqueta: 'Estado', valor: filtros.estado }, { etiqueta: 'Búsqueda', valor: filtros.busqueda }],
    columnas: [
      { titulo: 'Municipalidad', ancho: 52 }, { titulo: 'RUC', ancho: 26 }, { titulo: 'Tipo', ancho: 22 },
      { titulo: 'Jurisdicción', ancho: 50 }, { titulo: 'Teléfono', ancho: 26 }, { titulo: 'Correo' },
      { titulo: 'Entidades', ancho: 20 }, { titulo: 'Estado', ancho: 24, estado: true }
    ],
    filas: filas.map(f => [f.nombre, f.ruc, f.tipo, f.jurisdiccion, f.telefono, f.email, f.entidades, f.estado])
  };
}

/** Hoja extra del Excel del padrón: todas las entidades de las municipalidades exportadas. */
export function hojaEntidades(entidades: EntidadReporteFila[]): HojaReporte {
  return {
    nombre: 'Entidades',
    columnas: ['Municipalidad', ...COLUMNAS_ENTIDAD],
    filas: entidades.map(e => [e.municipalidad, e.nombre, e.ruc, e.tipo, e.distrito, e.estado]),
    anchos: [34, 40, 16, 20, 26, 14],
    estados: [5]
  };
}

/** Ficha de una municipalidad: sus datos de registro como cabecera y sus entidades como detalle. */
export function reporteFichaMunicipalidad(m: MunicipalidadReporteFila, entidades: EntidadReporteFila[]): ReporteTabla {
  return {
    titulo: `Ficha de Municipalidad — ${m.nombre}`,
    documento: 'Ficha_Municipalidad',
    placeholder: m.ruc,
    hoja: 'Entidades',
    orientacion: 'portrait',
    filtros: [
      { etiqueta: 'RUC', valor: m.ruc },
      { etiqueta: 'Tipo', valor: m.tipo },
      { etiqueta: 'Estado', valor: m.estado },
      { etiqueta: 'Jurisdicción', valor: m.jurisdiccion },
      { etiqueta: 'Teléfono', valor: m.telefono ?? '' },
      { etiqueta: 'Correo', valor: m.email ?? '' },
      { etiqueta: 'Dirección', valor: m.direccion ?? '' }
    ],
    columnas: [
      { titulo: 'Entidad' }, { titulo: 'RUC', ancho: 24 }, { titulo: 'Tipo', ancho: 26 },
      { titulo: 'Distrito', ancho: 38 }, { titulo: 'Estado', ancho: 22, estado: true }
    ],
    filas: entidades.map(e => [e.nombre, e.ruc, e.tipo, e.distrito, e.estado])
  };
}
