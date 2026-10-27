import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

import { API_PATHS, buildApiUrl } from '../config/api-config';
import { Entidad } from '../models/entidad.model';
import { EntidadDetalle } from '../models/incident';

@Injectable({
  providedIn: 'root'
})
export class EntidadService {

  private readonly apiUrl = buildApiUrl(API_PATHS.entidades);

  constructor(private http: HttpClient) {}

  listar(): Observable<Entidad[]> {
    return this.http.get<Entidad[]>(this.apiUrl);
  }

  obtenerPorId(id: string): Observable<Entidad> {
    return this.http.get<Entidad>(`${this.apiUrl}/${id}`);
  }

  obtenerPorRuc(ruc: string): Observable<Entidad> {
    return this.http.get<Entidad>(`${this.apiUrl}/ruc/${ruc}`);
  }

  obtenerPorTipo(tipoEntidad: string): Observable<Entidad[]> {
    return this.http.get<Entidad[]>(`${this.apiUrl}/type/${tipoEntidad}`);
  }

  obtenerPorEstado(estado: string): Observable<Entidad[]> {
    return this.http.get<Entidad[]>(`${this.apiUrl}/status/${estado}`);
  }

  buscarPorRazonSocial(razonSocial: string): Observable<Entidad[]> {
    const params = new HttpParams().set('businessName', razonSocial);
    return this.http.get<Entidad[]>(`${this.apiUrl}/search`, { params });
  }

  crear(entidad: Entidad): Observable<Entidad> {
    return this.http.post<Entidad>(this.apiUrl, entidad);
  }

  actualizar(id: string, entidad: Entidad): Observable<Entidad> {
    return this.http.put<Entidad>(`${this.apiUrl}/${id}`, entidad);
  }

  desactivar(id: string): Observable<Entidad> {
    return this.http.patch<Entidad>(`${this.apiUrl}/${id}/deactivate`, {});
  }

  activar(id: string): Observable<Entidad> {
    return this.http.patch<Entidad>(`${this.apiUrl}/${id}/activate`, {});
  }

  existePorRuc(ruc: string): Observable<boolean> {
    return this.http.get<boolean>(`${this.apiUrl}/exists/ruc/${ruc}`);
  }
}

/** /api/entities responde en inglés; EntidadDetalle es la forma que usan emergencias y escalamiento. */
export function entidadADetalle(e: Entidad): EntidadDetalle {
  return {
    id: e.id as string,
    ruc: e.ruc,
    businessName: e.businessName,
    entityType: e.entityType,
    handledEmergencyTypes: e.handledEmergencyTypes,
    status: e.status,
    baseLocation: e.baseLocation as EntidadDetalle['baseLocation']
  };
}
