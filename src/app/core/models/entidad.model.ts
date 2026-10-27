/** Contrato de vg-ms-entidades (JSON en inglés). */
export interface Entidad {
  id?: string;

  roleId: string;
  /** Tenant: municipalidad a la que pertenece (la fija el backend para MUNICIPALIDAD_ADMIN). */
  municipalityId?: string | null;
  /** UBIGEO INEI del distrito donde opera (6 dígitos); debe estar en la jurisdicción de su municipalidad. */
  ubigeo?: string | null;
  ruc: string;
  businessName: string;
  entityType: string;
  /** Tipos de emergencia que la entidad puede atender. */
  handledEmergencyTypes?: string[] | null;

  password?: string;
  securityPin?: string;

  baseLocation?: Record<string, unknown> | null;
  contactData?: Record<string, unknown> | null;

  status: string;
  createdAt?: string | null;
}
