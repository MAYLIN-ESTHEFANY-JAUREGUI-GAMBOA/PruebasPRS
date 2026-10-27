import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  input,
  output
} from '@angular/core';
import { OsmMap, GeoPunto } from '../../../../../shared/components/osm-map/osm-map';

export interface CreateIncidentPayload {
  severity: string;
  location: { lat: number; lng: number };
}

@Component({
  selector: 'app-incident-create, app-emergencias-crear',
  imports: [CommonModule, OsmMap],
  templateUrl: './incident-create.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class IncidentCreateComponent {
  readonly isOpen = input<boolean>(false, { alias: 'abierto' });
  readonly isSaving = input<boolean>(false, { alias: 'guardando' });

  readonly closed = output<void>({ alias: 'cerrar' });
  readonly incidentCreated = output<CreateIncidentPayload>({ alias: 'incidenteCreado' });

  // Alias para retrocompatibilidad en plantillas
  get abierto(): boolean { return this.isOpen(); }
  get guardando(): boolean { return this.isSaving(); }
  get cerrar() { return this.closed; }
  get incidenteCreado() { return this.incidentCreated; }

  triedSubmit = false;
  severityLevel = 'ALTA';
  internalSaving = false;
  mapCenter: GeoPunto = { lat: -13.0829, lng: -76.3706 };
  selectedLocation: { lat: number | null; lng: number | null } = { lat: null, lng: null };

  get nivelGravedad(): string { return this.severityLevel; }
  set nivelGravedad(v: string) { this.severityLevel = v; }
  get ubicacion() { return this.selectedLocation; }
  set ubicacion(val) { this.selectedLocation = val; }

  readonly severities = [
    { v: 'ALTA',  label: 'Alta',  cls: 'border-red-400 bg-red-50 text-red-700',         dot: 'bg-red-500'     },
    { v: 'MEDIA', label: 'Media', cls: 'border-orange-400 bg-orange-50 text-orange-700', dot: 'bg-orange-500'  },
    { v: 'BAJA',  label: 'Baja',  cls: 'border-emerald-400 bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500' }
  ];

  get gravedades() { return this.severities; }

  onMapClick(point: GeoPunto): void {
    this.selectedLocation = { ...point };
    this.mapCenter = { ...point };
  }

  confirm(): void {
    this.triedSubmit = true;
    if (!this.selectedLocation.lat || !this.selectedLocation.lng) return;
    this.incidentCreated.emit({
      severity: this.severityLevel,
      location: { lat: this.selectedLocation.lat, lng: this.selectedLocation.lng }
    });
  }

  confirmar(): void {
    this.confirm();
  }

  reset(): void {
    this.triedSubmit = false;
    this.severityLevel = 'ALTA';
    this.internalSaving = false;
    this.selectedLocation = { lat: null, lng: null };
    this.mapCenter = { lat: -13.0829, lng: -76.3706 };
  }
}

/** Alias retrocompatible */
export { IncidentCreateComponent as EmergenciasCrear };
