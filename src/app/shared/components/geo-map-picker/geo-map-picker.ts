/**
 * GeoMapPicker — componente reutilizable de mapa.
 *
 * Modos:
 *  - picker  → el usuario puede hacer click para fijar un pin (emit locationChange)
 *  - viewer  → solo lectura, muestra el marcador en la posición dada
 *
 * Inputs:
 *  lat / lng       — coordenadas iniciales (opcionales)
 *  mode            — 'picker' (default) | 'viewer'
 *  height          — altura CSS del contenedor (default '320px')
 *  zoom            — nivel de zoom inicial (default 14)
 *  markerTitle     — texto del tooltip del marcador
 *
 * Outputs:
 *  locationChange  — emite { lat, lng } cada vez que el usuario mueve el pin
 */
import {
  Component, Input, Output, EventEmitter,
  OnChanges, SimpleChanges, NgZone,
  ChangeDetectionStrategy, ChangeDetectorRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { OsmMap, MapaMarcador } from '../osm-map/osm-map';

export interface GeoPoint { lat: number; lng: number; }

@Component({
  selector: 'app-geo-map-picker',
  standalone: true,
  imports: [CommonModule, OsmMap],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="geo-map-wrap" [style.height]="height">

      <!-- Barra de coordenadas (solo en modo picker) -->
      @if (mode === 'picker') {
        <div class="geo-map-coords-bar">
          @if (current) {
            <span class="geo-map-coords-bar__pin">📍</span>
            <span class="geo-map-coords-bar__text">
              {{ current.lat | number:'1.6-6' }}, {{ current.lng | number:'1.6-6' }}
            </span>
            <button type="button" class="geo-map-coords-bar__clear" (click)="limpiar()" title="Quitar ubicación">✕</button>
          } @else {
            <span class="geo-map-coords-bar__hint">{{ hint }}</span>
          }
        </div>
      }

      <!-- Botón "Usar mi ubicación" (solo picker) -->
      @if (mode === 'picker') {
        <button type="button"
                class="geo-map-gps-btn"
                [class.geo-map-gps-btn--loading]="gpsLoading"
                [disabled]="gpsLoading"
                (click)="usarGPS()"
                title="Centrar en mi ubicación actual">
          @if (gpsLoading) {
            <span class="geo-map-spinner"></span>
          } @else {
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5">
              <path fill-rule="evenodd" d="M12 2.25a.75.75 0 0 1 .75.75v.756a49.106 49.106 0 0 1 9.152 1 .75.75 0 0 1-.152 1.485h-1.918l2.474 10.124a.75.75 0 0 1-.375.84A6.723 6.723 0 0 1 18.75 18a6.723 6.723 0 0 1-3.131-.745.75.75 0 0 1-.375-.84l2.474-10.124H12.75v13.28c1.293.076 2.534.343 3.697.776a.75.75 0 0 1-.262 1.453h-8.37a.75.75 0 0 1-.262-1.453c1.162-.433 2.404-.7 3.697-.776V6.291H7.182l2.474 10.124a.75.75 0 0 1-.375.84A6.723 6.723 0 0 1 5.25 18a6.723 6.723 0 0 1-3.131-.745.75.75 0 0 1-.375-.84L4.218 6.291H2.3a.75.75 0 0 1-.152-1.485 49.105 49.105 0 0 1 9.152-1V3a.75.75 0 0 1 .75-.75Z" clip-rule="evenodd" />
            </svg>
          }
        </button>
      }

      <!-- Mapa -->
      <app-osm-map
        altura="100%"
        [centro]="center"
        [zoom]="mapZoom"
        [marcadores]="marcadores"
        (mapaClick)="fijar($event)"
        (marcadorMovido)="fijar($event.punto)" />

    </div>
  `,
  styles: [`
    :host { display: block; height: 100%; }

    .geo-map-wrap {
      position: relative;
      border-radius: 0.75rem;
      overflow: hidden;
      border: 1.5px solid #e2e8f0;
      background: #f8fafc;
    }

    .geo-map-coords-bar {
      position: absolute;
      top: 0.5rem;
      left: 50%;
      transform: translateX(-50%);
      z-index: 500;
      display: flex;
      align-items: center;
      gap: 0.4rem;
      background: rgba(255,255,255,0.96);
      backdrop-filter: blur(8px);
      border: 1px solid #e2e8f0;
      border-radius: 999px;
      padding: 0.3rem 0.85rem;
      font-size: 0.78rem;
      font-weight: 500;
      color: #334155;
      box-shadow: 0 2px 8px rgba(0,0,0,0.12);
      white-space: nowrap;
      max-width: calc(100% - 2rem);
    }
    .geo-map-coords-bar__pin { font-size: 1rem; }
    .geo-map-coords-bar__text { font-variant-numeric: tabular-nums; color: #4f46e5; }
    .geo-map-coords-bar__hint { color: #64748b; font-style: italic; }
    .geo-map-coords-bar__clear {
      background: none; border: none; cursor: pointer;
      color: #94a3b8; font-size: 0.85rem; padding: 0 0.1rem; line-height: 1;
      transition: color 0.15s;
    }
    .geo-map-coords-bar__clear:hover { color: #ef4444; }

    .geo-map-gps-btn {
      position: absolute;
      bottom: 5.5rem;
      right: 0.6rem;
      z-index: 500;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 2.4rem;
      height: 2.4rem;
      border-radius: 0.5rem;
      background: #fff;
      border: 1px solid #e2e8f0;
      box-shadow: 0 2px 6px rgba(0,0,0,0.14);
      cursor: pointer;
      color: #4f46e5;
      transition: background 0.15s, color 0.15s;
    }
    .geo-map-gps-btn:hover:not(:disabled) { background: #4f46e5; color: #fff; }
    .geo-map-gps-btn--loading { cursor: not-allowed; opacity: 0.6; }
    .geo-map-gps-btn:disabled { cursor: not-allowed; }

    .geo-map-spinner {
      width: 1rem; height: 1rem;
      border: 2px solid #c7d2fe;
      border-top-color: #4f46e5;
      border-radius: 50%;
      animation: spin 0.7s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    .geo-info-window { font-family: inherit; font-size: 0.82rem; line-height: 1.5; }
  `]
})
export class GeoMapPicker implements OnChanges {

  @Input() lat: number | null | undefined = null;
  @Input() lng: number | null | undefined = null;
  @Input() mode: 'picker' | 'viewer' = 'picker';
  @Input() height = '320px';
  @Input() zoom = 14;
  @Input() markerTitle = 'Ubicación del patrullero';
  @Input() hint = 'Haz click en el mapa para fijar la ubicación del patrullero';

  @Output() locationChange = new EventEmitter<GeoPoint | null>();

  // Cañete, Lima, Perú
  private readonly DEFAULT_CENTER: GeoPoint = { lat: -13.0767, lng: -76.3896 };

  center: GeoPoint = this.DEFAULT_CENTER;
  mapZoom = this.zoom;
  current: GeoPoint | null = null;
  gpsLoading = false;

  get marcadores(): MapaMarcador[] {
    return this.current
      ? [{ ...this.current, titulo: this.markerTitle, arrastrable: this.mode === 'picker',
           popup: `${this.markerTitle}
${this.current.lat.toFixed(6)}, ${this.current.lng.toFixed(6)}` }]
      : [];
  }

  constructor(private ngZone: NgZone, private cdr: ChangeDetectorRef) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['lat'] || changes['lng']) {
      this.syncFromInputs();
    }
    if (changes['zoom']) {
      this.mapZoom = this.zoom;
    }
  }

  private syncFromInputs(): void {
    if (this.lat != null && this.lng != null) {
      this.current = { lat: this.lat, lng: this.lng };
      this.center = { ...this.current };
      this.mapZoom = this.zoom;
    } else {
      this.current = null;
      this.center = this.DEFAULT_CENTER;
      this.mapZoom = 13;
    }
  }

  fijar(p: GeoPoint): void {
    if (this.mode !== 'picker') return;
    this.current = { lat: p.lat, lng: p.lng };
    this.locationChange.emit({ ...this.current });
    this.cdr.markForCheck();
  }

  limpiar(): void {
    this.current = null;
    this.locationChange.emit(null);
    this.cdr.markForCheck();
  }

  usarGPS(): void {
    if (!navigator.geolocation) {
      alert('Tu navegador no soporta geolocalización.');
      return;
    }
    this.gpsLoading = true;
    this.cdr.markForCheck();

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        this.ngZone.run(() => {
          const point: GeoPoint = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude
          };
          this.current = point;
          this.center = { ...point };
          this.mapZoom = 16;
          this.gpsLoading = false;
          this.locationChange.emit({ ...point });
          this.cdr.markForCheck();
        });
      },
      (err) => {
        this.ngZone.run(() => {
          this.gpsLoading = false;
          console.warn('[GeoMapPicker] GPS error:', err.message);
          this.cdr.markForCheck();
        });
      },
      { enableHighAccuracy: true, timeout: 10_000 }
    );
  }
}
