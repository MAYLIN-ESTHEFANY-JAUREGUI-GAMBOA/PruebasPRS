/** DTOs alineados con vg-ms-auth. */

export type LoginContext = 'APP' | 'PANEL_ENTIDAD' | 'PANEL_MUNICIPALIDAD';

/** Cuenta que inicia sesión por RUC: entidad o cuenta titular de la municipalidad. */
export type RucLoginKind = 'entidad' | 'municipalidad';

export interface LoginDniRequest {
  dni: string;
  password: string;
  context: LoginContext;
}

export interface LoginEntidadRequest {
  ruc: string;
  password: string;
}

/** Respuesta de `/auth/login`. */
export interface AuthResponse {
  token: string;
  roles: string[];
}

/** Respuesta de `/auth/login/entity` y `/auth/login/municipality`. */
export interface AuthEntidadResponse {
  token: string;
  roles: string[];
  /** null en la cuenta titular de municipalidad. */
  entityId: string | null;
  ruc: string;
  businessName: string;
  entityType: string;
  municipalityId?: string | null;
}

export interface UserProfileResponse {
  id: string;
  dni: string;
  firstName: string;
  lastName: string;
  phone?: string;
  email?: string;
  profilePhotoUrl?: string;
  entityId?: string;
  createdAt?: string;
}

/** Sesión persistida en localStorage. */
export interface AuthSession {
  token: string;
  roles: string[];
  /** Tipo de credencial usada para iniciar sesión. */
  loginKind: 'dni' | RucLoginKind;
  /** Metadata enriquecida cuando el login fue por entidad. */
  entidad?: {
    entidadId: string | null;
    ruc: string;
    razonSocial: string;
    tipoEntidad: string;
    municipalidadId?: string | null;
  };
  /** Perfil cargado tras el login (DNI). */
  profile?: UserProfileResponse;
}
