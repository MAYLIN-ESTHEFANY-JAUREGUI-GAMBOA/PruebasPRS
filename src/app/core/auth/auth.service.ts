import { isPlatformBrowser } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Inject, Injectable, PLATFORM_ID, signal, computed } from '@angular/core';
import { Observable, of, tap, throwError } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';

import { API_PATHS, buildApiUrl } from '../config/api-config';
import {
  AuthEntidadResponse,
  AuthResponse,
  AuthSession,
  LoginContext,
  LoginDniRequest,
  LoginEntidadRequest,
  RucLoginKind,
  UserProfileResponse
} from './auth.types';

const STORAGE_KEY = 'cs.auth.session';

/** Nombres exactos de roles según el backend (`vg-ms-auth/RoleName`). */
export const ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  MUNICIPALIDAD_ADMIN: 'MUNICIPALIDAD_ADMIN',
  ENTIDAD_ADMIN: 'ENTIDAD_ADMIN',
  OPERADOR_ENTIDAD: 'OPERADOR_ENTIDAD',
  /** Solo lectura (métricas); de una entidad o de la municipalidad. */
  ANALISTA: 'ANALISTA',
  CIUDADANO: 'CIUDADANO'
} as const;

/** Orden en que el panel prueba el contexto de login por DNI. */
const LOGIN_CONTEXTS: LoginContext[] = ['APP', 'PANEL_ENTIDAD', 'PANEL_MUNICIPALIDAD'];

export type AppRole = (typeof ROLES)[keyof typeof ROLES];

@Injectable({ providedIn: 'root' })
export class AuthService {

  private readonly browser: boolean;
  private readonly _session = signal<AuthSession | null>(null);

  /** Sesión observable como signal (read-only). */
  readonly session = this._session.asReadonly();
  /** True si hay token vigente (no expirado) en sesión. */
  readonly isAuthenticated = computed(() => {
    const session = this._session();
    if (!session?.token) {
      return false;
    }
    return !this.isTokenExpired(session.token);
  });

  /** True si el usuario es SUPER_ADMIN (ve todas las municipalidades). */
  readonly isAdmin = computed(() => this.hasRole(ROLES.SUPER_ADMIN));
  /** True si administra una municipalidad (cuenta titular por RUC o admin por DNI). */
  readonly isMunicipalidadAdmin = computed(() => this.hasRole(ROLES.MUNICIPALIDAD_ADMIN));
  /** True si el usuario es admin de SU entidad (login por RUC de entidad o rol ENTIDAD_ADMIN por DNI). */
  readonly isEntidadAdmin = computed(() => this.hasRole(ROLES.ENTIDAD_ADMIN));
  /** Atender emergencias (despachar, verificar, cerrar…): solo personal operativo de una entidad; SUPER_ADMIN solo lee. */
  readonly puedeAtender = computed(() =>
    !!this.getEntidadId() && this.hasRole(ROLES.ENTIDAD_ADMIN, ROLES.OPERADOR_ENTIDAD)
  );
  /** Personal municipal (admin o analista sin entidad): ve su municipalidad, no atiende emergencias. */
  readonly isMunicipalScope = computed(() => !this.isAdmin() && !this.getEntidadId() && !!this.getMunicipalidadId());
  /** True si el usuario está limitado al ámbito de una entidad (cualquier rol no-ADMIN con entidad). */
  readonly isEntidadScope = computed(() => !this.isAdmin() && !!this.getEntidadId());

  constructor(
    private http: HttpClient,
    @Inject(PLATFORM_ID) platformId: object
  ) {
    this.browser = isPlatformBrowser(platformId);
    this._session.set(this.readStoredSession());
  }

  /** Token actual o null. Disponible solo en navegador. */
  getToken(): string | null {
    return this._session()?.token ?? null;
  }

  /** True si la sesión actual tiene alguno de estos roles. */
  hasRole(...roles: string[]): boolean {
    const sesion = this._session();
    if (!sesion) return false;
    return roles.some(r => sesion.roles.includes(r));
  }

  /** Rol de mayor privilegio (ROLES va de mayor a menor); el backend no garantiza el orden de `roles`. */
  primaryRole(): string | undefined {
    const roles = this._session()?.roles ?? [];
    return Object.values(ROLES).find(r => roles.includes(r)) ?? roles[0];
  }

