/**
 * TrackingOperario — página pública de compartición GPS.
 *
 * El operario abre esta URL en su celular (sin login).
 * Pide permiso GPS al browser, y cada 10 segundos envía la posición
 * al backend via POST /api/tracking/{id}/ubicacion.
 *
 * Diseño mobile-first, fondo oscuro tipo noche.
 */
import {
  Component, OnInit, OnDestroy,
  ChangeDetectionStrategy, ChangeDetectorRef, NgZone, inject
} from '@angular/core';
import { CommonModule, DOCUMENT } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { OsmMap, GeoPunto, MapaMarcador } from '../../../shared/components/osm-map/osm-map';
import { Subscription } from 'rxjs';

import { TrackingService } from '../../../core/services/tracking.service';

type EstadoGps = 'esperando' | 'compartiendo' | 'sin-conexion' | 'denegado';

@Component({
  selector: 'app-tracking-operario',
  standalone: true,
  imports: [CommonModule, OsmMap],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './tracking-operario.html',
  styleUrl: './tracking-operario.css'
})
export class TrackingOperario implements OnInit, OnDestroy {

  subassignmentId = '';
  estado: EstadoGps = 'esperando';

  posicionActual: GeoPunto | null = null;
  accuracy: number | null = null;
  ultimoEnvio: Date | null = null;
  intentosEnvio = 0;
  erroresConsecutivos = 0;

  // Centro por defecto: Cañete, Lima, Perú
  readonly defaultCenter: GeoPunto = { lat: -13.0767, lng: -76.3896 };
  mapZoom = 16;

  get mapCenter(): GeoPunto {
    return this.posicionActual ?? this.defaultCenter;
  }

  get marcadores(): MapaMarcador[] {
    return this.posicionActual ? [{ ...this.posicionActual, punto: true, color: '#22d3ee', titulo: 'Mi posición' }] : [];
  }

  get etiquetaEstado(): string {
    switch (this.estado) {
      case 'esperando':     return 'Esperando GPS…';
      case 'compartiendo':  return 'Compartiendo ubicación…';
      case 'sin-conexion':  return 'Sin conexión';
      case 'denegado':      return 'GPS denegado';
    }
  }

  get ultimoEnvioTexto(): string {
    if (!this.ultimoEnvio) return '—';
    return this.ultimoEnvio.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  private watchId: number | null = null;
  private sendTimer: ReturnType<typeof setInterval> | null = null;
  private pendingSend = false;
  private lastSentAt = 0;
  private readonly THROTTLE_MS = 10_000;

  private readonly route    = inject(ActivatedRoute);
  private readonly tracking = inject(TrackingService);
  private readonly cdr      = inject(ChangeDetectorRef);
  private readonly ngZone   = inject(NgZone);
  private readonly doc      = inject(DOCUMENT);

  private sub?: Subscription;

  ngOnInit(): void {
    this.subassignmentId = this.route.snapshot.paramMap.get('id') ?? '';
    this.iniciarGPS();
  }

  ngOnDestroy(): void {
    this.detenerGPS();
    this.sub?.unsubscribe();
  }

  private iniciarGPS(): void {
    if (!navigator.geolocation) {
      this.ngZone.run(() => {
        this.estado = 'denegado';
        this.cdr.markForCheck();
      });
      return;
    }

    this.watchId = navigator.geolocation.watchPosition(
      (pos) => this.ngZone.run(() => this.onPosicion(pos)),
      (err) => this.ngZone.run(() => this.onError(err)),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 5_000 }
    );

    // Timer independiente que dispara envíos cada 10s
    this.sendTimer = setInterval(() => {
      if (this.posicionActual && this.pendingSend) {
        this.enviarPosicion(this.posicionActual.lat, this.posicionActual.lng, this.accuracy);
      }
    }, this.THROTTLE_MS);
  }

  private onPosicion(pos: GeolocationPosition): void {
    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;
    const acc = pos.coords.accuracy ?? null;

    this.posicionActual = { lat, lng };
    this.accuracy       = acc;
    this.estado         = 'compartiendo';
    this.erroresConsecutivos = 0;

    const ahora = Date.now();
    if (ahora - this.lastSentAt >= this.THROTTLE_MS) {
      this.enviarPosicion(lat, lng, acc);
    } else {
      // Marcar para enviar en el próximo tick del timer
      this.pendingSend = true;
    }

    this.cdr.markForCheck();
  }

  private onError(err: GeolocationPositionError): void {
    if (err.code === GeolocationPositionError.PERMISSION_DENIED) {
      this.estado = 'denegado';
      this.detenerGPS();
    } else {
      this.erroresConsecutivos++;
      if (this.erroresConsecutivos >= 3) {
        this.estado = 'sin-conexion';
      }
    }
    this.cdr.markForCheck();
  }

  private enviarPosicion(lat: number, lng: number, accuracy: number | null): void {
    if (!this.subassignmentId) return;
    this.pendingSend  = false;
    this.lastSentAt   = Date.now();
    this.intentosEnvio++;

    this.sub = this.tracking.reportLocation(this.subassignmentId, lat, lng, accuracy).subscribe({
      next: () => {
        this.ngZone.run(() => {
          this.ultimoEnvio         = new Date();
          this.erroresConsecutivos = 0;
          this.estado              = 'compartiendo';
          this.cdr.markForCheck();
        });
      },
      error: () => {
        this.ngZone.run(() => {
          this.erroresConsecutivos++;
          if (this.erroresConsecutivos >= 3) {
            this.estado = 'sin-conexion';
          }
          this.cdr.markForCheck();
        });
      }
    });
  }

  private detenerGPS(): void {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    if (this.sendTimer !== null) {
      clearInterval(this.sendTimer);
      this.sendTimer = null;
    }
  }

  reintentar(): void {
    this.estado           = 'esperando';
    this.erroresConsecutivos = 0;
    this.detenerGPS();
    this.iniciarGPS();
    this.cdr.markForCheck();
  }
}
