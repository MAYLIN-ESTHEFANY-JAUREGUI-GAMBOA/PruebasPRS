/**
 * Mapa OpenStreetMap (Leaflet): sin API key ni facturación, a diferencia de Google Maps.
 * Declarativo: el padre pasa marcadores/líneas y escucha clics; Leaflet se importa solo en el navegador (SSR).
 */
import {
  AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, EventEmitter, Input, NgZone,
  OnChanges, OnDestroy, Output, PLATFORM_ID, ViewChild, inject
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import type * as Leaflet from 'leaflet';

export interface GeoPunto { lat: number; lng: number; }

export interface MapaMarcador extends GeoPunto {
  id?: string | number;
  /** Tooltip al pasar el mouse. */
  titulo?: string;
  /** Texto del popup al hacer clic; cada línea con `\n`. Se inserta como texto, nunca como HTML. */
  popup?: string;
  /** Color del pin (CSS). */
  color?: string;
  /** Emoji o 1-2 caracteres dentro del pin. */
  etiqueta?: string;
  /** Punto simple en vez de pin (p. ej. "mi posición"). */
  punto?: boolean;
  arrastrable?: boolean;
}

export interface MapaLinea { puntos: GeoPunto[]; color?: string; grosor?: number; discontinua?: boolean; }

const CENTRO_CANETE: GeoPunto = { lat: -13.0767, lng: -76.3896 };

@Component({
  selector: 'app-osm-map',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div #contenedor class="osm-map" [style.height]="altura"></div>`,
  styles: [`
    :host { display: block; height: 100%; }
    .osm-map { width: 100%; z-index: 0; }
    :host ::ng-deep .osm-pin { background: none; border: 0; }
    :host ::ng-deep .osm-pin__cuerpo {
      position: relative; display: grid; place-items: center; width: 30px; height: 30px;
      border-radius: 50% 50% 50% 0; transform: rotate(-45deg); background: var(--pin, #1d4ed8);
      box-shadow: 0 0 0 2px #fff, 0 3px 8px rgb(0 0 0 / 0.35);
    }
    :host ::ng-deep .osm-pin__txt { transform: rotate(45deg); font: 600 13px/1 system-ui, sans-serif; color: #fff; }
    :host ::ng-deep .osm-punto {
      width: 16px; height: 16px; border-radius: 50%; background: var(--pin, #2563eb);
      box-shadow: 0 0 0 3px #fff, 0 0 0 7px color-mix(in srgb, var(--pin, #2563eb) 30%, transparent);
    }
    :host ::ng-deep .leaflet-popup-content { margin: 10px 14px; font: 13px/1.45 system-ui, sans-serif; white-space: pre-line; }
  `]
})
export class OsmMap implements AfterViewInit, OnChanges, OnDestroy {
  @Input() centro: GeoPunto | null = null;
  @Input() zoom = 14;
  @Input() altura = '320px';
  @Input() marcadores: MapaMarcador[] = [];
  @Input() lineas: MapaLinea[] = [];
  /** Ajusta la vista para que se vean todos los marcadores y líneas (ignora `centro`/`zoom` si hay más de un punto). */
  @Input() encuadrar = false;
  /** false = mapa fijo (sin arrastre ni zoom), para vistas de solo lectura. */
  @Input() interactivo = true;
  /** Teselas oscuras (CARTO) para pantallas de uso nocturno, como el tracking del operario. */
  @Input() oscuro = false;

  @Output() mapaClick = new EventEmitter<GeoPunto>();
  @Output() marcadorClick = new EventEmitter<MapaMarcador>();
  @Output() marcadorMovido = new EventEmitter<{ marcador: MapaMarcador; punto: GeoPunto }>();

  @ViewChild('contenedor', { static: true }) contenedor!: ElementRef<HTMLDivElement>;

  private readonly zone = inject(NgZone);
  private readonly navegador = isPlatformBrowser(inject(PLATFORM_ID));
  private L?: typeof Leaflet;
  private mapa?: Leaflet.Map;
  private capa?: Leaflet.LayerGroup;
  private redimension?: ResizeObserver;

  async ngAfterViewInit(): Promise<void> {
    if (!this.navegador) return;
    this.L = await import('leaflet');
    const L = this.L;
    this.zone.runOutsideAngular(() => {
      this.mapa = L.map(this.contenedor.nativeElement, {
        center: this.centro ?? CENTRO_CANETE, zoom: this.zoom, zoomControl: this.interactivo,
        dragging: this.interactivo, scrollWheelZoom: false, doubleClickZoom: this.interactivo,
        touchZoom: this.interactivo, boxZoom: this.interactivo, keyboard: this.interactivo
      });
      L.tileLayer(this.oscuro
        ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
        : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19, attribution: this.oscuro ? '&copy; OpenStreetMap &copy; CARTO' : '&copy; OpenStreetMap'
      }).addTo(this.mapa);
      this.capa = L.layerGroup().addTo(this.mapa);
      this.mapa.on('click', (e: any) => this.zone.run(() => this.mapaClick.emit({ lat: e.latlng.lat, lng: e.latlng.lng })));
      // En modales y paneles el tamaño cambia después de crear el mapa: sin esto quedan teselas grises.
      this.redimension = new ResizeObserver(() => this.mapa?.invalidateSize());
      this.redimension.observe(this.contenedor.nativeElement);
    });
    this.dibujar(true);
  }

  ngOnChanges(): void {
    this.dibujar(false);
  }

  ngOnDestroy(): void {
    this.redimension?.disconnect();
    this.mapa?.remove();
  }

  private dibujar(inicial: boolean): void {
    const { L, mapa, capa } = this;
    if (!L || !mapa || !capa) return;
    this.zone.runOutsideAngular(() => {
      capa.clearLayers();
      for (const m of this.marcadores) {
        const icono = L.divIcon({
          className: 'osm-pin',
          html: m.punto
            ? `<div class="osm-punto" style="--pin:${color(m.color)}"></div>`
            : `<div class="osm-pin__cuerpo" style="--pin:${color(m.color)}"><span class="osm-pin__txt"></span></div>`,
          iconSize: m.punto ? [16, 16] : [30, 30],
          iconAnchor: m.punto ? [8, 8] : [15, 30],
          popupAnchor: [0, m.punto ? -8 : -28]
        });
        const marcador = L.marker([m.lat, m.lng], { icon: icono, draggable: !!m.arrastrable, title: m.titulo ?? '' });
        if (m.popup) {
          const div = document.createElement('div');
          div.textContent = m.popup;
          marcador.bindPopup(div);
        }
        marcador.on('click', () => this.zone.run(() => this.marcadorClick.emit(m)));
        marcador.on('dragend', () => {
          const p = marcador.getLatLng();
          this.zone.run(() => this.marcadorMovido.emit({ marcador: m, punto: { lat: p.lat, lng: p.lng } }));
        });
        marcador.addTo(capa);
        // La etiqueta va como texto: nunca HTML del usuario dentro del icono.
        const txt = marcador.getElement()?.querySelector('.osm-pin__txt');
        if (txt) txt.textContent = m.etiqueta ?? '';
      }
      for (const l of this.lineas) {
        if (l.puntos.length < 2) continue;
        L.polyline(l.puntos.map(p => [p.lat, p.lng] as [number, number]), {
          color: l.color ?? '#2563eb', weight: l.grosor ?? 4, opacity: 0.85, dashArray: l.discontinua ? '6 8' : undefined
        }).addTo(capa);
      }
      const puntos = [...this.marcadores, ...this.lineas.flatMap(l => l.puntos)];
      if (this.encuadrar && puntos.length > 1) {
        mapa.fitBounds(L.latLngBounds(puntos.map(p => [p.lat, p.lng] as [number, number])), { padding: [32, 32], maxZoom: 16 });
      } else if (this.centro) {
        mapa.setView(this.centro, this.zoom, { animate: !inicial });
      }
    });
  }
}

/** Solo colores CSS simples: el valor termina dentro de un atributo style. */
function color(c: string | undefined): string {
  return c && /^(#[0-9a-f]{3,8}|[a-z]+|(rgb|hsl|oklch)a?\([\d\s.,%/-]+\))$/i.test(c) ? c : '#1d4ed8';
}