  /**
   * Devuelve el `entidadId` del usuario logueado, sin importar si llegó por
   * login institucional (RUC) o por login de usuario (DNI con perfil cargado).
   * Es la fuente única de verdad para filtrar datos por entidad en el panel.
   */
  getEntidadId(): string | null {
    const sesion = this._session();
    if (!sesion) return null;
    // Intentar desde las propiedades directas (por si existen en otro flujo)
    if (sesion.entidad?.entidadId) return sesion.entidad.entidadId;
    if (sesion.profile?.entityId) return sesion.profile.entityId;
    // Si no existen, decodificar el payload del token JWT (claim `eid`)
    if (sesion.token) {
      try {
        const payload = this.decodeJwtPayload(sesion.token);
        const eid = payload?.['eid'];
        if (Array.isArray(eid) && eid.length > 0) {
          return String(eid[0]);
        }
        if (typeof eid === 'string' && eid) {
          return eid;
        }
      } catch (error) {
        console.error('Error al decodificar el token en getEntidadId:', error);
      }
    }

    return null;
  }

  /** Municipalidad (tenant) del usuario: claim `mid` del JWT. null para SUPER_ADMIN y ciudadanos. */
  getMunicipalidadId(): string | null {
    const sesion = this._session();
    if (!sesion) return null;
    if (sesion.entidad?.municipalidadId) return sesion.entidad.municipalidadId;
    const mid = sesion.token ? this.safePayload(sesion.token)?.['mid'] : null;
    if (Array.isArray(mid) && mid.length > 0) {
      return String(mid[0]);
    }
    return typeof mid === 'string' && mid ? mid : null;
  }

  /** True si la cuenta es la titular (RUC) de la municipalidad: solo ella crea otros admins municipales. */
  isTitular(): boolean {
    const sesion = this._session();
    if (!sesion?.token) return false;
    const titular = this.safePayload(sesion.token)?.['titular'];
    return titular === true || titular === 'true';
  }

  private safePayload(token: string): Record<string, unknown> | null {
    try {
      return this.decodeJwtPayload(token);
    } catch {
      return null;
    }
  }

  /** Tipo de entidad del usuario (POLICIA, BOMBEROS, etc.) o null. */
  getTipoEntidad(): string | null {
    const sesion = this._session();
    if (!sesion) return null;
    if (sesion.entidad?.tipoEntidad) {
      return sesion.entidad.tipoEntidad;
    }
    if (sesion.token) {
      try {
        const payload = this.decodeJwtPayload(sesion.token);
        const tipoEntidad = payload?.['tipoEntidad'] ?? payload?.['tipo_entidad'];
        if (typeof tipoEntidad === 'string' && tipoEntidad) {
          return tipoEntidad;
        }
      } catch (error) {
        console.error('Error al decodificar el token en getTipoEntidad:', error);
      }
    }
    return null;
  }

  /**
   * Devuelve el ID del usuario/operador logueado (claim 'uid' o 'sub' del JWT o profile.id).
   */
  getUserId(): string | null {
    const sesion = this._session();
    if (!sesion) return null;

    if (sesion.profile?.id) {
      return String(sesion.profile.id);
    }

    if (sesion.token) {
      try {
        const payload = this.decodeJwtPayload(sesion.token);
        if (payload) {
          const rawUid = payload['uid'] ?? payload['sub'] ?? payload['id'];
          if (Array.isArray(rawUid) && rawUid.length > 0) {
            return String(rawUid[0]);
          }
          if (typeof rawUid === 'string' && rawUid) {
            return rawUid;
          }
          const sub = payload['sub'];
          if (typeof sub === 'string' && sub) {
            return sub;
          }
        }
      } catch (error) {
        console.error('Error al decodificar el token en getUserId:', error);
      }
    }

    return null;
  }

  /**
   * Login con DNI + contraseña para el panel web.
   *
   * El backend separa `APP` (CIUDADANO/SUPER_ADMIN), `PANEL_ENTIDAD` (personal de entidad) y
   * `PANEL_MUNICIPALIDAD` (admins/analistas municipales). Probamos primero el contexto pedido y,
   * si el backend responde 403 por mismatch de rol, los demás en orden. Cualquier otro error se propaga.
   */
  loginConDni(request: LoginDniRequest): Observable<AuthSession> {
    const orden = [request.context, ...LOGIN_CONTEXTS.filter(c => c !== request.context)];
    const intentar = (i: number): Observable<AuthSession> =>
      this.loginConContexto({ ...request, context: orden[i] }).pipe(
        catchError((error: unknown) =>
          i + 1 < orden.length && this.esMismatchDeContexto(error)
            ? intentar(i + 1)
            : throwError(() => error))
      );
    return intentar(0);
  }

