/** Contrato de vg-ms-subasignacion (JSON en inglés). */
export interface Subasignacion {
  id?: string;
  resourceId?: string | null;
  targetEntityId?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  assignedBy?: string | null;
  shift?: string | null;
  notes?: string | null;
  status?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  createdAt?: string | null;
  updatedAt?: string | null;

}

/** Respuesta del endpoint GET /api/subassignments/nearby */
export interface SubasignacionCercana extends Subasignacion {
  /** Distancia en kilómetros desde el incidente hasta este patrullero */
  distanceKm: number;
  /** true si el patrullero tiene posición GPS registrada */
  hasLocation: boolean;
}
