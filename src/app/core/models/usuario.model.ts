/** Vista de castigo desde vg-ms-castigos (ya no embebido en db_auth). */
export interface SistemaCastigos {
  nivel_castigo?: number;
  advertencias_acumuladas?: number;
  fecha_fin_bloqueo_temporal?: string | null;
  suspendido_permanente?: boolean;
  motivo_ultimo_castigo?: string | null;
}

export interface UsuarioAdmin {
  id: string;
  dni: string;
  nombres: string;
  apellidos: string;
  telefono?: string | null;
  email?: string | null;
  rolesIds?: string[];
  /** Nombres de rol (vg-ms-usuarios los envía en el listado de personal). */
  roles?: string[] | null;
  entidadId?: string | null;
  estado: string;
  /** @deprecated Los castigos viven en vg-ms-castigos; usar CastigoResponse del API. */
  sistemaCastigos?: SistemaCastigos | null;
  creadoEn?: string;
  fotoPerfilUrl?: string | null;
  fotoPerfilPublicId?: string | null;
  verificacionLivenessEstado?: string | null;
  verificacionReniecEstado?: string | null;
  registroSolicitadoEn?: string | null;
  registroRevisadoEn?: string | null;
  registroRevisadoPor?: string | null;
  registroRechazoMotivo?: string | null;
}

/** GET /entity/users/lookup: ¿el DNI ya está registrado? */
export interface PersonalExistente {
  exists: boolean;
  alreadyStaff: boolean;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  email: string | null;
}

export interface AdminCreateUsuarioRequest {
  dni: string;
  /** Solo para usuarios nuevos; a un DNI existente únicamente se le agrega el rol. */
  password?: string;
  firstName: string;
  lastName: string;
  phone?: string;
  email?: string;
  roleIds?: string[];
  entityId?: string | null;
}

export interface AdminUpdateUsuarioRequest {
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  roleIds?: string[];
  entityId?: string | null;
}

export interface CastigoResponse {
  usuarioId: string;
  dni: string;
  nivelCastigo: number;
  nivelEtiqueta: string;
  proximoNivel: number | null;
  proximoNivelEtiqueta: string | null;
  advertenciasAcumuladas: number;
  fechaFinBloqueoTemporal: string | null;
  suspendidoPermanente: boolean;
  motivoUltimoCastigo: string | null;
  bloqueoActivo: boolean;
  accesoPermitido: boolean;
  /** Saga: falta confirmar ACTIVO/SUSPENDIDO en vg-ms-usuarios. */
  syncPendiente?: boolean;
  syncEstadoUsuario?: string | null;
  syncIntentos?: number;
}

/** Body de POST /api/auth/admin/users/{id}/penalty (vg-ms-castigos, JSON en inglés). */
export interface AplicarCastigoRequest {
  reason: string;
  blockHours?: number;
}

/** Entrada del historial de vg-ms-castigos (JSON en inglés). */
export interface CastigoHistorialEntry {
  id: string;
  userId: string;
  dni: string;
  fullName: string;
  action: 'APLICAR' | 'ACTUALIZAR' | 'LEVANTAR' | 'SYNC_COMPLETADA' | 'SYNC_FALLIDA';
  previousLevel: number;
  newLevel: number;
  previousLevelLabel: string;
  newLevelLabel: string;
  reason: string;
  recordedAt: string;
  /** Origen del castigo (null en historial antiguo o castigo manual de administración). */
  municipalidadId?: string | null;
  entidadId?: string | null;
  incidenteId?: string | null;
  alertaId?: string | null;
  appliedBy?: string | null;
}

export const NIVEL_CASTIGO = {
  SIN_CASTIGO: 0,
  AVISO: 1,
  BLOQUEO_TEMPORAL: 2,
  BLOQUEO_PERMANENTE: 3
} as const;

/** Acepta snake_case o camelCase desde el API. */
export function normalizarSistemaCastigos(
  raw?: SistemaCastigos | Record<string, unknown> | null
): SistemaCastigos | null {
  if (!raw || typeof raw !== 'object') return null;
  const sc = raw as Record<string, unknown>;
  return {
    nivel_castigo: Number(sc['nivel_castigo'] ?? sc['nivelCastigo'] ?? 0),
    advertencias_acumuladas: Number(sc['advertencias_acumuladas'] ?? sc['advertenciasAcumuladas'] ?? 0),
    fecha_fin_bloqueo_temporal: (sc['fecha_fin_bloqueo_temporal'] ?? sc['fechaFinBloqueoTemporal'] ?? null) as
      | string
      | null,
    suspendido_permanente: Boolean(sc['suspendido_permanente'] ?? sc['suspendidoPermanente'] ?? false),
    motivo_ultimo_castigo: (sc['motivo_ultimo_castigo'] ?? sc['motivoUltimoCastigo'] ?? null) as string | null
  };
}

