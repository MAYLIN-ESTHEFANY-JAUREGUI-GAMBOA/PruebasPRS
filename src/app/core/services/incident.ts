import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { API_PATHS, buildApiUrl } from '../config/api-config';
import { AuthService } from '../auth/auth.service';
import {
  EmergencyType,
  Incident,
  IncidentSeverity,
  IncidentStatus,
  IncidentWithEntities,
  LinkedAlertDTO,
  normalizarAlertaVinculada,
  ReopenIncidentRequest
} from '../models/incident';
import {
  DerivarIncidenteRequest,
  DividirIncidenteRequest,
  FusionarIncidenteRequest,
  SolicitarApoyoRequest,
  TomarIncidenteRequest,
  TransferirIncidenteRequest,
  VerificarIncidenteRequest
} from '../models/operador-request.model';

/**
 * Servicio de incidentes / emergencias.
 *
 * Apunta al `IncidenteEnriquecidoController` del microservicio `vg-ms-emergencias`,
 * que devuelve cada incidente con la lista de entidades responsables resuelta.
 */
@Injectable({ providedIn: 'root' })
export class IncidentService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);

  private readonly apiUrl = buildApiUrl(API_PATHS.incidentesEnriquecidos);
  private readonly incidentsBaseUrl = buildApiUrl(API_PATHS.incident);

  /** Lista incidentes enriquecidos visibles para el usuario actual. */
  list(): Observable<IncidentWithEntities[]> {
    return this.http.get<IncidentWithEntities[]>(this.apiUrl);
  }

  /** Detalle enriquecido de un incidente por ID. */
  getById(id: string): Observable<IncidentWithEntities> {
    return this.http.get<IncidentWithEntities>(`${this.apiUrl}/${id}`);
  }

  /** Crea un incidente manualmente (operador de turno). */
  createManual(payload: { severity: string; location: { lat: number; lng: number } }): Observable<unknown> {
    return this.http.post(`${this.incidentsBaseUrl}/manual`, payload);
  }

  /** Cierra un incidente (requiere ADMIN o entidad responsable). */
  close(id: string, finalResolution: string): Observable<unknown> {
    return this.http.patch(
      `${this.incidentsBaseUrl}/${id}/close`,
      {
        reason: finalResolution,
        motivo: finalResolution,
        finalResolution,
        closingReason: finalResolution,
        tipoResolucion: 'ATENDIDO'
      }
    );
  }

  /** Traspaso de mando a otra entidad. */
  handoffCommand(id: string, payload: { newCommandEntityId: string; justification: string }): Observable<unknown> {
    return this.http.post(`${this.incidentsBaseUrl}/${id}/handoff`, payload);
  }

  /** Reabre un incidente cerrado (requiere ADMIN o entidad responsable). */
  reopen(id: string, request: ReopenIncidentRequest): Observable<Incident> {
    return this.http.patch<Incident>(`${this.incidentsBaseUrl}/${id}/reopen`, request);
  }

  /** Cambia gravedad / estado del incidente. */
  update(id: string, changes: { severity?: string; currentStatus?: IncidentStatus }): Observable<unknown> {
    return this.http.put(`${this.incidentsBaseUrl}/${id}`, changes);
  }

  // FUNCIONALIDADES DEL OPERADOR
  /** Asigna el incidente al operador logueado. */
  takeIncident(id: string, request?: TomarIncidenteRequest): Observable<Incident> {
    return this.http.post<Incident>(
      `${this.incidentsBaseUrl}/${id}/take`,
      request ?? {}
    );
  }

  /** Verifica gravedad y estado (Triage). */
  verifyIncident(id: string, request: VerificarIncidenteRequest): Observable<Incident> {
    return this.http.post<Incident>(
      `${this.incidentsBaseUrl}/${id}/verify`,
      request
    );
  }

  /** Solicita apoyo a otra entidad (sala de crisis). */
  requestSupport(id: string, request: SolicitarApoyoRequest): Observable<Incident> {
    return this.http.post<Incident>(
      `${this.incidentsBaseUrl}/${id}/support`,
      request
    );
  }

  /** Registra despacho de unidad. */
  dispatchUnit(id: string, unitId: string): Observable<Incident> {
    return this.http.post<Incident>(
      `${this.incidentsBaseUrl}/${id}/dispatch`,
      null,
      { params: { unitId } }
    );
  }

  /** Cancela despacho de unidad. */
  cancelDispatch(incidentId: string, unitId: string): Observable<Incident> {
    return this.http.delete<Incident>(`${this.incidentsBaseUrl}/${incidentId}/dispatch/${unitId}`);
  }

  /** Actualiza estado táctico de unidad despachada. */
  updateTacticalStatus(incidentId: string, unitId: string, status: string): Observable<Incident> {
    return this.http.patch<Incident>(
      `${this.incidentsBaseUrl}/${incidentId}/dispatch/${unitId}/status`,
      null,
      { params: { status } }
    );
  }

  /** Agrega nota a la bitácora del incidente. */
  addLogbookNote(id: string, action: string, detail: string): Observable<Incident> {
    return this.http.post<Incident>(
      `${this.incidentsBaseUrl}/${id}/logbook`,
      { action, detail }
    );
  }

  /** Obtiene detalle crudo de MongoDB. */
  getRawDetail(id: string): Observable<Incident> {
    return this.http.get<Incident>(`${this.incidentsBaseUrl}/${id}`);
  }

  /** Obtiene alertas vinculadas al incidente. */
  getLinkedAlerts(id: string): Observable<LinkedAlertDTO[]> {
    return this.http.get<any[]>(`${this.incidentsBaseUrl}/${id}/linked-alerts`).pipe(
      map((items: any[]) => (items || []).map(normalizarAlertaVinculada))
    );
  }

  // OPERACIONES DE ESCALAMIENTO
  transferIncident(id: string, request: TransferirIncidenteRequest): Observable<Incident> {
    return this.http.post<Incident>(`${this.incidentsBaseUrl}/${id}/transfer`, request);
  }

  splitIncident(id: string, request: DividirIncidenteRequest): Observable<Incident> {
    return this.http.post<Incident>(`${this.incidentsBaseUrl}/${id}/split`, request);
  }

  mergeIncident(idPrincipal: string, request: FusionarIncidenteRequest): Observable<Incident> {
    return this.http.post<Incident>(`${this.incidentsBaseUrl}/${idPrincipal}/merge`, request);
  }

  deriveIncident(id: string, request: DerivarIncidenteRequest): Observable<Incident> {
    return this.http.post<Incident>(`${this.incidentsBaseUrl}/${id}/derive`, request);
  }

  /** Conjunto fijo de tipos de emergencia conocidos. */
  readonly emergencyTypes: ReadonlyArray<{ value: EmergencyType; label: string }> = [
    { value: 'ACCIDENTE_TRANSITO', label: 'Accidente de tránsito' },
    { value: 'INCENDIO', label: 'Incendio' },
    { value: 'SALUD', label: 'Salud' },
    { value: 'EMERGENCIA_MEDICA', label: 'Emergencia médica' },
    { value: 'ROBO', label: 'Robo' },
    { value: 'VIOLENCIA', label: 'Violencia' },
    { value: 'SEGURIDAD', label: 'Seguridad' },
    { value: 'DESASTRE_NATURAL', label: 'Desastre natural' },
    { value: 'EXPLOSION', label: 'Explosión' },
    { value: 'OTRO', label: 'Otro' }
  ];

  /** Estados disponibles para filtro. */
  readonly incidentStatuses: ReadonlyArray<{ value: IncidentStatus | 'TODOS'; label: string }> = [
    { value: 'TODOS', label: 'Todos' },
    { value: 'NUEVO', label: 'Nuevo' },
    { value: 'EN_ATENCION', label: 'En atención' },
    { value: 'VERIFICACION_PENDIENTE', label: 'Verificación pendiente' },
    { value: 'CERRADO', label: 'Cerrado' },
    { value: 'ELIMINADO', label: 'Eliminado' }
  ];

  // Alias retrocompatibles
  listar(): Observable<IncidentWithEntities[]> { return this.list(); }
  obtenerPorId(id: string): Observable<IncidentWithEntities> { return this.getById(id); }
  crearManual(payload: { severity: string; location: { lat: number; lng: number } }): Observable<unknown> { return this.createManual(payload); }
  cerrar(id: string, resolucionFinal: string): Observable<unknown> { return this.close(id, resolucionFinal); }
  traspasarComando(id: string, payload: { newCommandEntityId: string; justification: string }): Observable<unknown> { return this.handoffCommand(id, payload); }
  reaperturar(id: string, request: ReopenIncidentRequest): Observable<Incident> { return this.reopen(id, request); }
  actualizar(id: string, cambios: { severity?: string; currentStatus?: IncidentStatus }): Observable<unknown> { return this.update(id, cambios); }
  tomarIncidente(id: string, request?: TomarIncidenteRequest): Observable<Incident> { return this.takeIncident(id, request); }
  verificarIncidente(id: string, request: VerificarIncidenteRequest): Observable<Incident> { return this.verifyIncident(id, request); }
  solicitarApoyoEntidad(id: string, request: SolicitarApoyoRequest): Observable<Incident> { return this.requestSupport(id, request); }
  registrarDespacho(id: string, unidadId: string): Observable<Incident> { return this.dispatchUnit(id, unidadId); }
  cancelarDespacho(incidenteId: string, unidadId: string): Observable<Incident> { return this.cancelDispatch(incidenteId, unidadId); }
  actualizarEstadoTactico(incidenteId: string, unidadId: string, estado: string): Observable<Incident> { return this.updateTacticalStatus(incidenteId, unidadId, estado); }
  agregarNotaBitacora(id: string, accion: string, detalle: string): Observable<Incident> { return this.addLogbookNote(id, accion, detalle); }
  obtenerDetallePuro(id: string): Observable<Incident> { return this.getRawDetail(id); }
  obtenerAlertasVinculadas(id: string): Observable<LinkedAlertDTO[]> { return this.getLinkedAlerts(id); }
  transferirIncidente(id: string, request: TransferirIncidenteRequest): Observable<Incident> { return this.transferIncident(id, request); }
  dividirIncidente(id: string, request: DividirIncidenteRequest): Observable<Incident> { return this.splitIncident(id, request); }
  fusionarIncidente(idPrincipal: string, request: FusionarIncidenteRequest): Observable<Incident> { return this.mergeIncident(idPrincipal, request); }
  derivarIncidente(id: string, request: DerivarIncidenteRequest): Observable<Incident> { return this.deriveIncident(id, request); }
  get tiposEmergencia() { return this.emergencyTypes; }
  get estadosIncidente() { return this.incidentStatuses; }
}

/** Alias retrocompatible de clase */
export { IncidentService as EmergenciaService };
