/**
 * GeoPatrolMap — mapa en tiempo real de patrulleros activos.
 *
 * Muestra todos los patrulleros activos con ubicación GPS registrada.
 * Soporta polling configurable para actualización en tiempo real.
 *
 * Inputs:
 *  subasignaciones   — lista de subasignaciones a mostrar
 *  getRecursoLabel   — función para resolver nombre de recurso por ID
 *  getEntidadLabel   — función para resolver nombre de entidad por ID
 *  height            — altura CSS del mapa (default '480px')
 *  radiusKm          — radio de búsqueda en km para el buscador de cercanos
 */
import {
  Component, Input, Output, EventEmitter,
  OnChanges, SimpleChanges, OnDestroy,
  ChangeDetectionStrategy, ChangeDetectorRef, NgZone
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { OsmMap, MapaMarcador, GeoPunto } from '../osm-map/osm-map';
import { Subasignacion, SubasignacionCercana } from '../../../core/models/subasignacion.model';

export interface PatrolMarker {
  sub: Subasignacion;
  position: GeoPunto;
  color: string;
  label: string;
  entidadLabel: string;
  distanceKm?: number;
}

@Component({
  selector: 'app-geo-patrol-map',
  standalone: true,
  imports: [CommonModule, FormsModule, OsmMap],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="geo-patrol-wrap" [style.height]="height">

      <!-- Toolbar del mapa -->
      <div class="geo-patrol-toolbar">
        <div class="geo-patrol-toolbar__left">
          <span class="geo-patrol-toolbar__badge geo-patrol-toolbar__badge--activos">
            <span class="geo-patrol-pulse"></span>
            {{ markersConUbicacion.length }} con GPS
          </span>
          <span class="geo-patrol-toolbar__badge geo-patrol-toolbar__badge--sin-gps">
            {{ markersSinUbicacion }} sin GPS
          </span>
        </div>

        <!-- Buscador de cercanos -->
        <div class="geo-patrol-toolbar__right">
          <button type="button"
                  class="geo-patrol-btn geo-patrol-btn--gps"
                  [class.geo-patrol-btn--loading]="buscandoCercanos"
                  [disabled]="buscandoCercanos"
                  (click)="buscarCercanosAlClick()"
                  title="Buscar patrulleros cercanos a tu posición">
            @if (buscandoCercanos) {
              <span class="geo-patrol-spinner"></span>
            } @else {
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-4 h-4">
                <path fill-rule="evenodd" d="m11.54 22.351.07.04.028.016a.76.76 0 0 0 .723 0l.028-.015.071-.041a16.975 16.975 0 0 0 1.144-.742 19.58 19.58 0 0 0 2.683-2.282c1.944-1.99 3.963-4.98 3.963-8.827a8.25 8.25 0 0 0-16.5 0c0 3.846 2.02 6.837 3.963 8.827a19.58 19.58 0 0 0 2.682 2.282 16.975 16.975 0 0 0 1.145.742ZM12 13.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" clip-rule="evenodd" />
              </svg>
            }
            Cercanos a mí
          </button>

          @if (cercanosActivos) {
            <button type="button" class="geo-patrol-btn geo-patrol-btn--clear" (click)="limpiarCercanos()">
              ✕ Quitar filtro
            </button>
          }
        </div>
      </div>

      <!-- Mapa principal -->
      <div [style.height]="mapInnerHeight">
        <app-osm-map altura="100%" [centro]="center" [zoom]="mapZoom" [marcadores]="marcadores" [encuadrar]="!miPosicion" />
      </div>

      <!-- Lista de cercanos -->
      @if (cercanosActivos && resultadosCercanos.length > 0) {
        <div class="geo-patrol-cercanos">
          <p class="geo-patrol-cercanos__title">
            Patrulleros cercanos (radio {{ radiusKm }} km)
          </p>
          <div class="geo-patrol-cercanos__list">
            @for (c of resultadosCercanos; track c.id) {
              <div class="geo-patrol-cercanos__item">
                <span class="geo-patrol-cercanos__icon">🚓</span>
                <div class="geo-patrol-cercanos__info">
                  <p class="geo-patrol-cercanos__nombre">{{ getRecursoLabel(c.resourceId) }}</p>
                  <p class="geo-patrol-cercanos__entidad">{{ getEntidadLabel(c.targetEntityId) }}</p>
                </div>
                <span class="geo-patrol-cercanos__dist">{{ c.distanceKm | number:'1.2-2' }} km</span>
              </div>
            }
          </div>
        </div>
      }

      @if (cercanosActivos && resultadosCercanos.length === 0 && !buscandoCercanos) {
        <div class="geo-patrol-cercanos geo-patrol-cercanos--empty">
          <p>No hay patrulleros activos con GPS en un radio de {{ radiusKm }} km.</p>
        </div>
      }
    </div>
  `,
  styles: [`
    :host { display: block; }

    .geo-patrol-wrap {
      position: relative;
      border-radius: 0.75rem;
      overflow: hidden;
      border: 1.5px solid #e2e8f0;
      background: #f8fafc;
      display: flex;
      flex-direction: column;
    }

    /* Toolbar */
    .geo-patrol-toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      padding: 0.5rem 0.75rem;
      background: rgba(255,255,255,0.97);
      border-bottom: 1px solid #e2e8f0;
      flex-shrink: 0;
      flex-wrap: wrap;
      z-index: 10;
    }
    .geo-patrol-toolbar__left,
    .geo-patrol-toolbar__right {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex-wrap: wrap;
    }

    .geo-patrol-toolbar__badge {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      font-size: 0.72rem;
      font-weight: 600;
      padding: 0.2rem 0.6rem;
      border-radius: 999px;
    }
    .geo-patrol-toolbar__badge--activos {
      background: #dcfce7; color: #166534; border: 1px solid #bbf7d0;
    }
    .geo-patrol-toolbar__badge--sin-gps {
      background: #f1f5f9; color: #64748b; border: 1px solid #e2e8f0;
    }

    .geo-patrol-pulse {
      width: 0.5rem; height: 0.5rem;
      border-radius: 50%;
      background: #22c55e;
      box-shadow: 0 0 0 2px #bbf7d0;
      animation: pulse-gps 1.4s infinite;
      flex-shrink: 0;
    }
    @keyframes pulse-gps {
      0%,100% { box-shadow: 0 0 0 0 rgba(34,197,94,0.6); }
      50%      { box-shadow: 0 0 0 5px rgba(34,197,94,0); }
    }

    .geo-patrol-btn {
      display: inline-flex; align-items: center; gap: 0.35rem;
      font-size: 0.75rem; font-weight: 600;
      padding: 0.3rem 0.75rem; border-radius: 0.4rem;
      border: 1.5px solid; cursor: pointer;
      transition: background 0.15s, color 0.15s;
    }
    .geo-patrol-btn--gps {
      background: #4f46e5; color: #fff; border-color: #4338ca;
    }
    .geo-patrol-btn--gps:hover:not(:disabled) { background: #4338ca; }
    .geo-patrol-btn--gps:disabled { opacity: 0.6; cursor: not-allowed; }
    .geo-patrol-btn--clear {
      background: #fee2e2; color: #b91c1c; border-color: #fecaca;
    }
    .geo-patrol-btn--clear:hover { background: #fecaca; }
    .geo-patrol-btn--loading { cursor: not-allowed; }

    .geo-patrol-spinner {
      width: 0.9rem; height: 0.9rem;
      border: 2px solid rgba(255,255,255,0.3);
      border-top-color: #fff;
      border-radius: 50%;
      animation: spin 0.7s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* Info window */

    /* Lista cercanos */
    .geo-patrol-cercanos {
      background: rgba(255,255,255,0.97);
      border-top: 1px solid #e2e8f0;
      padding: 0.6rem 0.75rem;
      flex-shrink: 0;
      max-height: 160px;
      overflow-y: auto;
    }
    .geo-patrol-cercanos--empty {
      font-size: 0.8rem; color: #94a3b8; text-align: center; font-style: italic;
    }
    .geo-patrol-cercanos__title {
      font-size: 0.72rem; font-weight: 700; color: #4f46e5;
      text-transform: uppercase; letter-spacing: 0.05em;
      margin: 0 0 0.4rem;
    }
    .geo-patrol-cercanos__list { display: flex; flex-direction: column; gap: 0.3rem; }
    .geo-patrol-cercanos__item {
      display: flex; align-items: center; gap: 0.5rem;
      background: #f8fafc; border: 1px solid #e2e8f0;
      border-radius: 0.4rem; padding: 0.35rem 0.5rem;
    }
    .geo-patrol-cercanos__icon { font-size: 0.9rem; }
    .geo-patrol-cercanos__info { flex: 1; min-width: 0; }
    .geo-patrol-cercanos__nombre { font-size: 0.78rem; font-weight: 600; color: #1e293b; margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .geo-patrol-cercanos__entidad { font-size: 0.68rem; color: #64748b; margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .geo-patrol-cercanos__dist {
      font-size: 0.72rem; font-weight: 700; color: #0369a1;
      background: #e0f2fe; border-radius: 999px; padding: 0.1rem 0.45rem;
      white-space: nowrap;
    }
  `]
})
export class GeoPatrolMap implements OnChanges, OnDestroy {

  @Input() subasignaciones: Subasignacion[] = [];
  @Input() getRecursoLabel: (id: string | null | undefined) => string = (id) => id ?? '-';
  @Input() getEntidadLabel: (id: string | null | undefined) => string = (id) => id ?? '-';
  @Input() height = '480px';
  @Input() radiusKm = 5;

  @Output() cercanosEncontrados = new EventEmitter<SubasignacionCercana[]>();

  // Cañete como centro por defecto
  center: GeoPunto = { lat: -13.0767, lng: -76.3896 };
  mapZoom = 13;

  markersConUbicacion: PatrolMarker[] = [];
  markersSinUbicacion = 0;

  miPosicion: GeoPunto | null = null;
  buscandoCercanos = false;
  cercanosActivos = false;
  resultadosCercanos: SubasignacionCercana[] = [];

  get mapInnerHeight(): string {
    // Descuenta toolbar (44px) + lista cercanos (variable, max 160px)
    return this.cercanosActivos ? 'calc(100% - 44px - 160px)' : 'calc(100% - 44px)';
  }

  /** Pines por turno; el popup reemplaza al InfoWindow de Google (texto plano). */
  get marcadores(): MapaMarcador[] {
    const pines: MapaMarcador[] = this.markersConUbicacion.map(m => ({
      ...m.position, id: m.sub.id, color: m.color, etiqueta: '🚓', titulo: m.label,
      popup: [
        m.label, m.entidadLabel,
        `Turno: ${this.formatear(m.sub.shift)}`, `Estado: ${m.sub.status}`,
        `Coords: ${m.position.lat.toFixed(5)}, ${m.position.lng.toFixed(5)}`,
        ...(m.distanceKm !== undefined ? [`Distancia: ${m.distanceKm.toFixed(2)} km`] : [])
      ].join('\n')
    }));
    return this.miPosicion ? [...pines, { ...this.miPosicion, punto: true, color: '#4f46e5', titulo: 'Tu posición' }] : pines;
  }

  private readonly TURNO_COLORS: Record<string, string> = {
    T_DIA:   '#d97706',
    T_TARDE: '#ea580c',
    T_NOCHE: '#4f46e5',
  };

  constructor(private ngZone: NgZone, private cdr: ChangeDetectorRef) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['subasignaciones']) {
      this.buildMarkers();
    }
  }

  ngOnDestroy(): void {}

  private buildMarkers(): void {
    const subs = this.subasignaciones ?? [];
    const conGps = subs.filter(s => s.latitude != null && s.longitude != null);
    const sinGps = subs.filter(s => s.latitude == null || s.longitude == null);

    this.markersSinUbicacion = sinGps.length;

    this.markersConUbicacion = conGps.map(s => {
      const turno = s.shift ?? 'default';
      const color = this.TURNO_COLORS[turno] ?? '#64748b';
      return {
        sub: s,
        position: { lat: s.latitude!, lng: s.longitude! },
        color,
        label: this.getRecursoLabel(s.resourceId),
        entidadLabel: this.getEntidadLabel(s.targetEntityId),
      } as PatrolMarker;
    });

    // Si hay marcadores, centrar el mapa en el primero (o promedio)
    if (this.markersConUbicacion.length > 0) {
      const avgLat = this.markersConUbicacion.reduce((acc, m) => acc + m.position.lat, 0) / this.markersConUbicacion.length;
      const avgLng = this.markersConUbicacion.reduce((acc, m) => acc + m.position.lng, 0) / this.markersConUbicacion.length;
      this.center = { lat: avgLat, lng: avgLng };
    }

    this.cdr.markForCheck();
  }

  buscarCercanosAlClick(): void {
    if (!navigator.geolocation) {
      alert('Tu navegador no soporta geolocalización.');
      return;
    }
    this.buscandoCercanos = true;
    this.cdr.markForCheck();

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        this.ngZone.run(() => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          this.miPosicion = { lat, lng };
          this.center = { lat, lng };
          this.mapZoom = 14;

          // Filtrar en frontend los más cercanos dentro del radio
          const conGps = this.subasignaciones.filter(
            s => s.status === 'ACTIVA' && s.latitude != null && s.longitude != null
          );
          const conDistancia: SubasignacionCercana[] = conGps.map(s => {
            const dist = this.haversine(lat, lng, s.latitude!, s.longitude!);
            return { ...s, distanceKm: dist, hasLocation: true };
          }).filter(s => s.distanceKm <= this.radiusKm)
            .sort((a, b) => a.distanceKm - b.distanceKm);

          this.resultadosCercanos = conDistancia;
          this.cercanosActivos = true;
          this.buscandoCercanos = false;

          // Actualizar distancia en los marcadores
          this.markersConUbicacion = this.markersConUbicacion.map(m => {
            const c = conDistancia.find(cd => cd.id === m.sub.id);
            return c ? { ...m, distanceKm: c.distanceKm } : m;
          });

          this.cercanosEncontrados.emit(conDistancia);
          this.cdr.markForCheck();
        });
      },
      (err) => {
        this.ngZone.run(() => {
          this.buscandoCercanos = false;
          console.warn('[GeoPatrolMap] GPS error:', err.message);
          this.cdr.markForCheck();
        });
      },
      { enableHighAccuracy: true, timeout: 10_000 }
    );
  }

  limpiarCercanos(): void {
    this.cercanosActivos = false;
    this.resultadosCercanos = [];
    this.miPosicion = null;
    this.buildMarkers();
    this.cdr.markForCheck();
  }

  formatear(valor: string | null | undefined): string {
    if (!valor) return '-';
    return valor.toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  private haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371.0;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
}
