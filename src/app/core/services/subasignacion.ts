import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { API_PATHS, buildApiUrl } from '../config/api-config';
import { Subasignacion, SubasignacionCercana } from '../models/subasignacion.model';

@Injectable({
  providedIn: 'root'
})
export class SubasignacionService {

  private readonly apiUrl = buildApiUrl(API_PATHS.subasignacion);

  constructor(private http: HttpClient) {}

  listar(): Observable<Subasignacion[]> {
    return this.http.get<Subasignacion[]>(this.apiUrl);
  }

  obtenerPorId(id: string): Observable<Subasignacion> {
    return this.http.get<Subasignacion>(`${this.apiUrl}/${id}`);
  }

  obtenerPorRecurso(recursoId: string): Observable<Subasignacion[]> {
    return this.http.get<Subasignacion[]>(`${this.apiUrl}/resource/${recursoId}`);
  }

  obtenerPorEntidadDestino(entidadDestinoId: string): Observable<Subasignacion[]> {
    return this.http.get<Subasignacion[]>(`${this.apiUrl}/entity/${entidadDestinoId}`);
  }

  obtenerPorEstado(estado: string): Observable<Subasignacion[]> {
    return this.http.get<Subasignacion[]>(`${this.apiUrl}/status/${estado}`);
  }

  obtenerPorTurno(turno: string): Observable<Subasignacion[]> {
    return this.http.get<Subasignacion[]>(`${this.apiUrl}/shift/${turno}`);
  }

  crear(subasignacion: Subasignacion): Observable<Subasignacion> {
    return this.http.post<Subasignacion>(this.apiUrl, subasignacion);
  }

  actualizar(id: string, subasignacion: Subasignacion): Observable<Subasignacion> {
    return this.http.put<Subasignacion>(`${this.apiUrl}/${id}`, subasignacion);
  }

  cambiarEstado(id: string, estado: string): Observable<Subasignacion> {
    return this.http.patch<Subasignacion>(`${this.apiUrl}/${id}/status`, { status: estado });
  }

  eliminar(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }

  /**
   * Busca patrulleros ACTIVOS más cercanos a un punto de incidente.
   * Llama a GET /api/subasignaciones/nearby?lat=X&lon=Y&radiusKm=Z
   */
  buscarCercanos(lat: number, lon: number, radiusKm = 5): Observable<SubasignacionCercana[]> {
    return this.http.get<SubasignacionCercana[]>(`${this.apiUrl}/nearby`, {
      params: { lat: lat.toString(), lon: lon.toString(), radiusKm: radiusKm.toString() }
    });
  }
}
