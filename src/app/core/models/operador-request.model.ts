import { EstadoIncidente, TipoEmergencia, PrioridadAlerta } from './incident';

export interface TomarIncidenteRequest {
  operatorName?: string;
}

export interface VerificarIncidenteRequest {
  newSeverity: PrioridadAlerta;
  status: EstadoIncidente;
}

// DTO para Caso 1: Transferir (Transfer)
export interface TransferirIncidenteRequest {
  newEntityId: string;
  reason: string;
}

// DTO para Caso 2: Dividir (Split)
export interface DividirIncidenteRequest {
  alertIdsToExtract: string[];
  newType: TipoEmergencia;
  targetEntityId: string;
}

// DTO para Caso 3: Fusionar (Merge / Duplicado)
export interface FusionarIncidenteRequest {
  duplicateId: string;
  reason: string;
}

// DTO para la Derivación estándar
export interface DerivarIncidenteRequest {
  newEmergencyType: TipoEmergencia;
  targetEntityId: string;
}

export interface SolicitarApoyoRequest {
  newEntityId: string;
  reason: string;
}