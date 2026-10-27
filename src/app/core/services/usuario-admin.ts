import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, forkJoin, of, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { API_PATHS, buildApiUrl } from '../config/api-config';
import { AuthService, ROLES } from '../auth/auth.service';
import {
  PersonalExistente,
  AdminCreateUsuarioRequest,
  AdminUpdateUsuarioRequest,
  AplicarCastigoRequest,
  CastigoHistorialEntry,
  CastigoResponse,
  UsuarioAdmin,
  normalizarSistemaCastigos
} from '../models/usuario.model';

export interface RolSistema { id: string; roleName: string; status?: string; description?: string; createdAt?: string; }
export interface ResultadoImportRol { roleName: string; result: 'CREADO' | 'OMITIDO'; detail?: string; }

@Injectable({ providedIn: 'root' })
export class UsuarioAdminService {

  private readonly usuariosUrl = buildApiUrl(API_PATHS.adminUsuarios);
  private readonly rolesUrl = buildApiUrl(API_PATHS.adminRoles);
  private readonly entidadUsuariosUrl = buildApiUrl(API_PATHS.entidadUsuarios);
  private readonly castigosUrl = buildApiUrl(API_PATHS.castigos);
  private readonly auth = inject(AuthService);

  constructor(private http: HttpClient) {}

  /** Colección de roles (SUPER_ADMIN): solo nombres que el sistema reconoce. */
  listarRoles(): Observable<RolSistema[]> {
    return this.http.get<RolSistema[]>(this.rolesUrl);
  }

  rolesDisponibles(): Observable<string[]> {
    return this.http.get<string[]>(`${this.rolesUrl}/available`);
  }

  crearRol(roleName: string, description: string): Observable<RolSistema> {
    return this.http.post<RolSistema>(this.rolesUrl, { roleName, description });
  }

  /** Alta en lote; cada fila vuelve como CREADO u OMITIDO con el motivo. */
  importarRoles(filas: { roleName: string; description?: string }[]): Observable<ResultadoImportRol[]> {
    return this.http.post<ResultadoImportRol[]>(`${this.rolesUrl}/import`, filas);
  }

  actualizarRol(id: string, cambios: { description?: string; status?: string }): Observable<RolSistema> {
    return this.http.put<RolSistema>(`${this.rolesUrl}/${id}`, cambios);
  }

  eliminarRol(id: string): Observable<void> {
    return this.http.delete<void>(`${this.rolesUrl}/${id}`);
  }

  listarUsuarios(): Observable<UsuarioAdmin[]> {
    return this.http.get<unknown>(this.usuariosUrl).pipe(
      map(raw => this.asArray(raw).map(row => this.normalizarUsuarioListado(row)))
    );
  }

  /** Personal de la entidad autenticada (claim eid). */
  listarPersonalEntidad(): Observable<UsuarioAdmin[]> {
    return this.http.get<unknown>(this.entidadUsuariosUrl).pipe(
      map(raw => this.asArray(raw).map(row => this.normalizarUsuarioListado(row))),
      catchError(err => this.relanzarErrorHttp(err))
    );
  }

  /** Usuario con ese DNI, o null si no está registrado (404). Solo SUPER_ADMIN. */
  buscarUsuarioPorDni(dni: string): Observable<UsuarioAdmin | null> {
    return this.http.get<unknown>(`${this.usuariosUrl}/dni/${encodeURIComponent(dni)}`).pipe(
      map(raw => this.normalizarUsuarioListado(raw)),
      catchError(err => (err as { status?: number })?.status === 404 ? of(null) : this.relanzarErrorHttp(err))
    );
  }

  crearUsuario(body: AdminCreateUsuarioRequest): Observable<UsuarioAdmin> {
    return this.http.post<unknown>(this.usuariosUrl, body).pipe(
      map(raw => this.normalizarUsuarioListado(raw)),
      catchError(err => this.relanzarErrorHttp(err))
    );
  }

  /** 403 si el DNI es de otra entidad o municipalidad. */
  buscarPersonalPorDni(dni: string): Observable<PersonalExistente> {
    return this.http.get<PersonalExistente>(`${this.entidadUsuariosUrl}/lookup`, { params: { dni } }).pipe(
      catchError(err => this.relanzarErrorHttp(err))
    );
  }

  crearPersonalEntidad(body: AdminCreateUsuarioRequest): Observable<UsuarioAdmin> {
    return this.http.post<unknown>(this.entidadUsuariosUrl, body).pipe(
      map(raw => this.normalizarUsuarioListado(raw)),
      catchError(err => this.relanzarErrorHttp(err))
    );
  }

