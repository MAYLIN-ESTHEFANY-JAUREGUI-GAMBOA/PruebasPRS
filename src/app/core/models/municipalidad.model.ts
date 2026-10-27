/** DTOs alineados con vg-ms-municipalidades (`MunicipalityResponse` / `SaveMunicipalityRequest`). */

export type EstadoMunicipalidad = 'ACTIVA' | 'SUSPENDIDA';
/** PROVINCIAL cubre su provincia (4 dígitos del UBIGEO); DISTRITAL solo su distrito (6). */
export type TipoMunicipalidad = 'PROVINCIAL' | 'DISTRITAL';

export interface Municipalidad {
  id: string;
  ruc: string;
  businessName: string;
  logoUrl?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  location?: { lat: number; lng: number } | null;
  /** UBIGEO INEI del distrito sede (6 dígitos). */
  ubigeo?: string | null;
  type?: TipoMunicipalidad | null;
  status: EstadoMunicipalidad;
}

export interface GuardarMunicipalidadRequest {
  ruc: string;
  businessName: string;
  logoUrl?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  location: { lat: number; lng: number };
  ubigeo: string;
  type: TipoMunicipalidad;
  /** Clave de la cuenta titular (login por RUC): obligatoria al crear, opcional al editar. */
  password?: string;
}