  private loginConContexto(request: LoginDniRequest): Observable<AuthSession> {
    return this.http
      .post<AuthResponse>(buildApiUrl(API_PATHS.authLogin), request)
      .pipe(
        tap(response => {
          this.persistSession({
            token: response.token,
            roles: this.resolveRoles(response.roles, response.token),
            loginKind: 'dni'
          });
        }),
        switchMap(() =>
          this.refreshProfile().pipe(
            // Si el perfil falla mantenemos la sesión y devolvemos lo que haya.
            catchError(() => of(null))
          )
        ),
        map(() => this._session() as AuthSession)
      );
  }

  /**
   * Roles de la respuesta de login, o del JWT (claim `roles` / `realm_access`)
   * cuando el backend solo emite el access_token de Keycloak.
   */
  private resolveRoles(rolesFromApi: string[] | undefined, token: string): string[] {
    if (rolesFromApi && rolesFromApi.length > 0) {
      return rolesFromApi;
    }
    return this.extractRolesFromToken(token);
  }

  private static readonly APP_ROLES = new Set<string>(Object.values(ROLES));

  private extractRolesFromToken(token: string): string[] {
    try {
      const payload = this.decodeJwtPayload(token);
      if (!payload) {
        return [];
      }
      const collected: string[] = [];
      const flat = payload['roles'];
      if (Array.isArray(flat)) {
        collected.push(...flat.filter((r): r is string => typeof r === 'string'));
      }
      const realmAccess = payload['realm_access'];
      if (realmAccess && typeof realmAccess === 'object') {
        const realmRoles = (realmAccess as Record<string, unknown>)['roles'];
        if (Array.isArray(realmRoles)) {
          collected.push(...realmRoles.filter((r): r is string => typeof r === 'string'));
        }
      }
      return [...new Set(collected)].filter(r => AuthService.APP_ROLES.has(r));
    } catch {
      return [];
    }
  }

  /** Decodifica el payload JWT (base64url) a objeto JSON. */
  private decodeJwtPayload(token: string): Record<string, unknown> | null {
    const payloadBase64 = token.split('.')[1];
    if (!payloadBase64) {
      return null;
    }
    const normalized = payloadBase64.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
    // atob da bytes Latin-1: sin TextDecoder la ñ y las tildes de los claims salen como "Ã±".
    const bytes = Uint8Array.from(atob(padded), c => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
  }

  /**
   * `true` cuando el backend devuelve 403 porque el contexto no aplica al rol del usuario.
   * Detectamos por mensaje para no confundir con cuentas inhabilitadas (también 403).
   */
  private esMismatchDeContexto(error: unknown): boolean {
    if (!(error instanceof HttpErrorResponse) || error.status !== 403) {
      return false;
    }
    const payload = error.error;
    const mensaje =
      typeof payload === 'string'
        ? payload
        : payload && typeof payload === 'object'
          ? ((payload as Record<string, unknown>)['message'] as string | undefined) ??
            ((payload as Record<string, unknown>)['error'] as string | undefined) ??
            ''
          : '';
    return /panel/i.test(mensaje) && /rol/i.test(mensaje);
  }

  /** Login institucional con RUC + contraseña: entidad o cuenta titular de la municipalidad. */
  loginConRuc(request: LoginEntidadRequest, tipo: RucLoginKind = 'entidad'): Observable<AuthSession> {
    const path = tipo === 'municipalidad' ? API_PATHS.authLoginMunicipalidad : API_PATHS.authLoginEntidad;
    return this.http
      .post<AuthEntidadResponse>(buildApiUrl(path), request)
      .pipe(
        tap(response => {
          this.persistSession({
            token: response.token,
            roles: this.resolveRoles(response.roles, response.token),
            loginKind: tipo,
            entidad: {
              entidadId: response.entityId,
              ruc: response.ruc,
              razonSocial: response.businessName,
              tipoEntidad: response.entityType,
              municipalidadId: response.municipalityId ?? null
            }
          });
        }),
        map(() => this._session() as AuthSession)
      );
  }

  /** Refresca el perfil del usuario (solo aplica al login DNI). */
  refreshProfile(): Observable<UserProfileResponse | null> {
    const current = this._session();
    if (!current || current.loginKind !== 'dni') {
      return of(null);
    }

    // Personal del panel (cualquier rol distinto de CIUDADANO) usa el perfil del panel.
    const esPanel = current.roles.some(r => r !== ROLES.CIUDADANO);
    const urlProfile = esPanel ? API_PATHS.authEntidadPerfil : API_PATHS.authProfile;

    return this.http.get<UserProfileResponse>(buildApiUrl(urlProfile)).pipe(
      tap(profile => this.updateSession({ ...current, profile })),
      catchError(() => of(null))
    );
  }

  /** Limpia la sesión y persiste el cambio. */
  logout(): void {
    this._session.set(null);
    if (this.browser) {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        // Ignoramos errores de almacenamiento (modo privado, etc.).
      }
    }
  }

