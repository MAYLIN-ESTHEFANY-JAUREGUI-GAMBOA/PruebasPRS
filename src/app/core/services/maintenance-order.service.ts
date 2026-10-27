import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { API_PATHS, buildApiUrl } from '../config/api-config';
import {
  AssignWorkshopRequest,
  CancelOrderRequest,
  CreateMaintenanceOrderRequest,
  MaintenanceOrder,
  MaintenanceOrderDetail,
  OrderStatus,
  TechnicalDischargeRequest,
  UpdateMaintenanceOrderRequest
} from '../models/maintenance-order.model';

@Injectable({
  providedIn: 'root'
})
export class MaintenanceOrderService {

  private readonly http = inject(HttpClient);
  private readonly baseUrl = buildApiUrl(API_PATHS.maintenanceOrders);

  getAll(): Observable<MaintenanceOrder[]> {
    return this.http.get<MaintenanceOrder[]>(this.baseUrl);
  }

  getById(id: string): Observable<MaintenanceOrderDetail> {
    return this.http.get<MaintenanceOrderDetail>(`${this.baseUrl}/${id}`);
  }

  getByCode(code: string): Observable<MaintenanceOrderDetail> {
    return this.http.get<MaintenanceOrderDetail>(`${this.baseUrl}/code/${code}`);
  }

  getByResource(resourceId: string): Observable<MaintenanceOrder[]> {
    return this.http.get<MaintenanceOrder[]>(`${this.baseUrl}/resource/${resourceId}`);
  }

  getByEntity(entityId: string): Observable<MaintenanceOrder[]> {
    return this.http.get<MaintenanceOrder[]>(`${this.baseUrl}/entity/${entityId}`);
  }

  getByStatus(status: OrderStatus): Observable<MaintenanceOrder[]> {
    return this.http.get<MaintenanceOrder[]>(`${this.baseUrl}/status/${status}`);
  }

  create(request: CreateMaintenanceOrderRequest): Observable<MaintenanceOrderDetail> {
    return this.http.post<MaintenanceOrderDetail>(this.baseUrl, request);
  }

  assignWorkshop(id: string, request: AssignWorkshopRequest): Observable<MaintenanceOrderDetail> {
    return this.http.patch<MaintenanceOrderDetail>(`${this.baseUrl}/${id}/workshop`, request);
  }

  startRepair(id: string): Observable<MaintenanceOrderDetail> {
    return this.http.patch<MaintenanceOrderDetail>(`${this.baseUrl}/${id}/start-repair`, {});
  }

  passToQualityControl(id: string): Observable<MaintenanceOrderDetail> {
    return this.http.patch<MaintenanceOrderDetail>(`${this.baseUrl}/${id}/quality-control`, {});
  }

  issueTechnicalDischarge(id: string, request: TechnicalDischargeRequest): Observable<MaintenanceOrderDetail> {
    return this.http.post<MaintenanceOrderDetail>(`${this.baseUrl}/${id}/technical-discharge`, request);
  }

  cancel(id: string, request: CancelOrderRequest): Observable<MaintenanceOrderDetail> {
    return this.http.patch<MaintenanceOrderDetail>(`${this.baseUrl}/${id}/cancel`, request);
  }

  update(id: string, request: UpdateMaintenanceOrderRequest): Observable<MaintenanceOrderDetail> {
    return this.http.put<MaintenanceOrderDetail>(`${this.baseUrl}/${id}`, request);
  }
}
