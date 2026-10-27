export type MaintenanceType =
  | 'PREVENTIVO'
  | 'CORRECTIVO'
  | 'CORRECTIVO_ACCIDENTE'
  | 'INSPECCION_REGLAMENTARIA'
  | 'PREVENTIVE'
  | 'CORRECTIVE'
  | 'CORRECTIVE_ACCIDENT'
  | 'REGULATORY_INSPECTION';

export type OrderStatus =
  | 'REGISTRADA'
  | 'EN_DIAGNOSTICO'
  | 'EN_TALLER'
  | 'EN_CONTROL_CALIDAD'
  | 'FINALIZADA'
  | 'CANCELADA'
  | 'REGISTERED'
  | 'IN_DIAGNOSIS'
  | 'IN_WORKSHOP'
  | 'QUALITY_CONTROL'
  | 'COMPLETED'
  | 'CANCELLED';

export type OrderPriority =
  | 'BAJA'
  | 'MEDIA'
  | 'ALTA'
  | 'CRITICA'
  | 'LOW'
  | 'MEDIUM'
  | 'HIGH'
  | 'CRITICAL';

export interface WorkshopDetail {
  workshopName: string;
  workshopRuc?: string | null;
  mechanicInCharge?: string | null;
  contactPhone?: string | null;
  workshopAddress?: string | null;
  estimatedCost?: number | null;
  finalCost?: number | null;
  estimatedDeliveryDate?: string | null;
  initialDiagnosis?: string | null;
}

export interface TechnicalDischargeReport {
  technicalVerdict: string;
  testsPerformed?: string | null;
  exitMileage: number;
  dischargeDate?: string | null;
  approvedByDni?: string | null;
  remarks?: string | null;
  mediaUrl?: string | null;
}

export interface MaintenanceOrder {
  id: string;
  orderCode: string;
  resourceId: string;
  resourcePlate?: string | null;
  entityId: string;
  reportedByDni?: string | null;
  maintenanceType: MaintenanceType;
  orderStatus: OrderStatus;
  priority: OrderPriority;
  failureReason: string;
  reportedMileage?: number | null;
  status?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface MaintenanceOrderDetail extends MaintenanceOrder {
  incidentId?: string | null;
  workshopDetail?: WorkshopDetail | null;
  technicalDischargeReport?: TechnicalDischargeReport | null;
  remarks?: string | null;
}

export interface CreateMaintenanceOrderRequest {
  resourceId: string;
  resourcePlate?: string;
  entityId?: string;
  incidentId?: string;
  maintenanceType: MaintenanceType;
  priority?: OrderPriority;
  failureReason: string;
  reportedMileage?: number;
  remarks?: string;
}

export interface AssignWorkshopRequest {
  workshopName: string;
  workshopRuc?: string;
  mechanicInCharge?: string;
  contactPhone?: string;
  workshopAddress?: string;
  estimatedCost?: number;
  estimatedDeliveryDate?: string;
  initialDiagnosis?: string;
}

export interface TechnicalDischargeRequest {
  technicalVerdict: string;
  testsPerformed?: string;
  exitMileage: number;
  finalCost?: number;
  remarks?: string;
  mediaUrl?: string;
}

export interface CancelOrderRequest {
  reason: string;
}

export interface UpdateMaintenanceOrderRequest {
  failureReason?: string;
  reportedMileage?: number | null;
  priority?: OrderPriority;
  remarks?: string | null;
  incidentId?: string | null;
  workshopDetail?: AssignWorkshopRequest | null;
}