  /**
   * Devuelve un nombre amigable para mostrar en el layout.
   * Prioriza el perfil DNI; si es login de entidad usa la razón social.
   */
  getDisplayName(): string {
    const current = this._session();
    if (!current) {
      return 'Invitado';
    }

    if (current.profile) {
      const { firstName, lastName } = current.profile;
      const composed = [firstName, lastName].filter(Boolean).join(' ').trim();
      if (composed) {
        return composed;
      }
    }

    if (current.token) {
      try {
        const payload = this.decodeJwtPayload(current.token);
        if (payload) {
          const givenName = payload['given_name'] ?? payload['firstName'] ?? payload['nombres'];
          const familyName = payload['family_name'] ?? payload['lastName'] ?? payload['apellidos'];
          const composed = [givenName as string, familyName as string].filter(Boolean).join(' ').trim();
          if (composed) {
            return composed;
          }
          if (typeof payload['name'] === 'string' && payload['name'].trim()) {
            return payload['name'].trim();
          }
        }
      } catch (error) {
        console.error('Error al decodificar el token en getDisplayName:', error);
      }
    }

    if (current.entidad?.razonSocial) {
      return current.entidad.razonSocial;
    }

    if (current.roles.length > 0) {
      return this.primaryRole() ?? current.roles[0];
    }

    return 'Usuario';
  }

  /** Iniciales (avatar) derivadas del nombre o RUC. */
  getInitials(): string {
    const name = this.getDisplayName();
    return name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part.charAt(0).toUpperCase())
      .join('') || 'CS';
  }

  private persistSession(session: AuthSession): void {
    this._session.set(session);
    if (this.browser) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
      } catch {
        // Ignoramos errores de almacenamiento (modo privado, etc.).
      }
    }
  }

  private updateSession(session: AuthSession): void {
    this.persistSession(session);
  }

  private readStoredSession(): AuthSession | null {
    if (!this.browser) {
      return null;
    }

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return null;
      }

      const parsed = JSON.parse(raw) as Partial<AuthSession>;
      if (!parsed?.token) {
        return null;
      }
      // Garantizar que roles siempre sea un array aunque la sesión guardada sea antigua
      if (!Array.isArray(parsed.roles)) {
        parsed.roles = [];
      }

      
      if (this.isTokenExpired(parsed.token)) {
        localStorage.removeItem(STORAGE_KEY);
        return null;
      }

      return parsed as AuthSession;
    } catch {
      return null;
    }
  }

  /** Evita usar JWT expirados guardados en localStorage. */
  private isTokenExpired(token: string): boolean {
    try {
      const payload = this.decodeJwtPayload(token);
      if (!payload) {
        // Token malformado → conservar la sesión y dejar que el servidor rechace
        return false;
      }
      const exp = payload['exp'];
      if (typeof exp !== 'number') {
        // Sin claim exp → token sin vencimiento definido, lo consideramos válido
        return false;
      }
      // Expirado si la fecha de expiración (menos 30s de margen) ya pasó
      return (exp - 30) * 1000 < Date.now();
    } catch {
      // Si no se puede decodificar conservar la sesión; el servidor validará
      return false;
    }
  }
}