  cambiarEstadoPersonalEntidad(id: string, estado: 'ACTIVO' | 'INACTIVO'): Observable<UsuarioAdmin> {
    return this.http
      .patch<unknown>(`${this.entidadUsuariosUrl}/status/${id}`, {}, {
        params: { status: estado }
      })
      .pipe(
        map(raw => this.normalizarUsuarioListado(raw)),
        catchError(err => this.relanzarErrorHttp(err))
      );
  }

  actualizarUsuario(id: string, body: AdminUpdateUsuarioRequest): Observable<UsuarioAdmin> {
    return this.http.put<unknown>(`${this.usuariosUrl}/${id}`, body).pipe(
      map(raw => this.normalizarUsuarioListado(raw)),
      catchError(err => this.relanzarErrorHttp(err))
    );
  }

  listarSolicitudes(estado: 'PENDIENTE_APROBACION' | 'RECHAZADO' = 'PENDIENTE_APROBACION'): Observable<UsuarioAdmin[]> {
    const esperado = estado.toUpperCase();
    return this.listarColaRegistro().pipe(
      map(cola => (esperado === 'RECHAZADO' ? cola.rechazadas : cola.pendientes))
    );
  }

  /** Una sola lectura del directorio, partida en colas de registro. */
  listarColaRegistro(): Observable<{ pendientes: UsuarioAdmin[]; rechazadas: UsuarioAdmin[] }> {
    return this.listarUsuarios().pipe(
      map(rows => {
        const pendientes: UsuarioAdmin[] = [];
        const rechazadas: UsuarioAdmin[] = [];
        for (const u of rows) {
          const estado = (u.estado ?? '').toUpperCase();
          if (estado === 'PENDIENTE_APROBACION') pendientes.push(u);
          else if (estado === 'RECHAZADO') rechazadas.push(u);
        }
        pendientes.sort(compararSolicitudPorEspera);
        rechazadas.sort(compararSolicitudPorReciente);
        return { pendientes, rechazadas };
      }),
      catchError(err => this.relanzarErrorHttp(err))
    );
  }

  aprobarRegistro(id: string): Observable<UsuarioAdmin> {
    return this.http.post<unknown>(`${this.usuariosUrl}/${id}/approve-registration`, {}).pipe(
      map(raw => this.normalizarUsuarioListado(raw)),
      catchError(err => this.relanzarErrorHttp(err))
    );
  }

  rechazarRegistro(id: string, motivo: string): Observable<UsuarioAdmin> {
    return this.http
      .post<unknown>(`${this.usuariosUrl}/${id}/reject-registration`, { reason: motivo })
      .pipe(
        map(raw => this.normalizarUsuarioListado(raw)),
        catchError(err => this.relanzarErrorHttp(err))
      );
  }

  cambiarEstado(id: string, estado: 'ACTIVO' | 'INACTIVO'): Observable<UsuarioAdmin> {
    return this.http.patch<unknown>(`${this.usuariosUrl}/status/${id}`, { status: estado }).pipe(
      map(raw => this.normalizarUsuarioListado(raw)),
      catchError(err => this.relanzarErrorHttp(err))
    );
  }

  /** SUPER_ADMIN ve el castigo completo; el resto del personal solo el estado (sin motivo). */
  obtenerCastigo(usuarioId: string): Observable<CastigoResponse> {
    const url = this.auth.hasRole(ROLES.SUPER_ADMIN)
      ? `${this.usuariosUrl}/${usuarioId}/penalty`
      : `${this.castigosUrl}/status/${usuarioId}`;
    return this.http.get<unknown>(url).pipe(map(body => this.normalizarCastigo(body)));
  }

  /** Castiga al emisor de una alerta del incidente (operador, admins de entidad/municipalidad). */
  castigarAlerta(incidenteId: string, alertaId: string, motivo: string): Observable<CastigoResponse> {
    return this.http
      .post<unknown>(`${this.castigosUrl}/incidents/${incidenteId}/alerts/${alertaId}`, { reason: motivo })
      .pipe(
        map(raw => this.normalizarCastigo(raw)),
        catchError(err => this.relanzarErrorHttp(err))
      );
  }

  aplicarCastigo(usuarioId: string, body: AplicarCastigoRequest): Observable<CastigoResponse> {
    return this.http
      .post<unknown>(`${this.usuariosUrl}/${usuarioId}/penalty`, body)
      .pipe(
        map(raw => this.normalizarCastigo(raw)),
        catchError(err => this.relanzarErrorHttp(err))
      );
  }

  levantarCastigo(usuarioId: string): Observable<CastigoResponse> {
    return this.http
      .delete<unknown>(`${this.usuariosUrl}/${usuarioId}/penalty`)
      .pipe(
        map(raw => this.normalizarCastigo(raw)),
        catchError(err => this.relanzarErrorHttp(err))
      );
  }

