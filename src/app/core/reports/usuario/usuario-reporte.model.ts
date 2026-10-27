import { fechaHoraIso } from '../../../shared/reports/report-format';
import { ColumnaReporte, ReporteTabla } from '../../../shared/reports/report.model';

/** Nivel jerárquico de quien exporta: cada uno ve (y exporta) solo su alcance. */
export type AmbitoUsuarios = 'ciudadanos' | 'municipal' | 'entidad';

/** Contiene PII (DNI, contacto): solo roles con permiso de exportar (PermissionConstants.REPORTS_EXPORT). */
export interface UsuarioReporteFila {
  nombre: string;
  dni: string;
  rol?: string;
  telefono?: string | null;
  email?: string | null;
  estado: string;
  creadoEn?: string | null;
}

export interface UsuarioReporteFiltros { estado: string; busqueda: string; }

const AMBITOS: Record<AmbitoUsuarios, { titulo: string; documento: string; hoja: string }> = {
  ciudadanos: { titulo: 'Reporte de Ciudadanos Registrados', documento: 'Reporte_Ciudadanos', hoja: 'Ciudadanos' },
  municipal: { titulo: 'Reporte de Personal Municipal', documento: 'Reporte_Personal_Municipal', hoja: 'Personal' },
  entidad: { titulo: 'Reporte de Personal de Entidad', documento: 'Reporte_Personal_Entidad', hoja: 'Personal' }
};

/**
 * Fuente: GET /api/auth/admin/users (SUPER_ADMIN, ciudadanos) o el listado de personal de la
 * municipalidad/entidad del JWT. `institucion` = nombre de la entidad o municipalidad del personal.
 */
export function reporteUsuarios(ambito: AmbitoUsuarios, filas: UsuarioReporteFila[], filtros: UsuarioReporteFiltros,
                                institucion?: string): ReporteTabla {
  const conRol = ambito !== 'ciudadanos';
  const columnas: ColumnaReporte[] = [
    { titulo: 'Nombre completo', ancho: 50 }, { titulo: 'DNI', ancho: 22 },
    ...(conRol ? [{ titulo: 'Rol', ancho: 36 }] : []),
    { titulo: 'Teléfono', ancho: 26 }, { titulo: 'Correo' }, { titulo: 'Estado', ancho: 22, estado: true },
    { titulo: 'Registrado', ancho: 30 }
  ];
  return {
    ...AMBITOS[ambito],
    orientacion: 'landscape',
    filtros: [
      ...(institucion ? [{ etiqueta: ambito === 'municipal' ? 'Municipalidad' : 'Entidad', valor: institucion }] : []),
      { etiqueta: 'Estado', valor: filtros.estado }, { etiqueta: 'Búsqueda', valor: filtros.busqueda }
    ],
    columnas,
    filas: filas.map(f => [f.nombre, f.dni, ...(conRol ? [f.rol] : []), f.telefono, f.email, f.estado, fechaHoraIso(f.creadoEn)])
  };
}