export function resolverNivelCastigo(sc?: SistemaCastigos | null): number {
  if (!sc) return NIVEL_CASTIGO.SIN_CASTIGO;
  if ((sc.nivel_castigo ?? 0) > 0) return sc.nivel_castigo!;
  if (sc.suspendido_permanente) return NIVEL_CASTIGO.BLOQUEO_PERMANENTE;
  if (sc.fecha_fin_bloqueo_temporal && new Date(sc.fecha_fin_bloqueo_temporal) > new Date()) {
    return NIVEL_CASTIGO.BLOQUEO_TEMPORAL;
  }
  if ((sc.advertencias_acumuladas ?? 0) > 0) return NIVEL_CASTIGO.AVISO;
  return NIVEL_CASTIGO.SIN_CASTIGO;
}

export function etiquetaNivelCastigo(nivel: number): string {
  switch (nivel) {
    case NIVEL_CASTIGO.AVISO: return 'Aviso';
    case NIVEL_CASTIGO.BLOQUEO_TEMPORAL: return 'Bloqueo temporal';
    case NIVEL_CASTIGO.BLOQUEO_PERMANENTE: return 'Bloqueo permanente';
    default: return 'Sin castigo';
  }
}

export function nombreCompletoUsuario(u: UsuarioAdmin): string {
  return [u.nombres, u.apellidos].filter(Boolean).join(' ').trim() || u.dni;
}

export function bloqueoCastigoActivo(sc?: SistemaCastigos | null, nivel?: number): boolean {
  const n = nivel ?? resolverNivelCastigo(sc);
  if (n === NIVEL_CASTIGO.BLOQUEO_PERMANENTE) return true;
  if (n === NIVEL_CASTIGO.BLOQUEO_TEMPORAL && sc?.fecha_fin_bloqueo_temporal) {
    return new Date(sc.fecha_fin_bloqueo_temporal) > new Date();
  }
  return false;
}

function proximoNivelCastigo(nivel: number): { codigo: number; etiqueta: string } | null {
  if (nivel >= NIVEL_CASTIGO.BLOQUEO_PERMANENTE) return null;
  const codigo = nivel === NIVEL_CASTIGO.SIN_CASTIGO ? NIVEL_CASTIGO.AVISO : nivel + 1;
  return { codigo, etiqueta: etiquetaNivelCastigo(codigo) };
}

/** Convierte la respuesta del microservicio de castigos al formato legado. */
export function castigoResponseToSistemaCastigos(c: CastigoResponse): SistemaCastigos {
  return {
    nivel_castigo: c.nivelCastigo,
    advertencias_acumuladas: c.advertenciasAcumuladas,
    fecha_fin_bloqueo_temporal: c.fechaFinBloqueoTemporal,
    suspendido_permanente: c.suspendidoPermanente,
    motivo_ultimo_castigo: c.motivoUltimoCastigo
  };
}
export function construirCastigoResponse(u: UsuarioAdmin): CastigoResponse {
  const sc = normalizarSistemaCastigos(u.sistemaCastigos ?? null);
  const nivel = resolverNivelCastigo(sc);
  const bloqueoActivo = bloqueoCastigoActivo(sc, nivel);
  const proximo = proximoNivelCastigo(nivel);

  return {
    usuarioId: u.id,
    dni: u.dni,
    nivelCastigo: nivel,
    nivelEtiqueta: etiquetaNivelCastigo(nivel),
    proximoNivel: proximo?.codigo ?? null,
    proximoNivelEtiqueta: proximo?.etiqueta ?? null,
    advertenciasAcumuladas: sc?.advertencias_acumuladas ?? 0,
    fechaFinBloqueoTemporal: sc?.fecha_fin_bloqueo_temporal ?? null,
    suspendidoPermanente: sc?.suspendido_permanente ?? false,
    motivoUltimoCastigo: sc?.motivo_ultimo_castigo ?? null,
    bloqueoActivo,
    accesoPermitido: !bloqueoActivo,
    syncPendiente: false,
    syncEstadoUsuario: null,
    syncIntentos: 0
  };
}