  /** Historial dentro del alcance del token (SUPER_ADMIN: todo). */
  listarHistorialCastigos(): Observable<CastigoHistorialEntry[]> {
    return this.http.get<CastigoHistorialEntry[]>(`${this.castigosUrl}/history`);
  }

  listarHistorialUsuario(usuarioId: string): Observable<CastigoHistorialEntry[]> {
    return this.http.get<CastigoHistorialEntry[]>(`${this.castigosUrl}/history`, { params: { userId: usuarioId } });
  }

  /** Carga castigos en paralelo para varios usuarios (vg-ms-castigos). */
  listarCastigos(usuarioIds: string[]): Observable<Map<string, CastigoResponse>> {
    const ids = [...new Set(usuarioIds.filter(Boolean))];
    if (ids.length === 0) {
      return of(new Map());
    }
    return forkJoin(
      ids.map(id =>
        this.obtenerCastigo(id).pipe(
          map(castigo => [id, castigo] as const),
          catchError(() => of([id, null] as const))
        )
      )
    ).pipe(
      map(entries => {
        const mapa = new Map<string, CastigoResponse>();
        for (const [id, castigo] of entries) {
          if (castigo) mapa.set(id, castigo);
        }
        return mapa;
      })
    );
  }

  private asArray(raw: unknown): unknown[] {
    if (Array.isArray(raw)) {
      return raw;
    }
    if (raw && typeof raw === 'object') {
      const obj = raw as Record<string, unknown>;
      if (Array.isArray(obj['body'])) {
        return obj['body'];
      }
      if (Array.isArray(obj['content'])) {
        return obj['content'];
      }
    }
    return [];
  }

  private normalizarUsuarioListado(raw: unknown): UsuarioAdmin {
    const usuario = this.normalizarUsuario(raw);
    if (raw && typeof raw === 'object') {
      const obj = raw as Record<string, unknown>;
      const castigosRaw = obj['sistemaCastigos'] ?? obj['sistema_castigos'];
      usuario.sistemaCastigos = normalizarSistemaCastigos(
        castigosRaw as Record<string, unknown> | null | undefined
      );
    }
    return usuario;
  }

  private normalizarUsuario(raw: unknown): UsuarioAdmin {
    if (raw && typeof raw === 'object') {
      const obj = raw as Record<string, unknown>;
      if (obj['body'] && typeof obj['body'] === 'object' && !Array.isArray(obj['body'])) {
        return this.normalizarUsuarioListado(obj['body']);
      }
      const id = obj['id'] ?? obj['_id'];
      if (id != null && String(id).length > 0) {
        const rolesRaw = obj['roleIds'] ?? obj['rolesIds'] ?? obj['roles_ids'];
        const rolesIds = Array.isArray(rolesRaw) ? rolesRaw.map(String) : undefined;
        const entidadRaw = obj['entityId'] ?? obj['entidadId'] ?? obj['entityId'] ?? obj['entidad_perteneciente_id'] ?? obj['entidad_id'];
        return {
          ...(raw as UsuarioAdmin),
          id: String(id),
          dni: String(obj['dni'] ?? ''),
          nombres: String(obj['firstName'] ?? obj['nombres'] ?? ''),
          apellidos: String(obj['lastName'] ?? obj['apellidos'] ?? ''),
          email: (obj['email'] ?? null) as string | null,
          telefono: (obj['phone'] ?? obj['telefono'] ?? null) as string | null,
          rolesIds,
          entidadId: entidadRaw != null ? String(entidadRaw) : null,
          estado: String(obj['status'] ?? obj['estado'] ?? ''),
          creadoEn: (obj['createdAt'] ?? obj['creadoEn'] ?? obj['createdAt'] ?? obj['creado_en'] ?? null) as string | undefined,
          fotoPerfilUrl: (obj['profilePhotoUrl'] ?? obj['fotoPerfilUrl'] ?? obj['profilePhotoUrl'] ?? obj['foto_perfil_url'] ?? null) as string | null,
          fotoPerfilPublicId: (obj['profilePhotoPublicId'] ?? obj['fotoPerfilPublicId'] ?? obj['profilePhotoPublicId'] ?? obj['foto_perfil_public_id'] ?? null) as
            | string
            | null,
          verificacionLivenessEstado: (obj['livenessVerificationStatus'] ?? obj['verificacionLivenessEstado'] ??
            obj['livenessVerificationStatus'] ?? obj['verificacion_liveness_estado'] ??
            null) as string | null,
          verificacionReniecEstado: (obj['reniecVerificationStatus'] ?? obj['verificacionReniecEstado'] ??
            obj['verificacion_reniec_estado'] ??
            null) as string | null,
          registroSolicitadoEn: (obj['registrationRequestedAt'] ?? obj['registroSolicitadoEn'] ??
            obj['registro_solicitado_en'] ??
            obj['createdAt'] ?? obj['creadoEn'] ??
            obj['createdAt'] ?? obj['creado_en'] ??
            null) as string | null,
          registroRevisadoEn: (obj['registrationReviewedAt'] ?? obj['registroRevisadoEn'] ?? obj['registro_revisado_en'] ?? null) as
            | string
            | null,
          registroRevisadoPor: (obj['registrationReviewedBy'] ?? obj['registroRevisadoPor'] ?? obj['registro_revisado_por'] ?? null) as
            | string
            | null,
          registroRechazoMotivo: (obj['registrationRejectionReason'] ?? obj['registroRechazoMotivo'] ??
            obj['registro_rechazo_motivo'] ??
            null) as string | null
        };
      }
    }
    throw new Error('Respuesta de usuario inválida');
  }

