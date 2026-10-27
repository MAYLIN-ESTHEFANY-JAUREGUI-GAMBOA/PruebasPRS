/**
 * Configuración centralizada del API Gateway.
 *
 * Todos los servicios HTTP deben construir sus URLs a partir de aquí para
 * tener un único punto de entrada (gateway en `:9000`) y evitar llamadas
 * directas a microservicios.
 */

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/$/, '');
}

// const DEFAULT_API_URL = 'http://localhost:9000';
const DEFAULT_API_URL = 'https://lab.vallegrande.edu.pe/canete-seguro';

const ENV_API_URL =
  typeof process !== 'undefined' && process?.env?.['NG_APP_API_URL']
    ? String(process.env['NG_APP_API_URL'])
    : undefined;

export const API_BASE_URL = normalizeBaseUrl(ENV_API_URL ?? DEFAULT_API_URL);

/** Rutas expuestas por el gateway. */
export const API_PATHS = {
  authLogin: '/api/auth/login',
  authLoginEntidad: '/api/auth/login/entity',
  authLoginMunicipalidad: '/api/auth/login/municipality',
  authProfile: '/api/auth/profile',
  authEntidadPerfil: '/api/auth/entity/profile',
  /** Personal de la entidad (ENTIDAD_ADMIN): listar / crear / estado. */
  entidadUsuarios: '/api/auth/entity/users',
  authCastigo: '/api/auth/penalty',
  adminUsuarios: '/api/auth/admin/users',
  adminRoles: '/api/auth/admin/roles',
  adminCastigosHistorial: '/api/auth/admin/penalties/history',
  /** Castigos del personal (vg-ms-castigos): castigar desde una alerta, estado e historial por alcance. */
  castigos: '/api/penalties',
  entidades: '/api/entities',
  /** Municipalidades (SUPER_ADMIN: todas; MUNICIPALIDAD_ADMIN: la suya). */
  municipalidades: '/api/municipalities',
  catalogos: '/api/catalogs',
  recursosOperativos: '/api/v1/resources',
  subasignacion: '/api/subassignments',
  /** Tracking GPS en tiempo real de subasignaciones (vg-ms-subasignacion). */
  tracking: '/api/tracking',
  /** Incidentes enriquecidos con entidades responsables. */
  incidentesEnriquecidos: '/api/incidents/enriched',
  /** Incidentes (operaciones CRUD básicas vía gateway → /api/incidents). */
  incident: '/api/incidents',
  /** Alertas ciudadanas (crudo). */
  alertas: '/api/alerts',
  /** Mantenimiento de flota vehicular (vg-ms-flota-mantenimiento). */
  maintenanceOrders: '/api/maintenance-orders',
  /** Chat de coordinación entre entidades. */
  chatEntidades: '/api/chat-entidades'
} as const;

/** Prefijos cuyas peticiones deben llevar el token JWT al gateway. */
export const API_AUTHENTICATED_PREFIXES: readonly string[] = [
  API_PATHS.entidades,
  API_PATHS.municipalidades,
  API_PATHS.catalogos,
  API_PATHS.recursosOperativos,
  API_PATHS.subasignacion,
  API_PATHS.tracking,
  API_PATHS.incidentesEnriquecidos,
  API_PATHS.incident,
  API_PATHS.alertas,
  API_PATHS.maintenanceOrders,
  API_PATHS.authProfile,
  API_PATHS.authEntidadPerfil,
  API_PATHS.entidadUsuarios,
  API_PATHS.adminUsuarios,
  API_PATHS.adminRoles,
  API_PATHS.adminCastigosHistorial,
  API_PATHS.castigos,
  API_PATHS.chatEntidades
];

/** Construye una URL absoluta hacia el gateway. */
export function buildApiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
}

/** Ruta /api/... de una petición al gateway (relativa o absoluta). */
export function gatewayApiPath(url: string): string | null {
  if (url.startsWith('/api/')) {
    return url;
  }
  if (API_BASE_URL && url.startsWith(API_BASE_URL)) {
    return url.substring(API_BASE_URL.length);
  }
  const apiIdx = url.indexOf('/api/');
  if (apiIdx >= 0) {
    return url.substring(apiIdx);
  }
  return null;
}
