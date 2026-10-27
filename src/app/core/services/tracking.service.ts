import { Injectable, NgZone } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, interval, switchMap, distinctUntilChanged, catchError, EMPTY } from 'rxjs';

import { API_PATHS, buildApiUrl } from '../config/api-config';
import { LocationHistory } from '../models/location-history.model';

@Injectable({
  providedIn: 'root'
})
export class TrackingService {

  private readonly baseUrl = buildApiUrl(API_PATHS.tracking);

  constructor(
    private readonly http: HttpClient,
    private readonly ngZone: NgZone
  ) {}

  /**
   * POST /api/tracking/{id}/location — PÚBLICO (sin JWT requerido).
   * Reporta la posición actual del operario desde la página pública.
   */
  reportLocation(
    subassignmentId: string,
    lat: number,
    lng: number,
    accuracy: number | null
  ): Observable<LocationHistory> {
    return this.http.post<LocationHistory>(
      `${this.baseUrl}/${subassignmentId}/location`,
      { lat, lng, accuracy, source: 'APP' }
    );
  }

  /**
   * GET /api/tracking/{id}/history — Autenticado.
   * Devuelve las últimas 50 posiciones de la subasignación.
   */
  getHistory(subassignmentId: string): Observable<LocationHistory[]> {
    return this.http.get<LocationHistory[]>(
      `${this.baseUrl}/${subassignmentId}/history`
    );
  }

  /**
   * GET /api/tracking/{id}/latest — Autenticado.
   * Devuelve la posición más reciente.
   */
  getLatest(subassignmentId: string): Observable<LocationHistory> {
    return this.http.get<LocationHistory>(
      `${this.baseUrl}/${subassignmentId}/latest`
    );
  }

  /**
   * Polling de la posición más reciente cada `intervalMs` milisegundos.
   *
   * Reemplaza el SSE para garantizar compatibilidad con:
   *  - El proxy de Angular CLI en local (/api → localhost:9000)
   *  - El gateway en producción (https://lab.vallegrande.edu.pe/canete-seguro/api)
   *  - El interceptor de auth (JWT se adjunta automáticamente vía HttpClient)
   *
   * El observable se completa al hacer unsubscribe (cierra el polling).
   * Los errores individuales se tragan silenciosamente para no romper el stream.
   */
  pollLatest(subassignmentId: string, intervalMs = 5000): Observable<LocationHistory> {
    return interval(intervalMs).pipe(
      switchMap(() =>
        this.http.get<LocationHistory>(
          `${this.baseUrl}/${subassignmentId}/latest`
        ).pipe(
          catchError(() => EMPTY)   // error silencioso — reintenta en el siguiente tick
        )
      ),
      distinctUntilChanged((a, b) => a.recordedAt === b.recordedAt)
    );
  }

  /**
   * Polling del historial completo cada `intervalMs` milisegundos.
   * Útil para mantener la polyline actualizada sin SSE.
   */
  pollHistory(subassignmentId: string, intervalMs = 10000): Observable<LocationHistory[]> {
    return interval(intervalMs).pipe(
      switchMap(() =>
        this.http.get<LocationHistory[]>(
          `${this.baseUrl}/${subassignmentId}/history`
        ).pipe(
          catchError(() => EMPTY)
        )
      )
    );
  }
}