  private normalizarCastigo(raw: unknown): CastigoResponse {
    if (raw && typeof raw === 'object') {
      const obj = raw as Record<string, unknown>;
      if (obj['body'] && typeof obj['body'] === 'object') {
        return this.normalizarCastigo(obj['body']);
      }

      const usuarioId = obj['userId'] ?? obj['usuarioId'];
      if (typeof usuarioId === 'string') {
        const nivelCastigo = Number(obj['penaltyLevel'] ?? obj['nivelCastigo'] ?? 0);
        const proximoNivelRaw = obj['nextLevel'] ?? obj['proximoNivel'];
        return {
          usuarioId,
          dni: String(obj['dni'] ?? ''),
          nivelCastigo,
          nivelEtiqueta: String(obj['levelLabel'] ?? obj['nivelEtiqueta'] ?? ''),
          proximoNivel: proximoNivelRaw == null ? null : Number(proximoNivelRaw),
          proximoNivelEtiqueta: (obj['nextLevelLabel'] ?? obj['proximoNivelEtiqueta'] ?? null) as
            | string
            | null,
          advertenciasAcumuladas: Number(
            obj['accumulatedWarnings'] ?? obj['advertenciasAcumuladas'] ?? 0
          ),
          fechaFinBloqueoTemporal: (obj['temporaryBlockEndDate'] ?? obj['fechaFinBloqueoTemporal'] ??
            null) as string | null,
          suspendidoPermanente: Boolean(
            obj['permanentlySuspended'] ?? obj['suspendidoPermanente'] ?? false
          ),
          motivoUltimoCastigo: (obj['lastPenaltyReason'] ?? obj['motivoUltimoCastigo'] ?? null) as
            | string
            | null,
          bloqueoActivo: Boolean(obj['blockActive'] ?? obj['bloqueoActivo'] ?? false),
          accesoPermitido: Boolean(
            obj['accessAllowed'] ?? obj['accesoPermitido'] ??
              !(obj['blockActive'] ?? obj['bloqueoActivo'])
          ),
          syncPendiente: Boolean(obj['syncPending'] ?? obj['syncPendiente'] ?? false),
          syncEstadoUsuario: (obj['syncUserStatus'] ?? obj['syncEstadoUsuario'] ?? null) as
            | string
            | null,
          syncIntentos: Number(obj['syncAttempts'] ?? obj['syncIntentos'] ?? 0)
        };
      }
    }
    throw new Error('Respuesta de castigo inválida');
  }

  private relanzarErrorHttp(err: unknown): Observable<never> {
    if (err && typeof err === 'object' && 'error' in err) {
      const payload = (err as { error?: unknown }).error;
      if (payload && typeof payload === 'object' && payload !== null && 'error' in payload) {
        return throwError(() => new Error(String((payload as { error: unknown }).error)));
      }
      if (typeof payload === 'string') {
        return throwError(() => new Error(payload));
      }
    }
    return throwError(() => err);
  }
}

function fechaSolicitudMs(u: UsuarioAdmin): number {
  const raw = u.registroSolicitadoEn ?? u.creadoEn;
  if (!raw) return 0;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : 0;
}

/** Pendientes: quien espera más tiempo primero (FIFO). */
function compararSolicitudPorEspera(a: UsuarioAdmin, b: UsuarioAdmin): number {
  const da = fechaSolicitudMs(a);
  const db = fechaSolicitudMs(b);
  if (da === 0 && db === 0) return 0;
  if (da === 0) return 1;
  if (db === 0) return -1;
  return da - db;
}

/** Rechazadas: más recientes primero. */
function compararSolicitudPorReciente(a: UsuarioAdmin, b: UsuarioAdmin): number {
  return fechaSolicitudMs(b) - fechaSolicitudMs(a);
}
